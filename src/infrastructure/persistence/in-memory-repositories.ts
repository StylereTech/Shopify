import {
  AuditLogRecord,
  DeliveryJob,
  DispatchAttempt,
  MerchantDeliveryConfig,
  OAuthState,
  ShopInstallation,
  WebhookEvent
} from '../../domain/types.js';
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

export class InMemoryMerchantConfigRepository implements MerchantConfigRepository {
  private readonly byShop = new Map<string, MerchantDeliveryConfig>();
  async upsert(config: MerchantDeliveryConfig): Promise<void> { this.byShop.set(config.shopDomain, config); }
  async getByShopDomain(shopDomain: string): Promise<MerchantDeliveryConfig | undefined> { return this.byShop.get(shopDomain); }
}

export class InMemoryDeliveryJobRepository implements DeliveryJobRepository {
  private readonly jobs = new Map<string, DeliveryJob>();
  async create(job: DeliveryJob): Promise<void> { this.jobs.set(job.shopifyOrderId, job); }
  async update(job: DeliveryJob): Promise<void> { this.jobs.set(job.shopifyOrderId, job); }
  async getByShopifyOrderId(shopifyOrderId: string): Promise<DeliveryJob | undefined> { return this.jobs.get(shopifyOrderId); }
}

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly keys = new Set<string>();
  async seen(key: string): Promise<boolean> { return this.keys.has(key); }
  async mark(key: string): Promise<void> { this.keys.add(key); }
}

export class InMemoryShopInstallationRepository implements ShopInstallationRepository {
  private readonly shops = new Map<string, ShopInstallation>();
  async upsert(installation: ShopInstallation): Promise<void> { this.shops.set(installation.shopDomain, installation); }
  async getByShopDomain(shopDomain: string): Promise<ShopInstallation | undefined> { return this.shops.get(shopDomain); }
}

export class InMemoryOAuthStateRepository implements OAuthStateRepository {
  private readonly states = new Map<string, OAuthState>();
  async create(state: OAuthState): Promise<void> { this.states.set(state.state, state); }
  async get(state: string): Promise<OAuthState | undefined> { return this.states.get(state); }
  async consume(state: string, consumedAt: Date): Promise<void> {
    const existing = this.states.get(state);
    if (existing) this.states.set(state, { ...existing, consumedAt });
  }
}

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
  private readonly events = new Map<string, WebhookEvent>();
  async create(event: WebhookEvent): Promise<void> { this.events.set(event.id, event); }
  async update(event: WebhookEvent): Promise<void> { this.events.set(event.id, event); }
  async getById(id: string): Promise<WebhookEvent | undefined> { return this.events.get(id); }
}

export class InMemoryDispatchAttemptRepository implements DispatchAttemptRepository {
  readonly attempts: DispatchAttempt[] = [];
  async create(attempt: DispatchAttempt): Promise<void> { this.attempts.push(attempt); }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  readonly records: AuditLogRecord[] = [];
  async create(record: AuditLogRecord): Promise<void> { this.records.push(record); }
}
