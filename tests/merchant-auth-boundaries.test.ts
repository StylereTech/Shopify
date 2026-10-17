import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn(), create: vi.fn() }));
vi.mock('../src/infrastructure/db/postgres.js', () => ({ createPostgresPool: database.create }));
import { createMerchantRouter, merchantAuthMiddleware } from '../src/api/merchant.js';

const merchantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = 'isolated-unit-test-signing-secret';
const token = (claims: Record<string, unknown> = { sub: merchantId, type: 'merchant' }) => jwt.sign(claims, secret, { expiresIn: '1h' });

describe('merchant authentication failure classification', () => {
  let app: express.Express;
  beforeEach(() => {
    vi.stubEnv('MERCHANT_JWT_SECRET', secret);
    database.query.mockReset(); database.end.mockReset().mockResolvedValue(undefined);
    database.create.mockReset().mockReturnValue(database);
    app = express().get('/protected', merchantAuthMiddleware, (_req, res) => res.json({ reached: true }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('retains credentials on database session-check outages and closes its pool', async () => {
    database.query.mockRejectedValueOnce(new Error('Database unavailable'));
    await request(app).get('/protected').set('Authorization', `Bearer ${token()}`).expect(503);
    expect(database.end).toHaveBeenCalledTimes(1);
  });
  it('classifies profile lookup outage as unavailable, not invalid credentials', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'session' }] }).mockRejectedValueOnce(new Error('Profile unavailable'));
    await request(app).get('/protected').set('Authorization', `Bearer ${token()}`).expect(503);
    expect(database.end).toHaveBeenCalledTimes(1);
  });
  it('accepts only a verified token with a persisted current session and account', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'session' }] }).mockResolvedValueOnce({ rows: [{ id: merchantId, store_name: 'Store A' }] });
    await request(app).get('/protected').set('Authorization', `Bearer ${token()}`).expect(200, { reached: true });
    expect(database.query.mock.calls[0][1][0]).toBe(merchantId);
    expect(database.query.mock.calls[0][1][1]).not.toBe(token());
    expect(database.end).toHaveBeenCalledTimes(1);
  });
  it.each(['missing session', 'deleted account'])('returns authoritative 401 for %s', async reason => {
    database.query.mockResolvedValueOnce({ rows: reason === 'missing session' ? [] : [{ id: 'session' }] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get('/protected').set('Authorization', `Bearer ${token()}`).expect(401);
    expect(database.end).toHaveBeenCalledTimes(1);
  });
  it.each([{ sub: 'not-a-uuid', type: 'merchant' }, { sub: merchantId, type: 'customer' }])('rejects invalid claims before querying the database', async claims => {
    await request(app).get('/protected').set('Authorization', `Bearer ${token(claims)}`).expect(401);
    expect(database.create).not.toHaveBeenCalled();
  });
  it('rejects expired or unsigned tokens before querying', async () => {
    const expired = jwt.sign({ sub: merchantId, type: 'merchant' }, secret, { expiresIn: -1 });
    await request(app).get('/protected').set('Authorization', `Bearer ${expired}`).expect(401);
    await request(app).get('/protected').set('Authorization', 'Bearer invalid').expect(401);
    expect(database.create).not.toHaveBeenCalled();
  });
  it('fails closed without a configured secret even for a token signed with the old development fallback', async () => {
    vi.stubEnv('MERCHANT_JWT_SECRET', '');
    const oldToken = jwt.sign({ sub: merchantId, type: 'merchant' }, 'dev-merchant-jwt-secret-change-in-production');
    await request(app).get('/protected').set('Authorization', `Bearer ${oldToken}`).expect(503);
    expect(database.create).not.toHaveBeenCalled();
  });
  it('cannot register or log in without signing configuration', async () => {
    vi.stubEnv('MERCHANT_JWT_SECRET', '');
    app.use(express.json(), createMerchantRouter());
    await request(app).post('/merchant/auth/register').send({ email: 'audit@example.test', password: 'test-password', store_name: 'Audit store' }).expect(503);
    await request(app).post('/merchant/auth/login').send({ email: 'audit@example.test', password: 'test-password' }).expect(503);
    expect(database.create).not.toHaveBeenCalled();
  });
});
