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

let connection;
let channel;

export const connectRabbitMq = async () => {
  if (channel) return;

  await connectWithRetry(async () => {
    connection = await amqp.connect(getRabbitUrl());
    connection.on('error', (err) => {
      console.error('Message Service RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      connection = null;
      channel = null;
      console.error('Message Service RabbitMQ connection closed');
    });

    channel = await connection.createConfirmChannel();
    await channel.assertExchange(FEED_EXCHANGE, 'topic', { durable: true });

    channel.on('return', (msg) => {
      console.error('Message Service RabbitMQ unroutable event:', {
        exchange: msg.fields.exchange,
        routingKey: msg.fields.routingKey,
        payload: msg.content?.toString(),
      });
    });
  }, 'Message Service');
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
