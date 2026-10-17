import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MerchantOrderRepository, parseMerchantOrderFilters } from '../src/infrastructure/persistence/merchant-orders.js';
import { PostgresDeliveryJobRepository, PostgresDispatchAttemptRepository } from '../src/infrastructure/persistence/postgres-repositories.js';

// Opt-in integration gate: only an explicitly named, disposable loopback database is allowed.
// This suite never reads DATABASE_URL or the application's provider configuration.
const localUrl = process.env.MERCHANT_TEST_DATABASE_URL;
if (localUrl) {
  const target = new URL(localUrl);
  if (target.hostname !== '127.0.0.1' || target.pathname !== '/merchant_order_audit' || target.port !== '55437') {
    throw new Error('Merchant integration tests require the isolated loopback audit database on port 55437.');
  }
}
const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const filters = (query: Record<string, unknown> = {}) => parseMerchantOrderFilters(query);
const input = (request_id = randomUUID()) => ({ request_id, customer_name: 'Audit customer', customer_phone: '+15555550123',
  customer_email: 'audit@example.test', delivery_address: '2 Test St, Dallas, TX 75201', declared_amount_cents: 12345,
  items: [{ name: 'Test item', quantity: 2 }] });

describe.skipIf(!localUrl)('merchant ownership against isolated Postgres', () => {
  let pool: Pool;
  let repository: MerchantOrderRepository;
  let migratedHistory: Record<string, unknown>;
  beforeAll(async () => {
    pool = new Pool({ connectionString: localUrl, max: 3, connectionTimeoutMillis: 2000, statement_timeout: 5000 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const migrations = new URL('../src/infrastructure/db/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
      if (file === '005_merchant_order_ownership.sql') {
        await pool.query(`INSERT INTO storree_orders(id,service_type,status,shop_domain) VALUES('legacy','item_delivery','delivered','a.myshopify.com');
          INSERT INTO delivery_jobs(id,shopify_order_id,merchant_id,service_level,status,created_at,updated_at)
            VALUES('legacy-job','legacy-order','delivery-a','same_day','delivered',NOW(),NOW())`);
      }
      await pool.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    migratedHistory = (await pool.query(`SELECT o.merchant_account_id, o.completed_at, j.shop_domain AS job_shop_domain, j.completed_at AS job_completed_at,
      (SELECT COUNT(*) FROM merchant_shop_bindings) AS binding_count FROM storree_orders o CROSS JOIN delivery_jobs j WHERE o.id='legacy' AND j.id='legacy-job'`)).rows[0];
    repository = new MerchantOrderRepository(pool);
  }, 15000);
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await pool.query('DELETE FROM merchant_shop_bindings; DELETE FROM dispatch_attempts; DELETE FROM delivery_jobs; DELETE FROM storree_orders; DELETE FROM merchant_configs; DELETE FROM shops; DELETE FROM merchants');
    await pool.query(`INSERT INTO merchants(id,email,store_name,plan_status) VALUES ($1,'a@example.test','Store A','active'),($2,'b@example.test','Store B','active')`, [ownerA, ownerB]);
  });
  async function standalone(id: string, owner: string | null, status = 'pending', completed: string | null = null) {
    await pool.query(`INSERT INTO storree_orders(id,service_type,merchant_account_id,status,contact,dropoff_address,items,completed_at)
      VALUES ($1,'item_delivery',$2,$3,'{"name":"Owned customer","private_secret":"do not expose"}','{"street":"1 Test St","city":"Dallas"}','[{"name":"Item","quantity":1}]',$4)`, [id, owner, status, completed]);
  }
  async function shop(domain: string) {
    await pool.query(`INSERT INTO shops(shop_domain,access_token_ciphertext,access_token_iv,access_token_tag,scopes,installed_at)
      VALUES($1,'private ciphertext','iv','tag','read_orders',NOW())`, [domain]);
  }
  async function bind(owner: string, domain: string, deliveryMerchant: string) {
    await shop(domain);
    await pool.query('INSERT INTO merchant_shop_bindings VALUES($1,$2,$3,NOW())', [owner, domain, deliveryMerchant]);
  }
  async function job(id: string, merchant: string, domain: string | null, status = 'pending') {
    await pool.query(`INSERT INTO delivery_jobs(id,shopify_order_id,merchant_id,shop_domain,service_level,status,created_at,updated_at)
      VALUES($1,$2,$3,$4,'same_day',$5,'2026-01-01 12:00:00','2026-01-01 12:00:00')`, [id, `order-${id}`, merchant, domain, status]);
  }

  it('migrates the shipped schema without assigning historical ownership or inventing completion dates', () => {
    expect(migratedHistory).toEqual({ merchant_account_id: null, completed_at: null, job_shop_domain: null, job_completed_at: null, binding_count: '0' });
  });

  it('isolates owners and excludes unknown history from list, totals, detail and recovery', async () => {
    await standalone('owned-a', ownerA);
    await standalone('owned-b', ownerB);
    await standalone('unassigned', null);
    const result = await repository.list(ownerA, filters());
    expect(result.orders.map(order => order.id)).toEqual(['owned-a']);
    expect(result.pagination.total).toBe(1);
    expect(result.ownership).toEqual({ standalone: 'owned_records_only', shopify: 'not_linked', linked_shop_count: 0, historical_unassigned: 'excluded' });
    expect(result.orders[0]).toMatchObject({ merchant_id: ownerA, customer_name: 'Owned customer', delivery_address: '1 Test St, Dallas' });
    expect(JSON.stringify(result)).not.toContain('private_secret');
    await expect(repository.detail(ownerA, 'owned-b')).rejects.toMatchObject({ status: 404 });
    await expect(repository.detail(ownerA, 'unassigned')).rejects.toMatchObject({ status: 404 });
    const request = input();
    await repository.create({ id: ownerB }, request);
    await expect(repository.request(ownerA, request.request_id)).rejects.toMatchObject({ status: 404 });
    expect((await repository.dashboard(ownerA)).stats.total).toBe(1);
  });

  it('requires verified merchant and immutable shop domain together, never public configuration', async () => {
    await bind(ownerA, 'a.myshopify.com', 'delivery-a');
    await bind(ownerB, 'b.myshopify.com', 'delivery-b');
    await job('matched', 'delivery-a', 'a.myshopify.com');
    await job('wrong-domain', 'delivery-a', 'b.myshopify.com');
    await job('missing-domain', 'delivery-a', null);
    await job('other-merchant', 'delivery-b', 'b.myshopify.com');
    await job('guessed', 'public-merchant', 'a.myshopify.com');
    await pool.query(`UPDATE merchants SET shopify_shop_domain='b.myshopify.com' WHERE id=$1`, [ownerA]);
    const result = await repository.list(ownerA, filters());
    expect(result.orders.map(order => order.id)).toEqual(['shopify:matched']);
    expect(result.ownership).toMatchObject({ shopify: 'linked', linked_shop_count: 1 });
    expect(result.orders[0]).toMatchObject({ source_order_id: 'order-matched', merchant_id: ownerA, customer_name: null, delivery_address: null, items: [], declared_amount_cents: null });
    await expect(repository.detail(ownerA, 'shopify:wrong-domain')).rejects.toMatchObject({ status: 404 });
    await pool.query(`DELETE FROM shops WHERE shop_domain='a.myshopify.com'`);
    expect((await repository.list(ownerA, filters())).orders).toEqual([]);
  });

  it('keeps source IDs distinct and exposes dispatch attempt fields, not raw provider data', async () => {
    await bind(ownerA, 'a.myshopify.com', 'delivery-a');
    await job('same-id', 'delivery-a', 'a.myshopify.com');
    await standalone('same-id', ownerA);
    await pool.query(`INSERT INTO dispatch_attempts(id,job_id,attempted_at,success,retry_count,provider_status_code,error_message)
      VALUES ('attempt-1','same-id','2026-01-01 12:01:00',false,0,503,'private provider response'),
        ('attempt-2','same-id','2026-01-01 12:02:00',true,1,201,null)`);
    expect((await repository.list(ownerA, filters())).orders.map(order => order.id).sort()).toEqual(['same-id', 'shopify:same-id']);
    const detail = await repository.detail(ownerA, 'shopify:same-id');
    expect(detail.tracking).toEqual([
      { id: 'attempt-2', attempted_at: '2026-01-01T12:02:00.000Z', success: true, retry_count: 1, provider_status_code: 201 },
      { id: 'attempt-1', attempted_at: '2026-01-01T12:01:00.000Z', success: false, retry_count: 0, provider_status_code: 503 },
    ]);
    expect((await repository.detail(ownerA, 'same-id')).tracking).toEqual([]);
  });

  it('records pending unpaid requests once under concurrency and rejects payload conflict', async () => {
    const request = input();
    const results = await Promise.all([repository.create({ id: ownerA }, request), repository.create({ id: ownerA }, request)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].order.id).toBe(results[1].order.id);
    expect(results.map(result => result.request_id)).toEqual([request.request_id, request.request_id]);
    expect(results[0].order).toMatchObject({ merchant_id: ownerA, service_type: 'merchant_record', status: 'pending', payment_status: 'unpaid', declared_amount_cents: 12345 });
    await expect(repository.create({ id: ownerA }, { ...request, declared_amount_cents: 5 })).rejects.toMatchObject({ status: 409 });
    const restored = await repository.request(ownerA, request.request_id);
    expect(restored.request_id).toBe(request.request_id);
    expect(restored.order.id).toBe(results[0].order.id);
    const stored = await pool.query('SELECT pricing,merchant_request_fingerprint FROM storree_orders WHERE id=$1', [restored.order.id]);
    expect(stored.rows[0].pricing).toEqual({});
    expect(restored.order).not.toHaveProperty('merchant_request_fingerprint');
    expect((await repository.create({ id: ownerB }, request)).replayed).toBe(false);
  });

  it('filters active orders across all pages and returns accurate deterministic pagination', async () => {
    for (let index = 0; index < 7; index++) await standalone(`a-${index}`, ownerA, index === 6 ? 'delivered' : 'pending');
    await standalone('b-1', ownerB, 'pending');
    const first = await repository.list(ownerA, filters({ active: 'true', page: '1', limit: '2' }));
    const second = await repository.list(ownerA, filters({ active: 'true', page: '2', limit: '2' }));
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 6, pages: 3 });
    expect(new Set([...first.orders, ...second.orders].map(order => order.id)).size).toBe(4);
    expect((await repository.list(ownerA, filters({ status: 'delivered' }))).pagination.total).toBe(1);
    expect((await repository.list(ownerA, filters({ page: '99' }))).orders).toEqual([]);
    expect((await repository.dashboard(ownerA)).recent_orders).toHaveLength(5);
  });

  it('counts confirmed completion in UTC and preserves unknown historical completion', async () => {
    await standalone('historical', ownerA, 'delivered');
    await standalone('today', ownerA, 'pending');
    await standalone('old', ownerA, 'delivered', '2020-01-01T00:00:00Z');
    await standalone('other', ownerB, 'pending');
    await pool.query(`UPDATE storree_orders SET status='delivered' WHERE id IN ('today','other')`);
    const first = await repository.detail(ownerA, 'today');
    expect(first.order.completed_at).not.toBeNull();
    await pool.query(`UPDATE storree_orders SET status='delivered', completed_at='2020-01-01' WHERE id='today'`);
    expect((await repository.detail(ownerA, 'today')).order.completed_at).toBe(first.order.completed_at);
    const dashboard = await repository.dashboard(ownerA);
    expect(dashboard.stats).toMatchObject({ total: 3, completed_today: 1, completion_time_unknown: 1 });
    expect(dashboard.completion_timezone).toBe('UTC');
    expect((await repository.detail(ownerA, 'historical')).order.completed_at).toBeNull();
  });

  it('keeps timestamps and the UTC completion-day boundary independent of connection timezone', async () => {
    await standalone('utc-boundary', ownerA, 'delivered');
    await pool.query(`UPDATE storree_orders SET completed_at=(date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + interval '1 minute',
      created_at='2026-01-01 12:00:00', updated_at='2026-01-01 12:00:00' WHERE id='utc-boundary'`);
    const client = await pool.connect();
    try {
      await client.query(`SET TIME ZONE 'America/Los_Angeles'`);
      const localRepository = new MerchantOrderRepository(client);
      expect((await localRepository.dashboard(ownerA)).stats.completed_today).toBe(1);
      expect(new Date((await localRepository.list(ownerA, filters())).orders[0].created_at).toISOString()).toBe('2026-01-01T12:00:00.000Z');
      const before = Date.now();
      const saved = await localRepository.create({ id: ownerA }, input());
      expect(new Date(saved.order.created_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(saved.order.created_at).getTime()).toBeLessThanOrEqual(Date.now());
    } finally { await client.query(`SET TIME ZONE 'UTC'`); client.release(); }
  });

  it('persists verified webhook shop on job creation and cannot assign unknown history on update', async () => {
    const jobs = new PostgresDeliveryJobRepository(pool);
    const now = new Date('2026-01-01T12:00:00Z');
    await jobs.create({ id: 'new-job', shopifyOrderId: 'new-order', merchantId: 'delivery-a', shopDomain: 'a.myshopify.com', serviceLevel: 'same_day', status: 'pending', createdAt: now, updatedAt: now });
    expect((await jobs.getByShopifyOrderId('new-order'))?.shopDomain).toBe('a.myshopify.com');
    expect((await jobs.getByShopifyOrderId('new-order'))?.createdAt.toISOString()).toBe(now.toISOString());
    await bind(ownerA, 'a.myshopify.com', 'delivery-a');
    expect((await repository.detail(ownerA, 'shopify:new-job')).order.created_at).toBe(now.toISOString());
    await new PostgresDispatchAttemptRepository(pool).create({ id: 'new-attempt', jobId: 'new-job', attemptedAt: now, success: true, retryCount: 0 });
    expect((await repository.detail(ownerA, 'shopify:new-job')).tracking[0].attempted_at).toBe(now.toISOString());
    await job('historical-job', 'delivery-a', null);
    const historical = await jobs.getByShopifyOrderId('order-historical-job');
    if (!historical) throw new Error('Test fixture missing');
    await jobs.update({ ...historical, shopDomain: 'a.myshopify.com', status: 'delivered' });
    expect((await jobs.getByShopifyOrderId('order-historical-job'))?.shopDomain).toBeUndefined();
    expect((await pool.query(`SELECT completed_at FROM delivery_jobs WHERE id='historical-job'`)).rows[0].completed_at).toBeInstanceOf(Date);
  });
});

describe('merchant order input boundaries', () => {
  it.each([{ page: '0' }, { limit: '51' }, { active: ['true'] }, { active: 'true', status: 'pending' }, { status: 'made-up' }, { page: '9007199254740991', limit: '50' }])('rejects ambiguous or unbounded filters %j', query => {
    expect(() => parseMerchantOrderFilters(query)).toThrow();
  });
});
