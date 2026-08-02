import { subscribePayloadSchema } from '@tor-sockets/api-contract';
import { federationPeers, getDb } from '@tor-sockets/db';
import {
  FederationVerifyError,
  assertUrlSafe,
  fetchActorDocument,
  verifyEnvelope,
} from '@tor-sockets/federation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /federation/v1/subscribe
 *
 * Webhook subscription + peer registration. The body is a SignedEnvelope whose
 * payload carries the subscriber's own actor document (and an optional webhook
 * URL). The server:
 *   1. Parses the payload.
 *   2. Fetches the actor document from `actor.instance_uri` (anti-republication,
 *      per spec section 4.3 - the pubkey must come from the canonical origin).
 *   3. Verifies the envelope signature against the fetched pubkey.
 *   4. Upserts into `federation_peers` with `trusted = false` (anti-Sybil: the
 *      operator must opt-in to cross-verification manually).
 *
 * Spec: FEDERATION.md section 5.5
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') {
    return Response.json(
      { error: { code: 'invalid_body', message: 'expected a signed envelope' } },
      { status: 400 },
    );
  }

  const env = body as {
    spec?: string;
    signed_at?: string;
    instance_id?: string;
    instance_uri?: string;
    payload?: unknown;
    sig?: string;
  };

  if (
    !env.signed_at ||
    !env.instance_id ||
    !env.instance_uri ||
    !env.sig ||
    env.payload === undefined
  ) {
    return Response.json(
      { error: { code: 'invalid_envelope', message: 'missing envelope fields' } },
      { status: 400 },
    );
  }

  const parsedPayload = subscribePayloadSchema.safeParse(env.payload);
  if (!parsedPayload.success) {
    return Response.json(
      {
        error: {
          code: 'invalid_payload',
          message: parsedPayload.error.issues[0]?.message ?? 'invalid subscribe payload',
        },
      },
      { status: 400 },
    );
  }
  const payload = parsedPayload.data;

  if (payload.actor.instance_id !== env.instance_id) {
    return Response.json(
      {
        error: {
          code: 'instance_mismatch',
          message: 'payload.actor.instance_id must match envelope.instance_id',
        },
      },
      { status: 400 },
    );
  }

  // Reject an unsafe webhook target at registration time rather than storing it
  // and failing on every delivery. safeFetch would block it later anyway; this
  // keeps the internal-probing surface out of the database entirely.
  if (payload.webhook_url) {
    try {
      assertUrlSafe(payload.webhook_url);
    } catch {
      return Response.json(
        { error: { code: 'invalid_webhook_url', message: 'webhook_url is not an allowed target' } },
        { status: 400 },
      );
    }
  }

  let verifiedActor: Awaited<ReturnType<typeof fetchActorDocument>>;
  try {
    const fetchedActor = await fetchActorDocument(payload.actor.instance_uri);
    verifyEnvelope(
      {
        spec: 'tor-federation/0.1',
        signed_at: env.signed_at,
        instance_id: env.instance_id,
        instance_uri: env.instance_uri,
        payload: env.payload,
        sig: env.sig,
      },
      fetchedActor,
    );
    verifiedActor = fetchedActor;
  } catch (err) {
    // Log the specifics server-side; return a generic message to the caller so
    // the endpoint cannot be used as an oracle to probe internal services
    // (status codes, blocked-IP errors, redirect targets).
    const code = err instanceof FederationVerifyError ? err.code : 'fetch_failed';
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[federation/subscribe] verification failed', { code, detail });
    return Response.json(
      { error: { code: 'verification_failed', message: 'verification failed' } },
      { status: 403 },
    );
  }

  // Persist what we VERIFIED (the actor document re-fetched from the canonical
  // origin), never the copy the caller put in the body: the body copy is
  // attacker-controlled and would let a peer register a pubkey it does not
  // actually publish, poisoning any later verification that trusts this row.
  const db = getDb(process.env.DATABASE_URL);
  await db
    .insert(federationPeers)
    .values({
      instanceId: verifiedActor.instance_id,
      uri: verifiedActor.instance_uri,
      pubkey: verifiedActor.pubkey,
      contact: verifiedActor.contact,
      trusted: false,
      lastSeenAt: new Date(),
      lastStatus: { subscribed: true, webhook_url: payload.webhook_url ?? null },
    })
    .onConflictDoUpdate({
      target: federationPeers.instanceId,
      set: {
        uri: verifiedActor.instance_uri,
        pubkey: verifiedActor.pubkey,
        contact: verifiedActor.contact,
        lastSeenAt: new Date(),
        lastStatus: { subscribed: true, webhook_url: payload.webhook_url ?? null },
      },
    });

  return Response.json({
    accepted: true,
    instance_id: payload.actor.instance_id,
    trusted: false,
    message: 'peer registered; cross-verification requires operator trust',
  });
}
