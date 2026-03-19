/**
 * Dispatch Watchdog Service
 *
 * Style.re 1.1 parity: polls every 30 seconds for paid orders (delivery jobs)
 * that are stuck in 'pending' or 'failed' state with no active dispatch.
 *
 * Strategy (mirrors guaranteedDispatchService.ts from Style.re 1.1):
 *  1. Query delivery_jobs with status='pending' older than 2 minutes (give queue time)
 *  2. Attempt re-dispatch via orchestrator
 *  3. Exponential back-off: 30s → 60s → 120s between retries
 *  4. After WORKER_MAX_RETRIES failures, mark job 'failed' and send admin alert SMS
 *  5. Double-dispatch guard: check dispatchId before each attempt
 *
 * Also recovers jobs stuck in 'pending' after server restart.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DeliveryJob } from './types.js';
import { DeliveryJobRepository, MerchantConfigRepository, DispatchAttemptRepository, AuditLogRepository } from '../infrastructure/persistence/repositories.js';
import { StorreeClient } from '../infrastructure/storree/storree-client.js';
import { MetricsRegistry } from '../observability/metrics.js';
import { Logger } from '../observability/logger.js';
import { tryAdminAlert } from '../infrastructure/sms-alert.js';
import { backoffDelayMs } from '../infrastructure/retry.js';

const POLL_INTERVAL_MS = 30_000;
const DISPATCH_DELAY_MS = 2 * 60_000; // Only act on jobs older than 2 min
const MAX_WATCHDOG_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 30_000;

export interface WatchdogEnv {
  ADMIN_PHONE_NUMBER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
}

interface StuckJobRecord {
  lastAttemptAt?: Date;
  attempts: number;
}

export class DispatchWatchdog {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private readonly stuckJobState = new Map<string, StuckJobRecord>();

  constructor(
    private readonly pool: Pool,
    private readonly jobs: DeliveryJobRepository,
    private readonly merchantConfigs: MerchantConfigRepository,
    private readonly storreeClient: StorreeClient,
    private readonly dispatchAttempts: DispatchAttemptRepository,
    private readonly auditLogs: AuditLogRepository,
    private readonly metrics: MetricsRegistry,
    private readonly logger: Logger,
    private readonly env: WatchdogEnv,
    private readonly maxAttempts = MAX_WATCHDOG_ATTEMPTS
  ) {}

  start(): void {
    if (this.intervalHandle) return;
    this.isRunning = true;
    this.logger.info('[Watchdog] Starting dispatch watchdog', { pollIntervalMs: POLL_INTERVAL_MS });

    // Startup recovery scan
    this.runCycle().catch((err) => {
      this.logger.error('[Watchdog] Startup cycle error', { error: String(err) });
    });

    this.intervalHandle = setInterval(() => {
      this.runCycle().catch((err) => {
        this.logger.error('[Watchdog] Poll cycle error', { error: String(err) });
      });
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.logger.info('[Watchdog] Stopped');
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    const cutoff = new Date(Date.now() - DISPATCH_DELAY_MS);

    // Find stuck pending/failed delivery jobs
    let stuckJobs: DeliveryJob[] = [];
    try {
      const { rows } = await this.pool.query<{
        id: string;
        shopify_order_id: string;
        merchant_id: string;
        service_level: string;
        status: string;
        dispatch_id: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM delivery_jobs
         WHERE status IN ('pending', 'failed')
           AND dispatch_id IS NULL
           AND created_at < $1
         LIMIT 20`,
        [cutoff]
      );

      stuckJobs = rows.map((row) => ({
        id: row.id,
        shopifyOrderId: row.shopify_order_id,
        merchantId: row.merchant_id,
        serviceLevel: row.service_level as 'one_hour' | 'same_day',
        status: row.status as DeliveryJob['status'],
        dispatchId: row.dispatch_id ?? undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }));
    } catch (err) {
      this.logger.error('[Watchdog] DB query error', { error: String(err) });
      return;
    }

    if (stuckJobs.length === 0) return;

    this.logger.warn('[Watchdog] Found stuck delivery jobs', { count: stuckJobs.length });
    this.metrics.increment('watchdog.stuck_jobs_found');

    for (const job of stuckJobs) {
      await this.processStuckJob(job);
    }
  }

  private async processStuckJob(job: DeliveryJob): Promise<void> {
    const state = this.stuckJobState.get(job.id) ?? { attempts: 0 };

    // Back-off check: respect exponential delay between retry attempts
    if (state.lastAttemptAt) {
      const delay = backoffDelayMs(state.attempts - 1, BASE_BACKOFF_MS, 120_000);
      const timeSinceLast = Date.now() - state.lastAttemptAt.getTime();
      if (timeSinceLast < delay) {
        this.logger.info('[Watchdog] Job in back-off window, skipping', {
          jobId: job.id,
          remainingMs: Math.round(delay - timeSinceLast)
        });
        return;
      }
    }

    // Re-fetch to guard against race with queue worker
    let live: DeliveryJob | undefined;
    try {
      live = await this.jobs.getByShopifyOrderId(job.shopifyOrderId);
    } catch {
      return;
    }

    if (!live || (live.status !== 'pending' && live.status !== 'failed') || live.dispatchId) {
      // Already handled by worker or has a dispatch ID
      this.stuckJobState.delete(job.id);
      return;
    }

    if (state.attempts >= this.maxAttempts) {
      await this.handleMaxFailures(job, state.attempts);
      return;
    }

    // Attempt dispatch
    this.logger.warn('[Watchdog] Attempting re-dispatch for stuck job', {
      jobId: job.id,
      shopifyOrderId: job.shopifyOrderId,
      attempt: state.attempts + 1
    });
    this.metrics.increment('watchdog.redispatch_attempt');

    state.lastAttemptAt = new Date();
    state.attempts += 1;
    this.stuckJobState.set(job.id, state);

    const config = await this.merchantConfigs.getByShopDomain(
      // merchantId is stored, but we need shopDomain — look it up via merchantId
      // Fallback: query direct from pool
      await this.getShopDomainForMerchant(job.merchantId)
    );

    if (!config || !config.isActive) {
      this.logger.error('[Watchdog] Merchant config not found or inactive', { merchantId: job.merchantId });
      return;
    }

    try {
      const dispatch = await this.storreeClient.createDispatch({
        storreeMerchantId: config.storreeMerchantId,
        serviceLevel: job.serviceLevel,
        pickup: config.pickupLocation,
        dropoff: { lat: 0, lng: 0 }, // Will need actual dropoff from order data
        externalReference: job.shopifyOrderId,
        items: [],
        idempotencyKey: `watchdog-${job.id}-${state.attempts}`
      });

      job.status = dispatch.accepted ? 'accepted' : 'failed';
      job.dispatchId = dispatch.dispatchId;
      job.updatedAt = new Date();
      await this.jobs.update(job);

      await this.dispatchAttempts.create({
        id: randomUUID(),
        jobId: job.id,
        attemptedAt: new Date(),
        success: dispatch.accepted,
        retryCount: state.attempts,
        errorClass: dispatch.accepted ? undefined : 'retryable',
        providerStatusCode: dispatch.providerStatusCode,
        errorMessage: dispatch.accepted ? undefined : 'Watchdog re-dispatch rejected'
      });

      await this.auditLogs.create({
        id: randomUUID(),
        actor: 'watchdog',
        action: dispatch.accepted ? 'watchdog_redispatch_accepted' : 'watchdog_redispatch_rejected',
        entityType: 'delivery_job',
        entityId: job.id,
        occurredAt: new Date()
      });

      if (dispatch.accepted) {
        this.metrics.increment('watchdog.redispatch_success');
        this.stuckJobState.delete(job.id);
        this.logger.info('[Watchdog] Re-dispatch successful', { jobId: job.id, dispatchId: dispatch.dispatchId });
      } else {
        this.metrics.increment('watchdog.redispatch_rejected');
      }
    } catch (err) {
      this.metrics.increment('watchdog.redispatch_error');
      this.logger.error('[Watchdog] Re-dispatch error', { jobId: job.id, error: String(err) });

      await this.dispatchAttempts.create({
        id: randomUUID(),
        jobId: job.id,
        attemptedAt: new Date(),
        success: false,
        retryCount: state.attempts,
        errorClass: 'retryable',
        errorMessage: String(err)
      });
    }
  }

  private async handleMaxFailures(job: DeliveryJob, attempts: number): Promise<void> {
    this.logger.error('[Watchdog] Max re-dispatch attempts exhausted', {
      jobId: job.id,
      shopifyOrderId: job.shopifyOrderId,
      attempts
    });
    this.metrics.increment('watchdog.max_failures');

    // Mark terminal failure
    job.status = 'failed';
    job.updatedAt = new Date();
    try {
      await this.jobs.update(job);
    } catch {
      // best effort
    }

    await this.auditLogs.create({
      id: randomUUID(),
      actor: 'watchdog',
      action: 'watchdog_max_failures',
      entityType: 'delivery_job',
      entityId: job.id,
      occurredAt: new Date(),
      metadata: { attempts, shopifyOrderId: job.shopifyOrderId }
    });

    // Remove from watchdog state so we don't keep alerting
    this.stuckJobState.delete(job.id);

    const alertMsg = `🚨 WATCHDOG ALERT: Delivery job ${job.id} (Shopify order ${job.shopifyOrderId}) failed all ${attempts} watchdog re-dispatch attempts. Manual intervention required.`;
    await tryAdminAlert(alertMsg, this.env, this.logger);
  }

  private async getShopDomainForMerchant(merchantId: string): Promise<string> {
    try {
      const { rows } = await this.pool.query<{ shop_domain: string }>(
        'SELECT shop_domain FROM merchant_configs WHERE merchant_id = $1 LIMIT 1',
        [merchantId]
      );
      return rows[0]?.shop_domain ?? '';
    } catch {
      return '';
    }
  }
}

export function startDispatchWatchdog(
  pool: Pool,
  jobs: DeliveryJobRepository,
  merchantConfigs: MerchantConfigRepository,
  storreeClient: StorreeClient,
  dispatchAttempts: DispatchAttemptRepository,
  auditLogs: AuditLogRepository,
  metrics: MetricsRegistry,
  logger: Logger,
  env: WatchdogEnv
): DispatchWatchdog {
  const watchdog = new DispatchWatchdog(
    pool,
    jobs,
    merchantConfigs,
    storreeClient,
    dispatchAttempts,
    auditLogs,
    metrics,
    logger,
    env
  );
  watchdog.start();
  return watchdog;
}
