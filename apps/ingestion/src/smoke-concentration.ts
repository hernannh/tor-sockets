import { getDb } from '@tor-sockets/db';
import { runConcentrationSnapshot } from './jobs/concentration-snapshot';

/**
 * One-shot smoke test: compute a concentration snapshot against the current
 * relay set and print the HHI per dimension.
 *
 * Usage: `bun run src/smoke-concentration.ts`
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  console.log('[smoke] computing concentration snapshot...');
  const result = await runConcentrationSnapshot(db);
  console.log('[smoke] result:', JSON.stringify(result, null, 2));
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
