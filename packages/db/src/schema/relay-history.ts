import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Time-series history of relay metrics.
 *
 * This is a TimescaleDB HYPERTABLE partitioned by `time`
 * (see `drizzle/0001_timescale.sql`). One row per (fingerprint, consensus_hour).
 *
 * Used by `packages/analysis` (Fase 1) for:
 *  - HHI / concentration trends over time
 *  - Anomaly detection (weight spikes, churn)
 *  - Continuous aggregates via `time_bucket`
 */
export const relayHistory = pgTable(
  'relay_history',
  {
    time: timestamp('time', { withTimezone: true, mode: 'date' }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    consensusWeight: integer('consensus_weight').notNull(),
    running: boolean('running').notNull(),
    flags: text('flags').array().notNull().default(sql`ARRAY[]::text[]`),
    guardProbability: integer('guard_probability'),
    middleProbability: integer('middle_probability'),
    exitProbability: integer('exit_probability'),
    advertisedBandwidth: bigint('advertised_bandwidth', { mode: 'bigint' }),
    country: text('country'),
    asNumber: text('as_number'),
    consensusFingerprint: text('consensus_fingerprint'),
  },
  // Declared here, not only in SQL: migration 0009 created this index directly
  // and the schema never learned about it, so `drizzle-kit generate` could not
  // see it - the same blind spot that let the snapshot chain drift. It backs the
  // idempotent `onConflictDoUpdate` write path of the hourly ingest.
  (t) => [uniqueIndex('relay_history_time_fingerprint_uniq').on(t.time, t.fingerprint)],
);

export type RelayHistoryRow = typeof relayHistory.$inferSelect;
export type NewRelayHistoryRow = typeof relayHistory.$inferInsert;
