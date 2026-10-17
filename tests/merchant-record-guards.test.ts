import request from 'supertest';
import { describe,it,expect } from 'vitest';
import { draft,fixture } from './customer-checkout-fixtures.js';

describe('customer checkout never books merchant-only records',()=>{
  it.each(['merchant_record','arbitrary_service'])('rejects customer-created service %s',async serviceType=>{
    const f=fixture();const session=await f.login();
    await request(f.app).post('/api/orders/create').set(f.headers(session)).send({...draft(),serviceType}).expect(400);expect(f.repository.orders.size).toBe(0);
  });
  it('excludes legacy unowned and merchant-only records across read/payment routes',async()=>{
    const f=fixture();const session=await f.login();const order=await f.create(session);f.repository.orders.get(order.id)!.serviceType='merchant_record';
    for(const id of [order.id,'legacy_unowned']){
      for(const suffix of ['','/tracking','/chat'])await request(f.app).get(`/api/orders/${id}${suffix}`).set(f.headers(session)).expect(404);
      await request(f.app).post('/api/payments/intent').set(f.headers(session)).send({orderId:id}).expect(404);
      await request(f.app).post('/api/payments/confirm').set(f.headers(session)).send({orderId:id,paymentIntentId:'pi_prohibited'}).expect(404);
    }
    const history=await request(f.app).get('/api/orders').set(f.headers(session)).expect(200);expect(history.body.orders).toEqual([]);expect(f.stripe.create).not.toHaveBeenCalled();expect(f.delivery.create).not.toHaveBeenCalled();
  });
  it('does not create guest ownership or trigger dispatch from merchant webhook metadata',async()=>{
    const f=fixture();const session=await f.login();const order=await f.create(session);f.repository.orders.get(order.id)!.serviceType='merchant_record';
    const response=await request(f.app).post('/api/payments/stripe-webhook').set('stripe-signature','valid').send({id:'evt_merchant',type:'payment_intent.succeeded',data:{object:{id:'pi_prohibited',metadata:{orderId:order.id,source:'stylere-shopify-app'}}}}).expect(200);
    expect(response.body.ignored).toBe('unowned_order');expect(f.repository.orders.get(order.id)!.paymentStatus).toBe('unpaid');expect(f.delivery.create).not.toHaveBeenCalled();
  });
});
