import { getInstance } from '@/lib/federation';
import { federationLog, getDb, relays } from '@tor-sockets/db';
import { signEnvelope } from '@tor-sockets/federation';
import { count, max, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Signed instance status. Peers poll this to learn our freshness and
 * to cross-check our view of the network against theirs.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);

  // Instance keypair, relay stats, and the federation-log watermark are
  // independent reads: start them together so no round-trip waits for another.
  const [instance, [statsRow], [seqRow]] = await Promise.all([
    getInstance(),
    db
      .select({
        total: count(),
        running: sql<number>`count(*) filter (where ${relays.running})`,
        weightMax: max(relays.consensusWeight),
        lastSeen: max(relays.lastSeen),
      })
      .from(relays),
    db.select({ lastSeq: max(federationLog.seq) }).from(federationLog),
  ]);

  const payload = {
    software: { name: 'tor-sockets', version: '0.0.0' },
    sources: ['onionoo'],
    last_consensus_published: statsRow?.lastSeen?.toISOString() ?? null,
    relays_total: statsRow?.total ?? 0,
    relays_running: Number(statsRow?.running ?? 0),
    consensus_weight_max: statsRow?.weightMax ?? 0,
    federation_log_last_seq: seqRow?.lastSeq ? Number(seqRow.lastSeq) : 0,
    booted_at: instance.bootedAt,
  };

  const envelope = await signEnvelope(payload, instance.keypair, instance.uri);
  return Response.json(envelope, {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
