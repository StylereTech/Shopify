import Redis from 'ioredis';
import { DispatchOrchestrator } from './domain/dispatch-orchestrator.js';
import { env } from './config/env.js';
import { createPostgresPool } from './infrastructure/db/postgres.js';
import {
  PostgresAuditLogRepository,
  PostgresDeliveryJobRepository,
  PostgresDispatchAttemptRepository,
  PostgresIdempotencyRepository,
  PostgresMerchantConfigRepository
} from './infrastructure/persistence/postgres-repositories.js';
import { ConsoleLogger } from './observability/logger.js';
import { RedisDispatchWorker } from './infrastructure/queue/dispatch-queue.js';
import { shopifyOrderWebhookSchema } from './shopify/schemas.js';
import { MetricsRegistry } from './observability/metrics.js';
import { StorreeApiClient, StorreeDispatchError } from './infrastructure/storree/storree-client.js';
import { runStartupChecks } from './operations/startup-checks.js';

const pool = createPostgresPool(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const logger = new ConsoleLogger();
const metrics = new MetricsRegistry();

const storreeClient = new StorreeApiClient(
  env.STORREE_API_BASE_URL,
  env.STORREE_API_KEY,
  env.STORREE_TIMEOUT_MS,
  env.STORREE_MAX_RETRIES
);

const checks = await runStartupChecks(pool, redis, storreeClient, logger, 'worker');
if (!checks.dbOk || !checks.redisOk) {
  logger.error('Critical dependencies unavailable. Worker refusing startup.');
  process.exit(1);
}

const orchestrator = new DispatchOrchestrator(
  new PostgresMerchantConfigRepository(pool),
  new PostgresDeliveryJobRepository(pool),
  new PostgresIdempotencyRepository(pool),
  storreeClient,
  new PostgresDispatchAttemptRepository(pool),
  new PostgresAuditLogRepository(pool),
  metrics
);

const worker = new RedisDispatchWorker(
  redis,
  env.REDIS_QUEUE_KEY,
  env.REDIS_DEAD_LETTER_KEY,
  logger,
  async (payload, attempts) => {
    const { shopDomain, webhookId, body, correlationId } = payload as {
      shopDomain: string;
      webhookId: string;
      body: unknown;
      correlationId?: string;
    };
    const parsed = shopifyOrderWebhookSchema.parse(body);

    await orchestrator.ingestPaidShopifyOrder(
      {
        id: parsed.id,
        orderNumber: parsed.name,
        shopDomain,
        shippingMethodCode: parsed.shipping_lines[0]?.code ?? '',
        customerAddress: {
          lat: parsed.shipping_address.latitude,
          lng: parsed.shipping_address.longitude
        },
        lineItems: parsed.line_items.map((item) => ({ sku: item.sku, quantity: item.quantity, name: item.name }))
      },
      webhookId,
      { retryCount: attempts, correlationId }
    );
  },
  (error) => (error instanceof StorreeDispatchError ? error.retryable : true),
  metrics,
  env.WORKER_MAX_RETRIES
);

worker.start().catch((error) => {
  logger.error('Worker crashed', { error: String(error) });
  process.exit(1);
});
