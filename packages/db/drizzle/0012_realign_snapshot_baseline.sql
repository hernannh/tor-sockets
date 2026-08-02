-- Baseline realignment. Applies NOTHING new on an existing database.
--
-- Migrations 0009, 0010 and 0011 were written by hand and added to the journal
-- without their `meta/*_snapshot.json`, so drizzle-kit's diff baseline stayed
-- frozen at 0008. Everything those three created - the two unique indexes behind
-- the idempotent writes, `two_factor`, `user.two_factor_enabled`,
-- `ingest_status` - was invisible to `drizzle-kit generate`, which therefore
-- proposed creating all of it again. This migration carries the snapshot that
-- closes the gap; its SQL is a no-op wherever the objects already exist, and
-- does the real work on a database built from zero.
--
-- One genuine divergence surfaced while writing it: 0010 declares the foreign
-- key inline and unnamed, so Postgres called it `two_factor_user_id_fkey`, while
-- the schema expects `two_factor_user_id_user_id_fk`. It is renamed rather than
-- duplicated - two identical foreign keys on one column would satisfy the diff
-- and mislead every future reader.

CREATE TABLE IF NOT EXISTS "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_status" (
	"job" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'two_factor_user_id_user_id_fk') THEN
		NULL;
	ELSIF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'two_factor_user_id_fkey') THEN
		ALTER TABLE "two_factor" RENAME CONSTRAINT "two_factor_user_id_fkey" TO "two_factor_user_id_user_id_fk";
	ELSE
		ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relay_history_time_fingerprint_uniq" ON "relay_history" USING btree ("time","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "concentration_snapshots_time_dim_key_uniq" ON "concentration_snapshots" USING btree ("time","dimension","key");
