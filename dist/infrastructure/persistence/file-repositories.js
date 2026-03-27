import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const EMPTY = {
    merchantConfigs: [], jobs: [], idempotencyKeys: [], shops: [], oauthStates: [], webhookEvents: [], dispatchAttempts: [], auditLogs: []
};
export class JsonFileStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async read() {
        try {
            return JSON.parse(await readFile(this.filePath, 'utf8'));
        }
        catch {
            return structuredClone(EMPTY);
        }
    }
    async write(data) {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(data, null, 2));
    }
}
export class FileMerchantConfigRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async upsert(config) { const data = await this.store.read(); data.merchantConfigs = data.merchantConfigs.filter((c) => c.shopDomain !== config.shopDomain).concat(config); await this.store.write(data); }
    async getByShopDomain(shopDomain) { const data = await this.store.read(); return data.merchantConfigs.find((c) => c.shopDomain === shopDomain); }
}
export class FileDeliveryJobRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(job) { const data = await this.store.read(); data.jobs.push(job); await this.store.write(data); }
    async update(job) { const data = await this.store.read(); data.jobs = data.jobs.filter((j) => j.shopifyOrderId !== job.shopifyOrderId).concat(job); await this.store.write(data); }
    async getByShopifyOrderId(shopifyOrderId) { const data = await this.store.read(); return data.jobs.find((j) => j.shopifyOrderId === shopifyOrderId); }
    async getByDispatchId(dispatchId) { const data = await this.store.read(); return data.jobs.find((j) => j.dispatchId === dispatchId); }
}
export class FileIdempotencyRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async seen(key) { const data = await this.store.read(); return data.idempotencyKeys.includes(key); }
    async mark(key) { const data = await this.store.read(); if (!data.idempotencyKeys.includes(key))
        data.idempotencyKeys.push(key); await this.store.write(data); }
}
export class FileShopInstallationRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async upsert(installation) { const data = await this.store.read(); data.shops = data.shops.filter((s) => s.shopDomain !== installation.shopDomain).concat(installation); await this.store.write(data); }
    async getByShopDomain(shopDomain) { const data = await this.store.read(); return data.shops.find((s) => s.shopDomain === shopDomain); }
    async deleteByShopDomain(shopDomain) { const data = await this.store.read(); data.shops = data.shops.filter((s) => s.shopDomain !== shopDomain); await this.store.write(data); }
}
export class FileOAuthStateRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(state) { const data = await this.store.read(); data.oauthStates.push(state); await this.store.write(data); }
    async get(state) { const data = await this.store.read(); return data.oauthStates.find((s) => s.state === state); }
    async consume(state, consumedAt) { const data = await this.store.read(); data.oauthStates = data.oauthStates.map((s) => s.state === state ? { ...s, consumedAt } : s); await this.store.write(data); }
}
export class FileWebhookEventRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(event) { const data = await this.store.read(); data.webhookEvents.push(event); await this.store.write(data); }
    async update(event) { const data = await this.store.read(); data.webhookEvents = data.webhookEvents.filter((e) => e.id !== event.id).concat(event); await this.store.write(data); }
    async getById(id) { const data = await this.store.read(); return data.webhookEvents.find((e) => e.id === id); }
}
export class FileDispatchAttemptRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(attempt) { const data = await this.store.read(); data.dispatchAttempts.push(attempt); await this.store.write(data); }
}
export class FileAuditLogRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(record) { const data = await this.store.read(); data.auditLogs.push(record); await this.store.write(data); }
}
