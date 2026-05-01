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

let connection;
let channel;

export const connectRabbitMq = async () => {
    if (channel) {
        return { connection, channel };
    }

    await connectWithRetry(async () => {
        connection = await amqp.connect(getRabbitUrl());
        connection.on('error', (error) => {
            console.error('Search Service RabbitMQ connection error:', error.message);
        });

        connection.on('close', () => {
            console.error('Search Service RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        channel = await connection.createChannel();
        console.log('Search Service: RabbitMQ connection established');
    }, 'Search Service');

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