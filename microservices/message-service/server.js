import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import messageRoutes from './routes/messageRoutes.js';
import './models/User.js';
import { inngest, functions } from './inngest/index.js';
import { serve } from "inngest/express";
import { connectRabbitMq, closeRabbitMq } from './configs/rabbitmq.js';
import { startUserEventConsumer, stopUserEventConsumer } from './consumers/userEventConsumer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

const PORT = process.env.PORT || process.env.MESSAGE_SERVICE_PORT || 3005;

// Retry utility for cold start issues
const retry = async (fn, retries = 18, delay = 10000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Message Service: Attempt ${i + 1} failed, retrying in ${delay}ms...`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Middleware
const clientUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

if (!process.env.JWT_SECRET) {
  console.warn('Message Service: JWT_SECRET is missing; auth routes will return 401.');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Inngest serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

// Routes
app.use('/api/messages', messageRoutes);

// Database connection
const startServer = async () => {
  try {
    await retry(async () => {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('Message Service: Connected to MongoDB (pingup-message mode)');
    });

    try {
      await retry(async () => {
        await connectRabbitMq();
        console.log('Message Service: Connected to RabbitMQ');
      });

      await retry(async () => {
        await startUserEventConsumer();
        console.log('Message Service: RabbitMQ consumer started');
      });
    } catch (rabbitError) {
      console.error('Message Service: RabbitMQ consumer startup error after retries. Continuing without live user sync:', rabbitError.message);
    }

    const server = app.listen(PORT, () => {
      console.log(`Message Service running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Message Service: Shutting down gracefully...');
      server.close(async () => {
        await stopUserEventConsumer();
        await closeRabbitMq();
        await mongoose.connection.close();
        console.log('Message Service: MongoDB connection closed');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('Message Service: Forced shutdown');
        process.exit(1);
      }, 10000);
    });
  } catch (err) {
    console.error('Message Service: Startup error after retries:', err.message);
    process.exit(1);
  }
};

startServer();