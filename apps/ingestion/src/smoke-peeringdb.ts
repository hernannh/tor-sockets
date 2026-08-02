import { getDb } from '@tor-sockets/db';
import { runPeeringdbSync } from './jobs/peeringdb-sync';

/**
 * Smoke test / manual bootstrap: fetch PeeringDB and populate `as_org`.
 *
 * Usage: `bun run src/smoke-peeringdb.ts`
 * Env: PEERINGDB_API_KEY (optional), PEERINGDB_BASE_URL (optional).
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  console.log('[smoke-peeringdb] fetching PeeringDB net + org...');
  const result = await runPeeringdbSync(db);
  console.log('[smoke-peeringdb] result:', JSON.stringify(result));
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch((err) => {
  console.error('[smoke-peeringdb] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
