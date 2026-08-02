import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Per-run test database URL, derived from DATABASE_URL by swapping the database
 * name to `<name>_test`. Kept separate from the dev DB so test TRUNCATEs never
 * touch ingested data.
 */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL is not set - start the docker stack first (docker/compose.yml)');
  const u = new URL(base);
  const dbName = u.pathname.replace(/^\//, '') || 'torsockets';
  u.pathname = `/${dbName}_test`;
  return u.toString();
}

/** Admin connection (to the `postgres` maintenance DB) for CREATE/DROP. */
function adminUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  const u = new URL(base);
  u.pathname = '/postgres';
  return u.toString();
}

/**
 * Vitest globalSetup: drop+recreate the test DB, enable TimescaleDB, and run
 * pending Drizzle migrations. Runs once before the test suite. Hermetic - the
 * schema is rebuilt from scratch each run.
 */
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const admin = postgres(adminUrl(), { max: 1 });
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const conn = postgres(url, { max: 1 });
  await conn.unsafe('CREATE EXTENSION IF NOT EXISTS timescaledb');
  await conn.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // Run migrations via a Drizzle client we own (so we can close its pool).
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const schema = await import('@tor-sockets/db/schema');
  const migrationsFolder = fileURLToPath(new URL('../../../db/drizzle', import.meta.url));
  if (!existsSync(migrationsFolder)) {
    throw new Error(`migrations folder not found: ${migrationsFolder}`);
  }
  const migClient = postgres(url, { max: 1 });
  const migDb = drizzle(migClient, { schema });
  await migrate(migDb, { migrationsFolder });
  await migClient.end();
  await conn.end();
}
