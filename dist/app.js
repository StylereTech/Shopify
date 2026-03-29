import express from 'express';
import { randomUUID } from 'node:crypto';
import { createOrdersRouter, createPaymentsRouter, createStoresRouter } from './api/orders.js';
import { createMerchantRouter } from './api/merchant.js';
import { quoteDeliveryOptions } from './domain/pricing.js';
import { DispatchOrchestrator } from './domain/dispatch-orchestrator.js';
import { mapProviderStatus, isStatusRegression, isValidTransition } from './domain/order-lifecycle.js';
import { deliveryStatusWebhookSchema } from './shopify/schemas.js';
import { InMemoryAuditLogRepository, InMemoryDeliveryJobRepository, InMemoryDispatchAttemptRepository, InMemoryIdempotencyRepository, InMemoryMerchantConfigRepository, InMemoryOAuthStateRepository, InMemoryShopInstallationRepository, InMemoryWebhookEventRepository } from './infrastructure/persistence/in-memory-repositories.js';
import { FakeStorreeClient } from './infrastructure/storree/storree-client.js';
import { carrierRateRequestSchema, shopifyOrderWebhookSchema } from './shopify/schemas.js';
import { requestContext } from './middleware/request-context.js';
import { ConsoleLogger } from './observability/logger.js';
import { InlineDispatchQueue, RedisDispatchQueue } from './infrastructure/queue/dispatch-queue.js';
import { verifyShopifyWebhookHmac } from './shopify/hmac.js';
import { ShopifyAuthService } from './shopify/auth.js';
import { CarrierServiceManager } from './shopify/carrier-service-manager.js';
import { TokenVault } from './shopify/token-vault.js';
import { ShopifyLocationService } from './shopify/location-service.js';
import { MetricsRegistry } from './observability/metrics.js';
export function createDefaultInMemoryDeps() {
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
export function createApp(config) {
    const deps = config?.deps ?? createDefaultInMemoryDeps();
    const storreeClient = config?.storreeClient ?? new FakeStorreeClient();
    const carrierServiceManager = new CarrierServiceManager();
    const locationService = new ShopifyLocationService();
    const tokenVault = new TokenVault(config?.encryptionKeyHex ?? 'a'.repeat(64));
    const orchestrator = new DispatchOrchestrator(deps.merchantConfigs, deps.jobs, deps.idempotency, storreeClient, deps.dispatchAttempts, deps.auditLogs, deps.metrics);
    const processWebhookPayload = async (payload, retryCount = 0) => {
        const { shopDomain, webhookId, body, correlationId } = payload;
        const order = shopifyOrderWebhookSchema.parse(body);
        await orchestrator.ingestPaidShopifyOrder({
            id: order.id,
            orderNumber: order.name,
            shopDomain,
            shippingMethodCode: order.shipping_lines[0]?.code ?? '',
            customerAddress: {
                lat: order.shipping_address.latitude,
                lng: order.shipping_address.longitude
            },
            lineItems: order.line_items.map((item) => ({ sku: item.sku, quantity: item.quantity, name: item.name }))
        }, webhookId, { retryCount, correlationId });
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
    app.use(express.json({
        verify: (req, _res, buf) => {
            req.rawBody = Buffer.from(buf);
        }
    }));
    app.use(requestContext);
    app.get('/health', (_req, res) => res.json({ ok: true }));
    // ── Style.re Customer-Facing API ──────────────────────────────────────────
    // Note: Stripe webhook needs rawBody, must be before JSON parser for /api/payments/stripe-webhook
    app.use('/api', createOrdersRouter());
    app.use('/api', createPaymentsRouter());
    app.use('/api', createStoresRouter());
    // ── Merchant Platform API ─────────────────────────────────────────────────
    app.use('/api', createMerchantRouter());
    // ─────────────────────────────────────────────────────────────────────────
    app.get('/health/ready', async (_req, res) => {
        const dbOk = config?.readiness?.db ? await config.readiness.db() : true;
        const redisOk = config?.readiness?.redis ? await config.readiness.redis() : true;
        // Dispatch connectivity is best-effort — not a hard dependency for readiness
        const storreeOk = await storreeClient.checkConnectivity().catch(() => false);
        // Only DB and Redis are hard dependencies for readiness
        if (!dbOk || !redisOk) {
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
    /**
     * Checkout integration info endpoint
     * Returns which checkout mechanism is available based on plan
     */
    app.get('/shopify/checkout-capability', async (req, res) => {
        const shopDomain = req.query.shop;
        if (!shopDomain)
            return res.status(400).json({ error: 'shop required' });
        const installation = await deps.shops.getByShopDomain(shopDomain);
        if (!installation) {
            return res.json({
                mechanism: 'direct_link',
                carrierServiceAvailable: false,
                reason: 'App not installed',
                instructions: 'Install the app first via /shopify/install?shop=<domain>',
                directFlowUrl: `${config?.appUrl ?? 'https://api-production-653e.up.railway.app'}/shopify/order-flow?shop=${shopDomain}`,
            });
        }
        const token = tokenVault.decrypt(installation.encryptedAccessToken);
        const prereq = await carrierServiceManager.checkPrerequisites(shopDomain, token);
        const carrierServiceAvailable = prereq.partnerDevelopment === true || prereq.shopifyPlus === true;
        return res.json({
            mechanism: carrierServiceAvailable ? 'carrier_service' : 'direct_link',
            carrierServiceAvailable,
            plan: prereq.planName,
            shopifyPlus: prereq.shopifyPlus,
            partnerDevelopment: prereq.partnerDevelopment,
            reason: carrierServiceAvailable
                ? 'Store is eligible for carrier service injection into checkout'
                : 'Store plan does not support carrier service. Use direct link flow instead.',
            directFlowUrl: `https://stylere.app/shopify?shop=${shopDomain}`,
            carrierServiceCallbackUrl: `${config?.appUrl ?? 'https://api-production-653e.up.railway.app'}/shopify/carrier-service/rates`,
            note: 'Carrier services require Shopify Advanced or Plus plan, or Partner Development stores.',
        });
    });
    app.get('/shopify/install', async (req, res) => {
        const query = req.query;
        if (!authService.verifyInstallQuery(query) || !query.shop) {
            return res.status(401).json({ error: 'Invalid install request' });
        }
        const install = await authService.beginInstall(query.shop);
        return res.redirect(install.redirectUrl);
    });
    // Public install entry point — merchant enters their store name on the landing page
    // No HMAC required (merchant-initiated, not Shopify-initiated)
    app.get('/shopify/begin-install', async (req, res) => {
        const shop = req.query.shop;
        if (!shop || !shop.endsWith('.myshopify.com')) {
            return res.status(400).json({ error: 'Valid shop param required (e.g. your-store.myshopify.com)' });
        }
        const install = await authService.beginInstall(shop);
        return res.redirect(install.redirectUrl);
    });
    // Merchant delivery config — public read endpoint for frontend/integration checks
    app.get('/shopify/merchant-config', async (req, res) => {
        const shopDomain = req.query.shop;
        if (!shopDomain)
            return res.status(400).json({ error: 'shop required' });
        const merchantConfig = await deps.merchantConfigs.getByShopDomain(shopDomain);
        if (!merchantConfig) {
            return res.status(404).json({ error: 'Merchant config not found', shop: shopDomain });
        }
        return res.json(merchantConfig);
    });
    // Merchant dashboard redirect — when Shopify loads the app, redirect to frontend
    app.get('/shopify/dashboard', async (req, res) => {
        const shop = req.query.shop;
        const frontendUrl = 'https://stylere-shopify-delivery-7fkzbujzs-styleres-projects.vercel.app/merchant';
        return res.redirect(shop ? `${frontendUrl}?shop=${shop}` : frontendUrl);
    });
    // Dev install bypass — disabled in production
    if (process.env.NODE_ENV !== 'production') {
        app.get('/shopify/dev-install', async (req, res) => {
            const shop = req.query.shop;
            const token = req.query.token;
            const devSecret = config?.shopifyApiSecret ?? 'dev-secret';
            if (!shop)
                return res.status(400).json({ error: 'shop param required' });
            if (token !== devSecret)
                return res.status(401).json({ error: 'Unauthorized' });
            const install = await authService.beginInstall(shop);
            return res.redirect(install.redirectUrl);
        });
    }
    app.get('/shopify/auth/callback', async (req, res) => {
        try {
            await authService.completeCallback(req.query, req.header('x-request-id') ?? undefined);
            return res.status(200).send('Storree app installed successfully. ✅');
        }
        catch (error) {
            const msg = String(error);
            deps.logger.error('OAuth callback failed', { error: msg, query: JSON.stringify(req.query), correlationId: req.header('x-request-id') });
            return res.status(401).json({ error: 'OAuth failed', reason: msg });
        }
    });
    app.get('/shopify/onboarding/status', async (req, res) => {
        const shopDomain = req.query.shop;
        if (!shopDomain)
            return res.status(400).json({ error: 'shop required' });
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
        let locations = [];
        let prerequisiteStatus = { eligibilityUnknown: true, note: 'Not checked' };
        let shopifyApiOk = true;
        try {
            locations = await locationService.listLocations(shopDomain, token);
        }
        catch (err) {
            deps.logger.warn('onboarding/status: listLocations failed (token may be expired)', { shopDomain, error: String(err) });
            shopifyApiOk = false;
        }
        try {
            prerequisiteStatus = await carrierServiceManager.checkPrerequisites(shopDomain, token);
        }
        catch (err) {
            deps.logger.warn('onboarding/status: checkPrerequisites failed', { shopDomain, error: String(err) });
        }
        const storreeConnectivity = await storreeClient.checkConnectivity();
        const reasons = [];
        if (!shopifyApiOk)
            reasons.push('Shopify API unreachable — access token may be expired. Re-install may be required.');
        if (!installation.carrierServiceId)
            reasons.push('Carrier service is not registered.');
        if (!merchantConfig)
            reasons.push('Merchant delivery configuration is missing.');
        if (merchantConfig && !merchantConfig.pickupLocation)
            reasons.push('Pickup location is not configured.');
        if (!storreeConnectivity)
            reasons.push('Storree connectivity check failed.');
        return res.json({
            appInstalled: true,
            tokenPresent: true,
            oauthValid: shopifyApiOk,
            shopifyApiReachable: shopifyApiOk,
            carrierServiceRegistered: !!installation.carrierServiceId,
            complianceConfigExpected: true,
            pickupLocationConfigured: !!merchantConfig?.pickupLocation,
            merchantConfigComplete: !!merchantConfig,
            dispatchConnectivityOk: storreeConnectivity,
            locations,
            carrierServicePrerequisites: prerequisiteStatus,
            merchantActionRequired: 'Confirm Storree carrier service visibility in active shipping profiles; Shopify may require profile-specific configuration.',
            reasons
        });
    });
    app.post('/shopify/webhooks/compliance', async (req, res) => {
        const topic = req.header('x-shopify-topic') ?? 'unknown';
        const shopDomain = req.header('x-shopify-shop-domain') ?? 'unknown';
        const webhookId = req.header('x-shopify-webhook-id') ?? randomUUID();
        const webhookHmac = req.header('x-shopify-hmac-sha256');
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
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
    // App uninstalled webhook — cleans up shop data
    app.post('/shopify/webhooks/app/uninstalled', async (req, res) => {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        const webhookHmac = req.header('x-shopify-hmac-sha256');
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
        if (!verifyShopifyWebhookHmac(rawBody, webhookHmac, config?.shopifyApiSecret ?? 'dev-secret')) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
        }
        if (!shopDomain)
            return res.status(400).json({ error: 'Missing shop domain' });
        try {
            await deps.shops.deleteByShopDomain(shopDomain);
            // Note: merchant_configs left in place — no delete method; shop tokens are removed above
            await deps.auditLogs.create({
                id: randomUUID(),
                actor: 'shopify',
                action: 'app_uninstalled',
                entityType: 'shop',
                entityId: shopDomain,
                occurredAt: new Date(),
                correlationId: req.header('x-shopify-webhook-id') ?? randomUUID(),
                metadata: { uninstalled_at: new Date().toISOString() }
            });
            deps.logger.info('App uninstalled — shop data removed', { shopDomain });
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            deps.logger.error('Uninstall webhook error', { error: String(err), shopDomain });
            return res.status(500).json({ error: 'Failed to process uninstall' });
        }
    });
    app.post('/merchant/config', async (req, res) => {
        const configBody = req.body;
        await deps.merchantConfigs.upsert(configBody);
        res.status(204).end();
    });
    app.post('/shopify/carrier-service/rates', async (req, res) => {
        deps.metrics.increment('carrier.quote_requests');
        const parsed = carrierRateRequestSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const storreeHealthy = await storreeClient.checkConnectivity();
        if (!storreeHealthy) {
            deps.metrics.increment('dispatch.connectivity_unhealthy');
            return res.json({ rates: [] });
        }
        const cfg = await deps.merchantConfigs.getByShopDomain(parsed.data.shop.domain);
        if (!cfg || !cfg.isActive)
            return res.json({ rates: [] });
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
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
        if (!verifyShopifyWebhookHmac(rawBody, webhookHmac, config?.shopifyApiSecret ?? 'dev-secret')) {
            deps.metrics.increment('webhook.invalid_signature');
            return res.status(401).json({ error: 'Invalid webhook signature' });
        }
        const storreeHealthy = await storreeClient.checkConnectivity();
        if (!storreeHealthy) {
            deps.metrics.increment('dispatch.connectivity_unhealthy');
            return res.status(503).json({ error: 'Storree unavailable' });
        }
        const event = {
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
        }
        catch (error) {
            event.status = 'failed';
            event.errorMessage = String(error);
            await deps.webhookEvents.update(event);
            deps.metrics.increment('webhook.enqueue_failure');
            return res.status(500).json({ error: 'Queue enqueue failed' });
        }
    });
    /**
     * Storree delivery status webhook
     * Called by Storree/dispatch provider when delivery status changes.
     * Updates the DeliveryJob status using the order lifecycle state machine.
     */
    app.post('/storree/webhooks/delivery-status', async (req, res) => {
        const webhookId = req.header('x-webhook-id') ?? randomUUID();
        const correlationId = req.header('x-request-id') ?? webhookId;
        const parsed = deliveryStatusWebhookSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid delivery status payload', details: parsed.error.flatten() });
        }
        const { dispatchId, externalReference, status: rawStatus } = parsed.data;
        const mappedStatus = mapProviderStatus(rawStatus);
        if (!mappedStatus) {
            deps.logger.warn('Unknown provider delivery status — ignoring', { rawStatus, dispatchId });
            return res.status(422).json({ error: `Unknown delivery status: ${rawStatus}` });
        }
        // Find the job by dispatchId (preferred) or shopify order id
        let job = await deps.jobs.getByDispatchId(dispatchId);
        if (!job) {
            job = await deps.jobs.getByShopifyOrderId(externalReference);
        }
        if (!job) {
            deps.logger.warn('Delivery status webhook: job not found', { dispatchId, externalReference });
            return res.status(404).json({ error: 'Delivery job not found' });
        }
        const currentStatus = job.status;
        // State machine guard — reject regressions (out-of-order webhook)
        if (isStatusRegression(currentStatus, mappedStatus)) {
            deps.logger.warn('Delivery status webhook: status regression rejected', {
                jobId: job.id,
                currentStatus,
                mappedStatus
            });
            return res.status(200).json({ ok: true, skipped: true, reason: 'status_regression' });
        }
        if (!isValidTransition(currentStatus, mappedStatus)) {
            deps.logger.warn('Delivery status webhook: invalid transition', {
                jobId: job.id,
                currentStatus,
                mappedStatus
            });
            return res.status(200).json({ ok: true, skipped: true, reason: 'invalid_transition' });
        }
        job.status = mappedStatus;
        job.updatedAt = new Date();
        await deps.jobs.update(job);
        deps.metrics.increment(`delivery_status.${mappedStatus}`);
        await deps.auditLogs.create({
            id: randomUUID(),
            actor: 'storree',
            action: `delivery_status_${mappedStatus}`,
            entityType: 'delivery_job',
            entityId: job.id,
            occurredAt: new Date(),
            correlationId,
            metadata: { dispatchId, externalReference, rawStatus, mappedStatus }
        });
        deps.logger.info('Delivery status updated', { jobId: job.id, from: currentStatus, to: mappedStatus });
        return res.status(200).json({ ok: true, jobId: job.id, status: mappedStatus });
    });
    return app;
}
export const app = createApp();
