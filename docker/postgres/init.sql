-- Tor-Sockets DB init
-- Runs once on first container boot (docker-entrypoint-initdb.d).

-- TimescaleDB community extension (hypertables for relay_history, concentration_snapshots).
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- pgcrypto for gen_random_uuid() if not already available via pg17 core.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'TimescaleDB extension ready.';
END $$;
