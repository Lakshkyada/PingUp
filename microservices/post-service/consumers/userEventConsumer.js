import User from '../models/User.js';
import UserRelationship from '../models/UserRelationship.js';
import { getRabbitMqChannel } from '../configs/rabbitmq.js';

const USER_EVENTS_EXCHANGE = 'feed.events';
const USER_EVENTS_QUEUE = 'post.user-events';

let consumerTag = null;

const normalizeEventType = (value) => String(value ?? '')
  .trim()
  .toUpperCase()
  .replace(/\./g, '_');

const normalizePayload = (rawPayload = {}) => rawPayload?.user ?? rawPayload?.data?.user ?? rawPayload?.data ?? rawPayload;

const toUserSnapshotPatch = (payload = {}) => ({
  full_name: payload.full_name ?? payload.fullName ?? payload.name ?? '',
  username: payload.username ?? '',
  profile_picture: payload.profile_picture ?? payload.profilePicture ?? '',
});

const upsertUserSnapshot = async (payload) => {
  const userId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id;

  if (!userId) {
    throw new Error('Post Service: Missing user_id in user event payload');
  }

  await User.findByIdAndUpdate(
    userId,
    { $set: toUserSnapshotPatch(payload) },
    { upsert: true, new: true }
  );

  return userId;
};

const ensureRelationshipDoc = async (userId) => {
  await UserRelationship.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, followers: [], following: [], connections: [] } },
    { upsert: true }
  );
};

const upsertRelationshipSnapshot = async (payload = {}) => {
  const userId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id;

  if (!userId) {
    throw new Error('Post Service: Missing user_id in relationship snapshot payload');
  }

  await UserRelationship.updateOne(
    { user_id: userId },
    {
      $setOnInsert: { user_id: userId },
      $set: {
        followers: Array.isArray(payload.followers) ? payload.followers : [],
        following: Array.isArray(payload.following) ? payload.following : [],
        connections: Array.isArray(payload.connections) ? payload.connections : [],
      }
    },
    { upsert: true }
  );
};

const applyFollowEvent = async (eventType, payload = {}) => {
  const followerId = payload.followerId ?? payload.follower_id;
  const followingId = payload.followingId ?? payload.following_id;

  if (!followerId || !followingId) {
    throw new Error(`Post Service: Missing follower/following ids for ${eventType}`);
  }

  await Promise.all([
    ensureRelationshipDoc(followerId),
    ensureRelationshipDoc(followingId)
  ]);

  if (eventType === 'USER_FOLLOWED') {
    await Promise.all([
      UserRelationship.updateOne(
        { user_id: followerId },
        { $addToSet: { following: followingId } }
      ),
      UserRelationship.updateOne(
        { user_id: followingId },
        { $addToSet: { followers: followerId } }
      )
    ]);
  }

  if (eventType === 'USER_UNFOLLOWED') {
    await Promise.all([
      UserRelationship.updateOne(
        { user_id: followerId },
        { $pull: { following: followingId } }
      ),
      UserRelationship.updateOne(
        { user_id: followingId },
        { $pull: { followers: followerId } }
      )
    ]);
  }
};

const applyConnectionAcceptedEvent = async (payload = {}) => {
  const userAId = payload.userAId ?? payload.user_a_id;
  const userBId = payload.userBId ?? payload.user_b_id;

  if (!userAId || !userBId) {
    throw new Error('Post Service: Missing userAId/userBId for connection.accepted');
  }

  await Promise.all([
    ensureRelationshipDoc(userAId),
    ensureRelationshipDoc(userBId)
  ]);

  await Promise.all([
    UserRelationship.updateOne(
      { user_id: userAId },
      { $addToSet: { connections: userBId } }
    ),
    UserRelationship.updateOne(
      { user_id: userBId },
      { $addToSet: { connections: userAId } }
    )
  ]);
};

const processUserEvent = async (message) => {
  const rawPayload = message?.content ? JSON.parse(message.content.toString()) : message;
  const eventType = normalizeEventType(
    rawPayload?.event
    ?? rawPayload?.type
    ?? rawPayload?.eventType
    ?? message?.fields?.routingKey
  );

  const payload = normalizePayload(rawPayload);

  if (['USER_CREATED', 'USER_UPDATED', 'USER_UPDATE'].includes(eventType)) {
    const userId = await upsertUserSnapshot(payload);
    await upsertRelationshipSnapshot(payload);

    console.log('Post Service: Synced user snapshot', {
      eventType,
      user_id: String(userId),
      routingKey: message?.fields?.routingKey,
    });
    return;
  }

  if (eventType === 'USER_FOLLOWED' || eventType === 'USER_UNFOLLOWED') {
    await applyFollowEvent(eventType, payload);
    console.log('Post Service: Applied follow relationship event', {
      eventType,
      followerId: payload.followerId ?? payload.follower_id,
      followingId: payload.followingId ?? payload.following_id,
      routingKey: message?.fields?.routingKey,
    });
    return;
  }

  if (eventType === 'CONNECTION_ACCEPTED') {
    await applyConnectionAcceptedEvent(payload);
    console.log('Post Service: Applied connection relationship event', {
      eventType,
      userAId: payload.userAId ?? payload.user_a_id,
      userBId: payload.userBId ?? payload.user_b_id,
      routingKey: message?.fields?.routingKey,
    });
  }
};

export const startUserEventConsumer = async () => {
  const channel = getRabbitMqChannel();

  if (!channel) {
    throw new Error('Post Service: RabbitMQ channel not available');
  }

  await channel.assertExchange(USER_EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(USER_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(USER_EVENTS_QUEUE, USER_EVENTS_EXCHANGE, 'user.*');
  await channel.prefetch(20);

  const queueState = await channel.checkQueue(USER_EVENTS_QUEUE);
  console.log('Post Service: user events queue state', {
    queue: USER_EVENTS_QUEUE,
    messages: queueState.messageCount,
    consumers: queueState.consumerCount,
  });

  const consumer = await channel.consume(USER_EVENTS_QUEUE, async (message) => {
    if (!message) return;

    try {
      await processUserEvent(message);
      channel.ack(message);
    } catch (error) {
      console.error('Post Service: Failed to process user event:', error.message);
      channel.nack(message, false, false);
    }
  }, { noAck: false });

  consumerTag = consumer.consumerTag;
};

export const stopUserEventConsumer = async () => {
  const channel = getRabbitMqChannel();

  if (channel && consumerTag) {
    try {
      await channel.cancel(consumerTag);
    } catch (error) {
      console.error('Post Service: Failed to stop user event consumer:', error.message);
    }
  }

  consumerTag = null;
};
