import { detectAnomalies } from '@tor-sockets/analysis';
import type { Database } from '@tor-sockets/db';

export interface AnomalyResult {
  status: 'ok';
  detected: number;
  inserted: number;
  perType: Record<string, number>;
  durationMs: number;
}

/**
 * Run all anomaly detectors (HHI jumps, AS clustering, fast weight gain)
 * and persist new findings. Called from the worker after each concentration
 * snapshot so anomalies track the latest consensus.
 */
export async function runAnomalyDetection(
  db: Database,
  opts: { sourceInstance?: string; sources?: string[] } = {},
): Promise<AnomalyResult> {
  const start = Date.now();
  const result = await detectAnomalies(db, opts);
  return {
    status: 'ok',
    detected: result.detected,
    inserted: result.inserted,
    perType: result.perType,
    durationMs: Date.now() - start,
  };
}
