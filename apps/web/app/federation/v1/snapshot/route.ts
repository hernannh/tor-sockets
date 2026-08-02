import { createHash } from 'node:crypto';
import { getInstance } from '@/lib/federation';
import { getDb, relays } from '@tor-sockets/db';
import { signEnvelope } from '@tor-sockets/federation';
import { count, sql, sum } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Signed snapshot of the instance's aggregated view of the network.
 * The `relay_set_hash` lets two peers cheaply detect whether they agree on
 * the relay set without exchanging full data; differences are reconciled
 * via `/changes`.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);

  // The aggregate, the fingerprint set (for the relay-set hash), and the
  // instance keypair are independent reads: run them together.
  const [instance, [aggRow], fingerprintRows] = await Promise.all([
    getInstance(),
    db
      .select({
        total: count(),
        running: sql<number>`count(*) filter (where ${relays.running})`,
        weightSum: sum(relays.consensusWeight),
      })
      .from(relays),
    db.select({ f: relays.fingerprint }).from(relays),
  ]);
  const fingerprints = fingerprintRows.map((r) => r.f).sort();
  const relaySetHash = createHash('sha256').update(fingerprints.join('\n')).digest('hex');

  const payload = {
    relays_total: aggRow?.total ?? 0,
    relays_running: Number(aggRow?.running ?? 0),
    consensus_weight_sum: aggRow?.weightSum ? Number(aggRow.weightSum) : 0,
    relay_set_hash: relaySetHash,
    relay_set_count: fingerprints.length,
    computed_at: new Date().toISOString(),
  };

  const envelope = await signEnvelope(payload, instance.keypair, instance.uri);
  return Response.json(envelope, {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
