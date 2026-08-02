import { detectAnomalies } from '@tor-sockets/analysis';
import { getDb } from '@tor-sockets/db';
import { getInstanceIdentity } from './instance';

/**
 * One-shot smoke test: run all anomaly detectors against the current data
 * and print findings. Usage: `bun run src/smoke-anomalies.ts`
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  const identity = await getInstanceIdentity();
  console.log('[smoke] instance:', identity.keypair.instanceId);
  console.log('[smoke] detecting anomalies...');
  const result = await detectAnomalies(db, {
    sourceInstance: identity.keypair.instanceId,
    sources: ['onionoo'],
  });
  console.log('[smoke] result:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
