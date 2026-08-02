import { describe, expect, it } from 'vitest';
import { derivePublicKey, generateKeyPair, sign, toBase64 } from './ed25519';
import { canonicalJson, signEnvelope, signPayload, signingMessage, verifyPayload } from './sign';

describe('canonicalJson - spec section 10 test vectors', () => {
  it('primitives', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson(-1.5)).toBe('-1.5');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson('foo')).toBe('"foo"');
  });

  it('arrays preserve order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([])).toBe('[]');
  });

  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ x: [1, { b: 2, a: 1 }] })).toBe('{"x":[1,{"a":1,"b":2}]}');
    expect(canonicalJson({})).toBe('{}');
  });

  it('is stable regardless of insertion order', () => {
    expect(canonicalJson({ z: 1, a: 2, m: 3 })).toBe(canonicalJson({ a: 2, m: 3, z: 1 }));
  });

  it('handles nested structures', () => {
    expect(canonicalJson({ c: { b: 2, a: 1 }, d: [3, 2, 1] })).toBe(
      '{"c":{"a":1,"b":2},"d":[3,2,1]}',
    );
  });
});

describe('signingMessage', () => {
  it('builds `${signedAt}\\n${instanceId}\\n${canonicalJson(payload)}`', () => {
    const msg = signingMessage('2026-06-29T00:00:00.000Z', 'deadbeef', { b: 1, a: 2 });
    expect(Buffer.from(msg).toString('utf8')).toBe(
      '2026-06-29T00:00:00.000Z\ndeadbeef\n{"a":2,"b":1}',
    );
  });
});

describe('signPayload / verifyPayload', () => {
  it('round-trips a signature that verifies against the signer pubkey', async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const publicKeyBase64 = toBase64(derivePublicKey(privateKey));
    const payload = { relays: 7142, hash: 'abc', nested: { b: 2, a: 1 } };
    const sig = await signPayload('2026-06-29T00:00:00.000Z', 'inst-1', payload, {
      privateKey,
      publicKey,
      instanceId: 'inst-1',
      publicKeyBase64,
    });
    expect(
      await verifyPayload('2026-06-29T00:00:00.000Z', 'inst-1', payload, sig, publicKeyBase64),
    ).toBe(true);
  });

  it('rejects a signature for a different payload', async () => {
    const { privateKey } = generateKeyPair();
    const publicKeyBase64 = toBase64(derivePublicKey(privateKey));
    const sig = await signPayload(
      't',
      'inst',
      { a: 1 },
      {
        privateKey,
        publicKey: derivePublicKey(privateKey),
        instanceId: 'inst',
        publicKeyBase64,
      },
    );
    expect(await verifyPayload('t', 'inst', { a: 2 }, sig, publicKeyBase64)).toBe(false);
  });

  it('rejects a signature verified against an unrelated pubkey', async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const sig = await signPayload(
      't',
      'inst',
      { a: 1 },
      {
        privateKey: a.privateKey,
        publicKey: a.publicKey,
        instanceId: 'inst',
        publicKeyBase64: toBase64(a.publicKey),
      },
    );
    expect(await verifyPayload('t', 'inst', { a: 1 }, sig, toBase64(b.publicKey))).toBe(false);
  });
});

describe('signEnvelope', () => {
  it('produces a well-formed SignedEnvelope whose signature verifies', async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const instanceId = 'a'.repeat(64);
    const publicKeyBase64 = toBase64(publicKey);
    const keypair = { privateKey, publicKey, instanceId, publicKeyBase64 };
    const payload = { count: 3, items: ['x', 'y'] };

    const env = await signEnvelope(payload, keypair, 'https://example.com');

    expect(env.spec).toBe('tor-federation/0.1');
    expect(env.instance_id).toBe(instanceId);
    expect(env.instance_uri).toBe('https://example.com');
    expect(env.payload).toEqual(payload);
    expect(env.sig).toBe(
      toBase64(
        sign(
          Buffer.from(`${env.signed_at}\n${instanceId}\n${canonicalJson(payload)}`, 'utf8'),
          privateKey,
        ),
      ),
    );
  });
});
