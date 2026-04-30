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

export const handlePostLikedEvent = async (payload) => {
  const { postId, likerId } = payload;

  if (!postId || !likerId) {
    throw new Error('post.liked payload missing postId/likerId');
  }

  const post = await Post.findByIdAndUpdate(
    postId,
    { $addToSet: { likes_count: likerId } },
    { new: true }
  ).lean();

  if (!post?.user) {
    return;
  }

  // Invalidate caches for all users who might see this post
  try {
    const impactedUsers = await User.find({
      $or: [
        { _id: post.user.toString() }, // post author
        { following: post.user.toString() }, // followers of author
        { connections: post.user.toString() } // connections of author
      ]
    }).select('_id').lean();

    const cachedIds = impactedUsers.map((u) => `feed:${u._id}`);
    if (cachedIds.length > 0) {
      await safeRedisDel(...cachedIds);
    }
  } catch (error) {
    console.log('Could not invalidate feed caches for liked post:', error.message);
  }
};

export const handlePostUnlikedEvent = async (payload) => {
  const { postId, likerId } = payload;

  if (!postId || !likerId) {
    throw new Error('post.unliked payload missing postId/likerId');
  }

  const post = await Post.findByIdAndUpdate(
    postId,
    { $pull: { likes_count: likerId } },
    { new: true }
  ).lean();

  if (!post?.user) {
    return;
  }

  // Invalidate caches for all users who might see this post
  try {
    const impactedUsers = await User.find({
      $or: [
        { _id: post.user.toString() }, // post author
        { following: post.user.toString() }, // followers of author
        { connections: post.user.toString() } // connections of author
      ]
    }).select('_id').lean();

    const cachedIds = impactedUsers.map((u) => `feed:${u._id}`);
    if (cachedIds.length > 0) {
      await safeRedisDel(...cachedIds);
    }
  } catch (error) {
    console.log('Could not invalidate feed caches for unliked post:', error.message);
  }
};
