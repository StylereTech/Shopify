import { randomUUID } from 'node:crypto';
import { StorreeDispatchError } from '../infrastructure/storree/storree-client.js';
const METHOD_TO_LEVEL = {
    STORREE_ONE_HOUR: 'one_hour',
    STORREE_SAME_DAY: 'same_day'
};
export class DispatchOrchestrator {
    merchantConfigs;
    jobs;
    idempotency;
    storreeClient;
    dispatchAttempts;
    auditLogs;
    metrics;
    constructor(merchantConfigs, jobs, idempotency, storreeClient, dispatchAttempts, auditLogs, metrics) {
        this.merchantConfigs = merchantConfigs;
        this.jobs = jobs;
        this.idempotency = idempotency;
        this.storreeClient = storreeClient;
        this.dispatchAttempts = dispatchAttempts;
        this.auditLogs = auditLogs;
        this.metrics = metrics;
    }
    async ingestPaidShopifyOrder(order, webhookId, options) {
        if (await this.idempotency.seen(webhookId)) {
            this.metrics?.increment('dispatch.idempotent_replay');
            return this.jobs.getByShopifyOrderId(order.id);
        }
        await this.idempotency.mark(webhookId);
        const serviceLevel = METHOD_TO_LEVEL[order.shippingMethodCode];
        if (!serviceLevel)
            return undefined;
        const config = await this.merchantConfigs.getByShopDomain(order.shopDomain);
        if (!config || !config.isActive)
            throw new Error('Merchant configuration not active');
        const existing = await this.jobs.getByShopifyOrderId(order.id);
        if (existing)
            return existing;
        const now = new Date();
        const job = {
            id: randomUUID(),
            shopifyOrderId: order.id,
            merchantId: config.merchantId,
            serviceLevel,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        };
        await this.jobs.create(job);
        this.metrics?.increment('dispatch.queued');
        await this.auditLogs.create({
            id: randomUUID(),
            actor: 'system',
            action: 'dispatch_queued',
            entityType: 'delivery_job',
            entityId: job.id,
            occurredAt: new Date(),
            correlationId: options?.correlationId
        });
        try {
            await this.auditLogs.create({
                id: randomUUID(),
                actor: 'system',
                action: 'dispatch_submitted',
                entityType: 'delivery_job',
                entityId: job.id,
                occurredAt: new Date(),
                correlationId: options?.correlationId
            });
            const dispatch = await this.storreeClient.createDispatch({
                storreeMerchantId: config.storreeMerchantId,
                serviceLevel,
                pickup: config.pickupLocation,
                dropoff: order.customerAddress,
                externalReference: order.orderNumber,
                items: order.lineItems,
                idempotencyKey: webhookId
            });
            job.status = dispatch.accepted ? 'accepted' : 'failed';
            job.dispatchId = dispatch.dispatchId;
            job.updatedAt = new Date();
            await this.jobs.update(job);
            this.metrics?.increment(dispatch.accepted ? 'dispatch.accepted' : 'dispatch.rejected');
            this.metrics?.observeMs('dispatch.latency_ms', dispatch.latencyMs);
            await this.dispatchAttempts.create({
                id: randomUUID(),
                jobId: job.id,
                attemptedAt: new Date(),
                success: dispatch.accepted,
                retryCount: options?.retryCount ?? 0,
                errorClass: dispatch.errorClass,
                providerStatusCode: dispatch.providerStatusCode,
                errorMessage: dispatch.accepted ? undefined : 'Dispatch rejected by Storree'
            });
        }
        catch (error) {
            const retryable = error instanceof StorreeDispatchError ? error.retryable : true;
            this.metrics?.increment(retryable ? 'dispatch.retry_scheduled' : 'dispatch.failed_terminal');
            job.status = 'failed';
            await this.jobs.update(job);
            await this.dispatchAttempts.create({
                id: randomUUID(),
                jobId: job.id,
                attemptedAt: new Date(),
                success: false,
                retryCount: options?.retryCount ?? 0,
                errorClass: retryable ? 'retryable' : 'terminal',
                providerStatusCode: error instanceof StorreeDispatchError ? error.providerStatusCode : undefined,
                errorMessage: String(error)
            });
            await this.auditLogs.create({
                id: randomUUID(),
                actor: 'system',
                action: retryable ? 'retry_scheduled' : 'failed_terminal',
                entityType: 'delivery_job',
                entityId: job.id,
                occurredAt: new Date(),
                correlationId: options?.correlationId,
                metadata: { error: String(error) }
            });
            throw error;
        }
        return job;
    }
}
