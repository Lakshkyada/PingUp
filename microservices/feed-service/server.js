import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import feedRoutes from './routes/feedRoutes.js';
import { connectRedis, redisClient } from './configs/redis.js';
import { closeRabbitMqConnection } from './configs/rabbitmq.js';
import { initializeFeedConsumers } from './consumers/rabbitmqConsumer.js';

dotenv.config();

const app = express();
const PORT = process.env.FEED_SERVICE_PORT || 3006;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/feed', feedRoutes);

let server;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Feed Service: Connected to MongoDB');

    try {
      await connectRedis();
      console.log('Feed Service: Connected to Redis');
    } catch (redisError) {
      console.error('Feed Service: Redis connection error. Continuing without cache:', redisError.message);
    }

    try {
      await initializeFeedConsumers();
      console.log('Feed Service: RabbitMQ consumers initialized');
    } catch (rabbitError) {
      console.error('Feed Service: RabbitMQ connection error. Continuing without consumers:', rabbitError.message);
    }

    server = app.listen(PORT, () => {
      console.log(`Feed Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Feed Service: Startup error:', err.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Feed Service: Shutting down gracefully...');
  server?.close(async () => {
    await closeRabbitMqConnection();
    if (redisClient?.isOpen) {
      await redisClient.quit();
      console.log('Feed Service: Redis connection closed');
    }
    await mongoose.connection.close();
    console.log('Feed Service: MongoDB connection closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Feed Service: Forced shutdown');
    process.exit(1);
  }, 10000);
});
