import { describe, expect, it } from 'vitest';
import { derivePublicKey, fromBase64, generateKeyPair, sign, toBase64, verify } from './ed25519';

describe('generateKeyPair / derivePublicKey', () => {
  it('produces 32-byte keys where pubkey is derived from the seed', () => {
    const { privateKey, publicKey } = generateKeyPair();
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(32);
    expect(derivePublicKey(privateKey)).toEqual(publicKey);
  });

  it('is deterministic: same seed → same pubkey', () => {
    const a = generateKeyPair();
    expect(derivePublicKey(a.privateKey)).toEqual(a.publicKey);
  });

  it('distinct keypairs are distinct', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.privateKey).not.toEqual(b.privateKey);
    expect(a.publicKey).not.toEqual(b.publicKey);
  });
});

describe('sign / verify', () => {
  it('verifies a signature over the signed message with the matching pubkey', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const msg = Buffer.from('hello tor', 'utf8');
    const sig = sign(msg, privateKey);
    expect(verify(sig, msg, publicKey)).toBe(true);
  });

  it('rejects a different message', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const sig = sign(Buffer.from('a', 'utf8'), privateKey);
    expect(verify(sig, Buffer.from('b', 'utf8'), publicKey)).toBe(false);
  });

  it('rejects a different pubkey', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const sig = sign(Buffer.from('msg', 'utf8'), a.privateKey);
    expect(verify(sig, Buffer.from('msg', 'utf8'), b.publicKey)).toBe(false);
  });

  it('returns false (does not throw) on a malformed signature', () => {
    const { publicKey } = generateKeyPair();
    const garbage = new Uint8Array(64).fill(0xff);
    expect(verify(garbage, Buffer.from('msg', 'utf8'), publicKey)).toBe(false);
  });

  it('returns false on a truncated signature', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const sig = sign(Buffer.from('msg', 'utf8'), privateKey);
    expect(verify(sig.slice(0, 32), Buffer.from('msg', 'utf8'), publicKey)).toBe(false);
  });
});

describe('toBase64 / fromBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 127, 128, 255, 1, 2, 3]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('preserves length', () => {
    const bytes = generateKeyPair().privateKey;
    const roundTrip = fromBase64(toBase64(bytes));
    expect(roundTrip.length).toBe(32);
  });

  it('rejects non-base64 input instead of silently decoding to garbage', () => {
    // Buffer.from(x, 'base64') drops invalid characters, so these used to become
    // short buffers that failed verification for the wrong reason.
    for (const bad of ['!!!!', 'abc$def', 'nope nope', 'AAAAA']) {
      expect(() => fromBase64(bad), bad).toThrow();
    }
  });

  it('enforces the expected byte length when asked', () => {
    const key = toBase64(generateKeyPair().publicKey);
    expect(fromBase64(key, 32).length).toBe(32);
    expect(() => fromBase64(key, 64)).toThrow(/expected 64 bytes/);
  });

  it('accepts unpadded base64 (Tor publishes master-key-ed25519 without padding)', () => {
    const key = generateKeyPair().publicKey;
    const unpadded = toBase64(key).replace(/=+$/, '');
    expect(fromBase64(unpadded, 32)).toEqual(key);
  });
});
