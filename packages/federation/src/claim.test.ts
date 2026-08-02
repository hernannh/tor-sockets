import { describe, expect, it } from 'vitest';
import { buildT2ClaimMessage, verifyT2Claim } from './claim';
import { derivePublicKey, generateKeyPair, sign, toBase64 } from './ed25519';

const INSTANCE = 'i'.repeat(64);
const OPERATOR = 'op-0001';
const FP = 'A'.repeat(40);

function signWith(seed: Uint8Array, msg: Uint8Array): string {
  return toBase64(sign(msg, seed));
}

describe('buildT2ClaimMessage', () => {
  it('produces the canonical v1 string with uppercase fingerprint', () => {
    const msg = buildT2ClaimMessage(INSTANCE, OPERATOR, FP.toLowerCase());
    expect(Buffer.from(msg).toString('utf8')).toBe(
      `tor-sockets-ed25519-claim-v1\n${INSTANCE}\n${OPERATOR}\n${FP}`,
    );
  });

  it('is deterministic for identical inputs', () => {
    const a = buildT2ClaimMessage(INSTANCE, OPERATOR, FP);
    const b = buildT2ClaimMessage(INSTANCE, OPERATOR, FP);
    expect(a).toEqual(b);
  });

  it('differs when any component changes', () => {
    const base = buildT2ClaimMessage(INSTANCE, OPERATOR, FP);
    expect(buildT2ClaimMessage('x'.repeat(64), OPERATOR, FP)).not.toEqual(base);
    expect(buildT2ClaimMessage(INSTANCE, 'op-other', FP)).not.toEqual(base);
    expect(buildT2ClaimMessage(INSTANCE, OPERATOR, 'B'.repeat(40))).not.toEqual(base);
  });
});

describe('verifyT2Claim', () => {
  it('verifies a signature from the relay master identity key', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    const sig = signWith(privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(verifyT2Claim(INSTANCE, OPERATOR, FP, sig, pubkeyB64)).toBe(true);
  });

  it('accepts a lowercase fingerprint (normalized to uppercase)', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    const sig = signWith(privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(verifyT2Claim(INSTANCE, OPERATOR, FP.toLowerCase(), sig, pubkeyB64)).toBe(true);
  });

  it('rejects a signature bound to a different operator (anti-replay)', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    const sig = signWith(privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(verifyT2Claim(INSTANCE, 'op-impostor', FP, sig, pubkeyB64)).toBe(false);
  });

  it('rejects a signature bound to a different instance', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    const sig = signWith(privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(verifyT2Claim('0'.repeat(64), OPERATOR, FP, sig, pubkeyB64)).toBe(false);
  });

  it('rejects a signature bound to a different fingerprint', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    const sig = signWith(privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(verifyT2Claim(INSTANCE, OPERATOR, 'B'.repeat(40), sig, pubkeyB64)).toBe(false);
  });

  it('rejects a signature verified against an unrelated master pubkey', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const sig = signWith(a.privateKey, buildT2ClaimMessage(INSTANCE, OPERATOR, FP));
    expect(
      verifyT2Claim(INSTANCE, OPERATOR, FP, sig, toBase64(derivePublicKey(b.privateKey))),
    ).toBe(false);
  });

  it('rejects a malformed signature', () => {
    const { privateKey } = generateKeyPair();
    const pubkeyB64 = toBase64(derivePublicKey(privateKey));
    expect(verifyT2Claim(INSTANCE, OPERATOR, FP, 'not-a-valid-signature!!!', pubkeyB64)).toBe(
      false,
    );
  });
});
