import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { createPostgresPool } from './infrastructure/db/postgres.js';
import { PostgresAuditLogRepository, PostgresDeliveryJobRepository, PostgresDispatchAttemptRepository, PostgresIdempotencyRepository, PostgresMerchantConfigRepository, PostgresOAuthStateRepository, PostgresShopInstallationRepository, PostgresWebhookEventRepository, PostgresStorreeOrderRepository } from './infrastructure/persistence/postgres-repositories.js';
import { setStorreeOrderRepository } from './api/orders.js';
import { RedisDispatchQueue } from './infrastructure/queue/dispatch-queue.js';
import { ConsoleLogger } from './observability/logger.js';
import { MetricsRegistry } from './observability/metrics.js';
import { StorreeApiClient, FakeStorreeClient } from './infrastructure/storree/storree-client.js';
import { DoorDashDriveClient, DoorDashStorreeAdapter } from './infrastructure/doordash/doordash-client.js';
import { runStartupChecks } from './operations/startup-checks.js';
const pool = createPostgresPool(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
// Wire Postgres order repository for customer-facing direct-link flow
setStorreeOrderRepository(new PostgresStorreeOrderRepository(pool));
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
// ─── Dispatch Provider Selection ─────────────────────────────────────────────
// DISPATCH_PROVIDER=doordash (default prod) | storree | fake
let storreeClient;
if (env.DISPATCH_PROVIDER === 'doordash' && env.DOORDASH_DEVELOPER_ID && env.DOORDASH_KEY_ID && env.DOORDASH_SIGNING_SECRET) {
    const dd = new DoorDashDriveClient({
        developerId: env.DOORDASH_DEVELOPER_ID,
        keyId: env.DOORDASH_KEY_ID,
        signingSecret: env.DOORDASH_SIGNING_SECRET,
        baseUrl: env.DOORDASH_BASE_URL,
        timeoutMs: 10_000,
    });
    storreeClient = new DoorDashStorreeAdapter({
        doordash: dd,
        merchantPickupAddress: env.DEFAULT_PICKUP_ADDRESS ?? '1 Main St, Dallas, TX 75201',
        merchantPickupPhone: env.DEFAULT_PICKUP_PHONE,
        merchantPickupName: env.DEFAULT_PICKUP_NAME ?? 'Style.re Store',
        twilioPhone: env.TWILIO_FROM_NUMBER,
        googleMapsKey: env.GOOGLE_MAPS_API_KEY,
    });
    logger.info('Dispatch provider: DoorDash Drive');
}
else if (env.DISPATCH_PROVIDER === 'storree') {
    storreeClient = new StorreeApiClient(env.STORREE_API_BASE_URL, env.STORREE_API_KEY, env.STORREE_TIMEOUT_MS, env.STORREE_MAX_RETRIES);
    logger.info('Dispatch provider: Storree API');
}
else {
    storreeClient = new FakeStorreeClient();
    logger.info('Dispatch provider: Fake (no credentials configured)');
}
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
            }
            catch {
                return false;
            }
        },
        redis: async () => {
            try {
                const pong = await redis.ping();
                return pong === 'PONG';
            }
            catch {
                return false;
            }
        }
    }
});
const checks = await runStartupChecks(pool, redis, storreeClient, logger, 'api');
if (!checks.dbOk || !checks.redisOk) {
    logger.error('Critical dependencies unavailable. API refusing startup.', { checks });
    // Allow 3 retries with 5s delay before hard exit
    await new Promise(r => setTimeout(r, 5000));
    const retry = await runStartupChecks(pool, redis, storreeClient, logger, 'api');
    if (!retry.dbOk || !retry.redisOk) {
        process.exit(1);
    }
}
app.listen(Number(env.PORT), () => {
    logger.info('Storree Shopify app listening', { port: env.PORT });
});
