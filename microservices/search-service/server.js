import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import searchRoutes from './routes/searchRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.SEARCH_SERVICE_PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/search', searchRoutes);

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Search Service: Connected to MongoDB'))
  .catch(err => console.error('Search Service: MongoDB connection error:', err));

const server = app.listen(PORT, () => {
  console.log(`Search Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Search Service: Shutting down gracefully...');
  server.close(async () => {
    await mongoose.connection.close();
    console.log('Search Service: MongoDB connection closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Search Service: Forced shutdown');
    process.exit(1);
  }, 10000);
});