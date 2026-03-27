import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

interface Store {
  merchantConfigs: MerchantDeliveryConfig[];
  jobs: DeliveryJob[];
  idempotencyKeys: string[];
  shops: ShopInstallation[];
  oauthStates: OAuthState[];
  webhookEvents: WebhookEvent[];
  dispatchAttempts: DispatchAttempt[];
  auditLogs: AuditLogRecord[];
}

const EMPTY: Store = {
  merchantConfigs: [], jobs: [], idempotencyKeys: [], shops: [], oauthStates: [], webhookEvents: [], dispatchAttempts: [], auditLogs: []
};

export class JsonFileStore {
  constructor(private readonly filePath: string) {}
  async read(): Promise<Store> {
    try { return JSON.parse(await readFile(this.filePath, 'utf8')) as Store; } catch { return structuredClone(EMPTY); }
  }
  async write(data: Store): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

export class FileMerchantConfigRepository implements MerchantConfigRepository {
  constructor(private readonly store: JsonFileStore) {}
  async upsert(config: MerchantDeliveryConfig): Promise<void> { const data = await this.store.read(); data.merchantConfigs = data.merchantConfigs.filter((c) => c.shopDomain !== config.shopDomain).concat(config); await this.store.write(data); }
  async getByShopDomain(shopDomain: string): Promise<MerchantDeliveryConfig | undefined> { const data = await this.store.read(); return data.merchantConfigs.find((c) => c.shopDomain === shopDomain); }
}

export class FileDeliveryJobRepository implements DeliveryJobRepository {
  constructor(private readonly store: JsonFileStore) {}
  async create(job: DeliveryJob): Promise<void> { const data = await this.store.read(); data.jobs.push(job); await this.store.write(data); }
  async update(job: DeliveryJob): Promise<void> { const data = await this.store.read(); data.jobs = data.jobs.filter((j) => j.shopifyOrderId !== job.shopifyOrderId).concat(job); await this.store.write(data); }
  async getByShopifyOrderId(shopifyOrderId: string): Promise<DeliveryJob | undefined> { const data = await this.store.read(); return data.jobs.find((j) => j.shopifyOrderId === shopifyOrderId); }
  async getByDispatchId(dispatchId: string): Promise<DeliveryJob | undefined> { const data = await this.store.read(); return data.jobs.find((j) => j.dispatchId === dispatchId); }
}

export class FileIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly store: JsonFileStore) {}
  async seen(key: string): Promise<boolean> { const data = await this.store.read(); return data.idempotencyKeys.includes(key); }
  async mark(key: string): Promise<void> { const data = await this.store.read(); if (!data.idempotencyKeys.includes(key)) data.idempotencyKeys.push(key); await this.store.write(data); }
}

export class FileShopInstallationRepository implements ShopInstallationRepository {
  constructor(private readonly store: JsonFileStore) {}
  async upsert(installation: ShopInstallation): Promise<void> { const data = await this.store.read(); data.shops = data.shops.filter((s) => s.shopDomain !== installation.shopDomain).concat(installation); await this.store.write(data); }
  async getByShopDomain(shopDomain: string): Promise<ShopInstallation | undefined> { const data = await this.store.read(); return data.shops.find((s) => s.shopDomain === shopDomain); }
  async deleteByShopDomain(shopDomain: string): Promise<void> { const data = await this.store.read(); data.shops = data.shops.filter((s) => s.shopDomain !== shopDomain); await this.store.write(data); }
}

export class FileOAuthStateRepository implements OAuthStateRepository {
  constructor(private readonly store: JsonFileStore) {}
  async create(state: OAuthState): Promise<void> { const data = await this.store.read(); data.oauthStates.push(state); await this.store.write(data); }
  async get(state: string): Promise<OAuthState | undefined> { const data = await this.store.read(); return data.oauthStates.find((s) => s.state === state); }
  async consume(state: string, consumedAt: Date): Promise<void> { const data = await this.store.read(); data.oauthStates = data.oauthStates.map((s) => s.state === state ? { ...s, consumedAt } : s); await this.store.write(data); }
}

export class FileWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly store: JsonFileStore) {}
  async create(event: WebhookEvent): Promise<void> { const data = await this.store.read(); data.webhookEvents.push(event); await this.store.write(data); }
  async update(event: WebhookEvent): Promise<void> { const data = await this.store.read(); data.webhookEvents = data.webhookEvents.filter((e) => e.id !== event.id).concat(event); await this.store.write(data); }
  async getById(id: string): Promise<WebhookEvent | undefined> { const data = await this.store.read(); return data.webhookEvents.find((e) => e.id === id); }
}

export class FileDispatchAttemptRepository implements DispatchAttemptRepository {
  constructor(private readonly store: JsonFileStore) {}
  async create(attempt: DispatchAttempt): Promise<void> { const data = await this.store.read(); data.dispatchAttempts.push(attempt); await this.store.write(data); }
}

export class FileAuditLogRepository implements AuditLogRepository {
  constructor(private readonly store: JsonFileStore) {}
  async create(record: AuditLogRecord): Promise<void> { const data = await this.store.read(); data.auditLogs.push(record); await this.store.write(data); }
}
