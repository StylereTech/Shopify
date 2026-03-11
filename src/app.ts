import express from 'express';
import { randomUUID } from 'node:crypto';
import { quoteDeliveryOptions } from './domain/pricing.js';
import { DispatchOrchestrator } from './domain/dispatch-orchestrator.js';
import {
  InMemoryAuditLogRepository,
  InMemoryDeliveryJobRepository,
  InMemoryDispatchAttemptRepository,
  InMemoryIdempotencyRepository,
  InMemoryMerchantConfigRepository,
  InMemoryOAuthStateRepository,
  InMemoryShopInstallationRepository,
  InMemoryWebhookEventRepository
} from './infrastructure/persistence/in-memory-repositories.js';
import { FakeStorreeClient, StorreeClient } from './infrastructure/storree/storree-client.js';
import { carrierRateRequestSchema, shopifyOrderWebhookSchema } from './shopify/schemas.js';
import { MerchantDeliveryConfig, WebhookEvent } from './domain/types.js';
import { requestContext } from './middleware/request-context.js';
import { ConsoleLogger, Logger } from './observability/logger.js';
import { DispatchQueue, InlineDispatchQueue, RedisDispatchQueue } from './infrastructure/queue/dispatch-queue.js';
import { verifyShopifyWebhookHmac } from './shopify/hmac.js';
import { ShopifyAuthService } from './shopify/auth.js';
import { CarrierServiceManager } from './shopify/carrier-service-manager.js';
import {
  AuditLogRepository,
  DeliveryJobRepository,
  DispatchAttemptRepository,
  IdempotencyRepository,
  MerchantConfigRepository,
  OAuthStateRepository,
  ShopInstallationRepository,
  WebhookEventRepository
} from './infrastructure/persistence/repositories.js';
import { TokenVault } from './shopify/token-vault.js';
import { ShopifyLocationService } from './shopify/location-service.js';
import { MetricsRegistry } from './observability/metrics.js';

export interface AppDeps {
  merchantConfigs: MerchantConfigRepository;
  jobs: DeliveryJobRepository;
  idempotency: IdempotencyRepository;
  dispatchAttempts: DispatchAttemptRepository;
  auditLogs: AuditLogRepository;
  webhookEvents: WebhookEventRepository;
  shops: ShopInstallationRepository;
  oauthStates: OAuthStateRepository;
  queue: DispatchQueue;
  logger: Logger;
  metrics: MetricsRegistry;
}

export function createDefaultInMemoryDeps(): AppDeps {
  return {
    merchantConfigs: new InMemoryMerchantConfigRepository(),
    jobs: new InMemoryDeliveryJobRepository(),
    idempotency: new InMemoryIdempotencyRepository(),
    dispatchAttempts: new InMemoryDispatchAttemptRepository(),
    auditLogs: new InMemoryAuditLogRepository(),
    webhookEvents: new InMemoryWebhookEventRepository(),
    shops: new InMemoryShopInstallationRepository(),
    oauthStates: new InMemoryOAuthStateRepository(),
    queue: new InlineDispatchQueue(async () => undefined),
    logger: new ConsoleLogger(),
    metrics: new MetricsRegistry()
  };
}

export function createApp(config?: {
  shopifyApiKey?: string;
  shopifyApiSecret?: string;
  appUrl?: string;
  scopes?: string;
  encryptionKeyHex?: string;
  deps?: AppDeps;
  storreeClient?: StorreeClient;
  readiness?: {
    db?: () => Promise<boolean>;
    redis?: () => Promise<boolean>;
  };
}) {
  const deps = config?.deps ?? createDefaultInMemoryDeps();
  const storreeClient = config?.storreeClient ?? new FakeStorreeClient();
  const carrierServiceManager = new CarrierServiceManager();
  const locationService = new ShopifyLocationService();
  const tokenVault = new TokenVault(config?.encryptionKeyHex ?? 'a'.repeat(64));

  const orchestrator = new DispatchOrchestrator(
    deps.merchantConfigs,
    deps.jobs,
    deps.idempotency,
    storreeClient,
    deps.dispatchAttempts,
    deps.auditLogs,
    deps.metrics
  );

  const processWebhookPayload = async (payload: Record<string, unknown>, retryCount = 0): Promise<void> => {
    const { shopDomain, webhookId, body, correlationId } = payload as {
      shopDomain: string;
      webhookId: string;
      body: unknown;
      correlationId?: string;
    };

    const order = shopifyOrderWebhookSchema.parse(body);

    await orchestrator.ingestPaidShopifyOrder(
      {
        id: order.id,
        orderNumber: order.name,
        shopDomain,
        shippingMethodCode: order.shipping_lines[0]?.code ?? '',
        customerAddress: {
          lat: order.shipping_address.latitude,
          lng: order.shipping_address.longitude
        },
        lineItems: order.line_items.map((item) => ({ sku: item.sku, quantity: item.quantity, name: item.name }))
      },
      webhookId,
      { retryCount, correlationId }
    );
  };

  if (deps.queue instanceof InlineDispatchQueue) {
    deps.queue = new InlineDispatchQueue(async (payload) => processWebhookPayload(payload, 0));
  }

  const authService = new ShopifyAuthService({
    apiKey: config?.shopifyApiKey ?? 'dev-key',
    apiSecret: config?.shopifyApiSecret ?? 'dev-secret',
    appUrl: config?.appUrl ?? 'http://localhost:3000',
    scopes: config?.scopes ?? 'read_orders,write_shipping,read_locations',
    installationRepo: deps.shops,
    oauthStateRepo: deps.oauthStates,
    carrierServiceManager,
    tokenVault,
    auditLogs: deps.auditLogs
  });

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    })
  );
  app.use(requestContext);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/health/ready', async (_req, res) => {
    const dbOk = config?.readiness?.db ? await config.readiness.db() : true;
    const redisOk = config?.readiness?.redis ? await config.readiness.redis() : true;
    const storreeOk = await storreeClient.checkConnectivity();

    if (!dbOk || !redisOk || !storreeOk) {
      return res.status(503).json({ ok: false, dbOk, redisOk, storreeOk });
    }

    return res.json({ ok: true, dbOk, redisOk, storreeOk });
  });

  app.get('/metrics', async (_req, res) => {
    if (deps.queue instanceof RedisDispatchQueue) {
      deps.metrics.gauge('queue.depth', await deps.queue.size());
    }
    return res.json(deps.metrics.snapshot());
  });

  app.get('/shopify/install', async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    if (!authService.verifyInstallQuery(query) || !query.shop) {
      return res.status(401).json({ error: 'Invalid install request' });
    }

    const install = await authService.beginInstall(query.shop);
    return res.redirect(install.redirectUrl);
  });

  app.get('/shopify/auth/callback', async (req, res) => {
    try {
      await authService.completeCallback(req.query as Record<string, string | undefined>, req.header('x-request-id') ?? undefined);
      return res.status(200).send('Storree app installed successfully.');
    } catch (error) {
      deps.logger.error('OAuth callback failed', { error: String(error), correlationId: req.header('x-request-id') });
      return res.status(401).json({ error: 'OAuth failed' });
    }
  });

  app.get('/shopify/onboarding/status', async (req, res) => {
    const shopDomain = req.query.shop as string | undefined;
    if (!shopDomain) return res.status(400).json({ error: 'shop required' });

    const installation = await deps.shops.getByShopDomain(shopDomain);
    const merchantConfig = await deps.merchantConfigs.getByShopDomain(shopDomain);

    if (!installation) {
      return res.status(404).json({
        appInstalled: false,
        tokenPresent: false,
        oauthValid: false,
        carrierServiceRegistered: false,
        pickupLocationConfigured: false,
        merchantConfigComplete: false,
        dispatchConnectivityOk: false,
        reasons: ['Shop is not installed']
      });
    }

    const token = tokenVault.decrypt(installation.encryptedAccessToken);
    const locations = await locationService.listLocations(shopDomain, token);
    const prerequisiteStatus = await carrierServiceManager.checkPrerequisites(shopDomain, token);
    const storreeConnectivity = await storreeClient.checkConnectivity();

    const reasons: string[] = [];
    if (!installation.carrierServiceId) reasons.push('Carrier service is not registered.');
    if (!merchantConfig) reasons.push('Merchant delivery configuration is missing.');
    if (merchantConfig && !merchantConfig.pickupLocation) reasons.push('Pickup location is not configured.');
    if (!storreeConnectivity) reasons.push('Storree connectivity check failed.');

    return res.json({
      appInstalled: true,
      tokenPresent: true,
      oauthValid: true,
      carrierServiceRegistered: !!installation.carrierServiceId,
      complianceConfigExpected: true,
      pickupLocationConfigured: !!merchantConfig?.pickupLocation,
      merchantConfigComplete: !!merchantConfig,
      dispatchConnectivityOk: storreeConnectivity,
      locations,
      carrierServicePrerequisites: prerequisiteStatus,
      merchantActionRequired:
        'Confirm Storree carrier service visibility in active shipping profiles; Shopify may require profile-specific configuration.',
      reasons
    });
  });

  app.post('/shopify/webhooks/compliance', async (req, res) => {
    const topic = req.header('x-shopify-topic') ?? 'unknown';
    const shopDomain = req.header('x-shopify-shop-domain') ?? 'unknown';
    const webhookId = req.header('x-shopify-webhook-id') ?? randomUUID();
    const webhookHmac = req.header('x-shopify-hmac-sha256');
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));

    if (!verifyShopifyWebhookHmac(rawBody, webhookHmac, config?.shopifyApiSecret ?? 'dev-secret')) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    await deps.auditLogs.create({
      id: randomUUID(),
      actor: 'shopify',
      action: `compliance_${topic.replace('/', '_')}`,
      entityType: 'shop',
      entityId: shopDomain,
      occurredAt: new Date(),
      correlationId: webhookId,
      metadata: { payload: req.body }
    });

    return res.status(200).json({ acknowledged: true });
  });

  app.post('/merchant/config', async (req, res) => {
    const configBody = req.body as MerchantDeliveryConfig;
    await deps.merchantConfigs.upsert(configBody);
    res.status(204).end();
  });

  app.post('/shopify/carrier-service/rates', async (req, res) => {
    deps.metrics.increment('carrier.quote_requests');

    const parsed = carrierRateRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const storreeHealthy = await storreeClient.checkConnectivity();
    if (!storreeHealthy) {
      deps.metrics.increment('dispatch.connectivity_unhealthy');
      return res.json({ rates: [] });
    }

    const cfg = await deps.merchantConfigs.getByShopDomain(parsed.data.shop.domain);
    if (!cfg || !cfg.isActive) return res.json({ rates: [] });

    const quotes = quoteDeliveryOptions({
      merchantConfig: cfg,
      dropoffLocation: { lat: parsed.data.rate.destination.latitude, lng: parsed.data.rate.destination.longitude },
      orderSubtotalCents: Number(parsed.data.rate.price ?? '0'),
      requestedAt: new Date()
    });

    return res.json({
      rates: quotes.map((quote) => ({
        service_name: quote.serviceLevel === 'one_hour' ? 'Storree One-Hour Delivery' : 'Storree Same-Day Delivery',
        service_code: quote.serviceLevel === 'one_hour' ? 'STORREE_ONE_HOUR' : 'STORREE_SAME_DAY',
        total_price: String(quote.feeCents),
        description: quote.message,
        currency: parsed.data.rate.currency
      }))
    });
  });

  app.post('/shopify/webhooks/orders/paid', async (req, res) => {
    deps.metrics.increment('webhook.received');
    const topic = req.header('x-shopify-topic');
    const shopDomain = req.header('x-shopify-shop-domain');
    const webhookId = req.header('x-shopify-webhook-id') ?? randomUUID();
    const webhookHmac = req.header('x-shopify-hmac-sha256');
    const correlationId = req.header('x-request-id') ?? webhookId;
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));

    if (!verifyShopifyWebhookHmac(rawBody, webhookHmac, config?.shopifyApiSecret ?? 'dev-secret')) {
      deps.metrics.increment('webhook.invalid_signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const storreeHealthy = await storreeClient.checkConnectivity();
    if (!storreeHealthy) {
      deps.metrics.increment('dispatch.connectivity_unhealthy');
      return res.status(503).json({ error: 'Storree unavailable' });
    }

    const event: WebhookEvent = {
      id: webhookId,
      topic: topic ?? 'unknown',
      shopDomain: shopDomain ?? 'unknown',
      receivedAt: new Date(),
      status: 'received',
      payload: req.body
    };
    await deps.webhookEvents.create(event);

    if (topic !== 'orders/paid' || !shopDomain) {
      event.status = 'failed';
      event.errorMessage = 'Unexpected webhook';
      await deps.webhookEvents.update(event);
      return res.status(400).json({ error: 'Unexpected webhook' });
    }

    try {
      await deps.queue.enqueue({ shopDomain, webhookId, body: req.body, correlationId });
      event.status = 'processed';
      await deps.webhookEvents.update(event);
      deps.metrics.increment('webhook.accepted');
      return res.status(202).json({ accepted: true, webhookId });
    } catch (error) {
      event.status = 'failed';
      event.errorMessage = String(error);
      await deps.webhookEvents.update(event);
      deps.metrics.increment('webhook.enqueue_failure');
      return res.status(500).json({ error: 'Queue enqueue failed' });
    }
  });

  return app;
}

export const app = createApp();
