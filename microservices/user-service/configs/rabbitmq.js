import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const FEED_EXCHANGE = 'feed.events';
const FEED_DLX_EXCHANGE = 'feed.events.dlx';
const POST_EVENTS_QUEUE = 'feed.post-events';
const USER_EVENTS_QUEUE = 'feed.user-events';
const SEARCH_USER_EVENTS_QUEUE = 'search.user-events';
const AUDIT_USER_EVENTS_QUEUE = process.env.AUDIT_USER_EVENTS_QUEUE || 'audit.user-events';

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

  channel = await connection.createConfirmChannel();
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

  await channel.assertQueue(SEARCH_USER_EVENTS_QUEUE, {
    durable: true
  });

  await channel.assertQueue(AUDIT_USER_EVENTS_QUEUE, {
    durable: true
  });

  await channel.bindQueue(POST_EVENTS_QUEUE, FEED_EXCHANGE, 'post.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
  await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'connection.*');
  await channel.bindQueue(SEARCH_USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
  await channel.bindQueue(AUDIT_USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
  await channel.bindQueue(AUDIT_USER_EVENTS_QUEUE, FEED_EXCHANGE, 'connection.*');

  channel.on('return', (msg) => {
    console.error('User Service RabbitMQ unroutable event:', {
      exchange: msg.fields.exchange,
      routingKey: msg.fields.routingKey,
      payload: msg.content?.toString(),
    });
  });
};

export const publishFeedEvent = async (routingKey, event) => {
  if (!channel) {
    await connectRabbitMq();
  }

  await new Promise((resolve, reject) => {
    channel.publish(
      FEED_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      {
        contentType: 'application/json',
        persistent: true,
        mandatory: true,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  return true;
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
