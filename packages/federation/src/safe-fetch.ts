import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupAllOptions, LookupOneOptions } from 'node:dns';
import { request as httpRequest } from 'node:http';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

/**
 * SSRF-hardened fetch. Tor-Sockets performs outbound HTTP to URLs that come
 * from untrusted input: a peer's `instance_uri` (POST /federation/v1/subscribe
 * is public and anonymous) and an operator-configured webhook/alert URL. This is
 * the most exposed outbound surface in the project, so the guard is deliberately
 * fail-closed: anything it cannot prove is a public destination is rejected.
 *
 * Layers:
 *  1. URL policy - https-only in production, no embedded credentials, port
 *     allowlist (443 + FEDERATION_ALLOWED_PORTS), literal-IP and hostname
 *     denylist. IPv6 literals are unwrapped from their brackets first, and
 *     IPv4-mapped forms (`::ffff:169.254.169.254`, `::ffff:a9fe:a9fe`) are
 *     folded to their IPv4 value before the range check.
 *  2. Connect-time DNS pinning - the request is issued through node:http(s)
 *     with a custom `lookup` that re-validates EVERY resolved address at the
 *     moment of connection and refuses if any of them is non-public. Because
 *     the connection uses the address that was validated, a hostile resolver
 *     cannot flip a public answer to a private one between check and connect
 *     (DNS rebinding). A name whose records are a mix of public and private is
 *     refused outright.
 *  3. Redirects are followed MANUALLY, one hop at a time, each hop re-entering
 *     the full policy (this is what defeats `http://attacker -> 302 ->
 *     http://169.254.169.254`).
 *  4. The response body is streamed with a hard byte cap (the socket is
 *     destroyed on overflow) and the whole exchange runs under a deadline.
 *
 * Local peering: a dev instance legitimately talks to 127.0.0.1. Set
 * `SAFE_FETCH_ALLOW_PRIVATE=true` to relax layers 1-2 for that case; the flag is
 * IGNORED when NODE_ENV=production, so it can never weaken a real deployment.
 */

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;

const BLOCKED_SCHEME_HINT = new Set([
  'file:',
  'gopher:',
  'ftp:',
  'ftps:',
  'dict:',
  'ldap:',
  'ldaps:',
  'jar:',
  'tftp:',
  'data:',
  'blob:',
  'ws:',
  'wss:',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Dev-only escape hatch for local peering (two instances on 127.0.0.1). */
function allowPrivate(): boolean {
  return !isProduction() && process.env.SAFE_FETCH_ALLOW_PRIVATE === 'true';
}

function allowedSchemes(): Set<string> {
  return isProduction() ? new Set(['https:']) : new Set(['https:', 'http:']);
}

function allowedPorts(): Set<number> {
  const extra = (process.env.FEDERATION_ALLOWED_PORTS ?? '')
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  return new Set<number>([443, ...(isProduction() ? [] : [80, 3000, 3001]), ...extra]);
}

// --- Address classification ---

/** `[::1]` -> `::1`; leaves everything else untouched. */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Fold an IPv4-mapped/compatible IPv6 address to its IPv4 form so the IPv4
 * range checks apply. Handles both the dotted (`::ffff:127.0.0.1`) and the hex
 * (`::ffff:7f00:1`) spellings, plus NAT64 (`64:ff9b::7f00:1`).
 */
function mappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (dotted?.[1]) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] && hex[2]) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

/** CIDR blocks that must never be reachable from a user-supplied URL. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + 255.255.255.255
];

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable -> fail closed
  for (const [base, bits] of BLOCKED_V4) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) >>> 0 === (baseInt & mask) >>> 0) return true;
  }
  return false;
}

const BLOCKED_V6_PREFIXES = [
  'fc', // fc00::/7 unique local
  'fd',
  'fe8', // fe80::/10 link-local
  'fe9',
  'fea',
  'feb',
  'fec', // fec0::/10 site-local (deprecated)
  'fed',
  'fee',
  'fef',
  'ff', // ff00::/8 multicast
  '100:', // 100::/64 discard-only
  '2001:db8', // documentation
];

/**
 * True when the address must not be contacted. Unknown/unparseable input is
 * treated as blocked (fail closed).
 */
export function isBlockedAddress(rawIp: string): boolean {
  const ip = stripBrackets(rawIp.trim()).toLowerCase();
  if (!ip) return true;

  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind !== 6) return true; // not an IP at all -> caller misuse, fail closed

  const folded = mappedIpv4(ip);
  if (folded) return isBlockedIpv4(folded);

  const compact = ip.replace(/^\[|\]$/g, '');
  if (compact === '::1' || compact === '::') return true;
  // Strip a zone id (fe80::1%eth0) before prefix matching.
  const bare = compact.split('%')[0] ?? compact;
  return BLOCKED_V6_PREFIXES.some((prefix) => bare.startsWith(prefix));
}

// --- URL policy ---

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

interface Target {
  url: URL;
  /** Hostname without IPv6 brackets - what node:net expects. */
  host: string;
  port: number;
  isTls: boolean;
}

export function assertUrlSafe(rawUrl: string): Target {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('malformed url');
  }

  if (BLOCKED_SCHEME_HINT.has(parsed.protocol) || !allowedSchemes().has(parsed.protocol)) {
    throw new SafeFetchError(`disallowed scheme: ${parsed.protocol}`);
  }
  // Credentials in the URL are a redirect-smuggling / credential-leak vector and
  // no legitimate peer needs them.
  if (parsed.username || parsed.password) {
    throw new SafeFetchError('credentials in url are not allowed');
  }

  const isTls = parsed.protocol === 'https:';
  const port = parsed.port ? Number(parsed.port) : isTls ? 443 : 80;
  if (!allowPrivate() && !allowedPorts().has(port)) {
    throw new SafeFetchError(`disallowed port: ${port}`);
  }

  const host = stripBrackets(parsed.hostname).toLowerCase();
  if (!host) throw new SafeFetchError('empty host');

  if (!allowPrivate()) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new SafeFetchError(`blocked host: ${host}`);
    }
    // Literal IPs never reach DNS, so they are checked here. `isIP` understands
    // the unbracketed IPv6 form we just produced.
    if (isIP(host) !== 0 && isBlockedAddress(host)) {
      throw new SafeFetchError(`blocked target address: ${host}`);
    }
  }

  return { url: parsed, host, port, isTls };
}

// --- Connect-time DNS pinning ---

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` implementation handed to node:http(s). Every candidate address is
 * validated here - i.e. at connect time, on the exact addresses the socket will
 * use - which is what makes rebinding impossible rather than merely unlikely.
 */
function pinnedLookup(
  hostname: string,
  options: LookupOneOptions | LookupAllOptions,
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = (addresses ?? []) as LookupAddress[];
    if (list.length === 0) {
      return callback(
        new SafeFetchError(`no address for ${hostname}`) as NodeJS.ErrnoException,
        '',
      );
    }
    // Fail closed on ANY private record: a name that mixes public and private
    // answers is either misconfigured or a rebinding attempt.
    const blocked = list.find((a) => isBlockedAddress(a.address));
    if (blocked) {
      return callback(
        new SafeFetchError(
          `blocked resolved address ${blocked.address} for ${hostname}`,
        ) as NodeJS.ErrnoException,
        '',
      );
    }
    if ((options as LookupAllOptions).all) return callback(null, list);
    const first = list[0];
    if (!first) {
      return callback(
        new SafeFetchError(`no address for ${hostname}`) as NodeJS.ErrnoException,
        '',
      );
    }
    callback(null, first.address, first.family);
  });
}

// --- Request ---

/** Header shapes we accept - kept local so the package needs no DOM lib. */
export type SafeFetchHeaders = Headers | Array<[string, string]> | Record<string, string>;

export interface SafeFetchOptions {
  method?: string;
  headers?: SafeFetchHeaders;
  body?: string | Uint8Array | null;
  signal?: AbortSignal | null;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

function normalizeHeaders(input: SafeFetchHeaders | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (input instanceof Headers) {
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    for (const [key, value] of input) if (key) out[key] = String(value);
    return out;
  }
  for (const [key, value] of Object.entries(input)) out[key] = String(value);
  return out;
}

interface RawResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function requestOnce(target: Target, opts: SafeFetchOptions, deadlineMs: number, maxBytes: number) {
  return new Promise<RawResponse>((resolve, reject) => {
    const doRequest = target.isTls ? httpsRequest : httpRequest;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(err);
    };

    const req: ClientRequest = doRequest(
      {
        protocol: target.url.protocol,
        hostname: target.host,
        port: target.port,
        path: `${target.url.pathname}${target.url.search}`,
        method: opts.method ?? 'GET',
        headers: {
          host: target.url.host,
          'accept-encoding': 'identity',
          ...normalizeHeaders(opts.headers),
        },
        // Pin the connection to addresses validated right now.
        lookup: allowPrivate() ? undefined : pinnedLookup,
        // Never let node follow a redirect for us; hops are re-validated above.
        timeout: deadlineMs,
        servername: target.isTls ? target.host : undefined,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          fail(new SafeFetchError(`response too large: content-length=${declared}`));
          return;
        }
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            fail(new SafeFetchError(`response too large: >${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on('error', fail);
      },
    );

    req.on('error', fail);
    req.on('timeout', () => fail(new SafeFetchError(`request timed out after ${deadlineMs}ms`)));

    const signal = opts.signal;
    if (signal) {
      if (signal.aborted) {
        fail(new SafeFetchError('aborted'));
        return;
      }
      signal.addEventListener('abort', () => fail(new SafeFetchError('aborted')), { once: true });
    }

    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function toResponse(raw: RawResponse): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  // 204/304 must not carry a body.
  const body = raw.status === 204 || raw.status === 304 ? null : new Uint8Array(raw.body);
  return new Response(body, {
    status: raw.status,
    statusText: raw.statusText,
    headers,
  });
}

/**
 * Perform an outbound request to an untrusted URL under the policy documented
 * at the top of this file. Returns a standard `Response` whose body is already
 * buffered (bounded by `maxBytes`).
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let url = input;
  let method = opts.method ?? 'GET';
  let body = opts.body ?? null;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = assertUrlSafe(url);
    const raw = await requestOnce(target, { ...opts, method, body }, timeoutMs, maxBytes);

    if (raw.status >= 300 && raw.status < 400) {
      const location = raw.headers.location;
      const next = Array.isArray(location) ? location[0] : location;
      if (!next) return toResponse(raw);
      // 303 (and 301/302 for POST, per browser behaviour) degrade to GET.
      if (raw.status === 303 || ((raw.status === 301 || raw.status === 302) && method !== 'GET')) {
        method = 'GET';
        body = null;
      }
      url = new URL(next, url).toString();
      continue;
    }
    return toResponse(raw);
  }
  throw new SafeFetchError('too many redirects');
}
