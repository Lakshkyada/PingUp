import amqp from 'amqplib';

const getRabbitUrl = () => process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectWithRetry = async (connectFn, serviceName, maxRetries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${serviceName}: Attempting RabbitMQ connection (attempt ${attempt}/${maxRetries})...`);
      return await connectFn();
    } catch (err) {
      console.error(`${serviceName}: RabbitMQ connection attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        console.log(`${serviceName}: Retrying in ${RETRY_INTERVAL_MS / 1000} seconds...`);
        await sleep(RETRY_INTERVAL_MS);
      }
    }
  }
  throw new Error(`${serviceName}: Failed to connect to RabbitMQ after ${maxRetries} attempts`);
};

const FEED_EXCHANGE = 'feed.events';
const FEED_DLX_EXCHANGE = 'feed.events.dlx';
const POST_EVENTS_QUEUE = 'feed.post-events';
const USER_EVENTS_QUEUE = 'post.user-events';

let connection;
let channel;

export const connectRabbitMq = async () => {
  if (channel) return;

  await connectWithRetry(async () => {
    connection = await amqp.connect(getRabbitUrl());
    connection.on('error', (err) => {
      console.error('Post Service RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      connection = null;
      channel = null;
      console.error('Post Service RabbitMQ connection closed');
    });

    channel = await connection.createChannel();
    await channel.assertExchange(FEED_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(FEED_DLX_EXCHANGE, 'direct', { durable: true });

    await channel.assertQueue(POST_EVENTS_QUEUE, {
      durable: true,
      deadLetterExchange: FEED_DLX_EXCHANGE,
      deadLetterRoutingKey: `${POST_EVENTS_QUEUE}.dlq`
    });

    await channel.assertQueue(USER_EVENTS_QUEUE, {
      durable: true
    });

    await channel.bindQueue(POST_EVENTS_QUEUE, FEED_EXCHANGE, 'post.*');
    await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
    await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'connection.*');
  }, 'Post Service');
};

export const publishFeedEvent = async (routingKey, event) => {
  if (!channel) {
    await connectRabbitMq();
  }

  return channel.publish(
    FEED_EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    {
      contentType: 'application/json',
      persistent: true
    }
  );
};

export const getRabbitMqChannel = () => channel;

export const closeRabbitMq = async () => {
  if (channel) {
    await channel.close();
    channel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
};
