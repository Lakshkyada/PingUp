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
const PORT = process.env.AUTH_SERVICE_PORT || 3002;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Auth Service: Connected to MongoDB'))
  .catch(err => console.error('Auth Service: MongoDB connection error:', err));

connectRabbitMq()
  .then(() => console.log('Auth Service: Connected to RabbitMQ'))
  .catch((rabbitError) => {
    console.error('Auth Service: RabbitMQ connection error. Continuing without event publishing:', rabbitError.message);
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