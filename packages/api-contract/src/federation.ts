import { z } from 'zod';

/**
 * Tor federation protocol v0.1 - request/response schemas.
 *
 * Mirrors `FEDERATION.md`. These zod schemas validate:
 *  - the actor document at `/.well-known/tor-federation.json`
 *  - payloads inside the `SignedEnvelope.payload` of federation endpoints
 *  - the body of `POST /subscribe`
 *
 * The envelope itself (`spec`, `signed_at`, `instance_id`, `instance_uri`,
 * `payload`, `sig`) is produced/verified by `@tor-sockets/federation`; here we
 * only describe the inner payloads so handlers can parse them.
 */

export const federationSpecSchema = z.literal('tor-federation/0.1');

export const instanceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'instance_id must be sha256(pubkey) hex (64 lowercase hex chars)');

export const base64Schema = z.string().min(1);

/**
 * Actor document published at `/.well-known/tor-federation.json`.
 * This IS the root of trust: the pubkey here verifies every signed envelope.
 */
export const actorDocumentSchema = z.object({
  spec: federationSpecSchema,
  instance_id: instanceIdSchema,
  instance_uri: z.string().url(),
  pubkey: base64Schema,
  software: z.object({ name: z.string(), version: z.string() }),
  sources: z.array(z.string()),
  contact: z.string().nullable(),
  bootstrapped_at: z.string().datetime(),
  endpoints: z
    .object({
      status: z.string(),
      snapshot: z.string(),
      changes: z.string(),
      peers: z.string(),
      subscribe: z.string(),
    })
    .partial(),
});

export type ActorDocument = z.infer<typeof actorDocumentSchema>;

// --- Payloads served from /federation/v1/* ---

export const snapshotPayloadSchema = z.object({
  relays_total: z.number().int(),
  relays_running: z.number().int(),
  consensus_weight_sum: z.number(),
  relay_set_hash: z.string(),
  relay_set_count: z.number().int(),
  computed_at: z.string().datetime(),
});
export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;

export const statusPayloadSchema = z.object({
  software: z.object({ name: z.string(), version: z.string() }),
  sources: z.array(z.string()),
  last_consensus_published: z.string().datetime().nullable(),
  relays_total: z.number().int(),
  relays_running: z.number().int(),
  consensus_weight_max: z.number(),
  federation_log_last_seq: z.number().int(),
  booted_at: z.string().datetime(),
});
export type StatusPayload = z.infer<typeof statusPayloadSchema>;

/**
 * One row of the gossip list served from `GET /peers`.
 * Only exposes fields safe to publish (no internal sync state).
 */
export const peerEntrySchema = z.object({
  instance_id: instanceIdSchema,
  instance_uri: z.string().url(),
  trusted: z.boolean(),
  last_seen_at: z.string().datetime().nullable(),
});
export type PeerEntry = z.infer<typeof peerEntrySchema>;

export const peersPayloadSchema = z.object({
  peers: z.array(peerEntrySchema),
  count: z.number().int(),
});
export type PeersPayload = z.infer<typeof peersPayloadSchema>;

// --- POST /subscribe ---

/**
 * Subscribe request: the subscriber submits their own actor document plus the
 * webhook URL where they want change notifications pushed. The body is wrapped
 * in a SignedEnvelope signed by the subscriber's instance key - the server
 * verifies it against the actor document fetched from `instance_uri` before
 * recording the peer.
 */
export const subscribePayloadSchema = z.object({
  actor: actorDocumentSchema,
  webhook_url: z.string().url().optional(),
});
export type SubscribePayload = z.infer<typeof subscribePayloadSchema>;

export const subscribeResponseSchema = z.object({
  accepted: z.boolean(),
  instance_id: instanceIdSchema,
  trusted: z.boolean(),
  message: z.string().optional(),
});
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;
