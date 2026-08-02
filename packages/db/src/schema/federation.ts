import { sql } from 'drizzle-orm';
import { bigint, boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Other Tor-Sockets instances this instance knows about and may sync from.
 * Populated manually (anti-Sybil) and via gossip (Fase 0.4 / Fase 3).
 */
export const federationPeers = pgTable('federation_peers', {
  instanceId: text('instance_id').primaryKey(),
  uri: text('uri').notNull(),
  pubkey: text('pubkey').notNull(),
  contact: text('contact'),
  trusted: boolean('trusted').notNull().default(false),
  lastSyncSeq: bigint('last_sync_seq', { mode: 'bigint' }).notNull().default(sql`0`),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  lastStatus: jsonb('last_status'),
  discoveredAt: timestamp('discovered_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type FederationPeer = typeof federationPeers.$inferSelect;
export type NewFederationPeer = typeof federationPeers.$inferInsert;

/**
 * Append-only signed change log (CDC). Each row is a signed mutation
 * the instance emits; peers fetch via `/federation/v1/changes?since=<seq>`.
 *
 * `op` ∈ {'relay_upserted', 'relay_dropped', 'snapshot_taken', 'anomaly_detected'}
 * `payload` is the type-specific JSONB. `sig` is the Ed25519 signature over
 * `${seq}.${instanceId}.${op}.${payloadHash}`.
 */
export const federationLog = pgTable('federation_log', {
  seq: bigint('seq', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  instanceId: text('instance_id').notNull(),
  op: varchar('op', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  sig: text('sig').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type FederationLogRow = typeof federationLog.$inferSelect;
export type NewFederationLogRow = typeof federationLog.$inferInsert;
