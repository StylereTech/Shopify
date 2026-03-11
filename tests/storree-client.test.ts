import { describe, expect, it, vi } from 'vitest';
import { StorreeApiClient, StorreeDispatchError } from '../src/infrastructure/storree/storree-client.js';

describe('storree api client', () => {
  it('returns accepted dispatch on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'd_1', accepted: true })
      }) as unknown as typeof fetch
    );

    const client = new StorreeApiClient('https://storree.local', 'k', 1000, 0);
    const result = await client.createDispatch({
      storreeMerchantId: 'm1',
      serviceLevel: 'one_hour',
      pickup: { lat: 1, lng: 2 },
      dropoff: { lat: 3, lng: 4 },
      externalReference: 'ord-1',
      items: [{ sku: 's', quantity: 1, name: 'n' }],
      idempotencyKey: 'idemp-1'
    });

    expect(result.accepted).toBe(true);
    expect(result.dispatchId).toBe('d_1');
  });

  it('throws retryable error after retry exhaustion on 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'down' }) }) as unknown as typeof fetch
    );

    const client = new StorreeApiClient('https://storree.local', 'k', 1000, 1);
    await expect(
      client.createDispatch({
        storreeMerchantId: 'm1',
        serviceLevel: 'one_hour',
        pickup: { lat: 1, lng: 2 },
        dropoff: { lat: 3, lng: 4 },
        externalReference: 'ord-1',
        items: [{ sku: 's', quantity: 1, name: 'n' }],
        idempotencyKey: 'idemp-1'
      })
    ).rejects.toBeInstanceOf(StorreeDispatchError);
  });
});
