-- better-auth twoFactor plugin schema: TOTP two-factor auth for operator accounts.
-- Matches the schema emitted by `@better-auth/cli generate` for the twoFactor
-- plugin. `secret`/`backup_codes` are encrypted at rest by better-auth with
-- BETTER_AUTH_SECRET. `user.two_factor_enabled` is the aggregate on/off flag.

ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;

CREATE TABLE "two_factor" (
  "id" text PRIMARY KEY,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verified" boolean DEFAULT true,
  "failed_verification_count" integer DEFAULT 0,
  "locked_until" timestamptz
);

CREATE INDEX "twoFactor_secret_idx" ON "two_factor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" ("user_id");
