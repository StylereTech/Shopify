import { randomUUID } from 'node:crypto';
import { backoffDelayMs } from '../retry.js';
export class InlineDispatchQueue {
    handler;
    constructor(handler) {
        this.handler = handler;
    }
    async enqueue(payload) {
        const id = randomUUID();
        setImmediate(async () => {
            await this.handler(payload);
        });
        return id;
    }
}
export class RedisDispatchQueue {
    redis;
    queueKey;
    constructor(redis, queueKey) {
        this.redis = redis;
        this.queueKey = queueKey;
    }
    async enqueue(payload) {
        const message = { id: randomUUID(), payload, attempts: 0 };
        await this.redis.rpush(this.queueKey, JSON.stringify(message));
        return message.id;
    }
    async size() {
        return this.redis.llen(this.queueKey);
    }
}
export class RedisDispatchWorker {
    redis;
    queueKey;
    deadLetterKey;
    logger;
    handler;
    shouldRetry;
    metrics;
    onMaxFailures;
    baseRetryDelayMs;
    maxRetryDelayMs;
    maxRetries;
    constructor(redis, queueKey, deadLetterKey, logger, handler, shouldRetry, metrics, maxRetries = 3, onMaxFailures, options = {}) {
        this.redis = redis;
        this.queueKey = queueKey;
        this.deadLetterKey = deadLetterKey;
        this.logger = logger;
        this.handler = handler;
        this.shouldRetry = shouldRetry;
        this.metrics = metrics;
        this.onMaxFailures = onMaxFailures;
        this.maxRetries = maxRetries;
        this.baseRetryDelayMs = options.baseRetryDelayMs ?? 5000;
        this.maxRetryDelayMs = options.maxRetryDelayMs ?? 120000;
    }
    async start() {
        for (;;) {
            const result = await this.redis.blpop(this.queueKey, 0);
            if (!result)
                continue;
            const [, raw] = result;
            const parsed = JSON.parse(raw);
            try {
                await this.handler(parsed.payload, parsed.attempts);
                this.metrics?.increment('worker.dispatch_success');
            }
            catch (error) {
                const retryable = this.shouldRetry(error);
                const next = { ...parsed, attempts: parsed.attempts + 1, error: String(error), retryable };
                this.logger.error('Dispatch worker failure', {
                    queueKey: this.queueKey,
                    attempts: next.attempts,
                    retryable,
                    error: String(error)
                });
                this.metrics?.increment(retryable ? 'worker.retryable_error' : 'worker.terminal_error');
                if (!retryable || next.attempts >= this.maxRetries) {
                    // Dead-letter the message
                    await this.redis.rpush(this.deadLetterKey, JSON.stringify(next));
                    this.metrics?.increment('worker.dead_lettered');
                    // Notify admin on max failure (non-blocking)
                    if (this.onMaxFailures) {
                        try {
                            await this.onMaxFailures(parsed.payload, error);
                        }
                        catch (alertErr) {
                            this.logger.error('Max-failure callback threw', { error: String(alertErr) });
                        }
                    }
                }
                else {
                    // Exponential backoff before re-queuing (Style.re 1.1 pattern)
                    const delay = backoffDelayMs(next.attempts - 1, this.baseRetryDelayMs, this.maxRetryDelayMs);
                    this.logger.warn('Scheduling retry with backoff', {
                        attempt: next.attempts,
                        delayMs: Math.round(delay)
                    });
                    await new Promise((r) => setTimeout(r, delay));
                    await this.redis.rpush(this.queueKey, JSON.stringify(next));
                }
            }
        }
    }
}
