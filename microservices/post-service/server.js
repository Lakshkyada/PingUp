import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import postRoutes from './routes/postRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import './models/User.js';
import { inngest, functions } from './inngest/index.js';
import { serve } from "inngest/express";
import { connectRabbitMq, closeRabbitMq } from './configs/rabbitmq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.POST_SERVICE_PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Inngest serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

// Routes
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);

let server;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Post Service: Connected to MongoDB');

    try {
      await connectRabbitMq();
      console.log('Post Service: Connected to RabbitMQ');
    } catch (rabbitError) {
      console.error('Post Service: RabbitMQ connection error. Continuing without event publishing:', rabbitError.message);
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