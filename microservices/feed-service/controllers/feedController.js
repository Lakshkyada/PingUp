import User from '../models/User.js';
import Post from '../models/Post.js';
import { safeRedisGet, safeRedisSet } from '../configs/redis.js';

const FEED_LIMIT = 50;

export const getFeedPosts = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `feed:${userId}`;
    console.log(`Fetching feed for user ${userId} with cache key ${cacheKey}`);
    // Try to get from cache
    const cachedFeed = await safeRedisGet(cacheKey);
    if (cachedFeed) {
      try {
        const cached = JSON.parse(cachedFeed);
        // Return full posts for frontend
        return res.json({ success: true, posts: cached.feed || [], cached: true });
      } catch (e) {
        console.log('Cache parse error:', e.message);
      }
    }

    // Try to get user's following and connections from actual user collection
    let feedUserIds = [userId];
    try {
      const actualUser = await User.findById(userId)
        .select('following connections')
        .lean();

      if (actualUser) {
        feedUserIds = [
          userId,
          ...(actualUser.following || []).map(id => id.toString()),
          ...(actualUser.connections || []).map(id => id.toString())
        ];
      }
    } catch (userError) {
      console.log('Could not fetch user following/connections:', userError.message);
      // Fallback: just use current user's ID
    }

    const uniqueUserIds = [...new Set(feedUserIds)];
    console.log(`Feed for user ${userId}: querying posts from ${uniqueUserIds.length} users`);

    // Get posts from these users, sorted by newest first
    let posts = await Post.find({ user: { $in: uniqueUserIds } })
      .populate('user', 'full_name username profile_picture')
      .sort({ createdAt: -1 })
      .limit(FEED_LIMIT)
      .lean();

    // If no posts found and user only follows themselves, return recent posts from everyone
    if (posts.length === 0 && uniqueUserIds.length === 1) {
      console.log('No personalized posts found, returning recent posts from all users');
      posts = await Post.find({})
        .populate('user', 'full_name username profile_picture')
        .sort({ createdAt: -1 })
        .limit(FEED_LIMIT)
        .lean();
    }

    // Guard against orphaned posts whose user no longer exists.
    posts = posts.filter((post) => post?.user);

    // Cache full posts so cached/non-cached responses have the same shape.
    const feedData = {
      user_id: userId,
      feed: posts
    };

    // Cache the simplified format
    await safeRedisSet(cacheKey, JSON.stringify(feedData), { EX: 300 });

    // Return full posts to frontend (for UI to render)
    res.json({ success: true, posts, cached: false });
  } catch (error) {
    console.log('Feed error:', error);
    res.json({ success: false, message: error.message });
  }
};

export const getDlqStatus = async (req, res) => {
  try {
    res.json({ success: true, dlqStatus: 'No DLQ configured' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
