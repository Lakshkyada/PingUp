import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import searchRoutes from './routes/searchRoutes.js';
import { ensureUsersIndex, closeElasticsearchClient } from './configs/elasticsearch.js';
import { closeRabbitMqConnection } from './configs/rabbitmq.js';
import { startUserEventConsumer, stopUserEventConsumer } from './consumers/userEventConsumer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.SEARCH_SERVICE_PORT || 3004;

// Retry utility for cold start issues
const retry = async (fn, retries = 18, delay = 10000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Search Service: Attempt ${i + 1} failed, retrying in ${delay}ms...`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Routes
app.use('/api/search', searchRoutes);

let server;

const shutdown = async () => {
  console.log('Search Service: Shutting down gracefully...');

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await stopUserEventConsumer();
  await closeRabbitMqConnection();
  await closeElasticsearchClient();

  process.exit(0);
};

const bootstrap = async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      console.log(`Search Service running on port ${PORT}`);
      resolve();
    });

    server.on('error', (error) => {
      reject(error);
    });
  });

  try {
    await retry(async () => {
      await ensureUsersIndex();
      console.log('Search Service: Elasticsearch index ready');
    });
  } catch (elasticError) {
    console.error('Search Service: Elasticsearch initialization failed after retries. Continuing with degraded search:', elasticError.message);
  }

  try {
    await retry(async () => {
      await startUserEventConsumer();
      console.log('Search Service: RabbitMQ consumer started');
    });
  } catch (rabbitError) {
    console.error('Search Service: RabbitMQ consumer error after retries. Continuing without live indexing:', rabbitError.message);
  }
};

bootstrap().catch((error) => {
  console.error('Search Service bootstrap error:', error);
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);