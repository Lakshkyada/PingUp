import User from '../models/User.js';
import Post from '../models/Post.js';
import { safeRedisDel } from '../configs/redis.js';

export const handlePostCreatedEvent = async (payload) => {
  const {
    postId,
    authorId,
    createdAt,
    contentPreview = '',
    firstImageUrl = '',
    postType = 'text'
  } = payload;

  if (!postId || !authorId) {
    throw new Error('post.created payload missing postId/authorId');
  }

  // Ensure author exists locally so populate('user') works in feed queries.
  await User.findByIdAndUpdate(
    authorId,
    { $setOnInsert: { _id: authorId } },
    { upsert: true, new: true }
  );

  // Mirror post into feed-service DB.
  await Post.findByIdAndUpdate(
    postId,
    {
      $set: {
        user: authorId,
        content: contentPreview,
        image_urls: firstImageUrl ? [firstImageUrl] : [],
        post_type: postType,
      },
      $setOnInsert: {
        _id: postId,
        likes_count: [],
        createdAt: createdAt ? new Date(createdAt) : new Date()
      }
    },
    { upsert: true, new: true }
  );

  // Invalidate author's feed cache
  await safeRedisDel(`feed:${authorId}`);

  // Invalidate caches for followers and connections
  try {
    const impactedUsers = await User.find({
      $or: [
        { _id: authorId },
        { following: authorId },
        { connections: authorId }
      ]
    }).select('_id').lean();

    const cachedIds = impactedUsers.map((u) => `feed:${u._id}`);
    if (cachedIds.length > 0) {
      await safeRedisDel(...cachedIds);
    }
  } catch (error) {
    console.log('Could not invalidate follower caches:', error.message);
  }
};
