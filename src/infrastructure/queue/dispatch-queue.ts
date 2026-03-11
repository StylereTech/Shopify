import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Logger } from '../../observability/logger.js';
import { MetricsRegistry } from '../../observability/metrics.js';

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

export class RedisDispatchWorker {
  constructor(
    private readonly redis: Redis,
    private readonly queueKey: string,
    private readonly deadLetterKey: string,
    private readonly logger: Logger,
    private readonly handler: (payload: Record<string, unknown>, attempts: number) => Promise<void>,
    private readonly shouldRetry: (error: unknown) => boolean,
    private readonly metrics?: MetricsRegistry,
    private readonly maxRetries = 3
  ) {}

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
        this.logger.error('Dispatch worker failure', { queueKey: this.queueKey, attempts: next.attempts, retryable, error: String(error) });
        this.metrics?.increment(retryable ? 'worker.retryable_error' : 'worker.terminal_error');

        if (!retryable || next.attempts >= this.maxRetries) {
          await this.redis.rpush(this.deadLetterKey, JSON.stringify(next));
          this.metrics?.increment('worker.dead_lettered');
        } else {
          await this.redis.rpush(this.queueKey, JSON.stringify(next));
        }
      }
    }
  }
}
