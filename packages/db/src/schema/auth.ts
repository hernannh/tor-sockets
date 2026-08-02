import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * better-auth core tables (Fase 3.2).
 *
 * Managed by better-auth via the Drizzle adapter. Field names follow the
 * better-auth core schema (snake_case columns). `displayName` is an additional
 * user field configured in `packages/auth`. IDs are DB-generated UUIDs
 * (better-auth lets PostgreSQL generate them by default).
 *
 * Operators signing up here are the `ownerId` for alert rules and the
 * `operatorId` for relay claims (synced into the legacy `operators` table via
 * a database hook so the existing FK holds).
 */

export const user = pgTable('user', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  displayName: varchar('display_name', { length: 128 }),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
    mode: 'date',
  }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
    withTimezone: true,
    mode: 'date',
  }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

/**
 * better-auth TOTP two-factor secrets. Managed by the better-auth `twoFactor`
 * plugin (packages/auth). `secret` and `backupCodes` are encrypted at rest by
 * better-auth with BETTER_AUTH_SECRET. A user may have multiple 2FA rows (one
 * per device/method); `user.twoFactorEnabled` is the aggregate on/off flag.
 */
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('twoFactor_secret_idx').on(t.secret), index('twoFactor_userId_idx').on(t.userId)],
);

export type TwoFactor = typeof twoFactor.$inferSelect;
