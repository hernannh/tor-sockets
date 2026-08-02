import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Operator accounts. Auth handled by better-auth in `packages/auth` (Fase 3);
 * this minimal table mirrors the operator identity needed for claims/alerts.
 */
export const operators = pgTable('operators', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  email: text('email').notNull().unique(),
  displayName: varchar('display_name', { length: 128 }),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  verifyToken: text('verify_token'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Operator = typeof operators.$inferSelect;
export type NewOperator = typeof operators.$inferInsert;

/**
 * Verified relay ownership claims, three-tier model.
 *
 * `proofType` ∈ {'contact_token', 'ed25519_master_key', 'self_attested'}
 *   - T1 contact_token: token appeared in Onionoo `contact` field
 *   - T2 ed25519_master_key: CLI signed a nonce with the relay's master identity key
 *   - T3 self_attested: operator email matches the `contact` string only
 */
export const operatorClaims = pgTable(
  'operator_claims',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    operatorId: text('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    proofType: varchar('proof_type', { length: 32 }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    proofMetadata: text('proof_metadata'),
  },
  (t) => [unique('operator_claim_fingerprint_uidx').on(t.operatorId, t.fingerprint)],
);

export type OperatorClaim = typeof operatorClaims.$inferSelect;
export type NewOperatorClaim = typeof operatorClaims.$inferInsert;
