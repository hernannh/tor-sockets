import { getDb } from '@tor-sockets/db';
import { type KvStore, pollOnionoo } from './jobs/onionoo-poll';

/**
 * Smoke test / manual full poll: fetch Onionoo /details and upsert `relays`
 * (+ append `relay_history`). Uses an in-memory KV so no cached Last-Modified
 * forces a fresh full fetch - handy after a schema change that adds a field.
 *
 * Usage: `bun run src/smoke-poll.ts`
 */
const memoryKv: KvStore = {
  async get() {
    return null;
  },
  async set() {},
};

async function main() {
  const db = getDb(process.env.DATABASE_URL);
  console.log('[smoke-poll] fetching Onionoo /details (full)...');
  const result = await pollOnionoo(db, memoryKv);
  console.log('[smoke-poll] result:', JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke-poll] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
