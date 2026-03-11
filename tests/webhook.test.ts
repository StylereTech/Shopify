import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MerchantDeliveryConfig } from '../src/domain/types.js';

const app = createApp({ shopifyApiSecret: 'dev-secret' });

const config: MerchantDeliveryConfig = {
  merchantId: 'm-1',
  shopDomain: 'demo.myshopify.com',
  storreeMerchantId: 'storree-1',
  pickupLocation: { lat: 40.7128, lng: -74.006 },
  radiusKm: 30,
  oneHourEnabled: true,
  sameDayEnabled: true,
  oneHourCutoffHourLocal: 23,
  sameDayCutoffHourLocal: 23,
  baseFeeCents: 500,
  pricePerKmCents: 120,
  platformMarkupPercent: 0,
  timezone: 'UTC',
  isActive: true
};

describe('shopify webhook orchestration', () => {
  beforeEach(async () => {
    await request(app).post('/merchant/config').send(config).expect(204);
  });

  it('accepts valid signed webhook', async () => {
    const payload = {
      id: '123',
      name: '#1001',
      shipping_lines: [{ code: 'STORREE_ONE_HOUR' }],
      shipping_address: { latitude: 40.73, longitude: -73.93 },
      line_items: [{ sku: 'ABC', quantity: 1, name: 'Test Item' }]
    };
    const body = JSON.stringify(payload);
    const hmac = createHmac('sha256', 'dev-secret').update(body).digest('base64');

    const response = await request(app)
      .post('/shopify/webhooks/orders/paid')
      .set('x-shopify-topic', 'orders/paid')
      .set('x-shopify-shop-domain', 'demo.myshopify.com')
      .set('x-shopify-webhook-id', 'wh_1')
      .set('x-shopify-hmac-sha256', hmac)
      .set('content-type', 'application/json')
      .send(body)
      .expect(202);

    expect(response.body.accepted).toBe(true);
  });

  it('rejects invalid webhook signature', async () => {
    await request(app)
      .post('/shopify/webhooks/orders/paid')
      .set('x-shopify-topic', 'orders/paid')
      .set('x-shopify-shop-domain', 'demo.myshopify.com')
      .set('x-shopify-hmac-sha256', 'bad')
      .send({})
      .expect(401);
  });
});
