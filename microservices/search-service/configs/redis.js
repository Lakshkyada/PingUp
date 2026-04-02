import redis from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let redisClient = null;

export const connectRedis = async () => {
  if (redisClient?.isReady) return redisClient;

  redisClient = redis.createClient({ url: redisUrl });

  redisClient.on('error', (err) => {
    console.error('Search Service Redis error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('Search Service: Connected to Redis');
  });

  await redisClient.connect();
  return redisClient;
};

export const getRedisClient = () => redisClient;

export const safeRedisGet = async (key) => {
  try {
    if (!redisClient?.isReady) return null;
    return await redisClient.get(key);
  } catch (err) {
    console.error(`Search Service: Redis GET error for ${key}:`, err.message);
    return null;
  }
};

export const safeRedisSet = async (key, value, options = {}) => {
  try {
    if (!redisClient?.isReady) return false;
    await redisClient.set(key, value, options);
    return true;
  } catch (err) {
    console.error(`Search Service: Redis SET error for ${key}:`, err.message);
    return false;
  }
};

export const safeRedisDel = async (...keys) => {
  try {
    if (!redisClient?.isReady) return 0;
    return await redisClient.del(keys);
  } catch (err) {
    console.error(`Search Service: Redis DEL error for ${keys}:`, err.message);
    return 0;
  }
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
