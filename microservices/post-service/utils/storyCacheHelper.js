import { safeRedisGet, safeRedisSet, safeRedisDel, connectRedis } from '../configs/redis.js';

// Initialize Redis connection on module load
await connectRedis().catch(err => {
  console.error('Post Service: Failed to initialize Redis:', err.message);
});

const STORY_CACHE_TTL = 600; // 10 minutes

export const getStoriesFromCache = async (userId) => {
  const cacheKey = `stories:${userId}`;
  try {
    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      console.log('Post Service: Story cache hit for user', userId);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Post Service: Error parsing story cache:', err.message);
  }
  return null;
};

export const setStoriesToCache = async (userId, stories) => {
  const cacheKey = `stories:${userId}`;
  try {
    await safeRedisSet(cacheKey, JSON.stringify(stories), { EX: STORY_CACHE_TTL });
    console.log('Post Service: Story cache set for user', userId);
  } catch (err) {
    console.error('Post Service: Error setting story cache:', err.message);
  }
};

export const invalidateStoriesCache = async (userIds = []) => {
  try {
    if (!Array.isArray(userIds)) userIds = [userIds];
    const cacheKeys = userIds.map(uid => `stories:${uid}`);
    await safeRedisDel(...cacheKeys);
    console.log('Post Service: Story cache invalidated for users', userIds);
  } catch (err) {
    console.error('Post Service: Error invalidating story cache:', err.message);
  }
};
