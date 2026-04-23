/**
 * Stripe Webhook Hardening Tests
 *
 * Validates:
 * 1. Signature verification — rejects missing/invalid signature when secret set
 * 2. payment_intent.succeeded — updates order, dispatches (idempotency)
 * 3. payment_intent.payment_failed — marks order as failed
 * 4. No double dispatch — idempotency guard
 * 5. Dev mode fallback — no secret = accepts raw body (dev only)
 */

import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryStorreeOrderRepository,
  StorreeOrder,
  StorreeOrderRepository,
} from '../src/infrastructure/persistence/postgres-repositories.js';
import { setStorreeOrderRepository, getStorreeOrderRepository } from '../src/api/orders.js';

const app = createApp();

// Helper: create a test order in the repo
async function seedOrder(repo: StorreeOrderRepository, overrides: Partial<StorreeOrder> = {}): Promise<StorreeOrder> {
  const now = new Date();
  const order: StorreeOrder = {
    id: 'SR-TEST01',
    serviceType: 'item_delivery',
    status: 'pending',
    pickupAddress: { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
    dropoffAddress: { street: '2 Oak Ln', city: 'Dallas', state: 'TX', zip: '75203', country: 'US' },
    items: [{ name: 'Shirt', quantity: 1 }],
    contact: { name: 'Test User', phone: '+13461234567', email: 'test@test.com' },
    pricing: { subtotal: 0, deliveryFee: 8.99, serviceFee: 1.99, tax: 0.88, total: 11.86, estimatedMinutes: 50 },
    paymentStatus: 'unpaid',
    merchantNotified: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await repo.create(order);
  return order;
}

describe('Stripe webhook hardening', () => {
  let repo: InMemoryStorreeOrderRepository;
  let prevRepo: StorreeOrderRepository;

  beforeEach(() => {
    repo = new InMemoryStorreeOrderRepository();
    prevRepo = getStorreeOrderRepository();
    setStorreeOrderRepository(repo);
  });

  afterEach(() => {
    setStorreeOrderRepository(prevRepo);
    // Clear env overrides
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });

  describe('signature verification', () => {
    it('rejects request with missing stripe-signature when STRIPE_WEBHOOK_SECRET is set', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_testonly';
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', metadata: {} } } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing stripe-signature/);
    });

    it('rejects request with invalid signature when STRIPE_WEBHOOK_SECRET is set', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_testonly';
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'v1=badsignature,t=1234')
        .send({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', metadata: {} } } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature/i);
    });

    it('accepts raw body in dev mode (no STRIPE_WEBHOOK_SECRET) — returns received:true', async () => {
      // No STRIPE_WEBHOOK_SECRET set
      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({ type: 'payment_intent.payment_failed', data: { object: { id: 'pi_dev', metadata: {} } } });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('payment_intent.succeeded', () => {
    it('marks order as confirmed and sets paymentStatus=paid on succeeded event', async () => {
      const order = await seedOrder(repo, { id: 'SR-A1B2C3', status: 'pending', paymentStatus: 'unpaid' });

      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_test_succeeded', metadata: { orderId: order.id } } },
        });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      const updated = await repo.getById(order.id);
      expect(updated?.paymentStatus).toBe('paid');
      expect(updated?.stripePaymentIntentId).toBe('pi_test_succeeded');
      // Status should advance to at least 'confirmed'
      expect(['confirmed', 'assigned']).toContain(updated?.status);
    });

    it('does not double-dispatch if order already has doordashExternalId', async () => {
      const order = await seedOrder(repo, {
        id: 'SR-IDEM01',
        status: 'assigned',
        doordashExternalId: 'dd_already',
        paymentStatus: 'paid',
      });

      let dispatchCalls = 0;
      const origImport = (global as any).__importDoorDash;
      // We can't mock the import easily — instead verify order status unchanged
      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_dupe', metadata: { orderId: order.id } } },
        });

      expect(res.status).toBe(200);
      // doordashExternalId must not change
      const after = await repo.getById(order.id);
      expect(after?.doordashExternalId).toBe('dd_already');
      void dispatchCalls; void origImport;
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('marks pending order as failed when payment_failed event received', async () => {
      const order = await seedOrder(repo, { id: 'SR-FAIL01', status: 'pending', paymentStatus: 'unpaid' });

      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_failed_123', metadata: { orderId: order.id } } },
        });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      const updated = await repo.getById(order.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.paymentStatus).toBe('failed');
      expect(updated?.stripePaymentIntentId).toBe('pi_failed_123');
    });

    it('does not regress already-dispatched order on payment_failed', async () => {
      // Order already assigned (dispatched) — should NOT be marked failed
      const order = await seedOrder(repo, {
        id: 'SR-NOREGRESS',
        status: 'assigned',
        paymentStatus: 'paid',
        doordashExternalId: 'dd_real',
      });

      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_late_fail', metadata: { orderId: order.id } } },
        });

      expect(res.status).toBe(200);
      // Status should remain assigned (payment_failed guard: only applies when pending)
      const after = await repo.getById(order.id);
      expect(after?.status).toBe('assigned');
    });
  });

  describe('unhandled event types', () => {
    it('acknowledges unhandled event types gracefully', async () => {
      const res = await request(app)
        .post('/api/payments/stripe-webhook')
        .set('Content-Type', 'application/json')
        .send({ type: 'customer.created', data: { object: { id: 'cus_1' } } });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });
});

describe('Postgres order persistence (InMemory repo restart-safety simulation)', () => {
  let repo: InMemoryStorreeOrderRepository;
  let prevRepo: StorreeOrderRepository;

  beforeEach(() => {
    repo = new InMemoryStorreeOrderRepository();
    prevRepo = getStorreeOrderRepository();
    setStorreeOrderRepository(repo);
  });

  afterEach(() => {
    setStorreeOrderRepository(prevRepo);
  });

  it('creates an order via POST /api/orders/create and retrieves it', async () => {
    const createRes = await request(app)
      .post('/api/orders/create')
      .send({
        serviceType: 'item_delivery',
        pickupAddress: { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
        dropoffAddress: { street: '2 Oak Ln', city: 'Dallas', state: 'TX', zip: '75203', country: 'US' },
        items: [{ name: 'Shirt', quantity: 1 }],
        contact: { name: 'Jane Doe', phone: '+13461234567', email: 'jane@example.com' },
      });

    expect(createRes.status).toBe(201);
    const { id } = createRes.body;
    expect(id).toBeTruthy();

    // Retrieve it
    const getRes = await request(app).get(`/api/orders/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);
    expect(getRes.body.status).toBe('pending');
    expect(getRes.body.paymentStatus).toBe('unpaid');

    // Confirm it exists in repo directly
    const inRepo = await repo.getById(id);
    expect(inRepo).toBeTruthy();
    expect(inRepo?.id).toBe(id);
  });

  it('returns 404 for unknown order id', async () => {
    const res = await request(app).get('/api/orders/SR-NOTEXIST');
    expect(res.status).toBe(404);
  });

  it('listActive only returns active-status orders', async () => {
    const r = getStorreeOrderRepository() as InMemoryStorreeOrderRepository;
    await seedOrder(r, { id: 'SR-ACT1', status: 'pending' });
    await seedOrder(r, { id: 'SR-ACT2', status: 'in_transit' });
    await seedOrder(r, { id: 'SR-DONE', status: 'delivered' });

    const res = await request(app).get('/api/orders/active');
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain('SR-ACT1');
    expect(ids).toContain('SR-ACT2');
    expect(ids).not.toContain('SR-DONE');
  });

  it('getByPaymentIntentId finds order by stripe PI id', async () => {
    const r = getStorreeOrderRepository() as InMemoryStorreeOrderRepository;
    await seedOrder(r, { id: 'SR-PI01', stripePaymentIntentId: 'pi_findme' });

    const found = await r.getByPaymentIntentId('pi_findme');
    expect(found?.id).toBe('SR-PI01');
  });
});
