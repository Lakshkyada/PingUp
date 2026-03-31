import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import feedRoutes from './routes/feedRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.FEED_SERVICE_PORT || 3006;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/feed', feedRoutes);

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Feed Service: Connected to MongoDB'))
  .catch((err) => console.error('Feed Service: MongoDB connection error:', err));

const server = app.listen(PORT, () => {
  console.log(`Feed Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Feed Service: Shutting down gracefully...');
  server.close(async () => {
    await mongoose.connection.close();
    console.log('Feed Service: MongoDB connection closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Feed Service: Forced shutdown');
    process.exit(1);
  }, 10000);
});
