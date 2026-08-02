import { createHash } from 'node:crypto';
import { type Database, federationLog } from '@tor-sockets/db';
import { type InstanceKeypair, canonicalJson, sign, toBase64 } from '@tor-sockets/federation';

/**
 * CDC op codes written to `federation_log` and served from `/changes`.
 * Adding a code = bump the federation spec minor version.
 */
export const OPS = {
  consensusProcessed: 'consensus_processed',
  snapshotTaken: 'snapshot_taken',
  anomalyDetected: 'anomaly_detected',
  alertTriggered: 'alert_triggered',
  peerSynced: 'peer_synced',
} as const;

export type FederationOp = (typeof OPS)[keyof typeof OPS];

export interface LoggedEvent {
  seq: number;
  instanceId: string;
  op: string;
  payload: unknown;
  payloadHash: string;
  sig: string;
  createdAt: Date;
}

/**
 * Write one signed change event into the `federation_log` append-only table.
 *
 * Signature covers `${createdAtIso}.${instanceId}.${op}.${payloadHash}` where
 * `payloadHash = sha256(canonicalJson(payload))`. `seq` is DB-generated and
 * serves only as the pagination cursor for `/changes?since=` - peers verify
 * with the instance pubkey published in the actor document.
 *
 * Returns the inserted row including the DB-assigned `seq`.
 */
export async function logFederationEvent(
  db: Database,
  keypair: InstanceKeypair,
  op: FederationOp | string,
  payload: unknown,
  at: Date = new Date(),
): Promise<LoggedEvent> {
  const createdAtIso = at.toISOString();
  const payloadHash = createHash('sha256').update(canonicalJson(payload)).digest('hex');
  const message = `${createdAtIso}.${keypair.instanceId}.${op}.${payloadHash}`;
  const sig = toBase64(sign(Buffer.from(message, 'utf8'), keypair.privateKey));

  const [row] = await db
    .insert(federationLog)
    .values({
      instanceId: keypair.instanceId,
      op,
      payload,
      payloadHash,
      sig,
      createdAt: at,
    })
    .returning({
      seq: federationLog.seq,
      instanceId: federationLog.instanceId,
      op: federationLog.op,
      payload: federationLog.payload,
      payloadHash: federationLog.payloadHash,
      sig: federationLog.sig,
      createdAt: federationLog.createdAt,
    });

  if (!row) throw new Error('federation_log insert returned no row');
  return { ...row, seq: Number(row.seq) };
}
