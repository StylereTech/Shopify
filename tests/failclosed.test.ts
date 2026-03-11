import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MerchantDeliveryConfig } from '../src/domain/types.js';
import { StorreeClient } from '../src/infrastructure/storree/storree-client.js';

const merchantConfig: MerchantDeliveryConfig = {
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

describe('fail-closed storree behavior', () => {
  it('returns no rates when storree connectivity is unhealthy', async () => {
    const storreeClient: StorreeClient = {
      checkConnectivity: async () => false,
      createDispatch: vi.fn() as unknown as StorreeClient['createDispatch']
    };

    const app = createApp({ shopifyApiSecret: 'dev-secret', storreeClient });
    await request(app).post('/merchant/config').send(merchantConfig).expect(204);

    const response = await request(app)
      .post('/shopify/carrier-service/rates')
      .send({
        rate: {
          origin: { latitude: 40.71, longitude: -74.0 },
          destination: { latitude: 40.73, longitude: -73.99 },
          price: '1000',
          currency: 'USD'
        },
        shop: { domain: 'demo.myshopify.com' }
      })
      .expect(200);

    expect(response.body.rates).toEqual([]);
  });

  it('rejects paid webhook with 503 when storree connectivity is unhealthy', async () => {
    const storreeClient: StorreeClient = {
      checkConnectivity: async () => false,
      createDispatch: vi.fn() as unknown as StorreeClient['createDispatch']
    };

    const app = createApp({ shopifyApiSecret: 'dev-secret', storreeClient });
    const payload = {
      id: '123',
      name: '#1001',
      shipping_lines: [{ code: 'STORREE_ONE_HOUR' }],
      shipping_address: { latitude: 40.73, longitude: -73.93 },
      line_items: [{ sku: 'ABC', quantity: 1, name: 'Test Item' }]
    };
    const body = JSON.stringify(payload);
    const hmac = createHmac('sha256', 'dev-secret').update(body).digest('base64');

    await request(app)
      .post('/shopify/webhooks/orders/paid')
      .set('x-shopify-topic', 'orders/paid')
      .set('x-shopify-shop-domain', 'demo.myshopify.com')
      .set('x-shopify-webhook-id', 'wh_1')
      .set('x-shopify-hmac-sha256', hmac)
      .set('content-type', 'application/json')
      .send(body)
      .expect(503);
  });
});
