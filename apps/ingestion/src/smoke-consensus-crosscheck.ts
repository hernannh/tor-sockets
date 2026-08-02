import { getDb } from '@tor-sockets/db';
import { getInstanceIdentity } from './instance';
import { runConsensusCrossCheck } from './jobs/consensus-crosscheck';

/**
 * Smoke test / manual run: fetch the latest raw consensus and cross-check it
 * against the Onionoo-derived `relays` table. Confirms agreeing relays
 * into `sources[]` and records any `consensus_divergence` anomaly.
 *
 * Usage: `bun run src/smoke-consensus-crosscheck.ts`
 * Requires a populated `relays` table (run onionoo-poll first).
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  const identity = await getInstanceIdentity();
  console.log('[smoke-consensus] fetching latest consensus + cross-checking...');
  const result = await runConsensusCrossCheck(db, {
    sourceInstance: identity.keypair.instanceId,
    sources: ['onionoo', 'consensus'],
  });
  console.log('[smoke-consensus] result:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke-consensus] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
