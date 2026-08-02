import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Materialized concentration metrics per dimension (country / AS / hoster),
 * produced hourly by `packages/analysis` (Fase 1).
 *
 * `dimension` ∈ {'country', 'as', 'hoster', 'family'}
 * `key` is the ISO country code, AS number, hoster org name (PeeringDB, falling
 * back to AS name), or canonical family fingerprint.
 *
 * `hhi` is the Herfindahl-Hirschman Index for that dimension at that time
 * (sum of squared market shares × 10000), used for network-health alerts.
 *
 * TimescaleDB hypertable partitioned by `time`.
 */
export const concentrationSnapshots = pgTable(
  'concentration_snapshots',
  {
    time: timestamp('time', { withTimezone: true, mode: 'date' }).notNull(),
    dimension: varchar('dimension', { length: 16 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    relayCount: integer('relay_count').notNull(),
    guardWeightPct: doublePrecision('guard_weight_pct'),
    middleWeightPct: doublePrecision('middle_weight_pct'),
    exitWeightPct: doublePrecision('exit_weight_pct'),
    consensusWeightSum: integer('consensus_weight_sum'),
    hhi: doublePrecision('hhi'),
    sources: text('sources').array().default(sql`ARRAY[]::text[]`),
  },
  // Created by migration 0009 in raw SQL and never declared here; see the note
  // on `relayHistory`. It is what makes the hourly snapshot write idempotent.
  (t) => [uniqueIndex('concentration_snapshots_time_dim_key_uniq').on(t.time, t.dimension, t.key)],
);

export type ConcentrationSnapshot = typeof concentrationSnapshots.$inferSelect;
export type NewConcentrationSnapshot = typeof concentrationSnapshots.$inferInsert;
