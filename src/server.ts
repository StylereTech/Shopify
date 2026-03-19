import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { createPostgresPool } from './infrastructure/db/postgres.js';
import {
  PostgresAuditLogRepository,
  PostgresDeliveryJobRepository,
  PostgresDispatchAttemptRepository,
  PostgresIdempotencyRepository,
  PostgresMerchantConfigRepository,
  PostgresOAuthStateRepository,
  PostgresShopInstallationRepository,
  PostgresWebhookEventRepository
} from './infrastructure/persistence/postgres-repositories.js';
import { RedisDispatchQueue } from './infrastructure/queue/dispatch-queue.js';
import { ConsoleLogger } from './observability/logger.js';
import { MetricsRegistry } from './observability/metrics.js';
import { StorreeApiClient } from './infrastructure/storree/storree-client.js';
import { runStartupChecks } from './operations/startup-checks.js';

const pool = createPostgresPool(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const logger = new ConsoleLogger();
const metrics = new MetricsRegistry();

const deps = {
  merchantConfigs: new PostgresMerchantConfigRepository(pool),
  jobs: new PostgresDeliveryJobRepository(pool),
  idempotency: new PostgresIdempotencyRepository(pool),
  dispatchAttempts: new PostgresDispatchAttemptRepository(pool),
  auditLogs: new PostgresAuditLogRepository(pool),
  webhookEvents: new PostgresWebhookEventRepository(pool),
  shops: new PostgresShopInstallationRepository(pool),
  oauthStates: new PostgresOAuthStateRepository(pool),
  queue: new RedisDispatchQueue(redis, env.REDIS_QUEUE_KEY),
  logger,
  metrics
};

const storreeClient = new StorreeApiClient(
  env.STORREE_API_BASE_URL,
  env.STORREE_API_KEY,
  env.STORREE_TIMEOUT_MS,
  env.STORREE_MAX_RETRIES
);

const app = createApp({
  shopifyApiKey: env.SHOPIFY_API_KEY,
  shopifyApiSecret: env.SHOPIFY_API_SECRET,
  appUrl: env.APP_URL,
  scopes: env.SHOPIFY_SCOPES,
  encryptionKeyHex: env.TOKEN_ENCRYPTION_KEY_HEX,
  deps,
  storreeClient,
  readiness: {
    db: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    redis: async () => {
      try {
        const pong = await redis.ping();
        return pong === 'PONG';
      } catch {
        return false;
      }
    }
  }
});

const checks = await runStartupChecks(pool, redis, storreeClient, logger, 'api');
if (!checks.dbOk || !checks.redisOk) {
  logger.error('Critical dependencies unavailable. API refusing startup.');
  process.exit(1);
}

app.listen(Number(env.PORT), () => {
  logger.info('Storree Shopify app listening', { port: env.PORT });
});
