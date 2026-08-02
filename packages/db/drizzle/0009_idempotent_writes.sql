-- Idempotency for the time-series write path (audit H5/H6).
--
-- relay_history and concentration_snapshots are append-only hypertables written
-- in chunks. A partial failure mid-cycle (DB blip, timeout) could leave
-- duplicate rows: the Onionoo Last-Modified marker is only persisted at the END
-- of a successful cycle, so the next cron tick re-inserts everything. These
-- unique constraints make the chunked inserts idempotent via ON CONFLICT.
--
-- Step 1: remove duplicates already produced by the pre-fix bug (keep one row
--         per key). Idempotent - safe to re-run.
-- Step 2: create the unique indexes. Timescale requires a hypertable unique
--         index to include the partition column (`time`) - both do.

DELETE FROM "relay_history"
WHERE ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY "time", "fingerprint"
             ORDER BY "consensus_weight" DESC NULLS LAST
           ) AS rn
    FROM "relay_history"
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "relay_history_time_fingerprint_uniq"
  ON "relay_history" ("time", "fingerprint");

DELETE FROM "concentration_snapshots"
WHERE ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY "time", "dimension", "key"
             ORDER BY "relay_count" DESC
           ) AS rn
    FROM "concentration_snapshots"
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "concentration_snapshots_time_dim_key_uniq"
  ON "concentration_snapshots" ("time", "dimension", "key");
