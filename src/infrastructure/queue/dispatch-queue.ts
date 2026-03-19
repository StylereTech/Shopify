import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { Logger } from '../../observability/logger.js';
import { MetricsRegistry } from '../../observability/metrics.js';
import { backoffDelayMs } from '../retry.js';

export interface DispatchQueue {
  enqueue(payload: Record<string, unknown>): Promise<string>;
}

export class InlineDispatchQueue implements DispatchQueue {
  constructor(private readonly handler: (payload: Record<string, unknown>) => Promise<void>) {}
  async enqueue(payload: Record<string, unknown>): Promise<string> {
    const id = randomUUID();
    setImmediate(async () => {
      await this.handler(payload);
    });
    return id;
  }
}

export class RedisDispatchQueue implements DispatchQueue {
  constructor(private readonly redis: Redis, private readonly queueKey: string) {}

  async enqueue(payload: Record<string, unknown>): Promise<string> {
    const message = { id: randomUUID(), payload, attempts: 0 };
    await this.redis.rpush(this.queueKey, JSON.stringify(message));
    return message.id;
  }

  async size(): Promise<number> {
    return this.redis.llen(this.queueKey);
  }
}

export interface WorkerOptions {
  /** Base delay ms for exponential backoff between retries. Default: 5000 (5s) */
  baseRetryDelayMs?: number;
  /** Maximum delay ms cap. Default: 120000 (2 min) */
  maxRetryDelayMs?: number;
  /** Max retry attempts before dead-lettering. Default: 3 */
  maxRetries?: number;
}

export class RedisDispatchWorker {
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly redis: Redis,
    private readonly queueKey: string,
    private readonly deadLetterKey: string,
    private readonly logger: Logger,
    private readonly handler: (payload: Record<string, unknown>, attempts: number) => Promise<void>,
    private readonly shouldRetry: (error: unknown) => boolean,
    private readonly metrics?: MetricsRegistry,
    maxRetries = 3,
    private readonly onMaxFailures?: (payload: Record<string, unknown>, error: unknown) => Promise<void>,
    options: WorkerOptions = {}
  ) {
    this.maxRetries = maxRetries;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 5000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 120000;
  }

  async start(): Promise<void> {
    for (;;) {
      const result = await this.redis.blpop(this.queueKey, 0);
      if (!result) continue;
      const [, raw] = result;
      const parsed = JSON.parse(raw) as { id: string; payload: Record<string, unknown>; attempts: number };

      try {
        await this.handler(parsed.payload, parsed.attempts);
        this.metrics?.increment('worker.dispatch_success');
      } catch (error) {
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
            } catch (alertErr) {
              this.logger.error('Max-failure callback threw', { error: String(alertErr) });
            }
          }
        } else {
          // Exponential backoff before re-queuing (Style.re 1.1 pattern)
          const delay = backoffDelayMs(next.attempts - 1, this.baseRetryDelayMs, this.maxRetryDelayMs);
          this.logger.warn('Scheduling retry with backoff', {
            attempt: next.attempts,
            delayMs: Math.round(delay)
          });
          await new Promise<void>((r) => setTimeout(r, delay));
          await this.redis.rpush(this.queueKey, JSON.stringify(next));
        }
      }
    }
  }
}
