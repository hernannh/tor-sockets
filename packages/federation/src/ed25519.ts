import { ed25519 } from '@noble/curves/ed25519';

/**
 * Ed25519 primitives backed by @noble/curves (pure JS, no WASM).
 * The sync API is fine for our volumes; functions here are thin wrappers
 * so the rest of the package can swap backends without churn.
 */

/** 32-byte Ed25519 private key + 32-byte public key. */
export interface RawKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateKeyPair(): RawKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Decode base64 STRICTLY. `Buffer.from(x, 'base64')` silently skips invalid
 * characters and tolerates bad padding, so `"!!!!"` decodes to an empty buffer
 * instead of failing. For key and signature material that turns malformed input
 * into a short buffer that later fails verification for the wrong reason (or,
 * with a lenient verifier, does not fail at all). Length is checked by the
 * callers via `expectedLength`.
 */
export function fromBase64(b64: string, expectedLength?: number): Uint8Array {
  const trimmed = b64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) throw new Error('invalid base64');
  // Tor publishes `master-key-ed25519` UNPADDED, so padding is restored rather
  // than required. A remainder of 1 cannot come from valid base64.
  const unpadded = trimmed.replace(/=+$/, '');
  const remainder = unpadded.length % 4;
  if (remainder === 1) throw new Error('invalid base64 length');
  const padded = remainder === 0 ? unpadded : unpadded + '='.repeat(4 - remainder);
  const bytes = new Uint8Array(Buffer.from(padded, 'base64'));
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`invalid length: expected ${expectedLength} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Ed25519 sizes, for callers validating untrusted material. */
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;
