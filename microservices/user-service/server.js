import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import userRoutes from './routes/userRoutes.js';
import { inngest, functions } from './inngest/index.js';
import { serve } from "inngest/express";
import { connectRedis, redisClient } from './configs/redis.js';
import { connectRabbitMq, closeRabbitMq } from './configs/rabbitmq.js';
import { startUserEventConsumer, stopUserEventConsumer } from './consumers/userEventConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Inngest serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

// Routes
app.use('/api/users', userRoutes);

// Database connection
let server;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('User Service: Connected to MongoDB');

    try {
      await connectRedis();
      console.log('User Service: Connected to Redis');
    } catch (redisError) {
      console.error('User Service: Redis connection error. Continuing without cache:', redisError.message);
    }

    try {
      await connectRabbitMq();
      console.log('User Service: Connected to RabbitMQ');
    } catch (rabbitError) {
      console.error('User Service: RabbitMQ connection error. Continuing without event publishing:', rabbitError.message);
    }

    try {
      await startUserEventConsumer();
      console.log('User Service: User event consumer started');
    } catch (consumerError) {
      console.error('User Service: User event consumer error. Continuing without sync:', consumerError.message);
    }

    server = app.listen(PORT, () => {
      console.log(`User Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('User Service: Startup error:', err);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('User Service: Shutting down gracefully...');
  server?.close(async () => {
    await stopUserEventConsumer();
    await closeRabbitMq();
    await mongoose.connection.close();
    console.log('User Service: MongoDB connection closed');
    if (redisClient?.isOpen) {
      await redisClient.quit();
      console.log('User Service: Redis connection closed');
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error('User Service: Forced shutdown');
    process.exit(1);
  }, 10000);
});