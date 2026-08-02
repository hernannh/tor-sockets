import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Database = ReturnType<typeof createDb>;

/**
 * Build a Drizzle client bound to the full schema.
 * Connection pooling is handled by `postgres` (default 10 conns).
 */
export function createDb(databaseUrl: string, options?: { max?: number }) {
  const client = postgres(databaseUrl, {
    max: options?.max ?? 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

/**
 * Singleton for app usage (server components, route handlers, workers).
 * Lazily initialised from `DATABASE_URL`.
 */
let _db: Database | null = null;

export function getDb(databaseUrl?: string): Database {
  if (_db) return _db;
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  _db = createDb(url);
  return _db;
}
