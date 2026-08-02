import { type Dimension, snapshotConcentration } from '@tor-sockets/analysis';
import type { Database } from '@tor-sockets/db';

const DEFAULT_SOURCES = ['onionoo'];

export interface ConcentrationResult {
  status: 'ok' | 'empty';
  inserted: number;
  at: string;
  perDimension: Record<Dimension, { keys: number; hhi: number }>;
  durationMs: number;
}

/**
 * Run one concentration snapshot cycle: compute HHI + per-key shares for every
 * dimension and materialize rows into `concentration_snapshots`.
 *
 * Called from the ingestion worker after a successful Onionoo poll so the
 * hypertable tracks the network state hour-by-hour.
 */
export async function runConcentrationSnapshot(
  db: Database,
  opts: { sources?: string[] } = {},
): Promise<ConcentrationResult> {
  const start = Date.now();
  const sources = opts.sources ?? DEFAULT_SOURCES;

  const result = await snapshotConcentration(db, { sources });

  return {
    status: result.inserted > 0 ? 'ok' : 'empty',
    inserted: result.inserted,
    at: result.at.toISOString(),
    perDimension: result.perDimension,
    durationMs: Date.now() - start,
  };
}
