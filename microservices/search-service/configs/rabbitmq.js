import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

let connection;
let channel;

export const connectRabbitMq = async () => {
    if (channel) {
        return { connection, channel };
    }

    connection = await amqp.connect(rabbitUrl);

    connection.on('error', (error) => {
        console.error('Search Service RabbitMQ connection error:', error.message);
    });

    connection.on('close', () => {
        console.error('Search Service RabbitMQ connection closed');
        connection = null;
        channel = null;
    });

    channel = await connection.createChannel();

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