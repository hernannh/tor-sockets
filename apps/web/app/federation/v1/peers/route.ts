import { getInstance } from '@/lib/federation';
import { federationPeers, getDb } from '@tor-sockets/db';
import { signEnvelope } from '@tor-sockets/federation';
import { asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /federation/v1/peers
 *
 * Signed gossip list of peers this instance knows about. Enables transitive
 * discovery: a peer polling this endpoint learns of other peers it could also
 * sync from. Only publishes safe fields (instance_id, uri, trusted, last_seen)
 * - never internal sync cursors or status snapshots.
 *
 * Spec: FEDERATION.md section 5.4
 */
export async function GET() {
  const instance = await getInstance();
  const db = getDb(process.env.DATABASE_URL);

  const rows = await db
    .select({
      instanceId: federationPeers.instanceId,
      uri: federationPeers.uri,
      trusted: federationPeers.trusted,
      lastSeenAt: federationPeers.lastSeenAt,
    })
    .from(federationPeers)
    .orderBy(asc(federationPeers.discoveredAt));

  const payload = {
    peers: rows.map((r) => ({
      instance_id: r.instanceId,
      instance_uri: r.uri,
      trusted: r.trusted,
      last_seen_at: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    })),
    count: rows.length,
  };

  const envelope = await signEnvelope(payload, instance.keypair, instance.uri);
  return Response.json(envelope, {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
