import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => {
  console.error('Feed Service Redis Error', err.message);
});

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

export async function safeRedisGet(key) {
  if (!redisClient?.isReady) return null;
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error('Feed Service Redis read error:', error.message);
    return null;
  }
}

export async function safeRedisSet(key, value, options = {}) {
  if (!redisClient?.isReady) return;
  try {
    await redisClient.set(key, value, options);
  } catch (error) {
    console.error('Feed Service Redis write error:', error.message);
  }
}

export async function safeRedisDel(...keys) {
  if (!redisClient?.isReady || keys.length === 0) return;
  try {
    await redisClient.del(keys);
  } catch (error) {
    console.error('Feed Service Redis delete error:', error.message);
  }
}
