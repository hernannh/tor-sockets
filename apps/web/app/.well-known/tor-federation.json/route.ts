import { getInstance } from '@/lib/federation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Actor document for this Tor-Sockets instance.
 * Public (unsigned - this IS the source of the pubkey peers verify against).
 * Spec: FEDERATION.md, the actor document section
 */
export async function GET() {
  const instance = await getInstance();
  const doc = {
    spec: 'tor-federation/0.1',
    instance_id: instance.keypair.instanceId,
    instance_uri: instance.uri,
    pubkey: instance.keypair.publicKeyBase64,
    software: { name: 'tor-sockets', version: '0.0.0' },
    sources: ['onionoo'],
    contact: null,
    bootstrapped_at: instance.bootedAt,
    endpoints: {
      status: '/federation/v1/status',
      snapshot: '/federation/v1/snapshot',
      changes: '/federation/v1/changes',
      peers: '/federation/v1/peers',
      subscribe: '/federation/v1/subscribe',
    },
  };
  return Response.json(doc, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
