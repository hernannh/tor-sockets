import { type Database, getDb, relayHistory, relays } from '@tor-sockets/db';
import { fetchRelayDetails, normalizeRelay, toHistoryRow } from '@tor-sockets/ingestion-core';
import { sql } from 'drizzle-orm';

const LAST_MODIFIED_KEY = 'onionoo:details:last-modified';
const SOURCE_TAG = 'onionoo';
// Hard deadline on the upstream fetch. Without it, a server that accepts the
// connection but never responds (TCP stall) hangs the single-concurrency worker
// indefinitely, freezing the whole pipeline.
//
// The previous 60s default rested on "Onionoo serves ~3MB for ~7000 relays".
// Measured against the live endpoint (2026-07-24, 10.8k relays, the 42 fields in
// RELAY_FIELDS): the response is ~90 MB and Onionoo does NOT compress it - it
// answers without `content-encoding` even though the request asks for gzip. On a
// 1 MB/s link that is ~90s, so the timeout aborted every poll a few seconds
// before it would have finished, and the data silently went stale while the
// worker kept reporting healthy.
//
// 300s is sized for the real payload with room for a slow link. It is a ceiling
// against a stalled socket, not a target: a healthy poll here takes 30-90s.
const ONIONOO_FETCH_TIMEOUT_MS = Number(process.env.ONIONOO_FETCH_TIMEOUT_MS) || 300_000;

export interface PollResult {
  status: 'fetched' | 'not_modified' | 'error';
  relaysPublished?: string;
  relaysSeen?: number;
  relaysUpserted?: number;
  historyRows?: number;
  runningTrue?: number;
  runningFalse?: number;
  consensusWeightSum?: number;
  durationMs: number;
  error?: string;
}

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * One Onionoo polling cycle:
 *   1. Conditional GET (`If-Modified-Since`) → 304 short-circuits.
 *   2. Validate + normalize the relay array.
 *   3. Upsert every relay into `relays` (ON CONFLICT fingerprint DO UPDATE).
 *   4. Append one `relay_history` row per relay (consensus time series).
 *   5. Persist `Last-Modified` for the next cycle.
 *
 * Onionoo includes the past week's relays (running=true/false), so the upsert
 * naturally corrects the `running` flag without an extra sweep.
 */
export async function pollOnionoo(
  db: Database,
  kv: KvStore,
  opts: { baseUrl?: string; limit?: number } = {},
): Promise<PollResult> {
  const start = Date.now();
  const lastModified = (await kv.get(LAST_MODIFIED_KEY)) ?? undefined;

  let outcome: Awaited<ReturnType<typeof fetchRelayDetails>>;
  try {
    outcome = await fetchRelayDetails({
      baseUrl: opts.baseUrl,
      lastModified,
      limit: opts.limit,
      signal: AbortSignal.timeout(ONIONOO_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      status: 'error',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (outcome.status === 'not_modified') {
    return { status: 'not_modified', durationMs: Date.now() - start };
  }

  const { data, lastModified: newLastModified, publishedAt } = outcome;
  const seen = data.relays;

  const normalized = seen.map((r) => normalizeRelay(r, [SOURCE_TAG]));
  const historyRows = seen.map((r) => toHistoryRow(r, publishedAt, null));

  // Write the current relay set + one history row per relay atomically. A
  // failure between the two would leave `relays` advanced to consensus N but
  // the time series missing row N (torn state). Both writes are idempotent so
  // the whole cycle is safe to retry on the next cron tick.
  if (normalized.length > 0 || historyRows.length > 0) {
    await db.transaction(async (tx) => {
      // Chunk the upsert - postgres protocol caps at 65535 parameters per query,
      // and we have ~40 columns per relay.
      const UPSERT_CHUNK = 500;
      for (let i = 0; i < normalized.length; i += UPSERT_CHUNK) {
        const slice = normalized.slice(i, i + UPSERT_CHUNK);
        await tx.insert(relays).values(slice).onConflictDoUpdate({
          target: relays.fingerprint,
          set: fullRelayUpdateSet,
        });
      }

      // Bulk-insert history rows in chunks; ON CONFLICT DO NOTHING on
      // (time, fingerprint) makes a retry after a partial failure a no-op
      // instead of duplicating the series.
      const HISTORY_CHUNK = 1000;
      for (let i = 0; i < historyRows.length; i += HISTORY_CHUNK) {
        const slice = historyRows.slice(i, i + HISTORY_CHUNK);
        if (slice.length > 0) {
          await tx
            .insert(relayHistory)
            .values(slice)
            .onConflictDoNothing({ target: [relayHistory.time, relayHistory.fingerprint] });
        }
      }
    });
  }

  if (newLastModified) await kv.set(LAST_MODIFIED_KEY, newLastModified);

  const runningTrue = seen.filter((r) => r.running).length;
  const consensusWeightSum = seen.reduce((acc, r) => acc + (r.consensus_weight ?? 0), 0);
  return {
    status: 'fetched',
    relaysPublished: data.relays_published,
    relaysSeen: seen.length,
    relaysUpserted: normalized.length,
    historyRows: historyRows.length,
    runningTrue,
    runningFalse: seen.length - runningTrue,
    consensusWeightSum,
    durationMs: Date.now() - start,
  };
}

/**
 * SET clause for the upsert: map every persisted column to its EXCLUDED value
 * so the conflicting row's data wins. Built once (module scope).
 */
const fullRelayUpdateSet = {
  nickname: sql`EXCLUDED.nickname`,
  hashedFingerprint: sql`EXCLUDED.hashed_fingerprint`,
  firstSeen: sql`EXCLUDED.first_seen`,
  lastSeen: sql`EXCLUDED.last_seen`,
  lastRestarted: sql`EXCLUDED.last_restarted`,
  running: sql`EXCLUDED.running`,
  hibernating: sql`EXCLUDED.hibernating`,
  flags: sql`EXCLUDED.flags`,
  orAddresses: sql`EXCLUDED.or_addresses`,
  exitAddresses: sql`EXCLUDED.exit_addresses`,
  dirAddress: sql`EXCLUDED.dir_address`,
  country: sql`EXCLUDED.country`,
  countryName: sql`EXCLUDED.country_name`,
  cityName: sql`EXCLUDED.city_name`,
  latitude: sql`EXCLUDED.latitude`,
  longitude: sql`EXCLUDED.longitude`,
  asNumber: sql`EXCLUDED.as_number`,
  asName: sql`EXCLUDED.as_name`,
  consensusWeight: sql`EXCLUDED.consensus_weight`,
  consensusWeightFraction: sql`EXCLUDED.consensus_weight_fraction`,
  guardProbability: sql`EXCLUDED.guard_probability`,
  middleProbability: sql`EXCLUDED.middle_probability`,
  exitProbability: sql`EXCLUDED.exit_probability`,
  measured: sql`EXCLUDED.measured`,
  advertisedBandwidth: sql`EXCLUDED.advertised_bandwidth`,
  bandwidthRate: sql`EXCLUDED.bandwidth_rate`,
  bandwidthBurst: sql`EXCLUDED.bandwidth_burst`,
  observedBandwidth: sql`EXCLUDED.observed_bandwidth`,
  overloadGeneralTimestamp: sql`EXCLUDED.overload_general_timestamp`,
  contact: sql`EXCLUDED.contact`,
  platform: sql`EXCLUDED.platform`,
  version: sql`EXCLUDED.version`,
  recommendedVersion: sql`EXCLUDED.recommended_version`,
  versionStatus: sql`EXCLUDED.version_status`,
  exitsPort443: sql`EXCLUDED.exits_port_443`,
  exitsPort80: sql`EXCLUDED.exits_port_80`,
  exitPolicySummary: sql`EXCLUDED.exit_policy_summary`,
  effectiveFamily: sql`EXCLUDED.effective_family`,
  allegedFamily: sql`EXCLUDED.alleged_family`,
  indirectFamily: sql`EXCLUDED.indirect_family`,
  verifiedHostNames: sql`EXCLUDED.verified_host_names`,
  unreachableOrAddresses: sql`EXCLUDED.unreachable_or_addresses`,
  sources: sql`EXCLUDED.sources`,
  updatedAt: sql`now()`,
};

// Re-export the DB getter so the worker entry can use the singleton.
export { getDb };
