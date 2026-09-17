import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { ensureRedis } from '../config/redis';

/**
 * Redis-backed rate-limit store for express-rate-limit v7.
 *
 * Why: Vercel serverless instances do not share memory, so an in-memory
 * counter would let each instance allow its own full quota. Storing the
 * counters in Redis gives one shared, fixed-window quota per IP across all
 * instances. When Redis is unreachable the store falls back to an in-memory
 * map so rate limiting never takes the API down.
 */

const PREFIX = 'b7a6:rl:';

interface MemoryBucket {
  hits: number;
  resetAt: number;
}

export class RedisRateLimitStore implements Store {
  private windowMs: number;
  private memory = new Map<string, MemoryBucket>();

  constructor(options?: Partial<Options>) {
    this.windowMs = options?.windowMs ?? 15 * 60 * 1000;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    try {
      const redis = await ensureRedis();
      if (redis) {
        const rkey = `${PREFIX}${key}`;
        const totalHits = await redis.incr(rkey);
        if (totalHits === 1) {
          await redis.pexpire(rkey, this.windowMs);
        }
        const pttl = await redis.pttl(rkey);
        return {
          totalHits,
          resetTime: new Date(now.getTime() + Math.max(pttl, 0)),
        };
      }
    } catch {
      // fall through to the in-memory fallback
    }

    // In-memory fallback (single instance / Redis outage)
    const bucket = this.memory.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) {
      this.memory.set(key, { hits: 1, resetAt: Date.now() + this.windowMs });
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    bucket.hits += 1;
    return {
      totalHits: bucket.hits,
      resetTime: new Date(bucket.resetAt),
    };
  }

  async decrement(key: string): Promise<void> {
    try {
      const redis = await ensureRedis();
      if (redis) {
        await redis.decr(`${PREFIX}${key}`);
        return;
      }
    } catch {
      // ignore
    }
    const bucket = this.memory.get(key);
    if (bucket && bucket.hits > 0) bucket.hits -= 1;
  }

  async resetKey(key: string): Promise<void> {
    this.memory.delete(key);
    try {
      const redis = await ensureRedis();
      if (redis) await redis.unlink(`${PREFIX}${key}`);
    } catch {
      // ignore
    }
  }

  async resetAll(): Promise<void> {
    this.memory.clear();
    try {
      const redis = await ensureRedis();
      if (!redis) return;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 200);
        cursor = nextCursor;
        if (keys.length > 0) await redis.unlink(...keys);
      } while (cursor !== '0');
    } catch {
      // ignore
    }
  }
}
