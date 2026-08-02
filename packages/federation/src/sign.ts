import {
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  fromBase64,
  sign,
  toBase64,
  verify,
} from './ed25519';
import type { InstanceKeypair } from './keypair';

/**
 * Deterministic JSON serialization for signing.
 * Object keys are sorted recursively; arrays preserve order; numbers and
 * strings are emitted by `JSON.stringify`. This guarantees that any peer
 * verifying a signature reconstructs the exact bytes that were signed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const body = sortedKeys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * Build the canonical message bytes that a payload's signature covers:
 *   `${signedAt}\n${instanceId}\n${canonicalJson(payload)}`
 */
export function signingMessage(signedAt: string, instanceId: string, payload: unknown): Uint8Array {
  const text = `${signedAt}\n${instanceId}\n${canonicalJson(payload)}`;
  return Buffer.from(text, 'utf8');
}

/**
 * Sign a payload with the instance secret key, returning a base64 signature.
 * Async to keep the surface stable for future KMS/HSM backends.
 */
export async function signPayload(
  signedAt: string,
  instanceId: string,
  payload: unknown,
  keypair: InstanceKeypair,
): Promise<string> {
  const message = signingMessage(signedAt, instanceId, payload);
  const signature = sign(message, keypair.privateKey);
  return toBase64(signature);
}

/**
 * Verify a base64 Ed25519 signature against a base64 public key
 * (as published in the peer's actor document).
 */
export async function verifyPayload(
  signedAt: string,
  instanceId: string,
  payload: unknown,
  signatureBase64: string,
  publicKeyBase64: string,
): Promise<boolean> {
  const message = signingMessage(signedAt, instanceId, payload);
  try {
    // Both inputs come from a peer, so malformed material must read as "does
    // not verify" rather than blow up the caller.
    const signature = fromBase64(signatureBase64, ED25519_SIGNATURE_BYTES);
    const publicKey = fromBase64(publicKeyBase64, ED25519_PUBLIC_KEY_BYTES);
    return verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export interface SignedEnvelope<TPayload> {
  spec: 'tor-federation/0.1';
  signed_at: string;
  instance_id: string;
  instance_uri: string;
  payload: TPayload;
  sig: string;
}

/**
 * Wrap a payload in a signed envelope ready to serve from a federation endpoint.
 */
export async function signEnvelope<TPayload>(
  payload: TPayload,
  keypair: InstanceKeypair,
  instanceUri: string,
): Promise<SignedEnvelope<TPayload>> {
  const signedAt = new Date().toISOString();
  const sig = await signPayload(signedAt, keypair.instanceId, payload, keypair);
  return {
    spec: 'tor-federation/0.1',
    signed_at: signedAt,
    instance_id: keypair.instanceId,
    instance_uri: instanceUri,
    payload,
    sig,
  };
}
