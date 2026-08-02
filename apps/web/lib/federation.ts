import { type InstanceKeypair, loadOrCreateKeypair } from '@tor-sockets/federation';

export interface InstanceContext {
  keypair: InstanceKeypair;
  uri: string;
  /** ISO timestamp of when this process first loaded the keypair. */
  bootedAt: string;
}

let _instance: InstanceContext | null = null;
let _loadPromise: Promise<InstanceContext> | null = null;

/**
 * Server-side singleton for the federation identity.
 *
 * Loads (or bootstraps) the Ed25519 keypair from `FEDERATION_PRIVATE_KEY_PATH`
 * on first use and memoizes it for the lifetime of the process. Concurrent
 * callers share the same in-flight load to avoid racing on keypair creation.
 */
export function getInstance(): Promise<InstanceContext> {
  if (_instance) return Promise.resolve(_instance);
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const path = process.env.FEDERATION_PRIVATE_KEY_PATH;
    if (!path) throw new Error('FEDERATION_PRIVATE_KEY_PATH is not set');
    const keypair = await loadOrCreateKeypair(path);
    const ctx: InstanceContext = {
      keypair,
      uri: (process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
      bootedAt: new Date().toISOString(),
    };
    _instance = ctx;
    return ctx;
  })();
  return _loadPromise;
}
