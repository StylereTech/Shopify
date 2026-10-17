import request from 'supertest';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { fixture } from './customer-checkout-fixtures.js';
import { configuredStripe } from '../src/domain/customer-payment.js';

afterEach(()=>vi.unstubAllEnvs());
describe('fail-closed signed payment webhook',()=>{
  it('rejects missing webhook configuration instead of accepting unsigned events',async()=>{
    vi.stubEnv('STRIPE_WEBHOOK_SECRET','');const f=fixture({webhookSecret:()=>undefined});
    await request(f.app).post('/api/payments/stripe-webhook').send({type:'payment_intent.succeeded'}).expect(503);
  });
  it('rejects missing and invalid signatures using the actual Stripe verifier without API calls',async()=>{
    vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fixture');const f=fixture({stripe:configuredStripe});
    await request(f.app).post('/api/payments/stripe-webhook').send({type:'customer.created'}).expect(400);
    await request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','t=1234,v1=bad').send({type:'customer.created'}).expect(400);
  });
  it('fails closed without Stripe credentials; no development fake success',()=>{
    vi.stubEnv('STRIPE_SECRET_KEY','');expect(()=>configuredStripe()).toThrow('Payments are not configured');
  });
  it('settles signed matching payment and duplicate events without double dispatch',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);
    const event={id:'evt_match',type:'payment_intent.succeeded',data:{object:f.intents.get(pi.paymentIntentId)}};
    const post=()=>request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','valid').send(event);
    await Promise.all([post().expect(200),post().expect(200)]);
    expect(f.repository.orders.get(order.id)).toMatchObject({paymentStatus:'paid',stripePaymentIntentId:pi.paymentIntentId,dispatchStatus:'submitted'});expect(f.delivery.create).toHaveBeenCalledTimes(1);
  });
  it('refuses a foreign PI and retains pending state on database failure so Stripe can retry',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);const intent=f.intents.get(pi.paymentIntentId)!;
    const post=(value:unknown)=>request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','valid').send({id:'evt_match',type:'payment_intent.succeeded',data:{object:value}});
    await post({...intent,id:'pi_foreign'}).expect(409);expect(f.delivery.create).not.toHaveBeenCalled();
    const spy=vi.spyOn(f.repository,'locked').mockRejectedValueOnce(new Error('Database down'));
    await post(intent).expect(503);expect(f.repository.orders.get(order.id)!.paymentStatus).toBe('unpaid');spy.mockRestore();
    await post(intent).expect(200);expect(f.repository.orders.get(order.id)!.paymentStatus).toBe('paid');
  });
  it('does not regress a paid terminal order on a late failure or repeated success',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);
    const stored=f.repository.orders.get(order.id)!;stored.paymentStatus='paid';stored.status='delivered';stored.dispatchStatus='submitted';
    for(const type of ['payment_intent.payment_failed','payment_intent.succeeded'])await request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','valid').send({id:'evt_late',type,data:{object:f.intents.get(pi.paymentIntentId)}}).expect(200);
    expect(f.repository.orders.get(order.id)).toMatchObject({paymentStatus:'paid',status:'delivered'});expect(f.delivery.create).not.toHaveBeenCalled();
  });
  it('retries an event whose durable intent binding is not yet available',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);
    f.repository.orders.get(order.id)!.stripePaymentIntentId=undefined;
    await request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','valid').send({id:'evt_early',type:'payment_intent.succeeded',data:{object:f.intents.get(pi.paymentIntentId)}}).expect(503);
    expect(f.delivery.create).not.toHaveBeenCalled();
  });
});
