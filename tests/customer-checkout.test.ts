import request from 'supertest';
import { describe,it,expect,vi } from 'vitest';
import { draft,fixture,origin } from './customer-checkout-fixtures.js';
import { prepareCheckoutIntent } from '../src/domain/customer-payment.js';

describe('guest checkout ownership and recovery',()=>{
  it('issues only a hashed capability, reuses the session and rejects origin/cookie rotation',async()=>{
    const f=fixture();const a=await f.login();const b=await f.login();
    const session=[...f.repository.sessions.values()][0];expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(session)).not.toContain(a.cookie.split('=')[1]);
    await request(f.app).post('/api/customer/session').set('Cookie',a.cookie).set('Origin',origin).send({}).expect(200);
    await request(f.app).post('/api/orders/create').set(f.headers(a)).set('Origin','https://attacker.test').send(draft()).expect(403);
    await request(f.app).post('/api/orders/create').set(f.headers(a)).set('Cookie',b.cookie).send(draft()).expect(409);
    await request(f.app).get('/api/orders').set('Cookie',a.cookie).expect(409);
    await request(f.app).get('/api/orders').expect(401);
    await request(f.app).delete('/api/customer/session').set(f.headers(a)).send({}).expect(204);
    await request(f.app).get('/api/orders').set(f.headers(a)).expect(401);
  });
  it('makes simultaneous create and lost-response recovery return the same owned record',async()=>{
    const f=fixture();const a=await f.login();const input=draft();
    const [one,two]=await Promise.all([1,2].map(()=>request(f.app).post('/api/orders/create').set(f.headers(a)).send(input)));
    expect([one.status,two.status].sort()).toEqual([200,201]);expect(one.body.id).toBe(two.body.id);expect(f.repository.orders.size).toBe(1);
    const recovered=await request(f.app).get(`/api/orders/requests/${input.requestId}`).set(f.headers(a)).expect(200);
    expect(recovered.body).toMatchObject({guestId:a.guestId,requestId:input.requestId,id:one.body.id,amountCents:1186,currency:'usd'});
    await request(f.app).post('/api/orders/create').set(f.headers(a)).send({...input,notes:'Changed'}).expect(409);
  });
  it('scopes every detail/payment/tracking/chat/history lookup and validates request size/types',async()=>{
    const f=fixture();const a=await f.login();const b=await f.login();const order=await f.create(a);
    for(const suffix of ['', '/tracking','/chat'])await request(f.app).get(`/api/orders/${order.id}${suffix}`).set(f.headers(b)).expect(404);
    await request(f.app).post('/api/payments/intent').set(f.headers(b)).send({orderId:order.id}).expect(404);
    await request(f.app).get(`/api/orders/requests/${order.requestId}`).set(f.headers(b)).expect(404);
    const history=await request(f.app).get('/api/orders?page=1&limit=1').set(f.headers(b)).expect(200);expect(history.body.orders).toEqual([]);expect(history.body.guestId).toBe(b.guestId);
    await request(f.app).get('/api/orders?limit=100000').set(f.headers(a)).expect(400);
    await request(f.app).post('/api/orders/create').set(f.headers(a)).send({...draft(),notes:'x'.repeat(1001)}).expect(400);
    await request(f.app).post('/api/orders/create').set(f.headers(a)).send({...draft(),amount:0.01}).expect(400);
  });
  it('returns an explicit unavailable chat and no fabricated delivery/payment events',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);
    const chat=await request(f.app).get(`/api/orders/${order.id}/chat`).set(f.headers(a)).expect(200);expect(chat.body).toMatchObject({guestId:a.guestId,available:false,messages:[]});
    await request(f.app).post(`/api/orders/${order.id}/chat`).set(f.headers(a)).send({sender:'driver',message:'Fake'}).expect(503);
    const track=await request(f.app).get(`/api/orders/${order.id}/tracking`).set(f.headers(a)).expect(200);expect(track.body.timeline).toHaveLength(1);expect(track.body.timeline[0].description).toContain('not been confirmed');expect(track.body.providerTrackingUrl).toBeUndefined();expect(track.body.estimatedMinutes).toBeUndefined();
  });
  it('returns503 for storage outage rather than revoking a valid capability',async()=>{
    const f=fixture();const a=await f.login();vi.spyOn(f.repository,'findSession').mockRejectedValue(new Error('unavailable'));
    const res=await request(f.app).get('/api/orders').set(f.headers(a)).expect(503);expect(res.headers['set-cookie']).toBeUndefined();
  });
  it('normalizes US contact numbers and replays equivalent formatting under the same request',async()=>{
    const f=fixture();const session=await f.login();const input=draft();input.contact.phone='(214) 555-1234';
    const first=await f.create(session,input);expect(first.contact.phone).toBe('+12145551234');
    const replay=await request(f.app).post('/api/orders/create').set(f.headers(session)).send({...input,contact:{...input.contact,phone:'+1 (214) 555-1234'}}).expect(200);
    expect(replay.body.id).toBe(first.id);expect(f.repository.orders.size).toBe(1);
  });
  it.each(['+442071234567','+33123456789','(((((((((( '])('rejects non-US or nonnumeric phone %s before saving',async phone=>{
    const f=fixture();const session=await f.login();const input=draft();
    await request(f.app).post('/api/orders/create').set(f.headers(session)).send({...input,contact:{...input.contact,phone}}).expect(400);
    expect(f.repository.orders.size).toBe(0);
  });
});
describe('server authoritative customer payment',()=>{
  it('rejects caller amount and serializes repeated intent initialization to one stored Stripe PI',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);
    await request(f.app).post('/api/payments/intent').set(f.headers(a)).send({orderId:order.id,amount:0.01}).expect(400);
    const results=await Promise.all([1,2].map(()=>request(f.app).post('/api/payments/intent').set(f.headers(a)).send({orderId:order.id}).expect(200)));
    expect(results[0].body.paymentIntentId).toBe(results[1].body.paymentIntentId);expect(f.stripe.create).toHaveBeenCalledTimes(1);expect(results[0].body.amountCents).toBe(1186);
  });
  it.each(['amount','currency','owner','order','stored','mode','received'])('rejects a mismatched %s payment receipt',async(field)=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);const intent=f.intents.get(pi.paymentIntentId)!;
    if(field==='amount')intent.amount=1;if(field==='currency')intent.currency='eur';if(field==='owner')intent.metadata.guestId='other';if(field==='order')intent.metadata.orderId='other';if(field==='stored')f.repository.orders.get(order.id)!.stripePaymentIntentId='pi_foreign';if(field==='mode')intent.livemode=true;if(field==='received')intent.amount_received=1;
    await request(f.app).post('/api/payments/confirm').set(f.headers(a)).send({orderId:order.id,paymentIntentId:pi.paymentIntentId}).expect(409);
    expect(f.delivery.create).not.toHaveBeenCalled();expect(f.repository.orders.get(order.id)!.paymentStatus).toBe('unpaid');
  });
  it('rejects mock PI bypass and refuses expired uncertain initialization instead of recharging',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);
    await request(f.app).post('/api/payments/confirm').set(f.headers(a)).send({orderId:order.id,paymentIntentId:'pi_mock_probe'}).expect(400);
    f.repository.orders.get(order.id)!.intentStartedAt=new Date(Date.now()-24*60*60*1000);
    await expect(prepareCheckoutIntent(f.repository,order.id,a.guestId,f.stripe)).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'});expect(f.stripe.create).not.toHaveBeenCalled();
  });
  it('confirms repeated paid receipt without a second dispatch or invented assignment',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);
    const results=await Promise.all([1,2].map(()=>request(f.app).post('/api/payments/confirm').set(f.headers(a)).send({orderId:order.id,paymentIntentId:pi.paymentIntentId}).expect(200)));
    expect(f.delivery.create).toHaveBeenCalledTimes(1);expect(results[1].body).toMatchObject({guestId:a.guestId,paymentIntentId:pi.paymentIntentId,paymentStatus:'paid'});expect(f.repository.orders.get(order.id)!.status).toBe('confirmed');
  });
  it('reconciles an uncertain delivery by stable external ID before any second create',async()=>{
    const f=fixture();const a=await f.login();const order=await f.create(a);const pi=await f.pay(a,order.id);const actual=f.delivery.create;
    f.delivery.create=vi.fn(async o=>{await actual(o);throw new Error('response lost');});
    const post=()=>request(f.app).post('/api/payments/confirm').set(f.headers(a)).send({orderId:order.id,paymentIntentId:pi.paymentIntentId});
    const first=await post().expect(200);expect(first.body).toMatchObject({paymentStatus:'paid',dispatched:false,dispatchStatus:'unknown'});
    const second=await post().expect(200);expect(second.body.dispatched).toBe(true);expect(f.delivery.create).toHaveBeenCalledTimes(1);expect(f.delivery.get).toHaveBeenCalledWith(`stylere_${order.id}`);
  });
});
