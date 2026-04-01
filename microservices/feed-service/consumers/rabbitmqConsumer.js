import {
  POST_EVENTS_QUEUE,
  USER_EVENTS_QUEUE,
  connectRabbitMq,
  getRabbitMqChannel,
  closeRabbitMqConnection
} from '../configs/rabbitmq.js';
import ProcessedEvent from '../models/ProcessedEvent.js';
import { handlePostCreatedEvent } from '../handlers/postEventHandler.js';
import { handleUserEvent } from '../handlers/userEventHandler.js';

const MAX_RETRIES = 3;

const parseMessage = (msg) => {
  const content = msg.content.toString('utf-8');
  return JSON.parse(content);
};

const isAlreadyProcessed = async (eventId) => {
  if (!eventId) return false;
  const existing = await ProcessedEvent.findOne({ eventId }).lean();
  return Boolean(existing);
};

const markProcessed = async (eventId, eventType) => {
  if (!eventId) return;
  await ProcessedEvent.findOneAndUpdate(
    { eventId },
    { eventId, eventType, processedAt: new Date() },
    { upsert: true, new: true }
  );
};

const processMessage = async (queueName, msg, handler) => {
  const channel = getRabbitMqChannel();
  const headers = msg.properties.headers || {};
  const attempts = Number(headers['x-attempt'] || 1);

  try {
    const payload = parseMessage(msg);
    const eventType = payload.event;

    if (await isAlreadyProcessed(payload.eventId)) {
      channel.ack(msg);
      return;
    }

    await handler(eventType, payload);
    await markProcessed(payload.eventId, eventType);
    channel.ack(msg);
  } catch (error) {
    console.error(`Feed Service: Failed processing message from ${queueName}:`, error.message);

    if (attempts >= MAX_RETRIES) {
      channel.nack(msg, false, false);
      return;
    }

    channel.publish('', queueName, msg.content, {
      persistent: true,
      contentType: 'application/json',
      headers: {
        ...headers,
        'x-attempt': attempts + 1
      }
    });
    channel.ack(msg);
  }
};

export const initializeFeedConsumers = async () => {
  await connectRabbitMq();
  const channel = getRabbitMqChannel();

  await channel.consume(
    POST_EVENTS_QUEUE,
    (msg) => {
      if (!msg) return;
      processMessage(POST_EVENTS_QUEUE, msg, async (eventType, payload) => {
        if (eventType === 'post.created') {
          await handlePostCreatedEvent(payload);
        }
      });
    },
    { noAck: false }
  );

  await channel.consume(
    USER_EVENTS_QUEUE,
    (msg) => {
      if (!msg) return;
      processMessage(USER_EVENTS_QUEUE, msg, handleUserEvent);
    },
    { noAck: false }
  );
};

export const getDlqStatus = async (req, res) => {
  try {
    const channel = getRabbitMqChannel();
    if (!channel) {
      return res.status(503).json({ success: false, message: 'RabbitMQ channel unavailable' });
    }

    const [postDlq, userDlq] = await Promise.all([
      channel.checkQueue(`${POST_EVENTS_QUEUE}.dlq`),
      channel.checkQueue(`${USER_EVENTS_QUEUE}.dlq`)
    ]);

    return res.json({
      success: true,
      dlq: {
        post: postDlq.messageCount,
        user: userDlq.messageCount
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const closeRabbitMq = async () => {
  await closeRabbitMqConnection();
};
