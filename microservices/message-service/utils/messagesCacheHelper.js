import { safeRedisGet, safeRedisSet, safeRedisDel, connectRedis } from '../configs/redis.js';

// Initialize Redis connection on module load
await connectRedis().catch(err => {
  console.error('Message Service: Failed to initialize Redis:', err.message);
});

const RECENT_MESSAGES_CACHE_TTL = 300; // 5 minutes

export const getRecentMessagesFromCache = async (userId) => {
  const cacheKey = `messages:${userId}:recent:peers`;
  try {
    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      console.log('Message Service: Recent messages cache hit for user', userId);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Message Service: Error parsing recent messages cache:', err.message);
  }
  return null;
};

export const setRecentMessagesToCache = async (userId, recentMessages) => {
  const cacheKey = `messages:${userId}:recent:peers`;
  try {
    await safeRedisSet(cacheKey, JSON.stringify(recentMessages), { EX: RECENT_MESSAGES_CACHE_TTL });
    console.log('Message Service: Recent messages cache set for user', userId);
  } catch (err) {
    console.error('Message Service: Error setting recent messages cache:', err.message);
  }
};

export const invalidateRecentMessagesCache = async (userIds = []) => {
  try {
    if (!Array.isArray(userIds)) userIds = [userIds];
    const cacheKeys = userIds.map(uid => `messages:${uid}:recent:peers`);
    await safeRedisDel(...cacheKeys);
    console.log('Message Service: Recent messages cache invalidated for users', userIds);
  } catch (err) {
    console.error('Message Service: Error invalidating recent messages cache:', err.message);
  }
};

export const getUnreadCountFromCache = async (userId) => {
  const cacheKey = `messages:${userId}:unread:count`;
  try {
    const cached = await safeRedisGet(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('Message Service: Error getting unread count from cache:', err.message);
  }
  return null;
};

export const setUnreadCountToCache = async (userId, unreadData) => {
  const cacheKey = `messages:${userId}:unread:count`;
  try {
    await safeRedisSet(cacheKey, JSON.stringify(unreadData), { EX: RECENT_MESSAGES_CACHE_TTL });
  } catch (err) {
    console.error('Message Service: Error setting unread count cache:', err.message);
  }
};

export const invalidateUnreadCountCache = async (userIds = []) => {
  try {
    if (!Array.isArray(userIds)) userIds = [userIds];
    const cacheKeys = userIds.map(uid => `messages:${uid}:unread:count`);
    await safeRedisDel(...cacheKeys);
  } catch (err) {
    console.error('Message Service: Error invalidating unread count cache:', err.message);
  }
};
