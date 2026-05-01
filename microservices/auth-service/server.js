import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import { connectRabbitMq, closeRabbitMq } from './configs/rabbitmq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || process.env.AUTH_SERVICE_PORT || 3002;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Retry utility for cold start issues
const retry = async (fn, retries = 18, delay = 10000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Auth Service: Attempt ${i + 1} failed, retrying in ${delay}ms...`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Middleware
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);

// Database connection
const startServer = async () => {
  try {
    await retry(async () => {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('Auth Service: Connected to MongoDB');
    });

    await retry(async () => {
      await connectRabbitMq();
      console.log('Auth Service: Connected to RabbitMQ');
    }).catch((rabbitError) => {
      console.error('Auth Service: RabbitMQ connection error after retries. Continuing without event publishing:', rabbitError.message);
    });

    const server = app.listen(PORT, () => {
      console.log(`Auth Service running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Auth Service: Shutting down gracefully...');
      server.close(async () => {
        await closeRabbitMq();
        await mongoose.connection.close();
        console.log('Auth Service: MongoDB connection closed');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('Auth Service: Forced shutdown');
        process.exit(1);
      }, 10000);
    });
  } catch (err) {
    console.error('Auth Service: Startup error after retries:', err.message);
    process.exit(1);
  }
};

startServer();