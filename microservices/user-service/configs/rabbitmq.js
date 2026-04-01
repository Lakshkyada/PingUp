import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const FEED_EXCHANGE = 'feed.events';
const FEED_DLX_EXCHANGE = 'feed.events.dlx';
const POST_EVENTS_QUEUE = 'feed.post-events';
const USER_EVENTS_QUEUE = 'feed.user-events';

let connection;
let channel;

export const connectRabbitMq = async () => {
  if (channel) return;

  connection = await amqp.connect(rabbitUrl);
  connection.on('error', (err) => {
    console.error('User Service RabbitMQ connection error:', err.message);
  });

  connection.on('close', () => {
    connection = null;
    channel = null;
    console.error('User Service RabbitMQ connection closed');
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
    durable: true,
    deadLetterExchange: FEED_DLX_EXCHANGE,
    deadLetterRoutingKey: `${USER_EVENTS_QUEUE}.dlq`
  });

  await channel.bindQueue(POST_EVENTS_QUEUE, FEED_EXCHANGE, 'post.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'connection.*');
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
