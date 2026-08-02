import { createHash } from 'node:crypto';
import {
  type SnapshotPayload,
  type StatusPayload,
  snapshotPayloadSchema,
  statusPayloadSchema,
} from '@tor-sockets/api-contract';
import { type Database, anomalies, federationPeers, relays } from '@tor-sockets/db';
import {
  FederationVerifyError,
  type InstanceKeypair,
  fetchVerifiedEndpoint,
} from '@tor-sockets/federation';
import { count, eq, sql, sum } from 'drizzle-orm';

export interface PeerSyncResult {
  status: 'ok';
  peersChecked: number;
  peersReached: number;
  divergences: number;
  durationMs: number;
  errors: string[];
}

/**
 * Compute our own relay_set_hash + aggregate counts, mirroring the
 * `/federation/v1/snapshot` endpoint so the comparison is apples-to-apples.
 */
async function computeOwnSnapshot(db: Database) {
  const [aggRow] = await db
    .select({
      total: count(),
      running: sql<number>`count(*) filter (where ${relays.running})`,
      weightSum: sum(relays.consensusWeight),
    })
    .from(relays);

  const fingerprintRows = await db.select({ f: relays.fingerprint }).from(relays);
  const fingerprints = fingerprintRows.map((r) => r.f).sort();
  const relaySetHash = createHash('sha256').update(fingerprints.join('\n')).digest('hex');

  return {
    relays_total: aggRow?.total ?? 0,
    relays_running: Number(aggRow?.running ?? 0),
    consensus_weight_sum: aggRow?.weightSum ? Number(aggRow.weightSum) : 0,
    relay_set_hash: relaySetHash,
    relay_set_count: fingerprints.length,
  };
}

function divergenceId(peerInstanceId: string, ourHash: string, theirHash: string): string {
  return createHash('sha256')
    .update(`peer_divergence:${peerInstanceId}:${ourHash}:${theirHash}`)
    .digest('hex')
    .slice(0, 36);
}

/**
 * Sync with every known peer: fetch + verify each peer's `/status` and
 * `/snapshot`, record the observed state, and cross-check the relay set hash
 * against our own. Divergences are materialized as `peer_divergence` anomalies
 * (deduped by peer + hash pair, so a persistent divergence only fires once).
 *
 * Network failures and verification errors never abort the whole job - the peer
 * is skipped and recorded in `errors`.
 */
export async function runPeerSync(
  db: Database,
  opts: { instance?: InstanceKeypair } = {},
): Promise<PeerSyncResult> {
  const start = Date.now();
  const own = await computeOwnSnapshot(db);

  const peers = await db.select().from(federationPeers).orderBy(federationPeers.discoveredAt);

  const errors: string[] = [];
  let reached = 0;
  let divergences = 0;

  for (const peer of peers) {
    try {
      const { envelope: snapEnv } = await fetchVerifiedEndpoint<SnapshotPayload>(
        peer.uri,
        '/federation/v1/snapshot',
      );
      const snap = snapshotPayloadSchema.parse(snapEnv.payload);

      let lastSeq: number | null = null;
      try {
        const { envelope: statusEnv } = await fetchVerifiedEndpoint<StatusPayload>(
          peer.uri,
          '/federation/v1/status',
        );
        const status = statusPayloadSchema.parse(statusEnv.payload);
        lastSeq = status.federation_log_last_seq;
      } catch {
        // /status is best-effort; snapshot is enough to cross-check.
      }

      const matches = snap.relay_set_hash === own.relay_set_hash;
      await db
        .update(federationPeers)
        .set({
          lastSeenAt: new Date(),
          lastSyncSeq: BigInt(lastSeq ?? 0),
          lastStatus: {
            relay_set_hash: snap.relay_set_hash,
            relay_set_count: snap.relay_set_count,
            relays_total: snap.relays_total,
            relays_running: snap.relays_running,
            consensus_weight_sum: snap.consensus_weight_sum,
            matches_own: matches,
            checked_against: own.relay_set_hash,
            checked_at: new Date().toISOString(),
          },
        })
        .where(eq(federationPeers.instanceId, peer.instanceId));

      reached += 1;

      if (!matches) {
        const id = divergenceId(peer.instanceId, own.relay_set_hash, snap.relay_set_hash);
        const [inserted] = await db
          .insert(anomalies)
          .values({
            id,
            type: 'peer_divergence',
            severity: 'medium',
            details: {
              peer_instance_id: peer.instanceId,
              peer_uri: peer.uri,
              own_relay_set_hash: own.relay_set_hash,
              peer_relay_set_hash: snap.relay_set_hash,
              own_relay_set_count: own.relay_set_count,
              peer_relay_set_count: snap.relay_set_count,
              own_running: own.relays_running,
              peer_running: snap.relays_running,
            },
            sourceInstance: opts.instance?.instanceId,
            sources: ['onionoo'],
          })
          .onConflictDoNothing()
          .returning({ id: anomalies.id });
        if (inserted) divergences += 1;
      }
    } catch (err) {
      const msg =
        err instanceof FederationVerifyError
          ? `${peer.uri}: ${err.code} (${err.message})`
          : `${peer.uri}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
    }
  }

  return {
    status: 'ok',
    peersChecked: peers.length,
    peersReached: reached,
    divergences,
    durationMs: Date.now() - start,
    errors,
  };
}
