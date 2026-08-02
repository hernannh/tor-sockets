import { type Database, alertEvents, anomalies, federationLog } from '@tor-sockets/db';
import { sql } from 'drizzle-orm';

const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS) || 365;

export interface PruneResult {
  status: 'ok';
  anomaliesDeleted: number;
  alertEventsDeleted: number;
  federationLogDeleted: number;
  retentionDays: number;
  durationMs: number;
}

/**
 * Delete append-only rows older than the retention window from the regular
 * (non-hypertable) tables. `relay_history` and `concentration_snapshots` already
 * have Timescale retention policies (5y); `anomalies`, `alert_events` and
 * `federation_log` are plain tables that grow without bound and would eventually
 * fill the disk. Scheduled to run daily from the worker.
 */
export async function pruneOldRows(db: Database): Promise<PruneResult> {
  const start = Date.now();
  const cutoff = sql`now() - make_interval(days => ${RETENTION_DAYS})`;

  const rowCount = (r: unknown): number =>
    (r as { rowCount?: number | null } | null)?.rowCount ?? 0;

  const a = await db.delete(anomalies).where(sql`${anomalies.detectedAt} < ${cutoff}`);
  const e = await db.delete(alertEvents).where(sql`${alertEvents.triggeredAt} < ${cutoff}`);
  const f = await db.delete(federationLog).where(sql`${federationLog.createdAt} < ${cutoff}`);

  return {
    status: 'ok',
    anomaliesDeleted: rowCount(a),
    alertEventsDeleted: rowCount(e),
    federationLogDeleted: rowCount(f),
    retentionDays: RETENTION_DAYS,
    durationMs: Date.now() - start,
  };
}
