import { crossCheckConsensus, insertAnomalies } from '@tor-sockets/analysis';
import type { Database } from '@tor-sockets/db';
import { type CollecTorFetchOptions, fetchLatestConsensus } from '@tor-sockets/ingestion-core';

export interface ConsensusCrossCheckResult {
  status: 'ok';
  checked: number;
  confirmed: number;
  diverged: number;
  weightDiverged: number;
  flagDiverged: number;
  missingInConsensus: number;
  onlyInConsensus: number;
  anomaliesInserted: number;
  validAfter: string;
  durationMs: number;
}

/**
 * cross-check the raw, directory-authority-signed consensus against the
 * Onionoo-derived `relays` table. Confirms agreeing relays into `sources[]`
 * ('consensus') and records a `consensus_divergence` anomaly when weight/flags
 * drift beyond tolerance. Runs on a slow cadence (the consensus is hourly, but
 * cross-checking a few times a day is enough for a provenance signal).
 *
 * A fetch/parse failure throws - the caller logs it; nothing is written.
 */
export async function runConsensusCrossCheck(
  db: Database,
  opts: { sourceInstance?: string; sources?: string[] } & CollecTorFetchOptions = {},
): Promise<ConsensusCrossCheckResult> {
  const start = Date.now();
  const { sourceInstance, sources, ...fetchOpts } = opts;

  const consensus = await fetchLatestConsensus(fetchOpts);
  const result = await crossCheckConsensus(db, consensus.relays, {
    validAfter: consensus.validAfter,
  });

  const summary = await insertAnomalies(db, result.specs, { sourceInstance, sources });

  return {
    status: 'ok',
    checked: result.checked,
    confirmed: result.confirmed,
    diverged: result.diverged,
    weightDiverged: result.weightDiverged,
    flagDiverged: result.flagDiverged,
    missingInConsensus: result.missingInConsensus,
    onlyInConsensus: result.onlyInConsensus,
    anomaliesInserted: summary.inserted,
    validAfter: consensus.validAfter.toISOString(),
    durationMs: Date.now() - start,
  };
}
