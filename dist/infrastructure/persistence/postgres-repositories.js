export class PostgresMerchantConfigRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async upsert(config) {
        await this.pool.query(`INSERT INTO merchant_configs (merchant_id, shop_domain, storree_merchant_id, pickup_lat, pickup_lng, shopify_location_id, radius_km, one_hour_enabled, same_day_enabled, one_hour_cutoff_hour_local, same_day_cutoff_hour_local, base_fee_cents, price_per_km_cents, platform_markup_percent, timezone, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (shop_domain) DO UPDATE SET merchant_id=EXCLUDED.merchant_id, storree_merchant_id=EXCLUDED.storree_merchant_id, pickup_lat=EXCLUDED.pickup_lat, pickup_lng=EXCLUDED.pickup_lng, shopify_location_id=EXCLUDED.shopify_location_id, radius_km=EXCLUDED.radius_km, one_hour_enabled=EXCLUDED.one_hour_enabled, same_day_enabled=EXCLUDED.same_day_enabled, one_hour_cutoff_hour_local=EXCLUDED.one_hour_cutoff_hour_local, same_day_cutoff_hour_local=EXCLUDED.same_day_cutoff_hour_local, base_fee_cents=EXCLUDED.base_fee_cents, price_per_km_cents=EXCLUDED.price_per_km_cents, platform_markup_percent=EXCLUDED.platform_markup_percent, timezone=EXCLUDED.timezone, is_active=EXCLUDED.is_active`, [config.merchantId, config.shopDomain, config.storreeMerchantId, config.pickupLocation.lat, config.pickupLocation.lng, config.shopifyLocationId ?? null, config.radiusKm, config.oneHourEnabled, config.sameDayEnabled, config.oneHourCutoffHourLocal, config.sameDayCutoffHourLocal, config.baseFeeCents, config.pricePerKmCents, config.platformMarkupPercent, config.timezone, config.isActive]);
    }
    async getByShopDomain(shopDomain) {
        const { rows } = await this.pool.query('SELECT * FROM merchant_configs WHERE shop_domain = $1', [shopDomain]);
        const row = rows[0];
        if (!row)
            return undefined;
        return {
            merchantId: row.merchant_id,
            shopDomain: row.shop_domain,
            storreeMerchantId: row.storree_merchant_id,
            pickupLocation: { lat: Number(row.pickup_lat), lng: Number(row.pickup_lng) },
            shopifyLocationId: row.shopify_location_id ?? undefined,
            radiusKm: Number(row.radius_km),
            oneHourEnabled: row.one_hour_enabled,
            sameDayEnabled: row.same_day_enabled,
            oneHourCutoffHourLocal: row.one_hour_cutoff_hour_local,
            sameDayCutoffHourLocal: row.same_day_cutoff_hour_local,
            baseFeeCents: row.base_fee_cents,
            pricePerKmCents: row.price_per_km_cents,
            platformMarkupPercent: Number(row.platform_markup_percent),
            timezone: row.timezone,
            isActive: row.is_active
        };
    }
}
export class PostgresDeliveryJobRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(job) {
        await this.pool.query('INSERT INTO delivery_jobs (id, shopify_order_id, merchant_id, service_level, status, dispatch_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [job.id, job.shopifyOrderId, job.merchantId, job.serviceLevel, job.status, job.dispatchId ?? null, job.createdAt, job.updatedAt]);
    }
    async update(job) {
        await this.pool.query('UPDATE delivery_jobs SET status=$1, dispatch_id=$2, updated_at=$3, customer_phone=$4, shop_domain=$5, shopify_order_number=$6 WHERE shopify_order_id=$7', [job.status, job.dispatchId ?? null, job.updatedAt, job.customerPhone ?? null, job.shopDomain ?? null, job.shopifyOrderNumber ?? null, job.shopifyOrderId]);
    }
    async getByShopifyOrderId(shopifyOrderId) {
        const { rows } = await this.pool.query('SELECT * FROM delivery_jobs WHERE shopify_order_id=$1', [shopifyOrderId]);
        const row = rows[0];
        if (!row)
            return undefined;
        return {
            id: row.id,
            shopifyOrderId: row.shopify_order_id,
            merchantId: row.merchant_id,
            shopDomain: row.shop_domain ?? undefined,
            serviceLevel: row.service_level,
            status: row.status,
            dispatchId: row.dispatch_id ?? undefined,
            customerPhone: row.customer_phone ?? undefined,
            shopifyOrderNumber: row.shopify_order_number ?? undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }
    async getByDispatchId(dispatchId) {
        const { rows } = await this.pool.query('SELECT * FROM delivery_jobs WHERE dispatch_id=$1', [dispatchId]);
        const row = rows[0];
        if (!row)
            return undefined;
        return {
            id: row.id,
            shopifyOrderId: row.shopify_order_id,
            merchantId: row.merchant_id,
            shopDomain: row.shop_domain ?? undefined,
            serviceLevel: row.service_level,
            status: row.status,
            dispatchId: row.dispatch_id ?? undefined,
            customerPhone: row.customer_phone ?? undefined,
            shopifyOrderNumber: row.shopify_order_number ?? undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }
}
export class PostgresIdempotencyRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async seen(key) {
        const { rowCount } = await this.pool.query('SELECT 1 FROM idempotency_keys WHERE key=$1', [key]);
        return (rowCount ?? 0) > 0;
    }
    async mark(key) {
        await this.pool.query('INSERT INTO idempotency_keys (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
    }
}
export class PostgresShopInstallationRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async upsert(installation) {
        await this.pool.query(`INSERT INTO shops (shop_domain, access_token_ciphertext, access_token_iv, access_token_tag, scopes, installed_at, carrier_service_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (shop_domain) DO UPDATE SET access_token_ciphertext=EXCLUDED.access_token_ciphertext, access_token_iv=EXCLUDED.access_token_iv, access_token_tag=EXCLUDED.access_token_tag, scopes=EXCLUDED.scopes, installed_at=EXCLUDED.installed_at, carrier_service_id=EXCLUDED.carrier_service_id`, [installation.shopDomain, installation.encryptedAccessToken.ciphertext, installation.encryptedAccessToken.iv, installation.encryptedAccessToken.tag, installation.scopes.join(','), installation.installedAt, installation.carrierServiceId ?? null]);
    }
    async getByShopDomain(shopDomain) {
        const { rows } = await this.pool.query('SELECT * FROM shops WHERE shop_domain=$1', [shopDomain]);
        const row = rows[0];
        if (!row)
            return undefined;
        return {
            shopDomain: row.shop_domain,
            encryptedAccessToken: { ciphertext: row.access_token_ciphertext, iv: row.access_token_iv, tag: row.access_token_tag },
            scopes: String(row.scopes).split(','),
            installedAt: new Date(row.installed_at),
            carrierServiceId: row.carrier_service_id ?? undefined
        };
    }
}
export class PostgresOAuthStateRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(state) {
        await this.pool.query('INSERT INTO oauth_states (state, shop_domain, created_at, expires_at, consumed_at) VALUES ($1,$2,$3,$4,$5)', [state.state, state.shopDomain, state.createdAt, state.expiresAt, state.consumedAt ?? null]);
    }
    async get(state) {
        const { rows } = await this.pool.query('SELECT * FROM oauth_states WHERE state=$1', [state]);
        const row = rows[0];
        if (!row)
            return undefined;
        return { state: row.state, shopDomain: row.shop_domain, createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at), consumedAt: row.consumed_at ? new Date(row.consumed_at) : undefined };
    }
    async consume(state, consumedAt) {
        await this.pool.query('UPDATE oauth_states SET consumed_at=$1 WHERE state=$2', [consumedAt, state]);
    }
}
export class PostgresWebhookEventRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(event) {
        await this.pool.query('INSERT INTO webhook_events (id, topic, shop_domain, received_at, status, payload_json, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.id, event.topic, event.shopDomain, event.receivedAt, event.status, JSON.stringify(event.payload), event.errorMessage ?? null]);
    }
    async update(event) {
        await this.pool.query('UPDATE webhook_events SET status=$1, error_message=$2 WHERE id=$3', [event.status, event.errorMessage ?? null, event.id]);
    }
    async getById(id) {
        const { rows } = await this.pool.query('SELECT * FROM webhook_events WHERE id=$1', [id]);
        const row = rows[0];
        if (!row)
            return undefined;
        return { id: row.id, topic: row.topic, shopDomain: row.shop_domain, receivedAt: new Date(row.received_at), status: row.status, payload: JSON.parse(row.payload_json), errorMessage: row.error_message ?? undefined };
    }
}
export class PostgresDispatchAttemptRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(attempt) {
        await this.pool.query('INSERT INTO dispatch_attempts (id, job_id, attempted_at, success, retry_count, error_class, provider_status_code, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [attempt.id, attempt.jobId, attempt.attemptedAt, attempt.success, attempt.retryCount, attempt.errorClass ?? null, attempt.providerStatusCode ?? null, attempt.errorMessage ?? null]);
    }
}
export class PostgresAuditLogRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(record) {
        await this.pool.query('INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, occurred_at, correlation_id, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [record.id, record.actor, record.action, record.entityType, record.entityId, record.occurredAt, record.correlationId ?? null, JSON.stringify(record.metadata ?? {})]);
    }
}
