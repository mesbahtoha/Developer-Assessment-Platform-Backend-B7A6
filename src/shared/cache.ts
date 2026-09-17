import { ensureRedis } from '../config/redis';

/**
 * Redis-backed read-through cache with graceful degradation.
 *
 * Every helper is a no-op (or a direct DB call) when Redis is not configured or is
 * temporarily unreachable, so the API never hard-fails because of the cache.
 */

const PREFIX = 'b7a6';

export const TTL = {
  short: 30,
  medium: 60,
  long: 120,
} as const;

const stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };

export const cacheStats = () => ({ ...stats });

const namespaced = (key: string): string => `${PREFIX}:${key}`;

/** Build a deterministic cache key from parts (empty parts are skipped). */
export const cacheKey = (...parts: (string | number | boolean | undefined | null)[]): string =>
  parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => (typeof part === 'string' ? part : String(part)))
    .join(':');

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const redis = await ensureRedis();
    if (!redis) return null;
    const raw = await redis.get(namespaced(key));
    if (!raw) {
      stats.misses += 1;
      return null;
    }
    stats.hits += 1;
    return JSON.parse(raw) as T;
  } catch {
    stats.misses += 1;
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds: number = TTL.medium
): Promise<void> => {
  try {
    const redis = await ensureRedis();
    if (!redis) return;
    await redis.set(namespaced(key), JSON.stringify(value), 'EX', ttlSeconds);
    stats.sets += 1;
  } catch {
    // ignore cache write failures
  }
};

/**
 * Delete every key matching `<prefix>:<pattern>*` using SCAN + UNLINK
 * (non-blocking and safe on a shared Redis instance).
 */
export const cacheInvalidate = async (...patterns: string[]): Promise<number> => {
  try {
    const redis = await ensureRedis();
    if (!redis) return 0;
    let removed = 0;
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          namespaced(`${pattern}*`),
          'COUNT',
          200
        );
        cursor = nextCursor;
        if (keys.length > 0) removed += await redis.unlink(...keys);
      } while (cursor !== '0');
    }
    stats.invalidations += removed;
    return removed;
  } catch {
    return 0;
  }
};

/**
 * Read-through helper: serve from Redis when warm, otherwise run `producer`,
 * store the result and return it.
 */
export const cached = async <T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>
): Promise<T> => {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await producer();
  await cacheSet(key, value, ttlSeconds);
  return value;
};