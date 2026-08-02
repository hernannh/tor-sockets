import { getDb } from '@tor-sockets/db';
import Redis from 'ioredis';
import { backfillRecentConsensus } from './jobs/backfill-collector';
import { makeRedisKv } from './kv';

/**
 * Smoke test: download ONE recent consensus from CollecTor, parse it, and
 * insert its relays into relay_history.
 *
 * Usage: `bun run src/smoke-collector.ts [YYYY-MM-DD-HH-MM-SS]`
 * Default timestamp: 2 hours ago (format CollecTor expects).
 */
async function main() {
  const arg = process.argv[2];
  const timestamp = arg ?? twoHoursAgoTimestamp();
  const db = getDb(process.env.DATABASE_URL);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  void makeRedisKv; // KV only needed for month-level backfill; recent consensus doesn't use it

  console.log(`[smoke-collector] fetching consensus ${timestamp} from CollecTor...`);
  try {
    const result = await backfillRecentConsensus(db, timestamp);
    console.log('[smoke-collector] result:', JSON.stringify(result, null, 2));
    redis.disconnect();
    process.exit(result.inserted > 0 ? 0 : 1);
  } catch (err) {
    console.error('[smoke-collector] failed:', err instanceof Error ? err.message : err);
    console.error('              hint: the timestamp may not exist in CollecTor recent/');
    redis.disconnect();
    process.exit(1);
  }
}

/** Build a CollecTor timestamp `YYYY-MM-DD-HH-00-00` for 2 hours ago (UTC). */
function twoHoursAgoTimestamp(): string {
  const d = new Date(Date.now() - 2 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(
    d.getUTCHours(),
  )}-00-00`;
}

main().catch((err) => {
  console.error('[smoke-collector] fatal:', err);
  process.exit(1);
});
