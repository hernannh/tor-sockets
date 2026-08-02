import { getDb } from '@tor-sockets/db';
import Redis from 'ioredis';
import { pollOnionoo } from './jobs/onionoo-poll';
import { makeRedisKv } from './kv';

/**
 * One-shot smoke test: run a single Onionoo poll cycle against the local DB
 * and print the result. Usage: `bun run src/smoke.ts [limit]`
 * (limit defaults to 50 to be nice to Onionoo during development).
 */
async function main() {
  const limit = process.argv[2] ? Number(process.argv[2]) : 50;
  const db = getDb(process.env.DATABASE_URL);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const kv = makeRedisKv(redis);

  console.log(`[smoke] starting poll (limit=${limit})`);
  const result = await pollOnionoo(db, kv, { limit });
  console.log('[smoke] result:', JSON.stringify(result, null, 2));

  redis.disconnect();
  process.exit(result.status === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
