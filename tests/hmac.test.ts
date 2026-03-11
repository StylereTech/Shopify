import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalizeQuery, verifyShopifyQueryHmac, verifyShopifyWebhookHmac } from '../src/shopify/hmac.js';

describe('shopify hmac verification', () => {
  it('verifies install query hmac', () => {
    const query = { shop: 'demo.myshopify.com', timestamp: '123' } as Record<string, string | undefined>;
    const canonical = canonicalizeQuery(query);
    const hmac = createHmac('sha256', 'secret').update(canonical).digest('hex');
    expect(verifyShopifyQueryHmac({ ...query, hmac }, 'secret')).toBe(true);
  });

  it('verifies webhook hmac', () => {
    const body = Buffer.from('{"id":1}');
    const hmac = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(verifyShopifyWebhookHmac(body, hmac, 'secret')).toBe(true);
  });
});
