import type { ActorDocument } from '@tor-sockets/api-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FederationVerifyError,
  fetchActorDocument,
  fetchVerifiedEndpoint,
  verifyEnvelope,
} from './client';
import { sign, toBase64 } from './ed25519';
import { generateKeypair } from './keypair';
import { safeFetch } from './safe-fetch';
import { canonicalJson } from './sign';
import type { SignedEnvelope } from './sign';

// The client talks to peers exclusively through safeFetch (never bare fetch),
// so that is what the transport-level tests stub.
vi.mock('./safe-fetch', () => ({ safeFetch: vi.fn() }));
const safeFetchMock = vi.mocked(safeFetch);

beforeEach(() => {
  safeFetchMock.mockReset();
});

function mockResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function buildValidPair() {
  const keypair = generateKeypair();
  const actor: ActorDocument = {
    spec: 'tor-federation/0.1',
    instance_id: keypair.instanceId,
    instance_uri: 'https://example.com',
    pubkey: keypair.publicKeyBase64,
    software: { name: 'tor-sockets', version: '0.0.0' },
    sources: ['onionoo'],
    contact: null,
    bootstrapped_at: '2026-06-29T00:00:00.000Z',
    endpoints: { status: '/federation/v1/status' },
  };
  const signedAt = new Date().toISOString();
  const payload = { relays_total: 7, hash: 'abc' };
  const sig = toBase64(
    sign(
      Buffer.from(`${signedAt}\n${keypair.instanceId}\n${canonicalJson(payload)}`, 'utf8'),
      keypair.privateKey,
    ),
  );
  const envelope: SignedEnvelope<typeof payload> = {
    spec: 'tor-federation/0.1',
    signed_at: signedAt,
    instance_id: keypair.instanceId,
    instance_uri: 'https://example.com',
    payload,
    sig,
  };
  return { keypair, actor, envelope, payload };
}

describe('verifyEnvelope', () => {
  it('accepts a well-formed envelope signed by the actor pubkey', () => {
    const { actor, envelope } = buildValidPair();
    expect(() => verifyEnvelope(envelope, actor)).not.toThrow();
  });

  it('throws instance_mismatch when instance_id differs from the actor', () => {
    const { actor, envelope } = buildValidPair();
    const err = capture(() => verifyEnvelope({ ...envelope, instance_id: '0'.repeat(64) }, actor));
    expect(err.code).toBe('instance_mismatch');
  });

  it('throws uri_mismatch on anti-republication mismatch', () => {
    const { actor, envelope } = buildValidPair();
    const err = capture(() =>
      verifyEnvelope({ ...envelope, instance_uri: 'https://evil.test' }, actor),
    );
    expect(err.code).toBe('uri_mismatch');
  });

  it('throws stale when signed_at is beyond the ±15 min skew', () => {
    const { actor, envelope } = buildValidPair();
    const tooLate = new Date(Date.parse(envelope.signed_at) + 20 * 60 * 1000); // +20 min
    const err = capture(() => verifyEnvelope(envelope, actor, tooLate));
    expect(err.code).toBe('stale');
  });

  it('throws bad_signature when the signature does not verify', () => {
    const { actor, envelope } = buildValidPair();
    const err = capture(() => verifyEnvelope({ ...envelope, sig: 'a'.repeat(88) }, actor));
    expect(err.code).toBe('bad_signature');
  });

  it('throws stale on a malformed signed_at', () => {
    const { actor, envelope } = buildValidPair();
    const err = capture(() => verifyEnvelope({ ...envelope, signed_at: 'not-a-date' }, actor));
    expect(err.code).toBe('stale');
  });
});

describe('fetchActorDocument', () => {
  it('returns the parsed actor document on 200', async () => {
    const { actor } = buildValidPair();
    safeFetchMock.mockResolvedValue(mockResponse(actor));
    const doc = await fetchActorDocument('https://example.com');
    expect(doc.instance_id).toBe(actor.instance_id);
    expect(safeFetchMock).toHaveBeenCalledWith(
      'https://example.com/.well-known/tor-federation.json',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/json' }),
      }),
    );
  });

  it('throws fetch_failed on non-2xx', async () => {
    safeFetchMock.mockResolvedValue(
      mockResponse(null, { ok: false, status: 404, statusText: 'Not Found' }),
    );
    const err = await captureAsync(() => fetchActorDocument('https://x.test'));
    expect(err.code).toBe('fetch_failed');
  });

  it('throws invalid_actor when the body fails schema validation', async () => {
    safeFetchMock.mockResolvedValue(mockResponse({ spec: 'wrong', instance_id: 'no' }));
    const err = await captureAsync(() => fetchActorDocument('https://x.test'));
    expect(err.code).toBe('invalid_actor');
  });
});

describe('fetchVerifiedEndpoint', () => {
  it('fetches the actor doc + endpoint and verifies the envelope end-to-end', async () => {
    const { actor, envelope } = buildValidPair();
    safeFetchMock
      .mockResolvedValueOnce(mockResponse(actor)) // actor document
      .mockResolvedValueOnce(mockResponse(envelope)); // signed endpoint
    const { envelope: got, actor: gotActor } = await fetchVerifiedEndpoint(
      'https://example.com',
      '/federation/v1/snapshot',
    );
    expect(got.instance_id).toBe(actor.instance_id);
    expect(gotActor.instance_id).toBe(actor.instance_id);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns fetch_failed when the signed endpoint itself errors', async () => {
    const { actor } = buildValidPair();
    safeFetchMock
      .mockResolvedValueOnce(mockResponse(actor))
      .mockResolvedValueOnce(mockResponse(null, { ok: false, status: 500 }));
    const err = await captureAsync(() =>
      fetchVerifiedEndpoint('https://example.com', '/federation/v1/snapshot'),
    );
    expect(err.code).toBe('fetch_failed');
  });
});

function capture(fn: () => void): FederationVerifyError {
  try {
    fn();
    throw new Error('expected verifyEnvelope to throw');
  } catch (e) {
    if (e instanceof FederationVerifyError) return e;
    throw e;
  }
}

async function captureAsync(fn: () => Promise<unknown>): Promise<FederationVerifyError> {
  try {
    await fn();
    throw new Error('expected throw');
  } catch (e) {
    if (e instanceof FederationVerifyError) return e;
    throw e;
  }
}
