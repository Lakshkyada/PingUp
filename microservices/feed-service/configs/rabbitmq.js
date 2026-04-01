import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

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

  connection = await amqp.connect(rabbitUrl);
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
