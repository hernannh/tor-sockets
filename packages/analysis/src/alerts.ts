import type {
  AlertCondition,
  AnomalyCondition,
  ConcentrationShareCondition,
  HhiThresholdCondition,
} from '@tor-sockets/api-contract';
import { HHI_BANDS } from '@tor-sockets/api-contract';
import { type Database, alertRules, anomalies, concentrationSnapshots } from '@tor-sockets/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Severity } from './anomalies';

/**
 * Alert evaluation engine (Fase 3.1).
 *
 * Loads enabled `alert_rules`, evaluates each condition against the latest
 * anomalies / concentration snapshots, and returns specs describing what
 * would fire. The caller (ingestion job) persists `alert_events`, delivers
 * via channels, and dedups by `(ruleId, sourceId)`.
 *
 * Pure: no DB writes. Idempotent: re-running over the same window produces
 * the same specs; the job skips already-materialized events.
 */

export interface AlertEventSpec {
  ruleId: string;
  ruleName: string;
  ownerId: string;
  condition: AlertCondition;
  /** Dedup component: identical (ruleId, sourceId) is only delivered once. */
  sourceId: string;
  severity: Severity;
  title: string;
  payload: Record<string, unknown>;
  channels: string[];
}

export interface AlertEvalSummary {
  rulesEvaluated: number;
  events: number;
  perCondition: Record<string, number>;
}

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** How far back to scan for anomalies on each evaluation. Overlap is fine:
 * the job dedups by anomaly id, so a wider window only costs a cheap query. */
const ANOMALY_WINDOW_HOURS = 3;

export async function evaluateAlertRules(db: Database): Promise<AlertEventSpec[]> {
  const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true));
  if (rules.length === 0) return [];

  const specs: AlertEventSpec[] = [];
  for (const rule of rules) {
    const condition = rule.condition as AlertCondition;
    if (!condition || typeof condition !== 'object' || !('type' in condition)) continue;
    try {
      const matched = await evaluateCondition(db, rule.id, rule.name, rule.ownerId, condition);
      for (const spec of matched) spec.channels = rule.channels ?? [];
      specs.push(...matched);
    } catch {
      // A malformed condition should never take down the whole engine.
    }
  }
  return specs;
}

async function evaluateCondition(
  db: Database,
  ruleId: string,
  ruleName: string,
  ownerId: string,
  condition: AlertCondition,
): Promise<AlertEventSpec[]> {
  switch (condition.type) {
    case 'anomaly':
      return evalAnomaly(db, ruleId, ruleName, ownerId, condition);
    case 'hhi_threshold':
      return evalHhiThreshold(db, ruleId, ruleName, ownerId, condition);
    case 'concentration_share':
      return evalConcentrationShare(db, ruleId, ruleName, ownerId, condition);
    default:
      return [];
  }
}

async function evalAnomaly(
  db: Database,
  ruleId: string,
  ruleName: string,
  ownerId: string,
  c: AnomalyCondition,
): Promise<AlertEventSpec[]> {
  const conds = [
    sql`${anomalies.detectedAt} > now() - (${ANOMALY_WINDOW_HOURS} || ' hours')::interval`,
  ];
  if (c.anomalyType) conds.push(eq(anomalies.type, c.anomalyType));
  const minRank = c.severityMin ? SEVERITY_RANK[c.severityMin] : undefined;

  const rows = await db
    .select()
    .from(anomalies)
    .where(and(...conds))
    .orderBy(desc(anomalies.detectedAt))
    .limit(200);

  const out: AlertEventSpec[] = [];
  for (const a of rows) {
    const sev = a.severity as Severity;
    if (minRank !== undefined && SEVERITY_RANK[sev] < minRank) continue;
    out.push({
      ruleId,
      ruleName,
      ownerId,
      condition: c,
      sourceId: a.id,
      severity: sev,
      title: anomalyTitle(a.type, a.details as Record<string, unknown>),
      payload: {
        anomaly_id: a.id,
        anomaly_type: a.type,
        severity: a.severity,
        details: a.details,
        detected_at: a.detectedAt.toISOString(),
        source_instance: a.sourceInstance,
      },
      channels: [],
    });
  }
  return out;
}

async function evalHhiThreshold(
  db: Database,
  ruleId: string,
  ruleName: string,
  ownerId: string,
  c: HhiThresholdCondition,
): Promise<AlertEventSpec[]> {
  const [latest] = await db
    .select({ time: concentrationSnapshots.time })
    .from(concentrationSnapshots)
    .where(eq(concentrationSnapshots.dimension, c.dimension))
    .groupBy(concentrationSnapshots.time)
    .orderBy(desc(concentrationSnapshots.time))
    .limit(1);
  if (!latest?.time) return [];

  const [row] = await db
    .select({ hhi: concentrationSnapshots.hhi })
    .from(concentrationSnapshots)
    .where(
      and(
        eq(concentrationSnapshots.dimension, c.dimension),
        eq(concentrationSnapshots.time, latest.time),
      ),
    )
    .limit(1);
  const hhi = row?.hhi;
  if (hhi === undefined || hhi === null) return [];
  if (!compare(hhi, c.op, c.value)) return [];

  const bucket = latest.time.toISOString().slice(0, 13);
  return [
    {
      ruleId,
      ruleName,
      ownerId,
      condition: c,
      sourceId: `hhi:${c.dimension}:${bucket}`,
      severity: hhi > HHI_BANDS.high ? 'high' : hhi >= HHI_BANDS.moderate ? 'medium' : 'low',
      title: `HHI ${c.dimension} ${c.op} ${c.value}: now ${hhi.toFixed(0)}`,
      payload: {
        dimension: c.dimension,
        hhi: Number(hhi.toFixed(2)),
        threshold: { op: c.op, value: c.value },
        snapshot_time: latest.time.toISOString(),
      },
      channels: [],
    },
  ];
}

async function evalConcentrationShare(
  db: Database,
  ruleId: string,
  ruleName: string,
  ownerId: string,
  c: ConcentrationShareCondition,
): Promise<AlertEventSpec[]> {
  const [latest] = await db
    .select({ time: concentrationSnapshots.time })
    .from(concentrationSnapshots)
    .where(eq(concentrationSnapshots.dimension, c.dimension))
    .groupBy(concentrationSnapshots.time)
    .orderBy(desc(concentrationSnapshots.time))
    .limit(1);
  if (!latest?.time) return [];

  const col =
    c.role === 'guard'
      ? concentrationSnapshots.guardWeightPct
      : c.role === 'exit'
        ? concentrationSnapshots.exitWeightPct
        : concentrationSnapshots.middleWeightPct;

  const rows = await db
    .select({
      key: concentrationSnapshots.key,
      share: col,
      relayCount: concentrationSnapshots.relayCount,
    })
    .from(concentrationSnapshots)
    .where(
      and(
        eq(concentrationSnapshots.dimension, c.dimension),
        eq(concentrationSnapshots.time, latest.time),
      ),
    );
  if (rows.length === 0) return [];

  // If a key is specified, evaluate that one; otherwise the top key for the role.
  const keyLower = c.key?.toLowerCase();
  const targets = keyLower
    ? rows.filter((r) => r.key.toLowerCase() === keyLower)
    : rows
        .slice()
        .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
        .slice(0, 1);

  const bucket = latest.time.toISOString().slice(0, 13);
  const out: AlertEventSpec[] = [];
  for (const t of targets) {
    const share = t.share;
    if (share === null || share === undefined) continue;
    if (!compare(share, c.op, c.value)) continue;
    out.push({
      ruleId,
      ruleName,
      ownerId,
      condition: c,
      sourceId: `share:${c.dimension}:${t.key}:${c.role}:${bucket}`,
      severity: share >= 40 ? 'high' : share >= 25 ? 'medium' : 'low',
      title: `${c.role} share ${c.dimension}=${t.key} ${c.op} ${c.value}%: now ${share.toFixed(2)}%`,
      payload: {
        dimension: c.dimension,
        key: t.key,
        role: c.role,
        share: Number(share.toFixed(2)),
        relay_count: t.relayCount,
        threshold: { op: c.op, value: c.value },
        snapshot_time: latest.time.toISOString(),
      },
      channels: [],
    });
  }
  return out;
}

// --- Helpers ---

function compare(actual: number, op: string, threshold: number): boolean {
  switch (op) {
    case '>':
      return actual > threshold;
    case '>=':
      return actual >= threshold;
    case '<':
      return actual < threshold;
    case '<=':
      return actual <= threshold;
    default:
      return false;
  }
}

function anomalyTitle(type: string, details: Record<string, unknown>): string {
  const d = details as Record<string, string | number | null>;
  switch (type) {
    case 'hhi_jump':
      return `HHI jump ${d.dimension}: Δ${d.delta} (now ${d.current_hhi})`;
    case 'as_cluster_new_relays':
      return `${d.new_relays} new relays in ${d.as_name ?? d.as_number} (24h)`;
    case 'rapid_weight_gain':
      return `${d.fingerprint?.toString().slice(0, 8)} weight ×${d.ratio}`;
    default:
      return type;
  }
}
