import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import postRoutes from './routes/postRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import './models/User.js';
import './models/UserRelationship.js';
import { inngest, functions } from './inngest/index.js';
import { serve } from "inngest/express";
import { connectRabbitMq, closeRabbitMq } from './configs/rabbitmq.js';
import { startUserEventConsumer, stopUserEventConsumer } from './consumers/userEventConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.POST_SERVICE_PORT || 3003;
const mongoUri = process.env.POST_MONGO_URI || process.env.MONGO_URI;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Inngest serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

// Routes
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);

let server;

const startServer = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('Post Service: Connected to MongoDB (pingup-post mode)');

    try {
      await connectRabbitMq();
      console.log('Post Service: Connected to RabbitMQ');

      await startUserEventConsumer();
      console.log('Post Service: User event consumer started');
    } catch (rabbitError) {
      console.error('Post Service: RabbitMQ/consumer error. Continuing without live user sync:', rabbitError.message);
    }

    server = app.listen(PORT, () => {
      console.log(`Post Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Post Service: Startup error:', err.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Post Service: Shutting down gracefully...');
  server?.close(async () => {
    await stopUserEventConsumer();
    await closeRabbitMq();
    await mongoose.connection.close();
    console.log('Post Service: MongoDB connection closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Post Service: Forced shutdown');
    process.exit(1);
  }, 10000);
});