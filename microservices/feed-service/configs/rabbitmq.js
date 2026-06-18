import amqp from 'amqplib';

const getRabbitUrl = () => process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const MAX_RETRIES = 18; // Wait up to 3 minutes (matching post-service)
const RETRY_INTERVAL_MS = 10000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectWithRetry = async (connectFn, serviceName, maxRetries = MAX_RETRIES, retryInterval = RETRY_INTERVAL_MS) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${serviceName}: Attempting RabbitMQ connection (attempt ${attempt}/${maxRetries})...`);
      return await connectFn();
    } catch (err) {
      console.error(`${serviceName}: RabbitMQ connection attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        console.log(`${serviceName}: Retrying in ${retryInterval / 1000} seconds...`);
        await sleep(retryInterval);
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
let isConnecting = false;
const reconnectCallbacks = [];

export const registerReconnectCallback = (cb) => {
  if (!reconnectCallbacks.includes(cb)) {
    reconnectCallbacks.push(cb);
  }
};

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

const triggerReconnect = () => {
  setTimeout(async () => {
    try {
      console.log('Feed Service: Reconnecting to RabbitMQ...');
      await connectRabbitMq();
    } catch (err) {
      console.error('Feed Service: Reconnection failed, retrying again in 5s:', err.message);
      triggerReconnect();
    }
  }, 5000);
};

export const connectRabbitMq = async () => {
  if (channel) return { connection, channel };

  if (isConnecting) {
    while (isConnecting) {
      await sleep(100);
    }
    if (channel) return { connection, channel };
  }

  isConnecting = true;

  try {
    await connectWithRetry(async () => {
      connection = await amqp.connect(getRabbitUrl());
      connection.on('error', (err) => {
        console.error('Feed Service RabbitMQ connection error:', err.message);
      });

      connection.on('close', () => {
        console.error('Feed Service RabbitMQ connection closed');
        connection = null;
        channel = null;
        triggerReconnect();
      });

      channel = await connection.createChannel();
      await assertTopology();
    }, 'Feed Service');

    isConnecting = false;

    // Trigger reconnect/init callbacks
    for (const cb of reconnectCallbacks) {
      try {
        await cb(channel);
      } catch (err) {
        console.error('Feed Service: Error running reconnect callback:', err.message);
      }
    }

    return { connection, channel };
  } catch (err) {
    isConnecting = false;
    triggerReconnect();
    throw err;
  }
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
