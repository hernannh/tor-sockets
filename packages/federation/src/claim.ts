import { ED25519_PUBLIC_KEY_BYTES, ED25519_SIGNATURE_BYTES, fromBase64, verify } from './ed25519';
import type { InstanceKeypair } from './keypair';

/**
 * Canonical message signed by an operator's relay master identity key to
 * prove ownership (the T2 claim tier).
 *
 * Stateless challenge: the message binds the signature to this Tor-Sockets
 * instance + the claiming operator + the target relay. Replay is harmless
 * (it only re-asserts the same ownership for the same operator) and the
 * signature cannot be reused to claim the relay under a different operator.
 */
export function buildT2ClaimMessage(
  instanceId: string,
  operatorId: string,
  fingerprint: string,
): Uint8Array {
  const text = `tor-sockets-ed25519-claim-v1\n${instanceId}\n${operatorId}\n${fingerprint.toUpperCase()}`;
  return Buffer.from(text, 'utf8');
}

/**
 * Verify a T2 ownership signature against a relay's published Ed25519 master
 * identity public key (base64, as exposed in Tor server descriptors via
 * `master-key-ed25519`).
 */
export function verifyT2Claim(
  instanceId: string,
  operatorId: string,
  fingerprint: string,
  signatureBase64: string,
  masterPublicKeyBase64: string,
): boolean {
  const message = buildT2ClaimMessage(instanceId, operatorId, fingerprint);
  try {
    // Operator-supplied signature + relay-published key: malformed base64 means
    // "claim not proven", never an exception in the server action.
    return verify(
      fromBase64(signatureBase64, ED25519_SIGNATURE_BYTES),
      message,
      fromBase64(masterPublicKeyBase64, ED25519_PUBLIC_KEY_BYTES),
    );
  } catch {
    return false;
  }
}

export type { InstanceKeypair };
