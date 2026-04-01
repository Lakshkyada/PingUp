import User from '../models/User.js';
import { safeRedisDel } from '../configs/redis.js';

export const handleUserEvent = async (eventType, payload) => {
  const { followerId, followingId, userAId, userBId, requesterId, receiverId } = payload;

  const ensureUser = async (id) => {
    if (!id) return;
    await User.findByIdAndUpdate(id, { $setOnInsert: { _id: id } }, { upsert: true, new: true });
  };

  if (eventType === 'user.followed' && followerId && followingId) {
    await ensureUser(followerId);
    await ensureUser(followingId);

    await User.findByIdAndUpdate(followerId, { $addToSet: { following: followingId } });
    await User.findByIdAndUpdate(followingId, { $addToSet: { followers: followerId } });
  }

  if (eventType === 'user.unfollowed' && followerId && followingId) {
    await ensureUser(followerId);
    await ensureUser(followingId);

    await User.findByIdAndUpdate(followerId, { $pull: { following: followingId } });
    await User.findByIdAndUpdate(followingId, { $pull: { followers: followerId } });
  }

  if (eventType === 'connection.accepted' && userAId && userBId) {
    await ensureUser(userAId);
    await ensureUser(userBId);

    await User.findByIdAndUpdate(userAId, { $addToSet: { connections: userBId } });
    await User.findByIdAndUpdate(userBId, { $addToSet: { connections: userAId } });
  }

  if (eventType === 'connection.rejected' && requesterId && receiverId) {
    await ensureUser(requesterId);
    await ensureUser(receiverId);
  }

  // Collect all affected user IDs
  const affectedUserIds = [followerId, followingId, userAId, userBId, requesterId, receiverId].filter(Boolean);

  if (affectedUserIds.length > 0) {
    // Invalidate feed caches for affected users so they refetch
    const cacheKeys = affectedUserIds.map(userId => `feed:${userId}`);
    await safeRedisDel(...cacheKeys);
  }
};
