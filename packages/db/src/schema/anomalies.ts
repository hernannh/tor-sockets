import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Anomalies detected by `packages/analysis` (Fase 1).
 *
 * `type` ∈ {'hhi_jump', 'as_cluster_new_relays', 'rapid_weight_gain', 'relay_dropped_consensus'}
 * `severity` ∈ {'info', 'low', 'medium', 'high', 'critical'}
 *
 * `details` is a flexible JSONB payload specific to each type
 * (e.g. {as: 'AS24940', newRelays: 7, windowHours: 24}).
 */
export const anomalies = pgTable('anomalies', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  type: varchar('type', { length: 64 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull().default('info'),
  details: jsonb('details').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  sourceInstance: text('source_instance'),
  sources: text('sources').array().notNull().default(sql`ARRAY[]::text[]`),
});

export type Anomaly = typeof anomalies.$inferSelect;
export type NewAnomaly = typeof anomalies.$inferInsert;
