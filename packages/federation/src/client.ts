import { type ActorDocument, actorDocumentSchema } from '@tor-sockets/api-contract';
import { ED25519_PUBLIC_KEY_BYTES, ED25519_SIGNATURE_BYTES, fromBase64, verify } from './ed25519';
import { type SafeFetchOptions, safeFetch } from './safe-fetch';
import { canonicalJson } from './sign';
import type { SignedEnvelope } from './sign';

export interface VerifiedEnvelope<TPayload> {
  envelope: SignedEnvelope<TPayload>;
  actor: ActorDocument;
}

export class FederationVerifyError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'fetch_failed'
      | 'invalid_actor'
      | 'instance_mismatch'
      | 'uri_mismatch'
      | 'bad_signature'
      | 'stale',
  ) {
    super(message);
    this.name = 'FederationVerifyError';
  }
}

const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

/**
 * Fetch a peer's actor document from `/.well-known/tor-federation.json`.
 * Validates the shape with zod. Returns null on 404.
 */
export async function fetchActorDocument(
  instanceUri: string,
  init?: SafeFetchOptions,
): Promise<ActorDocument> {
  const base = instanceUri.replace(/\/$/, '');
  const url = `${base}/.well-known/tor-federation.json`;
  const res = await safeFetch(url, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new FederationVerifyError(
      `actor document fetch failed: ${res.status} ${res.statusText} for ${url}`,
      'fetch_failed',
    );
  }
  const json = (await res.json()) as unknown;
  const parsed = actorDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new FederationVerifyError(
      `actor document invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      'invalid_actor',
    );
  }
  return parsed.data;
}

/**
 * Verify a SignedEnvelope against an actor document.
 *
 * Checks (per spec section 4.3):
 *  1. `actor.instance_id === envelope.instance_id`
 *  2. `actor.instance_uri === envelope.instance_uri` (anti-republication)
 *  3. `signed_at` within ±15min of `now`
 *  4. Ed25519 signature over `${signed_at}\n${instance_id}\n${canonicalJson(payload)}`
 *
 * Does NOT check the payload shape - callers parse `envelope.payload` with the
 * endpoint-specific schema after this succeeds.
 */
export function verifyEnvelope<TPayload>(
  envelope: SignedEnvelope<TPayload>,
  actor: ActorDocument,
  now: Date = new Date(),
): void {
  if (actor.instance_id !== envelope.instance_id) {
    throw new FederationVerifyError(
      `instance_id mismatch: actor=${actor.instance_id.slice(0, 12)} envelope=${envelope.instance_id.slice(0, 12)}`,
      'instance_mismatch',
    );
  }
  if (actor.instance_uri !== envelope.instance_uri) {
    throw new FederationVerifyError(
      `instance_uri mismatch: actor=${actor.instance_uri} envelope=${envelope.instance_uri}`,
      'uri_mismatch',
    );
  }
  const signedAt = Date.parse(envelope.signed_at);
  if (Number.isNaN(signedAt) || Math.abs(now.getTime() - signedAt) > MAX_CLOCK_SKEW_MS) {
    throw new FederationVerifyError(`stale envelope: signed_at=${envelope.signed_at}`, 'stale');
  }
  const message = Buffer.from(
    `${envelope.signed_at}\n${envelope.instance_id}\n${canonicalJson(envelope.payload)}`,
    'utf8',
  );
  let ok = false;
  try {
    ok = verify(
      fromBase64(envelope.sig, ED25519_SIGNATURE_BYTES),
      message,
      fromBase64(actor.pubkey, ED25519_PUBLIC_KEY_BYTES),
    );
  } catch {
    // Malformed base64 / wrong length in attacker-controlled material.
    ok = false;
  }
  if (!ok) {
    throw new FederationVerifyError(
      'signature does not verify against actor pubkey',
      'bad_signature',
    );
  }
}

/**
 * Fetch a signed federation endpoint, pull the peer's actor document, and verify
 * the envelope end-to-end. Returns the parsed envelope + actor used to verify.
 */
export async function fetchVerifiedEndpoint<TPayload>(
  instanceUri: string,
  path: string,
  init?: SafeFetchOptions,
): Promise<VerifiedEnvelope<TPayload>> {
  const actor = await fetchActorDocument(instanceUri, init);
  const base = instanceUri.replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await safeFetch(url, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new FederationVerifyError(
      `endpoint fetch failed: ${res.status} ${res.statusText} for ${url}`,
      'fetch_failed',
    );
  }
  const envelope = (await res.json()) as SignedEnvelope<TPayload>;
  verifyEnvelope(envelope, actor);
  return { envelope, actor };
}
