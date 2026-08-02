/**
 * @tor-sockets/federation - Ed25519 signed federation protocol v1.
 *
 * Each Tor-Sockets instance owns an Ed25519 keypair. Payloads served from
 * `/federation/v1/*` are wrapped in a `SignedEnvelope` so peers can verify
 * provenance against the public key in `/.well-known/tor-federation.json`.
 *
 * Spec: FEDERATION.md
 */
export * from './ed25519';
export * from './keypair';
export * from './sign';
export * from './client';
export * from './claim';
export * from './safe-fetch';
