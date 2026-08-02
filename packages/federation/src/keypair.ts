import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { derivePublicKey, fromBase64, generateKeyPair, toBase64 } from './ed25519';

export interface InstanceKeypair {
  /** 32-byte Ed25519 public key */
  publicKey: Uint8Array;
  /** 32-byte Ed25519 private key (seed) */
  privateKey: Uint8Array;
  /** Hex of SHA-256(publicKey) - stable instance identifier */
  instanceId: string;
  /** Base64 of publicKey - shared in the actor document */
  publicKeyBase64: string;
}

/**
 * Generate a fresh Ed25519 keypair for this instance.
 */
export function generateKeypair(): InstanceKeypair {
  const { publicKey, privateKey } = generateKeyPair();
  return finalizeKeypair(publicKey, privateKey);
}

/**
 * Persist the secret key to disk (base64 of the 32-byte private key).
 * Restrictive permissions; the file lives in a Docker volume in prod.
 */
export async function saveKeypair(pair: InstanceKeypair, path: string): Promise<void> {
  const b64 = toBase64(pair.privateKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, b64, { mode: 0o600 });
  await chmod(path, 0o600);
}

/**
 * Load a previously persisted secret key, reconstructing the keypair.
 * Returns null if the file does not exist.
 */
export async function loadKeypair(path: string): Promise<InstanceKeypair | null> {
  let b64: string;
  try {
    b64 = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  const privateKey = fromBase64(b64.trim());
  const publicKey = derivePublicKey(privateKey);
  return finalizeKeypair(publicKey, privateKey);
}

/**
 * Load the keypair from `path`, or generate + persist a new one if missing.
 * This is the bootstrap entry point used by the web app on startup.
 */
export async function loadOrCreateKeypair(path: string): Promise<InstanceKeypair> {
  const existing = await loadKeypair(path);
  if (existing) return existing;
  const fresh = generateKeypair();
  await saveKeypair(fresh, path);
  return fresh;
}

function finalizeKeypair(publicKey: Uint8Array, privateKey: Uint8Array): InstanceKeypair {
  const instanceId = createHash('sha256').update(Buffer.from(publicKey)).digest('hex');
  const publicKeyBase64 = toBase64(publicKey);
  return { publicKey, privateKey, instanceId, publicKeyBase64 };
}
