export class InMemoryMerchantConfigRepository {
    byShop = new Map();
    async upsert(config) { this.byShop.set(config.shopDomain, config); }
    async getByShopDomain(shopDomain) { return this.byShop.get(shopDomain); }
}
export class InMemoryDeliveryJobRepository {
    jobs = new Map();
    async create(job) { this.jobs.set(job.shopifyOrderId, job); }
    async update(job) { this.jobs.set(job.shopifyOrderId, job); }
    async getByShopifyOrderId(shopifyOrderId) { return this.jobs.get(shopifyOrderId); }
    async getByDispatchId(dispatchId) {
        for (const job of this.jobs.values()) {
            if (job.dispatchId === dispatchId)
                return job;
        }
        return undefined;
    }
}
export class InMemoryIdempotencyRepository {
    keys = new Set();
    async seen(key) { return this.keys.has(key); }
    async mark(key) { this.keys.add(key); }
}
export class InMemoryShopInstallationRepository {
    shops = new Map();
    async upsert(installation) { this.shops.set(installation.shopDomain, installation); }
    async getByShopDomain(shopDomain) { return this.shops.get(shopDomain); }
    async deleteByShopDomain(shopDomain) { this.shops.delete(shopDomain); }
}
export class InMemoryOAuthStateRepository {
    states = new Map();
    async create(state) { this.states.set(state.state, state); }
    async get(state) { return this.states.get(state); }
    async consume(state, consumedAt) {
        const existing = this.states.get(state);
        if (existing)
            this.states.set(state, { ...existing, consumedAt });
    }
}
export class InMemoryWebhookEventRepository {
    events = new Map();
    async create(event) { this.events.set(event.id, event); }
    async update(event) { this.events.set(event.id, event); }
    async getById(id) { return this.events.get(id); }
}
export class InMemoryDispatchAttemptRepository {
    attempts = [];
    async create(attempt) { this.attempts.push(attempt); }
}
export class InMemoryAuditLogRepository {
    records = [];
    async create(record) { this.records.push(record); }
}
