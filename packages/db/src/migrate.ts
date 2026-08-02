import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from './client';

/**
 * Run pending Drizzle migrations (SQL files in `../drizzle`).
 * Used by `pnpm db:migrate` and the deploy job (post-deploy step).
 */
export async function runMigrations(databaseUrl?: string) {
  const db = getDb(databaseUrl);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[db] migrations applied');
}

runMigrations().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
