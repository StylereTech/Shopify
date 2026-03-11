import { describe, expect, it, vi } from 'vitest';
import { InlineDispatchQueue } from '../src/infrastructure/queue/dispatch-queue.js';

describe('inline dispatch queue', () => {
  it('executes enqueued payload', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const queue = new InlineDispatchQueue(handler);
    await queue.enqueue({ orderId: '1' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler).toHaveBeenCalledWith({ orderId: '1' });
  });
});
