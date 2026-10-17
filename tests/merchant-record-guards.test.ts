import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrdersRouter, createPaymentsRouter, getStorreeOrderRepository, setStorreeOrderRepository } from '../src/api/orders.js';
import { InMemoryStorreeOrderRepository, type StorreeOrder, type StorreeOrderRepository } from '../src/infrastructure/persistence/postgres-repositories.js';

describe('record-only merchant orders stay private and unbookable', () => {
  let repository: InMemoryStorreeOrderRepository;
  let previous: StorreeOrderRepository;
  let app: express.Express;
  beforeEach(async () => {
    previous = getStorreeOrderRepository();
    repository = new InMemoryStorreeOrderRepository();
    setStorreeOrderRepository(repository);
    app = express().use(express.json()).use('/api', createOrdersRouter()).use('/api', createPaymentsRouter());
    const now = new Date();
    const base: StorreeOrder = { id: 'private-record', serviceType: 'merchant_record', status: 'pending', pickupAddress: {},
      dropoffAddress: { formatted: 'Private customer address' }, items: [], contact: { name: 'Private customer' }, pricing: {},
      paymentStatus: 'unpaid', merchantNotified: false, createdAt: now, updatedAt: now };
    await repository.create(base);
    await repository.create({ ...base, id: 'customer-order', serviceType: 'item_delivery' });
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
  });
  afterEach(() => { setStorreeOrderRepository(previous); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('excludes merchant requests from public active, detail, tracking and chat', async () => {
    const active = await request(app).get('/api/orders/active').expect(200);
    expect(active.body.map((row: { id: string }) => row.id)).toEqual(['customer-order']);
    for (const suffix of ['', '/tracking', '/chat']) await request(app).get(`/api/orders/private-record${suffix}`).expect(404);
    await request(app).post('/api/orders/private-record/chat').send({ message: 'Do not save' }).expect(404);
    await request(app).get('/api/orders/customer-order').expect(200);
    await request(app).post('/api/orders/customer-order/chat').send({ message: 'Customer message' }).expect(201);
  });

  it('rejects payment intent and confirmation before any payment mutation', async () => {
    const update = vi.spyOn(repository, 'update');
    await request(app).post('/api/payments/intent').send({ orderId: 'private-record', amount: 1 }).expect(409);
    await request(app).post('/api/payments/confirm').send({ orderId: 'private-record', paymentIntentId: 'pi_mock_probe' }).expect(409);
    expect(update).not.toHaveBeenCalled();
    expect(await repository.getById('private-record')).toMatchObject({ status: 'pending', paymentStatus: 'unpaid', merchantNotified: false });
  });

  it('returns a bounded unavailable response if a customer record cannot be checked', async () => {
    vi.spyOn(repository, 'getById').mockRejectedValue(new Error('Database unavailable'));
    for (const suffix of ['', '/tracking', '/chat']) await request(app).get(`/api/orders/customer-order${suffix}`).expect(503);
    await request(app).post('/api/orders/customer-order/chat').send({ message: 'Do not save' }).expect(503);
  });

  it.each(['payment_intent.succeeded', 'payment_intent.payment_failed'])('ignores %s for record-only requests', async type => {
    const update = vi.spyOn(repository, 'update');
    const result = await request(app).post('/api/payments/stripe-webhook').send({ type, data: { object: { id: 'pi_probe', metadata: { orderId: 'private-record' } } } }).expect(200);
    expect(result.body).toEqual({ received: true, ignored: 'record_only' });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['merchant_record', 'arbitrary_service'])('rejects customer-created service %s', async serviceType => {
    const create = vi.spyOn(repository, 'create');
    await request(app).post('/api/orders/create').send({ serviceType, pickupAddress: {}, dropoffAddress: {}, contact: {} }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});
