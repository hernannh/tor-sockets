-- Convert time-series tables to TimescaleDB hypertables.
-- The `timescaledb` extension itself is enabled at DB bootstrap via
-- docker/postgres/init.sql, so it is available by the time migrations run.

SELECT create_hypertable(
  'relay_history',
  'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

SELECT create_hypertable(
  'concentration_snapshots',
  'time',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Speed up the most common time-range scans performed by the analysis engine
-- (Fase 1) and the API/UI (Fase 2).
CREATE INDEX IF NOT EXISTS relay_history_fingerprint_time_idx
  ON relay_history (fingerprint, time DESC);

CREATE INDEX IF NOT EXISTS concentration_snapshots_dim_time_idx
  ON concentration_snapshots (dimension, key, time DESC);

-- Retention policy: keep 5 years of relay history (can be tuned later).
-- 5y is enough for longitudinal concentration studies without unbounded disk.
SELECT add_retention_policy('relay_history', INTERVAL '5 years', if_not_exists => TRUE);
SELECT add_retention_policy('concentration_snapshots', INTERVAL '5 years', if_not_exists => TRUE);
