import { safeRedisGet, safeRedisSet, safeRedisDel, connectRedis } from '../configs/redis.js';

// Initialize Redis connection on module load
await connectRedis().catch(err => {
  console.error('User Service: Failed to initialize Redis:', err.message);
});

const CONNECTIONS_CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_TTL = 86400; // 24 hours

export const getConnectionsFromCache = async (userId) => {
  const cacheKey = `user:${userId}:connections`;
  try {
    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      console.log('User Service: Connections cache hit for user', userId);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('User Service: Error parsing connections cache:', err.message);
  }
  return null;
};

export const setConnectionsToCache = async (userId, connectionData) => {
  const cacheKey = `user:${userId}:connections`;
  try {
    await safeRedisSet(cacheKey, JSON.stringify(connectionData), { EX: CONNECTIONS_CACHE_TTL });
    console.log('User Service: Connections cache set for user', userId);
  } catch (err) {
    console.error('User Service: Error setting connections cache:', err.message);
  }
};

export const invalidateConnectionsCache = async (userIds = []) => {
  try {
    if (!Array.isArray(userIds)) userIds = [userIds];
    const cacheKeys = userIds.map(uid => `user:${uid}:connections`);
    await safeRedisDel(...cacheKeys);
    console.log('User Service: Connections cache invalidated for users', userIds);
  } catch (err) {
    console.error('User Service: Error invalidating connections cache:', err.message);
  }
};

// Connection rate limiting
export const incrementConnectionRequestCount = async (userId) => {
  const cacheKey = `connection:requests:${userId}`;
  try {
    const current = await safeRedisGet(cacheKey);
    const count = current ? parseInt(current) + 1 : 1;
    await safeRedisSet(cacheKey, String(count), { EX: RATE_LIMIT_TTL });
    return count;
  } catch (err) {
    console.error('User Service: Error incrementing connection requests:', err.message);
    return -1;
  }
};

export const getConnectionRequestCount = async (userId) => {
  const cacheKey = `connection:requests:${userId}`;
  try {
    const count = await safeRedisGet(cacheKey);
    return count ? parseInt(count) : 0;
  } catch (err) {
    console.error('User Service: Error getting connection requests count:', err.message);
    return -1;
  }
};
