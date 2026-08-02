import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * ASN → organization mapping, sourced from PeeringDB (`/api/net` joined with
 * `/api/org`). Lets the concentration engine group relays by the real *hoster*
 * (operator organization) instead of by AS name - one org (e.g. OVH) usually
 * spans several ASNs, and several orgs can share one AS.
 *
 * `as_number` matches `relays.as_number` exactly (Onionoo's `"AS<n>"` form) so
 * the two join directly. ASNs not present here fall back to the AS name.
 */
export const asOrg = pgTable('as_org', {
  asNumber: text('as_number').primaryKey(),
  orgId: text('org_id').notNull(),
  orgName: text('org_name').notNull(),
  source: text('source').notNull().default('peeringdb'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type AsOrg = typeof asOrg.$inferSelect;
export type NewAsOrg = typeof asOrg.$inferInsert;
