/**
 * @tor-sockets/ingestion-core - pluggable source adapters.
 *
 * Adapters:
 *  - OnionooAdapter (Fase 0.3): JSON REST, primary source
 *  - CollecTorAdapter (Fase 1.5): historical consensus tarballs, backfill
 *  - ConsensusAdapter (future): direct from directory authorities
 *  - PeerMirrorAdapter (future): federation sync
 */
export * from './adapters/onionoo';
export * from './adapters/collector';
export * from './adapters/peeringdb';
export * from './normalize';
