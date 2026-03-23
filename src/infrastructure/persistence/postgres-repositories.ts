import { Pool } from 'pg';
import {
  AuditLogRecord,
  DeliveryJob,
  DispatchAttempt,
  MerchantDeliveryConfig,
  OAuthState,
  ShopInstallation,
  WebhookEvent
} from '../../domain/types.js';

// ─── Storree Direct-Link Order Types ────────────────────────────────────────

export interface StorreeOrder {
  id: string;
  serviceType: string;
  status: string;
  pickupAddress: Record<string, unknown>;
  dropoffAddress: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  contact: Record<string, unknown>;
  notes?: string;
  pricing: Record<string, unknown>;
  paymentIntentId?: string;
  stripePaymentIntentId?: string;
  paymentStatus: string;
  doordashDeliveryId?: string;
  doordashExternalId?: string;
  doordashTrackingUrl?: string;
  dispatchId?: string;
  merchantNotified: boolean;
  shopDomain?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorreeOrderRepository {
  create(order: StorreeOrder): Promise<void>;
  update(order: StorreeOrder): Promise<void>;
  getById(id: string): Promise<StorreeOrder | undefined>;
  getByPaymentIntentId(piId: string): Promise<StorreeOrder | undefined>;
  listActive(): Promise<StorreeOrder[]>;
}

// ─── In-Memory Fallback (for tests) ─────────────────────────────────────────

export class InMemoryStorreeOrderRepository implements StorreeOrderRepository {
  private readonly store = new Map<string, StorreeOrder>();

  async create(order: StorreeOrder): Promise<void> {
    this.store.set(order.id, { ...order });
  }
  async update(order: StorreeOrder): Promise<void> {
    this.store.set(order.id, { ...order });
  }
  async getById(id: string): Promise<StorreeOrder | undefined> {
    return this.store.get(id);
  }
  async getByPaymentIntentId(piId: string): Promise<StorreeOrder | undefined> {
    for (const o of this.store.values()) {
      if (o.stripePaymentIntentId === piId || o.paymentIntentId === piId) return o;
    }
    return undefined;
  }
  async listActive(): Promise<StorreeOrder[]> {
    const activeStatuses = ['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit'];
    return Array.from(this.store.values())
      .filter((o) => activeStatuses.includes(o.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

// ─── Postgres Implementation ─────────────────────────────────────────────────

export class PostgresStorreeOrderRepository implements StorreeOrderRepository {
  constructor(private readonly pool: Pool) {}

  private rowToOrder(row: Record<string, unknown>): StorreeOrder {
    return {
      id: row.id as string,
      serviceType: row.service_type as string,
      status: row.status as string,
      pickupAddress: typeof row.pickup_address === 'string' ? JSON.parse(row.pickup_address) : row.pickup_address as Record<string, unknown>,
      dropoffAddress: typeof row.dropoff_address === 'string' ? JSON.parse(row.dropoff_address) : row.dropoff_address as Record<string, unknown>,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items as Array<Record<string, unknown>>,
      contact: typeof row.contact === 'string' ? JSON.parse(row.contact) : row.contact as Record<string, unknown>,
      notes: (row.notes as string | null) ?? undefined,
      pricing: typeof row.pricing === 'string' ? JSON.parse(row.pricing) : row.pricing as Record<string, unknown>,
      paymentIntentId: (row.payment_intent_id as string | null) ?? undefined,
      stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? undefined,
      paymentStatus: row.payment_status as string,
      doordashDeliveryId: (row.doordash_delivery_id as string | null) ?? undefined,
      doordashExternalId: (row.doordash_external_id as string | null) ?? undefined,
      doordashTrackingUrl: (row.doordash_tracking_url as string | null) ?? undefined,
      dispatchId: (row.dispatch_id as string | null) ?? undefined,
      merchantNotified: row.merchant_notified as boolean,
      shopDomain: (row.shop_domain as string | null) ?? undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  async create(order: StorreeOrder): Promise<void> {
    await this.pool.query(
      `INSERT INTO storree_orders
        (id, service_type, status, pickup_address, dropoff_address, items, contact, notes,
         pricing, payment_intent_id, stripe_payment_intent_id, payment_status,
         doordash_delivery_id, doordash_external_id, doordash_tracking_url, dispatch_id,
         merchant_notified, shop_domain, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        order.id, order.serviceType, order.status,
        JSON.stringify(order.pickupAddress), JSON.stringify(order.dropoffAddress),
        JSON.stringify(order.items), JSON.stringify(order.contact),
        order.notes ?? null, JSON.stringify(order.pricing),
        order.paymentIntentId ?? null, order.stripePaymentIntentId ?? null,
        order.paymentStatus,
        order.doordashDeliveryId ?? null, order.doordashExternalId ?? null,
        order.doordashTrackingUrl ?? null, order.dispatchId ?? null,
        order.merchantNotified, order.shopDomain ?? null,
        order.createdAt, order.updatedAt,
      ]
    );
  }

  async update(order: StorreeOrder): Promise<void> {
    await this.pool.query(
      `UPDATE storree_orders SET
        service_type=$2, status=$3, pickup_address=$4, dropoff_address=$5,
        items=$6, contact=$7, notes=$8, pricing=$9,
        payment_intent_id=$10, stripe_payment_intent_id=$11, payment_status=$12,
        doordash_delivery_id=$13, doordash_external_id=$14, doordash_tracking_url=$15,
        dispatch_id=$16, merchant_notified=$17, shop_domain=$18, updated_at=$19
       WHERE id=$1`,
      [
        order.id, order.serviceType, order.status,
        JSON.stringify(order.pickupAddress), JSON.stringify(order.dropoffAddress),
        JSON.stringify(order.items), JSON.stringify(order.contact),
        order.notes ?? null, JSON.stringify(order.pricing),
        order.paymentIntentId ?? null, order.stripePaymentIntentId ?? null,
        order.paymentStatus,
        order.doordashDeliveryId ?? null, order.doordashExternalId ?? null,
        order.doordashTrackingUrl ?? null, order.dispatchId ?? null,
        order.merchantNotified, order.shopDomain ?? null,
        order.updatedAt,
      ]
    );
  }

  async getById(id: string): Promise<StorreeOrder | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM storree_orders WHERE id=$1', [id]);
    if (!rows[0]) return undefined;
    return this.rowToOrder(rows[0]);
  }

  async getByPaymentIntentId(piId: string): Promise<StorreeOrder | undefined> {
    const { rows } = await this.pool.query(
      'SELECT * FROM storree_orders WHERE stripe_payment_intent_id=$1 OR payment_intent_id=$1 LIMIT 1',
      [piId]
    );
    if (!rows[0]) return undefined;
    return this.rowToOrder(rows[0]);
  }

  async listActive(): Promise<StorreeOrder[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM storree_orders
       WHERE status IN ('pending','confirmed','assigned','picked_up','in_transit')
       ORDER BY created_at DESC`
    );
    return rows.map((r) => this.rowToOrder(r));
  }
}
import {
  AuditLogRepository,
  DeliveryJobRepository,
  DispatchAttemptRepository,
  IdempotencyRepository,
  MerchantConfigRepository,
  OAuthStateRepository,
  ShopInstallationRepository,
  WebhookEventRepository
} from './repositories.js';

export class PostgresMerchantConfigRepository implements MerchantConfigRepository {
  constructor(private readonly pool: Pool) {}
  async upsert(config: MerchantDeliveryConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO merchant_configs (merchant_id, shop_domain, storree_merchant_id, pickup_lat, pickup_lng, shopify_location_id, radius_km, one_hour_enabled, same_day_enabled, one_hour_cutoff_hour_local, same_day_cutoff_hour_local, base_fee_cents, price_per_km_cents, platform_markup_percent, timezone, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (shop_domain) DO UPDATE SET merchant_id=EXCLUDED.merchant_id, storree_merchant_id=EXCLUDED.storree_merchant_id, pickup_lat=EXCLUDED.pickup_lat, pickup_lng=EXCLUDED.pickup_lng, shopify_location_id=EXCLUDED.shopify_location_id, radius_km=EXCLUDED.radius_km, one_hour_enabled=EXCLUDED.one_hour_enabled, same_day_enabled=EXCLUDED.same_day_enabled, one_hour_cutoff_hour_local=EXCLUDED.one_hour_cutoff_hour_local, same_day_cutoff_hour_local=EXCLUDED.same_day_cutoff_hour_local, base_fee_cents=EXCLUDED.base_fee_cents, price_per_km_cents=EXCLUDED.price_per_km_cents, platform_markup_percent=EXCLUDED.platform_markup_percent, timezone=EXCLUDED.timezone, is_active=EXCLUDED.is_active`,
      [config.merchantId, config.shopDomain, config.storreeMerchantId, config.pickupLocation.lat, config.pickupLocation.lng, config.shopifyLocationId ?? null, config.radiusKm, config.oneHourEnabled, config.sameDayEnabled, config.oneHourCutoffHourLocal, config.sameDayCutoffHourLocal, config.baseFeeCents, config.pricePerKmCents, config.platformMarkupPercent, config.timezone, config.isActive]
    );
  }
  async getByShopDomain(shopDomain: string): Promise<MerchantDeliveryConfig | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM merchant_configs WHERE shop_domain = $1', [shopDomain]);
    const row = rows[0];
    if (!row) return undefined;
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

export class PostgresDeliveryJobRepository implements DeliveryJobRepository {
  constructor(private readonly pool: Pool) {}
  async create(job: DeliveryJob): Promise<void> {
    await this.pool.query('INSERT INTO delivery_jobs (id, shopify_order_id, merchant_id, service_level, status, dispatch_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [job.id, job.shopifyOrderId, job.merchantId, job.serviceLevel, job.status, job.dispatchId ?? null, job.createdAt, job.updatedAt]);
  }
  async update(job: DeliveryJob): Promise<void> {
    await this.pool.query(
      'UPDATE delivery_jobs SET status=$1, dispatch_id=$2, updated_at=$3, customer_phone=$4, shop_domain=$5, shopify_order_number=$6 WHERE shopify_order_id=$7',
      [job.status, job.dispatchId ?? null, job.updatedAt, job.customerPhone ?? null, job.shopDomain ?? null, job.shopifyOrderNumber ?? null, job.shopifyOrderId]
    );
  }
  async getByShopifyOrderId(shopifyOrderId: string): Promise<DeliveryJob | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM delivery_jobs WHERE shopify_order_id=$1', [shopifyOrderId]);
    const row = rows[0];
    if (!row) return undefined;
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
  async getByDispatchId(dispatchId: string): Promise<DeliveryJob | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM delivery_jobs WHERE dispatch_id=$1', [dispatchId]);
    const row = rows[0];
    if (!row) return undefined;
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

export class PostgresIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly pool: Pool) {}
  async seen(key: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM idempotency_keys WHERE key=$1', [key]);
    return (rowCount ?? 0) > 0;
  }
  async mark(key: string): Promise<void> {
    await this.pool.query('INSERT INTO idempotency_keys (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
  }
}

export class PostgresShopInstallationRepository implements ShopInstallationRepository {
  constructor(private readonly pool: Pool) {}
  async upsert(installation: ShopInstallation): Promise<void> {
    await this.pool.query(
      `INSERT INTO shops (shop_domain, access_token_ciphertext, access_token_iv, access_token_tag, scopes, installed_at, carrier_service_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (shop_domain) DO UPDATE SET access_token_ciphertext=EXCLUDED.access_token_ciphertext, access_token_iv=EXCLUDED.access_token_iv, access_token_tag=EXCLUDED.access_token_tag, scopes=EXCLUDED.scopes, installed_at=EXCLUDED.installed_at, carrier_service_id=EXCLUDED.carrier_service_id`,
      [installation.shopDomain, installation.encryptedAccessToken.ciphertext, installation.encryptedAccessToken.iv, installation.encryptedAccessToken.tag, installation.scopes.join(','), installation.installedAt, installation.carrierServiceId ?? null]
    );
  }
  async getByShopDomain(shopDomain: string): Promise<ShopInstallation | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM shops WHERE shop_domain=$1', [shopDomain]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      shopDomain: row.shop_domain,
      encryptedAccessToken: { ciphertext: row.access_token_ciphertext, iv: row.access_token_iv, tag: row.access_token_tag },
      scopes: String(row.scopes).split(','),
      installedAt: new Date(row.installed_at),
      carrierServiceId: row.carrier_service_id ?? undefined
    };
  }
}

export class PostgresOAuthStateRepository implements OAuthStateRepository {
  constructor(private readonly pool: Pool) {}
  async create(state: OAuthState): Promise<void> {
    await this.pool.query('INSERT INTO oauth_states (state, shop_domain, created_at, expires_at, consumed_at) VALUES ($1,$2,$3,$4,$5)', [state.state, state.shopDomain, state.createdAt, state.expiresAt, state.consumedAt ?? null]);
  }
  async get(state: string): Promise<OAuthState | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM oauth_states WHERE state=$1', [state]);
    const row = rows[0];
    if (!row) return undefined;
    return { state: row.state, shopDomain: row.shop_domain, createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at), consumedAt: row.consumed_at ? new Date(row.consumed_at) : undefined };
  }
  async consume(state: string, consumedAt: Date): Promise<void> {
    await this.pool.query('UPDATE oauth_states SET consumed_at=$1 WHERE state=$2', [consumedAt, state]);
  }
}

export class PostgresWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly pool: Pool) {}
  async create(event: WebhookEvent): Promise<void> {
    await this.pool.query('INSERT INTO webhook_events (id, topic, shop_domain, received_at, status, payload_json, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.id, event.topic, event.shopDomain, event.receivedAt, event.status, JSON.stringify(event.payload), event.errorMessage ?? null]);
  }
  async update(event: WebhookEvent): Promise<void> {
    await this.pool.query('UPDATE webhook_events SET status=$1, error_message=$2 WHERE id=$3', [event.status, event.errorMessage ?? null, event.id]);
  }
  async getById(id: string): Promise<WebhookEvent | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM webhook_events WHERE id=$1', [id]);
    const row = rows[0];
    if (!row) return undefined;
    return { id: row.id, topic: row.topic, shopDomain: row.shop_domain, receivedAt: new Date(row.received_at), status: row.status, payload: JSON.parse(row.payload_json), errorMessage: row.error_message ?? undefined };
  }
}

export class PostgresDispatchAttemptRepository implements DispatchAttemptRepository {
  constructor(private readonly pool: Pool) {}
  async create(attempt: DispatchAttempt): Promise<void> {
    await this.pool.query('INSERT INTO dispatch_attempts (id, job_id, attempted_at, success, retry_count, error_class, provider_status_code, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [attempt.id, attempt.jobId, attempt.attemptedAt, attempt.success, attempt.retryCount, attempt.errorClass ?? null, attempt.providerStatusCode ?? null, attempt.errorMessage ?? null]);
  }
}

export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private readonly pool: Pool) {}
  async create(record: AuditLogRecord): Promise<void> {
    await this.pool.query('INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, occurred_at, correlation_id, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [record.id, record.actor, record.action, record.entityType, record.entityId, record.occurredAt, record.correlationId ?? null, JSON.stringify(record.metadata ?? {})]);
  }
}
