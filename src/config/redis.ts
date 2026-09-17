import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

export type RedisStatus = 'disabled' | 'idle' | 'connecting' | 'ready' | 'error';

let client: Redis | null = null;
let status: RedisStatus = env.REDIS_URL ? 'idle' : 'disabled';
let lastError: string | null = null;
let loggedErrorOnce = false;

const options: RedisOptions = {
  // Never block request handling: connect on demand, fail fast, and let callers fall back to the DB.
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 300, 2000)),
};

if (env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, options);

  client.on('ready', () => {
    status = 'ready';
    lastError = null;
    loggedErrorOnce = false;
  });
  client.on('end', () => {
    if (status === 'ready') status = 'idle';
  });
  client.on('error', (err: Error) => {
    status = 'error';
    lastError = err.message;
    if (!loggedErrorOnce) {
      loggedErrorOnce = true;
      // eslint-disable-next-line no-console
      console.warn(`⚠️  Redis unavailable, continuing without cache: ${err.message}`);
    }
  });
}

/**
 * Returns a connected client, or null when Redis is not configured/unreachable.
 * Callers must always cope with a null return (graceful degradation to Prisma).
 */
export const ensureRedis = async (): Promise<Redis | null> => {
  if (!client) return null;
  if (status === 'ready') return client;
  if (status === 'connecting') return client;

  status = 'connecting';
  try {
    await client.connect();
    status = 'ready';
    return client;
  } catch (err) {
    status = 'error';
    lastError = (err as Error).message;
    return null;
  }
};

export const getRedis = (): Redis | null => client;

export const redisHealth = (): { status: RedisStatus; error: string | null } => ({
  status,
  error: status === 'error' ? lastError : null,
});

export const disconnectRedis = async (): Promise<void> => {
  if (client) {
    client.disconnect();
    status = 'idle';
  }
};