-- Worker liveness, one row per repeatable job.
--
-- The header chip reported only the age of the last consensus, which cannot
-- distinguish a healthy instance from a broken one: Onionoo republishes with
-- roughly an hour of lag, so even a perfect pipeline is always 1-2h behind the
-- consensus it is reporting. When the Onionoo poll started timing out on the
-- first deploy, the readout looked exactly the same as normal operation and the
-- data quietly aged out of date behind a green stack.
--
-- `last_success_at` answers the other question - when did the pipeline last
-- complete a cycle - and is expected to stay under the poll interval.
--
-- Additive and idempotent, like every migration here.

CREATE TABLE IF NOT EXISTS "ingest_status" (
  "job" text PRIMARY KEY,
  "last_success_at" timestamp with time zone NOT NULL DEFAULT now(),
  "detail" jsonb
);
