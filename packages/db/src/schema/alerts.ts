import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * User-configurable alert rules (Fase 3).
 *
 * `condition` is a JSONB DSL evaluated by the alert engine, e.g.:
 *   { type: 'hhi_threshold', dimension: 'as', key: 'AS24940', op: '>', value: 0.15 }
 *   { type: 'relay_flag_change', fingerprint: '...', flag: 'Guard', action: 'lost' }
 *   { type: 'new_relay_in_country', country: 'CN', windowHours: 24 }
 *
 * `channels` lists delivery targets: ['email:user@x', 'webhook:https://...', 'telegram:123'].
 */
export const alertRules = pgTable('alert_rules', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  ownerId: text('owner_id').notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  condition: jsonb('condition').notNull(),
  channels: text('channels').array().notNull().default(sql`ARRAY[]::text[]`),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

/**
 * Materialized alert events (one per rule firing).
 * Kept for audit + the operator dashboard's recent-activity feed.
 */
export const alertEvents = pgTable('alert_events', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  ruleId: text('rule_id').references(() => alertRules.id, { onDelete: 'cascade' }),
  triggeredAt: timestamp('triggered_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  payload: jsonb('payload').notNull(),
  deliveredTo: text('delivered_to').array().default(sql`ARRAY[]::text[]`),
});

export type AlertEvent = typeof alertEvents.$inferSelect;
export type NewAlertEvent = typeof alertEvents.$inferInsert;
