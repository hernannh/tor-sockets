import { expect, test } from '@playwright/test';
import type { ActorDocument } from '@tor-sockets/api-contract';
import { type SignedEnvelope, verifyEnvelope } from '@tor-sockets/federation';

/**
 * Federation v1 end-to-end: every signed endpoint must return a SignedEnvelope
 * whose signature verifies against the pubkey published in the actor document.
 * This is the core federation trust contract - exercised here through the real
 * HTTP server (no DB data needed; an empty network still produces valid signed
 * envelopes).
 */

let actor: ActorDocument;

test.beforeAll(async ({ request }) => {
  const res = await request.get('/.well-known/tor-federation.json');
  expect(res.ok()).toBeTruthy();
  const doc = await res.json();
  // The actor document exposes exactly the fields verifyEnvelope reads.
  actor = {
    instance_id: doc.instance_id,
    instance_uri: doc.instance_uri,
    pubkey: doc.pubkey,
  } as ActorDocument;
  expect(actor.instance_id).toMatch(/^[0-9a-f]{64}$/);
  expect(actor.pubkey).toBeTruthy();
});

test.describe('federation actor document', () => {
  test('advertises the v1 endpoints', async ({ request }) => {
    const doc = await (await request.get('/.well-known/tor-federation.json')).json();
    expect(doc.spec).toBe('tor-federation/0.1');
    expect(doc.endpoints).toMatchObject({
      status: '/federation/v1/status',
      snapshot: '/federation/v1/snapshot',
      changes: '/federation/v1/changes',
      peers: '/federation/v1/peers',
      subscribe: '/federation/v1/subscribe',
    });
    expect(doc.sources).toContain('onionoo');
  });
});

test.describe('federation signed endpoints', () => {
  test('GET /federation/v1/status - signed and verifiable', async ({ request }) => {
    const res = await request.get('/federation/v1/status');
    expect(res.ok()).toBeTruthy();
    const env = (await res.json()) as SignedEnvelope<Record<string, unknown>>;

    // Throws on instance mismatch / uri mismatch / staleness / bad signature.
    expect(() => verifyEnvelope(env, actor)).not.toThrow();
    expect(env.instance_id).toBe(actor.instance_id);
    expect(env.spec).toBe('tor-federation/0.1');

    const payload = env.payload;
    expect(payload).toHaveProperty('relays_total');
    expect(payload).toHaveProperty('relays_running');
    expect(payload).toHaveProperty('booted_at');
    expect(typeof payload.relays_total).toBe('number');
  });

  test('GET /federation/v1/snapshot - signed and verifiable', async ({ request }) => {
    const res = await request.get('/federation/v1/snapshot');
    expect(res.ok()).toBeTruthy();
    const env = (await res.json()) as SignedEnvelope<Record<string, unknown>>;

    expect(() => verifyEnvelope(env, actor)).not.toThrow();

    const payload = env.payload;
    expect(payload).toHaveProperty('relays_total');
    expect(payload).toHaveProperty('relay_set_hash');
    expect(payload).toHaveProperty('relay_set_count');
    expect(typeof payload.relay_set_hash).toBe('string');
    // set_count is consistent with itself regardless of data volume
    expect(payload.relay_set_count).toBeGreaterThanOrEqual(0);
  });

  test('GET /federation/v1/peers - signed and verifiable', async ({ request }) => {
    const res = await request.get('/federation/v1/peers');
    expect(res.ok()).toBeTruthy();
    const env = (await res.json()) as SignedEnvelope<{ peers: unknown[] }>;

    expect(() => verifyEnvelope(env, actor)).not.toThrow();
    expect(Array.isArray(env.payload.peers)).toBeTruthy();
  });
});

test.describe('federation tamper detection', () => {
  test('a tampered payload no longer verifies', async ({ request }) => {
    const res = await request.get('/federation/v1/status');
    const env = (await res.json()) as SignedEnvelope<Record<string, unknown>>;

    // Mutate the payload after signing → signature must no longer match.
    const tampered = { ...env, payload: { ...env.payload, relays_total: 999_999_999 } };
    expect(() => verifyEnvelope(tampered, actor)).toThrow();
  });
});
