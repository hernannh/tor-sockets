import { readFile } from 'node:fs/promises';
import { type Database, relayHistory } from '@tor-sockets/db';
import {
  type CollecTorConsensus,
  cleanupTarballDir,
  fetchAndExtractMonthlyTarball,
  fetchRecentConsensus,
  parseConsensus,
} from '@tor-sockets/ingestion-core';
import { count, eq } from 'drizzle-orm';

const DONE_KEY_PREFIX = 'collector:done:';

export interface BackfillMonthResult {
  yearMonth: string;
  consensusesProcessed: number;
  relaysInserted: number;
  skipped: number;
  durationMs: number;
}

export interface BackfillRangeResult {
  months: string[];
  totalConsensuses: number;
  totalRelays: number;
  durationMs: number;
}

/** Minimal KV interface (reuses the Onionoo Last-Modified KV). */
export interface BackfillKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * Backfill one month of CollecTor consensuses into `relay_history`.
 *
 * Downloads the monthly `.tar.xz`, extracts every hourly consensus, parses
 * it, and bulk-inserts relay entries. Idempotent per-consensus: if
 * `relay_history` already has rows for a given `valid-after` timestamp, that
 * consensus is skipped. The month is marked done in `kv` so re-runs short-
 * circuit (resumability across worker restarts).
 *
 * CollecTor raw consensuses carry no country/AS data - only IPs, fingerprints,
 * flags and bandwidth. Those geo columns are left NULL; the concentration
 * engine can still compute HHI on pure weight distribution.
 */
export async function backfillMonth(
  db: Database,
  kv: BackfillKv,
  yearMonth: string,
  opts: { baseUrl?: string } = {},
): Promise<BackfillMonthResult> {
  const start = Date.now();
  const doneKey = `${DONE_KEY_PREFIX}${yearMonth}`;
  if ((await kv.get(doneKey)) === '1') {
    return { yearMonth, consensusesProcessed: 0, relaysInserted: 0, skipped: 1, durationMs: 0 };
  }

  const { dir, files } = await fetchAndExtractMonthlyTarball(yearMonth, opts);
  let consensusesProcessed = 0;
  let relaysInserted = 0;

  try {
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const consensus = parseConsensus(content);
      const inserted = await insertConsensus(db, consensus);
      if (inserted > 0) {
        consensusesProcessed += 1;
        relaysInserted += inserted;
      }
    }
  } finally {
    await cleanupTarballDir(dir);
  }

  await kv.set(doneKey, '1');
  return {
    yearMonth,
    consensusesProcessed,
    relaysInserted,
    skipped: 0,
    durationMs: Date.now() - start,
  };
}

/**
 * Backfill a range of months (inclusive) - convenience wrapper for a one-shot
 * historical fill. Stops on first error so a partial run can be resumed.
 */
export async function backfillRange(
  db: Database,
  kv: BackfillKv,
  from: string,
  to: string,
  opts: { baseUrl?: string } = {},
): Promise<BackfillRangeResult> {
  const start = Date.now();
  const months = enumerateMonths(from, to);
  let totalConsensuses = 0;
  let totalRelays = 0;

  for (const ym of months) {
    const result = await backfillMonth(db, kv, ym, opts);
    totalConsensuses += result.consensusesProcessed;
    totalRelays += result.relaysInserted;
  }

  return { months, totalConsensuses, totalRelays, durationMs: Date.now() - start };
}

/**
 * Backfill a single consensus fetched from CollecTor's `/recent/` endpoint.
 * Useful for smoke-testing the parser + insert path without downloading a
 * full monthly tarball. `timestamp` format: `YYYY-MM-DD-HH-MM-SS`.
 */
export async function backfillRecentConsensus(
  db: Database,
  timestamp: string,
  opts: { baseUrl?: string } = {},
): Promise<{ parsed: number; inserted: number; skipped: boolean; durationMs: number }> {
  const start = Date.now();
  const content = await fetchRecentConsensus(timestamp, opts);
  const consensus = parseConsensus(content);
  const inserted = await insertConsensus(db, consensus);
  return {
    parsed: consensus.relays.length,
    inserted,
    skipped: inserted === 0,
    durationMs: Date.now() - start,
  };
}

// --- Internal helpers ---

/**
 * Insert one consensus's relay entries into `relay_history`.
 * Idempotent: if rows already exist for this `validAfter`, skip entirely
 * (makes the backfill safe to re-run after interruptions).
 */
async function insertConsensus(db: Database, consensus: CollecTorConsensus): Promise<number> {
  const [existing] = await db
    .select({ c: count() })
    .from(relayHistory)
    .where(eq(relayHistory.time, consensus.validAfter));
  if (existing && existing.c > 0) return 0;

  if (consensus.relays.length === 0) return 0;

  const rows = consensus.relays.map((r) => ({
    time: consensus.validAfter,
    fingerprint: r.fingerprint,
    consensusWeight: r.consensusWeight,
    running: r.running,
    flags: r.flags,
  }));

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(relayHistory).values(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

/** Enumerate `YYYY-MM` strings in [from, to] inclusive. */
function enumerateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
