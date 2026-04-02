import User from '../models/User.js';
import { getRabbitMqChannel } from '../configs/rabbitmq.js';

const USER_EVENTS_EXCHANGE = 'feed.events';
const USER_EVENTS_QUEUE = 'message.user-events';

let consumerTag = null;

const normalizeEventType = (value) => String(value ?? '')
  .trim()
  .toUpperCase()
  .replace(/\./g, '_');

const normalizePayload = (rawPayload = {}) => rawPayload?.user ?? rawPayload?.data?.user ?? rawPayload?.data ?? rawPayload;

const toSnapshotPatch = (payload = {}) => ({
  username: payload.username ?? '',
  full_name: payload.full_name ?? payload.fullName ?? payload.name ?? '',
  profile_picture: payload.profile_picture ?? payload.profilePicture ?? '',
  email: payload.email ?? '',
});

const upsertUserSnapshot = async (payload) => {
  const userId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id;

  if (!userId) {
    throw new Error('Message Service: Missing user_id in user event payload');
  }

  await User.findByIdAndUpdate(
    userId,
    { $set: toSnapshotPatch(payload) },
    { upsert: true, new: true }
  );

  return userId;
};

const processUserEvent = async (message) => {
  const rawPayload = message?.content ? JSON.parse(message.content.toString()) : message;
  const eventType = normalizeEventType(
    rawPayload?.event
    ?? rawPayload?.type
    ?? rawPayload?.eventType
    ?? message?.fields?.routingKey
  );

  if (!['USER_CREATED', 'USER_UPDATED'].includes(eventType)) {
    return;
  }

  const payload = normalizePayload(rawPayload);
  const userId = await upsertUserSnapshot(payload);

  console.log('Message Service: Synced user snapshot', {
    eventType,
    user_id: String(userId),
    routingKey: message?.fields?.routingKey,
  });
};

export const startUserEventConsumer = async () => {
  const channel = getRabbitMqChannel();

  if (!channel) {
    throw new Error('Message Service: RabbitMQ channel not available');
  }

  await channel.assertExchange(USER_EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(USER_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(USER_EVENTS_QUEUE, USER_EVENTS_EXCHANGE, 'user.*');
  await channel.prefetch(20);

  const queueState = await channel.checkQueue(USER_EVENTS_QUEUE);
  console.log('Message Service: user events queue state', {
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
      console.error('Message Service: Failed to process user event:', error.message);
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
      console.error('Message Service: Failed to stop user event consumer:', error.message);
    }
  }

  consumerTag = null;
};
