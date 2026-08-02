import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeypair, loadKeypair, loadOrCreateKeypair, saveKeypair } from './keypair';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fed-keypair-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('generateKeypair', () => {
  it('derives instanceId as sha256(publicKey) hex and a matching base64 pubkey', () => {
    const kp = generateKeypair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
    const expectedId = createHash('sha256').update(Buffer.from(kp.publicKey)).digest('hex');
    expect(kp.instanceId).toBe(expectedId);
    expect(kp.instanceId).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.publicKeyBase64).toBe(Buffer.from(kp.publicKey).toString('base64'));
  });
});

describe('saveKeypair / loadKeypair', () => {
  it('persists and reloads the same keypair (idempotent instanceId)', async () => {
    const kp = generateKeypair();
    const path = join(dir, 'instance.ed25519');
    await saveKeypair(kp, path);

    const reloaded = await loadKeypair(path);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.instanceId).toBe(kp.instanceId);
    expect(reloaded?.publicKeyBase64).toBe(kp.publicKeyBase64);
    expect(reloaded?.privateKey).toEqual(kp.privateKey);
  });

  it('writes the secret with mode 0600', async () => {
    const kp = generateKeypair();
    const path = join(dir, 'instance.ed25519');
    await saveKeypair(kp, path);
    const s = await stat(path);
    expect(s.mode & 0o777).toBe(0o600);
  });

  it('returns null when the key file does not exist', async () => {
    expect(await loadKeypair(join(dir, 'missing.ed25519'))).toBeNull();
  });
});

describe('loadOrCreateKeypair', () => {
  it('creates and persists a new keypair on first call', async () => {
    const path = join(dir, 'instance.ed25519');
    const created = await loadOrCreateKeypair(path);
    expect(created.instanceId).toMatch(/^[0-9a-f]{64}$/);
    const reloaded = await loadKeypair(path);
    expect(reloaded?.instanceId).toBe(created.instanceId);
  });

  it('reuses the existing keypair on subsequent calls (stable identity)', async () => {
    const path = join(dir, 'instance.ed25519');
    const first = await loadOrCreateKeypair(path);
    const second = await loadOrCreateKeypair(path);
    expect(second.instanceId).toBe(first.instanceId);
    expect(second.publicKeyBase64).toBe(first.publicKeyBase64);
  });
});
