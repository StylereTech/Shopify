import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ShopifyAuthService } from '../src/shopify/auth.js';
import {
  InMemoryAuditLogRepository,
  InMemoryOAuthStateRepository,
  InMemoryShopInstallationRepository
} from '../src/infrastructure/persistence/in-memory-repositories.js';
import { CarrierServiceManager } from '../src/shopify/carrier-service-manager.js';
import { TokenVault } from '../src/shopify/token-vault.js';

function signQuery(params: Record<string, string>, secret: string): string {
  const canonical = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

describe('shopify install/auth', () => {
  it('redirects valid install request', async () => {
    const params = { shop: 'demo.myshopify.com', timestamp: '1' };
    const hmac = signQuery(params, 'dev-secret');
    const app = createApp({ shopifyApiKey: 'key', shopifyApiSecret: 'dev-secret', appUrl: 'http://localhost:3000', scopes: 'read_orders', encryptionKeyHex: 'a'.repeat(64) });

    const res = await request(app).get('/shopify/install').query({ ...params, hmac }).expect(302);
    expect(res.header.location).toContain('admin/oauth/authorize');
    expect(res.header.location).toContain('state=');
  });

  it('completes oauth callback once and rejects replay', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token', scope: 'read_orders' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { deliveryCarrierServices: { nodes: [] } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { deliveryCarrierServiceCreate: { carrierService: { id: 'gid://carrier/1' } } } }) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = createApp({ shopifyApiKey: 'key', shopifyApiSecret: 'dev-secret', appUrl: 'http://localhost:3000', scopes: 'read_orders', encryptionKeyHex: 'a'.repeat(64) });
    const installParams = { shop: 'demo.myshopify.com', timestamp: '1' };
    const installHmac = signQuery(installParams, 'dev-secret');
    const installRes = await request(app).get('/shopify/install').query({ ...installParams, hmac: installHmac }).expect(302);
    const state = new URL(installRes.header.location).searchParams.get('state') as string;

    const callbackParams = { shop: 'demo.myshopify.com', timestamp: '1', code: 'abc', state };
    const callbackHmac = signQuery(callbackParams, 'dev-secret');
    await request(app).get('/shopify/auth/callback').query({ ...callbackParams, hmac: callbackHmac }).expect(200);
    await request(app).get('/shopify/auth/callback').query({ ...callbackParams, hmac: callbackHmac }).expect(401);
  });

  it('rejects expired oauth state', async () => {
    const oauthStates = new InMemoryOAuthStateRepository();
    const auth = new ShopifyAuthService({
      apiKey: 'key',
      apiSecret: 'secret',
      appUrl: 'http://localhost:3000',
      scopes: 'read_orders',
      installationRepo: new InMemoryShopInstallationRepository(),
      oauthStateRepo: oauthStates,
      carrierServiceManager: { ensureCarrierService: async () => 'gid://carrier/1' } as CarrierServiceManager,
      tokenVault: new TokenVault('a'.repeat(64)),
      auditLogs: new InMemoryAuditLogRepository()
    });

    await oauthStates.create({
      state: 'expired',
      shopDomain: 'demo.myshopify.com',
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000)
    });

    const params = { shop: 'demo.myshopify.com', timestamp: '1', code: 'abc', state: 'expired' };
    const hmac = signQuery(params, 'secret');
    await expect(auth.completeCallback({ ...params, hmac })).rejects.toThrow('Expired OAuth state');
  });
});
