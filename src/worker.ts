import { Redis } from 'ioredis';
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
import { tryAdminAlert } from './infrastructure/sms-alert.js';
import { startDispatchWatchdog } from './domain/dispatch-watchdog.js';

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

const merchantConfigs = new PostgresMerchantConfigRepository(pool);
const jobs = new PostgresDeliveryJobRepository(pool);
const idempotency = new PostgresIdempotencyRepository(pool);
const dispatchAttempts = new PostgresDispatchAttemptRepository(pool);
const auditLogs = new PostgresAuditLogRepository(pool);

const orchestrator = new DispatchOrchestrator(
  merchantConfigs,
  jobs,
  idempotency,
  storreeClient,
  dispatchAttempts,
  auditLogs,
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
  env.WORKER_MAX_RETRIES,
  // Admin SMS alert on max dispatch failures (Style.re 1.1 parity)
  async (payload, error) => {
    const p = payload as { shopDomain?: string; webhookId?: string };
    const message = `🚨 DISPATCH ALERT: Order on ${p.shopDomain ?? 'unknown'} failed all ${env.WORKER_MAX_RETRIES} dispatch attempts. Webhook: ${p.webhookId ?? 'unknown'}. Error: ${String(error)}. Manual intervention required.`;
    logger.error('Max dispatch failures reached — sending admin alert', {
      shopDomain: p.shopDomain,
      webhookId: p.webhookId,
      error: String(error)
    });
    await tryAdminAlert(message, env, logger);
  },
  { baseRetryDelayMs: 5000, maxRetryDelayMs: 120000 }
);

// Start the dispatch watchdog (monitors stuck/orphaned jobs)
const watchdog = startDispatchWatchdog(pool, jobs, merchantConfigs, storreeClient, dispatchAttempts, auditLogs, metrics, logger, env);

logger.info('Worker started', { queueKey: env.REDIS_QUEUE_KEY });

worker.start().catch((error) => {
  logger.error('Worker crashed', { error: String(error) });
  watchdog.stop();
  process.exit(1);
});
