import { evaluateAlertRules } from '@tor-sockets/analysis';
import { type Database, alertEvents } from '@tor-sockets/db';
import type { InstanceKeypair } from '@tor-sockets/federation';
import { and, eq, sql } from 'drizzle-orm';
import { type NotificationPayload, deliver } from '../notify';

export interface AlertEvalResult {
  status: 'ok';
  rulesEvaluated: number;
  fired: number;
  delivered: number;
  durationMs: number;
}

/**
 * Evaluate every enabled alert rule, materialize new events (deduped by
 * ruleId + sourceId), and deliver to each rule's channels. Called from the
 * worker after anomaly detection so alerts track the latest findings.
 *
 * Delivery is best-effort and never throws: a channel failure is recorded on
 * the event's `delivered_to` array but does not abort the job.
 */
export async function runAlertEvaluation(
  db: Database,
  opts: { instance?: InstanceKeypair } = {},
): Promise<AlertEvalResult> {
  const start = Date.now();
  const specs = await evaluateAlertRules(db);

  let fired = 0;
  let delivered = 0;

  for (const spec of specs) {
    // Dedup: skip if an event already exists for this (rule, source).
    const already = await db
      .select({ id: alertEvents.id })
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.ruleId, spec.ruleId),
          sql`${alertEvents.payload}->>'source_id' = ${spec.sourceId}`,
        ),
      )
      .limit(1);
    if (already.length > 0) continue;

    const triggeredAt = new Date();
    const payload = {
      source_id: spec.sourceId,
      severity: spec.severity,
      title: spec.title,
      condition: spec.condition,
      details: spec.payload,
      rule_name: spec.ruleName,
    };

    const [row] = await db
      .insert(alertEvents)
      .values({
        ruleId: spec.ruleId,
        triggeredAt,
        payload,
      })
      .returning({ id: alertEvents.id });

    if (!row) continue;
    fired += 1;

    if (spec.channels.length === 0) continue;

    const notification: NotificationPayload = {
      ruleId: spec.ruleId,
      ruleName: spec.ruleName,
      severity: spec.severity,
      title: spec.title,
      condition: spec.condition,
      details: spec.payload,
      triggeredAt: triggeredAt.toISOString(),
    };

    const results = await deliver(spec.channels, notification, opts.instance);
    const okChannels = results.filter((r) => r.ok).map((r) => r.channel);
    if (okChannels.length > 0) {
      delivered += okChannels.length;
      await db
        .update(alertEvents)
        .set({ deliveredTo: okChannels })
        .where(eq(alertEvents.id, row.id));
    }
  }

  return {
    status: 'ok',
    rulesEvaluated: specs.length > 0 ? new Set(specs.map((s) => s.ruleId)).size : 0,
    fired,
    delivered,
    durationMs: Date.now() - start,
  };
}
