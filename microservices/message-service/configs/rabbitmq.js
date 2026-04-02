import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const FEED_EXCHANGE = 'feed.events';

let connection;
let channel;

export const connectRabbitMq = async () => {
  if (channel) return;

  connection = await amqp.connect(rabbitUrl);

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
