import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';

/**
 * CollecTor adapter - downloads and parses historical Tor consensuses from
 * the CollecTor archive (https://collector.torproject.org).
 *
 * CollecTor keeps every hourly consensus since ~2007 as plain-text files,
 * bundled into monthly `.tar.xz` tarballs. Each consensus has 6000-8000
 * router entries in Tor's `network-status-version 3` format. Unlike Onionoo
 * (which only keeps the last week), CollecTor is the source for longitudinal
 * analysis of network concentration.
 *
 * Geo/AS data is NOT in the raw consensus (only IPs). Callers that need
 * country/AS enrichment must run GeoIP separately. The parser populates the
 * fields that ARE available: fingerprint, nickname, flags, bandwidth.
 */

const DEFAULT_BASE_URL = 'https://collector.torproject.org';

export interface CollecTorRelayEntry {
  /** 40-char hex fingerprint (converted from the base64 identity in the `r` line). */
  fingerprint: string;
  nickname: string;
  address: string;
  orPort: number;
  dirPort: number | null;
  flags: string[];
  consensusWeight: number;
  running: boolean;
}

export interface CollecTorConsensus {
  validAfter: Date;
  rawFingerprint: string | null;
  relays: CollecTorRelayEntry[];
}

export interface CollecTorFetchOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Parse a single consensus document (Tor network-status-version 3 format).
 *
 * The `r` line starts a router entry:
 *   `r <nickname> <identity_base64> <digest_base64> <publication> <IP> <ORPort> <DirPort>`
 * The `s` line lists flags, `w Bandwidth=N` the consensus weight. We accumulate
 * fields until the next `r` line (or end) and emit a `CollecTorRelayEntry`.
 *
 * Throws on missing `valid-after` or a router entry missing its identity.
 */
export function parseConsensus(content: string): CollecTorConsensus {
  const lines = content.split('\n');
  let validAfter: Date | null = null;
  let rawFingerprint: string | null = null;
  const relays: CollecTorRelayEntry[] = [];

  let current: Partial<CollecTorRelayEntry> | null = null;

  const flush = () => {
    if (current?.fingerprint) {
      relays.push({
        fingerprint: current.fingerprint,
        nickname: current.nickname ?? '',
        address: current.address ?? '',
        orPort: current.orPort ?? 0,
        dirPort: current.dirPort ?? null,
        flags: current.flags ?? [],
        consensusWeight: current.consensusWeight ?? 0,
        running: current.running ?? true,
      });
    }
    current = null;
  };

  for (const line of lines) {
    // Consensus metadata
    if (line.startsWith('valid-after ')) {
      validAfter = parseTorTimestamp(line.slice('valid-after '.length));
      continue;
    }
    if (line.startsWith('directory-signature ')) {
      rawFingerprint = line.split(' ')[1] ?? null;
      // fallthrough - signatures are at the end, after all routers
    }

    // Router entry start
    if (line.startsWith('r ')) {
      flush();
      current = parseRLine(line);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('s ')) {
      current.flags = line.slice(2).split(' ').filter(Boolean);
      current.running = current.flags.includes('Running');
    } else if (line.startsWith('w ')) {
      const m = line.match(/Bandwidth=(\d+)/);
      if (m) current.consensusWeight = Number.parseInt(m[1], 10);
    }
  }
  flush();

  if (!validAfter) throw new Error('consensus missing valid-after line');
  return { validAfter, rawFingerprint, relays };
}

/**
 * Fetch a single recent consensus by its hourly timestamp.
 * `timestamp` format: `YYYY-MM-DD-HH-MM-SS`.
 */
export async function fetchRecentConsensus(
  timestamp: string,
  opts: CollecTorFetchOptions = {},
): Promise<string> {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${base}/recent/relay-descriptors/consensuses/${timestamp}-consensus`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tor-sockets-collector/0.1' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`CollecTor HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Fetch the newest hourly consensus from CollecTor's `recent/` directory.
 *
 * The recent index is an HTML listing whose entries are named
 * `YYYY-MM-DD-HH-MM-SS-consensus`. We scrape the filenames, pick the
 * lexicographically greatest (timestamps sort chronologically), and fetch it -
 * this avoids guessing the current hour, which is racy given publication lag.
 * Returns the parsed consensus (see {@link parseConsensus}).
 */
export async function fetchLatestConsensus(
  opts: CollecTorFetchOptions = {},
): Promise<CollecTorConsensus> {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const indexUrl = `${base}/recent/relay-descriptors/consensuses/`;
  const res = await fetch(indexUrl, {
    headers: { 'User-Agent': 'tor-sockets-collector/0.1' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`CollecTor HTTP ${res.status} for ${indexUrl}`);
  const html = await res.text();

  const stamps = new Set<string>();
  for (const m of html.matchAll(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})-consensus/g)) {
    stamps.add(m[1]);
  }
  if (stamps.size === 0) throw new Error(`no consensus files listed at ${indexUrl}`);

  const latest = [...stamps].sort().at(-1) as string;
  const content = await fetchRecentConsensus(latest, opts);
  return parseConsensus(content);
}

/**
 * Download and extract a monthly consensus tarball into a temp directory.
 * Returns the directory path and the list of consensus filenames inside.
 * Uses the system `tar` (xz support is universal on modern Linux/macOS).
 *
 * @param yearMonth e.g. "2025-06"
 */
export async function fetchAndExtractMonthlyTarball(
  yearMonth: string,
  opts: CollecTorFetchOptions = {},
): Promise<{ dir: string; files: string[] }> {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${base}/archive/relay-descriptors/consensuses/consensuses-${yearMonth}.tar.xz`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'tor-sockets-collector/0.1' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`CollecTar HTTP ${res.status} for ${url}`);

  const dir = await mkdtemp(join(tmpdir(), `collector-${yearMonth}-`));
  const tarballPath = join(dir, `${yearMonth}.tar.xz`);
  const stream = createWriteStream(tarballPath);

  // Stream the response body to disk, then extract with the system tar.
  const reader = res.body?.getReader();
  if (!reader) throw new Error('empty response body from CollecTor');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(value);
  }
  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.on('error', reject);
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('tar', ['-xJf', tarballPath, '-C', dir], { stdio: 'ignore' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
    proc.on('error', reject);
  });

  const entries = await readdir(dir, { recursive: true });
  const files = entries.filter((f) => !f.endsWith('.tar.xz')).map((f) => join(dir, f));
  return { dir, files };
}

/** Remove a temp directory created by `fetchAndExtractMonthlyTarball`. */
export async function cleanupTarballDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// --- Internal helpers ---

/** Parse the `r` line of a consensus into the start of a relay entry. */
function parseRLine(line: string): Partial<CollecTorRelayEntry> {
  const parts = line.slice(2).split(' ');
  const [nickname, identityB64, , , address, orPort, dirPort] = parts;
  return {
    fingerprint: identityB64 ? identityToHex(identityB64) : '',
    nickname: nickname ?? '',
    address: address ?? '',
    orPort: orPort ? Number.parseInt(orPort, 10) : 0,
    dirPort: dirPort ? Number.parseInt(dirPort, 10) : null,
  };
}

/**
 * Convert a Tor relay identity (base64 without padding, as stored in the `r`
 * line) to the canonical 40-char uppercase hex fingerprint.
 */
export function identityToHex(identityB64: string): string {
  const padded = identityB64.padEnd(identityB64.length + ((4 - (identityB64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('hex').toUpperCase();
}

/** Parse a Tor timestamp ("YYYY-MM-DD HH:MM:SS", UTC) into a Date. */
function parseTorTimestamp(value: string): Date {
  return new Date(`${value.trim().replace(' ', 'T')}Z`);
}

// Re-export for tests
export { createGunzip as _createGunzip };

// --- Server descriptors (Ed25519 master identity) ---

const SERVER_DESC_DIR = '/recent/relay-descriptors/server-descriptors/';
const SERVER_DESC_NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-server-descriptors$/;

/**
 * Parse a CollecTor server-descriptor concatenation into a map of
 * fingerprint → `master-key-ed25519` (base64, 32-byte pubkey).
 *
 * Each descriptor block carries both the RSA fingerprint
 * (`fingerprint <hex spaced>`) and the Ed25519 master identity public key
 * (`master-key-ed25519 <base64>`). This is the authoritative source for the
 * Ed25519 identity keyed by fingerprint - Onionoo does not expose it.
 */
export function parseServerDescriptors(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split('\n');
  let fingerprint: string | null = null;
  let masterKey: string | null = null;

  const flush = () => {
    if (fingerprint && masterKey) map.set(fingerprint, masterKey);
    fingerprint = null;
    masterKey = null;
  };

  for (const line of lines) {
    if (line.startsWith('@type server-descriptor')) {
      flush();
      continue;
    }
    if (line.startsWith('fingerprint ')) {
      fingerprint = line.slice('fingerprint '.length).replaceAll(' ', '').toUpperCase();
    } else if (line.startsWith('master-key-ed25519 ')) {
      masterKey = line.slice('master-key-ed25519 '.length).trim();
    }
  }
  flush();
  return map;
}

/**
 * List CollecTor's recent server-descriptor files and return the newest
 * filename (lexicographically = chronologically for the `YYYY-MM-DD-...` prefix).
 */
async function pickLatestServerDescriptorFile(
  opts: CollecTorFetchOptions = {},
): Promise<string | null> {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${base}${SERVER_DESC_DIR}`, {
    headers: { 'User-Agent': 'tor-sockets-collector/0.1' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`CollecTor listing HTTP ${res.status}`);
  const html = await res.text();
  const matches = html.match(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-server-descriptors/g);
  if (!matches || matches.length === 0) return null;
  return (
    [...matches]
      .filter((m) => SERVER_DESC_NAME_RE.test(m))
      .sort()
      .at(-1) ?? null
  );
}

/**
 * Fetch the latest server-descriptor batch and return a fingerprint →
 * master-key-ed25519 map. Callers should cache the result (the file refreshes
 * roughly hourly; the master identity is stable per relay lifetime).
 */
export async function fetchEd25519IdentityMap(
  opts: CollecTorFetchOptions = {},
): Promise<Map<string, string>> {
  const latest = await pickLatestServerDescriptorFile(opts);
  if (!latest) throw new Error('no server-descriptor files found on CollecTor');
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${base}${SERVER_DESC_DIR}${latest}`, {
    headers: { 'User-Agent': 'tor-sockets-collector/0.1' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`CollecTor HTTP ${res.status} for ${latest}`);
  return parseServerDescriptors(await res.text());
}
