import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, createDefaultInMemoryDeps } from '../src/app.js';
import { InMemoryDeliveryJobRepository } from '../src/infrastructure/persistence/in-memory-repositories.js';
import { DeliveryJob } from '../src/domain/types.js';

function makeJob(overrides: Partial<DeliveryJob> = {}): DeliveryJob {
  return {
    id: 'job-1',
    shopifyOrderId: 'order-123',
    merchantId: 'merchant-1',
    serviceLevel: 'one_hour',
    status: 'accepted',
    dispatchId: 'disp-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe('delivery status webhook', () => {
  let deps: ReturnType<typeof createDefaultInMemoryDeps>;
  let app: ReturnType<typeof createApp>;
  let jobs: InMemoryDeliveryJobRepository;

  beforeEach(() => {
    deps = createDefaultInMemoryDeps();
    jobs = deps.jobs as InMemoryDeliveryJobRepository;
    app = createApp({ deps });
  });

  it('updates job status on valid status webhook', async () => {
    await jobs.create(makeJob());

    const res = await request(app)
      .post('/storree/webhooks/delivery-status')
      .send({
        dispatchId: 'disp-abc',
        externalReference: 'order-123',
        status: 'picked_up'
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('picked_up');

    const updated = await jobs.getByDispatchId('disp-abc');
    expect(updated?.status).toBe('picked_up');
  });

  it('rejects unknown provider status (fail-closed)', async () => {
    await jobs.create(makeJob());

    const res = await request(app)
      .post('/storree/webhooks/delivery-status')
      .send({
        dispatchId: 'disp-abc',
        externalReference: 'order-123',
        status: 'bogus_unknown_status'
      });

    expect(res.status).toBe(422);
    // Job should remain unchanged
    const job = await jobs.getByDispatchId('disp-abc');
    expect(job?.status).toBe('accepted');
  });

  it('silently skips status regressions', async () => {
    await jobs.create(makeJob({ status: 'delivered' }));

    const res = await request(app)
      .post('/storree/webhooks/delivery-status')
      .send({
        dispatchId: 'disp-abc',
        externalReference: 'order-123',
        status: 'picked_up' // regression
      });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);

    const job = await jobs.getByDispatchId('disp-abc');
    expect(job?.status).toBe('delivered'); // unchanged
  });

  it('returns 404 when job not found', async () => {
    const res = await request(app)
      .post('/storree/webhooks/delivery-status')
      .send({
        dispatchId: 'nonexistent',
        externalReference: 'nonexistent',
        status: 'delivered'
      });

    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid payload schema', async () => {
    const res = await request(app)
      .post('/storree/webhooks/delivery-status')
      .send({ bad: 'payload' });

    expect(res.status).toBe(400);
  });
});
