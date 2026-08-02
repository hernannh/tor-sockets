import { z } from 'zod';

/**
 * Tor-Sockets alert condition DSL (Fase 3).
 *
 * `alert_rules.condition` holds one of these discriminated unions. The alert
 * engine (`packages/analysis/src/alerts.ts`) evaluates each enabled rule
 * against the latest anomalies / concentration snapshots and materializes an
 * `alert_event` when matched.
 *
 * Channels (stored on the rule, not the condition) take the form
 * `'<kind>:<target>'`: `webhook:https://...`, `email:user@example.com`,
 * `telegram:<chatId>`.
 */

export const severitySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);

const compareOp = z.enum(['>', '>=', '<', '<=']);
const dimensionEnum = z.enum(['country', 'as', 'hoster']);
const roleEnum = z.enum(['guard', 'middle', 'exit']);

/**
 * Match anomalies detected by the engine (Fase 1.2).
 * With no filters, matches every new anomaly above `severityMin`.
 */
export const anomalyConditionSchema = z.object({
  type: z.literal('anomaly'),
  anomalyType: z.string().optional(),
  severityMin: severitySchema.optional(),
});

/**
 * Fire when the latest HHI for a dimension crosses a threshold.
 * e.g. { type:'hhi_threshold', dimension:'country', op:'>', value:2500 }
 */
export const hhiThresholdConditionSchema = z.object({
  type: z.literal('hhi_threshold'),
  dimension: dimensionEnum,
  op: compareOp,
  value: z.number().min(0).max(10000),
});

/**
 * Fire when a key's role-share (guard/middle/exit) crosses a threshold.
 * With `key` omitted, matches the single top key for the dimension/role.
 * e.g. { type:'concentration_share', dimension:'country', role:'guard', op:'>', value:30 }
 */
export const concentrationShareConditionSchema = z.object({
  type: z.literal('concentration_share'),
  dimension: dimensionEnum,
  key: z.string().optional(),
  role: roleEnum,
  op: compareOp,
  value: z.number().min(0).max(100),
});

export const alertConditionSchema = z.discriminatedUnion('type', [
  anomalyConditionSchema,
  hhiThresholdConditionSchema,
  concentrationShareConditionSchema,
]);

export type AlertCondition = z.infer<typeof alertConditionSchema>;
export type AnomalyCondition = z.infer<typeof anomalyConditionSchema>;
export type HhiThresholdCondition = z.infer<typeof hhiThresholdConditionSchema>;
export type ConcentrationShareCondition = z.infer<typeof concentrationShareConditionSchema>;

// --- Response schemas (read-only feed) ---

export const anomalyFeedItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: severitySchema,
  details: z.record(z.string(), z.unknown()),
  detected_at: z.string().datetime(),
  source_instance: z.string().nullable(),
});

export const anomalyFeedResponseSchema = z.object({
  anomalies: z.array(anomalyFeedItemSchema),
  total: z.number().int(),
});

export const alertEventFeedItemSchema = z.object({
  id: z.string(),
  rule_id: z.string().nullable(),
  rule_name: z.string(),
  triggered_at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  delivered_to: z.array(z.string()),
});

export const alertEventFeedResponseSchema = z.object({
  events: z.array(alertEventFeedItemSchema),
  total: z.number().int(),
});

export type AnomalyFeedItem = z.infer<typeof anomalyFeedItemSchema>;
export type AnomalyFeedResponse = z.infer<typeof anomalyFeedResponseSchema>;
export type AlertEventFeedItem = z.infer<typeof alertEventFeedItemSchema>;
export type AlertEventFeedResponse = z.infer<typeof alertEventFeedResponseSchema>;
