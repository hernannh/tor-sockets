import { getDb } from '@tor-sockets/db';
import { getInstanceIdentity } from './instance';
import { runConcentrationSnapshot } from './jobs/concentration-snapshot';
import { OPS, logFederationEvent } from './jobs/federation-log';

/**
 * One-shot smoke test: run a concentration snapshot AND log it to
 * federation_log (the full CDC path that the worker does after a poll).
 * Usage: `bun run src/smoke-cdc.ts`
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  const identity = await getInstanceIdentity();

  console.log('[smoke-cdc] identity:', identity.keypair.instanceId);
  console.log('[smoke-cdc] running concentration snapshot...');
  const result = await runConcentrationSnapshot(db);
  console.log('[smoke-cdc] concentration:', JSON.stringify(result.perDimension));

  console.log('[smoke-cdc] logging snapshot_taken to federation_log...');
  const entry = await logFederationEvent(db, identity.keypair, OPS.snapshotTaken, {
    at: result.at,
    inserted: result.inserted,
    dimensions: result.perDimension,
  });
  console.log('[smoke-cdc] logged:', {
    seq: entry.seq,
    op: entry.op,
    payloadHash: entry.payloadHash.slice(0, 16),
  });
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke-cdc] fatal:', err);
  process.exit(1);
});
