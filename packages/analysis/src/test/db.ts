import type { Database } from '@tor-sockets/db';
import * as schema from '@tor-sockets/db/schema';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { testDatabaseUrl } from './global-setup';

let _client: ReturnType<typeof postgres> | null = null;
let _db: Database | null = null;

/** Shared Drizzle client for the per-run test database. */
export function getDb(): Database {
  if (_db) return _db;
  _client = postgres(testDatabaseUrl(), { max: 5, prepare: false });
  _db = drizzle(_client, { schema }) as unknown as Database;
  return _db;
}

/** Close the underlying connection pool (call in afterAll). */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

const TABLES = [
  'alert_events',
  'alert_rules',
  'anomalies',
  'as_org',
  'concentration_snapshots',
  'relay_history',
  'relays',
] as const;

/** Wipe every table the analysis engine touches, in any order (CASCADE). */
export async function resetTables(): Promise<void> {
  await getDb().execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));
}
