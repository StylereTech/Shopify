import {
  AuditLogRecord,
  DeliveryJob,
  DispatchAttempt,
  MerchantDeliveryConfig,
  OAuthState,
  ShopInstallation,
  WebhookEvent
} from '../../domain/types.js';

export interface MerchantConfigRepository {
  upsert(config: MerchantDeliveryConfig): Promise<void>;
  getByShopDomain(shopDomain: string): Promise<MerchantDeliveryConfig | undefined>;
}

export interface DeliveryJobRepository {
  create(job: DeliveryJob): Promise<void>;
  update(job: DeliveryJob): Promise<void>;
  getByShopifyOrderId(shopifyOrderId: string): Promise<DeliveryJob | undefined>;
  getByDispatchId(dispatchId: string): Promise<DeliveryJob | undefined>;
}

export interface IdempotencyRepository {
  seen(key: string): Promise<boolean>;
  mark(key: string): Promise<void>;
}

export interface ShopInstallationRepository {
  upsert(installation: ShopInstallation): Promise<void>;
  getByShopDomain(shopDomain: string): Promise<ShopInstallation | undefined>;
  deleteByShopDomain(shopDomain: string): Promise<void>;
}

export interface OAuthStateRepository {
  create(state: OAuthState): Promise<void>;
  get(state: string): Promise<OAuthState | undefined>;
  consume(state: string, consumedAt: Date): Promise<void>;
}

export interface WebhookEventRepository {
  create(event: WebhookEvent): Promise<void>;
  update(event: WebhookEvent): Promise<void>;
  getById(id: string): Promise<WebhookEvent | undefined>;
}

export interface DispatchAttemptRepository {
  create(attempt: DispatchAttempt): Promise<void>;
}

export interface AuditLogRepository {
  create(record: AuditLogRecord): Promise<void>;
}
