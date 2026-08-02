import type { Redis } from 'ioredis';
import type { KvStore } from './jobs/onionoo-poll';

/**
 * Redis-backed KvStore for caching Onionoo `Last-Modified` between cycles.
 * BullMQ's own Redis connection is separate; this is a lightweight sibling
 * used only for `get/set` of small metadata strings.
 */
export function makeRedisKv(redis: Redis): KvStore {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value) {
      await redis.set(key, value);
    },
  };
}

export function parseRedisUrl(url: string): {
  host: string;
  port: number;
  db?: number;
  username?: string;
  password?: string;
} {
  const parsed = new URL(url);
  const db =
    parsed.pathname && parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    db,
    // Required when Redis enforces requirepass (production). Without these,
    // BullMQ connects unauthenticated and every command fails with NOAUTH.
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}
