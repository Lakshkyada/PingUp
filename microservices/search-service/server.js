import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import searchRoutes from './routes/searchRoutes.js';
import { ensureUsersIndex, closeElasticsearchClient } from './configs/elasticsearch.js';
import { closeRabbitMqConnection } from './configs/rabbitmq.js';
import { startUserEventConsumer, stopUserEventConsumer } from './consumers/userEventConsumer.js';

dotenv.config();

const app = express();
const PORT = process.env.SEARCH_SERVICE_PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

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
    await ensureUsersIndex();
    console.log('Search Service: Elasticsearch index ready');
  } catch (elasticError) {
    console.error('Search Service: Elasticsearch initialization failed. Continuing with degraded search:', elasticError.message);
  }

  try {
    await startUserEventConsumer();
    console.log('Search Service: RabbitMQ consumer started');
  } catch (rabbitError) {
    console.error('Search Service: RabbitMQ consumer error. Continuing without live indexing:', rabbitError.message);
  }
};

bootstrap().catch((error) => {
  console.error('Search Service bootstrap error:', error);
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);