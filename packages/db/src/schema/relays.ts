import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Current state of each Tor relay, one row per fingerprint.
 * Source: Onionoo `/details` document, normalized.
 *
 * Upserted every poll cycle (Fase 0.3). History is tracked separately in
 * `relay_history` (TimescaleDB hypertable) - this table holds the latest snapshot.
 */
export const relays = pgTable('relays', {
  fingerprint: text('fingerprint').primaryKey(),
  nickname: text('nickname').notNull(),
  hashedFingerprint: text('hashed_fingerprint'),

  firstSeen: timestamp('first_seen', { withTimezone: true, mode: 'date' }).notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true, mode: 'date' }).notNull(),
  lastRestarted: timestamp('last_restarted', { withTimezone: true, mode: 'date' }),
  running: boolean('running').notNull().default(true),
  hibernating: boolean('hibernating'),

  flags: text('flags').array().notNull().default(sql`ARRAY[]::text[]`),

  orAddresses: text('or_addresses').array().notNull().default(sql`ARRAY[]::text[]`),
  exitAddresses: text('exit_addresses').array().default(sql`ARRAY[]::text[]`),
  dirAddress: text('dir_address'),

  country: text('country'),
  countryName: text('country_name'),
  cityName: text('city_name'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),

  asNumber: text('as_number'),
  asName: text('as_name'),

  consensusWeight: integer('consensus_weight').notNull().default(0),
  consensusWeightFraction: numeric('consensus_weight_fraction', { precision: 10, scale: 8 }),
  guardProbability: numeric('guard_probability', { precision: 10, scale: 8 }),
  middleProbability: numeric('middle_probability', { precision: 10, scale: 8 }),
  exitProbability: numeric('exit_probability', { precision: 10, scale: 8 }),
  measured: boolean('measured'),

  advertisedBandwidth: bigint('advertised_bandwidth', { mode: 'bigint' }),
  bandwidthRate: bigint('bandwidth_rate', { mode: 'bigint' }),
  bandwidthBurst: bigint('bandwidth_burst', { mode: 'bigint' }),
  observedBandwidth: bigint('observed_bandwidth', { mode: 'bigint' }),

  overloadGeneralTimestamp: timestamp('overload_general_timestamp', {
    withTimezone: true,
    mode: 'date',
  }),

  contact: text('contact'),
  platform: text('platform'),
  version: text('version'),
  recommendedVersion: boolean('recommended_version'),
  versionStatus: text('version_status'),

  // Derived from Onionoo exit_policy_summary: does this exit allow the scarce
  // key ports. Null = not an exit / no policy summary.
  exitsPort443: boolean('exits_port_443'),
  exitsPort80: boolean('exits_port_80'),
  // Full Onionoo exit_policy_summary ({accept:[...]} | {reject:[...]}), for
  // per-port diversity analysis. Null = no policy (non-exit).
  exitPolicySummary: jsonb('exit_policy_summary'),

  effectiveFamily: text('effective_family').array().default(sql`ARRAY[]::text[]`),
  allegedFamily: text('alleged_family').array().default(sql`ARRAY[]::text[]`),
  indirectFamily: text('indirect_family').array().default(sql`ARRAY[]::text[]`),

  verifiedHostNames: text('verified_host_names').array().default(sql`ARRAY[]::text[]`),
  unreachableOrAddresses: text('unreachable_or_addresses').array().default(sql`ARRAY[]::text[]`),

  consensusFingerprint: text('consensus_fingerprint'),
  sources: text('sources').array().notNull().default(sql`ARRAY[]::text[]`),

  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Relay = typeof relays.$inferSelect;
export type NewRelay = typeof relays.$inferInsert;
