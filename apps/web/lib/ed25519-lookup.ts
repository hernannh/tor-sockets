import 'server-only';
import { fetchEd25519IdentityMap } from '@tor-sockets/ingestion-core';

/**
 * Cached lookup of a relay's Ed25519 master identity public key, sourced from
 * CollecTor server descriptors (`master-key-ed25519`). Onionoo does not expose
 * this field, so T2 claim verification depends on it.
 *
 * The full fingerprint→pubkey map is fetched once per hour per process (the
 * server-descriptor batch refreshes roughly hourly, and the master identity is
 * stable for a relay's lifetime). A single fetch covers ~thousand relays.
 */

interface CachedMap {
  fetchedAt: number;
  map: Map<string, string>;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache: CachedMap | null = null;
let _loadPromise: Promise<CachedMap> | null = null;

async function loadMap(): Promise<CachedMap> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const map = await fetchEd25519IdentityMap();
    _cache = { fetchedAt: Date.now(), map };
    _loadPromise = null;
    return _cache;
  })();
  return _loadPromise;
}

/**
 * Return the base64 Ed25519 master identity pubkey for `fingerprint`, or null
 * if the relay is not in the latest server-descriptor batch (e.g. it hasn't
 * published recently). Callers should surface a retry hint to the operator.
 */
export async function getEd25519Identity(fingerprint: string): Promise<string | null> {
  const { map } = await loadMap();
  return map.get(fingerprint.toUpperCase()) ?? null;
}

/** Force a refresh on the next lookup (useful after a failed verification). */
export function invalidateEd25519Cache(): void {
  _cache = null;
}
