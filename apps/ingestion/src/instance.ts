import { type InstanceKeypair, loadOrCreateKeypair } from '@tor-sockets/federation';

/**
 * Singleton for the instance federation identity inside the ingestion worker.
 *
 * Mirrors `apps/web/lib/federation.ts` - both processes load the SAME keypair
 * from `FEDERATION_PRIVATE_KEY_PATH` (a Docker volume in prod) so they emit
 * entries with a consistent `instance_id` and verifiable signatures.
 */
export interface InstanceIdentity {
  keypair: InstanceKeypair;
  uri: string;
}

let _identity: InstanceIdentity | null = null;
let _loadPromise: Promise<InstanceIdentity> | null = null;

export async function getInstanceIdentity(): Promise<InstanceIdentity> {
  if (_identity) return _identity;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const path = process.env.FEDERATION_PRIVATE_KEY_PATH;
    if (!path) throw new Error('FEDERATION_PRIVATE_KEY_PATH is not set');
    const keypair = await loadOrCreateKeypair(path);
    const uri = (process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    _identity = { keypair, uri };
    return _identity;
  })();
  return _loadPromise;
}
