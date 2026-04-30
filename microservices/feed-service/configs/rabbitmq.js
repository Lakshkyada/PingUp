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

export const FEED_EXCHANGE = 'feed.events';
export const FEED_DLX_EXCHANGE = 'feed.events.dlx';
export const POST_EVENTS_QUEUE = 'feed.post-events';
export const USER_EVENTS_QUEUE = 'feed.user-events';

let connection;
let channel;

const assertTopology = async () => {
  await channel.assertExchange(FEED_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(FEED_DLX_EXCHANGE, 'direct', { durable: true });

  await channel.assertQueue(POST_EVENTS_QUEUE, {
    durable: true,
    deadLetterExchange: FEED_DLX_EXCHANGE,
    deadLetterRoutingKey: `${POST_EVENTS_QUEUE}.dlq`
  });
  await channel.assertQueue(USER_EVENTS_QUEUE, {
    durable: true,
    deadLetterExchange: FEED_DLX_EXCHANGE,
    deadLetterRoutingKey: `${USER_EVENTS_QUEUE}.dlq`
  });

  await channel.assertQueue(`${POST_EVENTS_QUEUE}.dlq`, { durable: true });
  await channel.assertQueue(`${USER_EVENTS_QUEUE}.dlq`, { durable: true });

  await channel.bindQueue(POST_EVENTS_QUEUE, FEED_EXCHANGE, 'post.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'connection.*');

  await channel.bindQueue(`${POST_EVENTS_QUEUE}.dlq`, FEED_DLX_EXCHANGE, `${POST_EVENTS_QUEUE}.dlq`);
  await channel.bindQueue(`${USER_EVENTS_QUEUE}.dlq`, FEED_DLX_EXCHANGE, `${USER_EVENTS_QUEUE}.dlq`);
};

export const connectRabbitMq = async () => {
  if (channel) return { connection, channel };

  await connectWithRetry(async () => {
    connection = await amqp.connect(getRabbitUrl());
    connection.on('error', (err) => {
      console.error('Feed Service RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      console.error('Feed Service RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    channel = await connection.createChannel();
    await assertTopology();
  }, 'Feed Service');

  return { connection, channel };
};

export const getRabbitMqChannel = () => channel;

export const closeRabbitMqConnection = async () => {
  if (channel) {
    await channel.close();
    channel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
};
