import { afterEach,describe,expect,it,vi } from 'vitest';
import { DoorDashDriveClient } from '../src/infrastructure/doordash/doordash-client.js';
import { safeProviderTrackingUrl } from '../src/domain/customer-dispatch.js';
import { prepareCheckoutIntent } from '../src/domain/customer-payment.js';
import { fixture } from './customer-checkout-fixtures.js';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const client=()=>new DoorDashDriveClient({developerId:'fixture',keyId:'fixture',signingSecret:Buffer.from('test only').toString('base64'),timeoutMs:20});
describe('bounded provider responses',()=>{
  it.each(['create','get'])('bounds %s through a hanging body even when the body ignores abort',async operation=>{
    vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})));
    const pending=operation==='create'?client().createDelivery({}):client().getDelivery('fixture');
    const asserted=expect(pending).rejects.toMatchObject({statusCode:408});await vi.advanceTimersByTimeAsync(21);await asserted;
  });
  it('bounds a fetch that ignores cancellation and rejects HTTP errors before reconciliation',async()=>{
    vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));const pending=client().getDelivery('fixture');const asserted=expect(pending).rejects.toMatchObject({statusCode:408});await vi.advanceTimersByTimeAsync(21);await asserted;
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:403,json:async()=>({})})));await expect(client().getDelivery('fixture')).rejects.toMatchObject({statusCode:403});
  });
  it('allows only HTTPS DoorDash provider map links',()=>{
    expect(safeProviderTrackingUrl('https://track.doordash.com/order')).toBe('https://track.doordash.com/order');
    for(const url of ['https://doordash.com.attacker.test/order','https://attacker.test','http://doordash.com','javascript:alert(1)','https://user@doordash.com'])expect(safeProviderTrackingUrl(url)).toBeUndefined();
  });
  it('releases a hung Stripe operation and recovers its uncertain result with the same durable key',async()=>{
    const f=fixture();const session=await f.login();const order=await f.create(session);
    const realCreate=f.stripe.create;
    f.stripe.create=vi.fn().mockImplementationOnce(async(o,key)=>{await realCreate(o,key);return new Promise(()=>{});}).mockImplementation(realCreate);
    vi.useFakeTimers();
    const pending=prepareCheckoutIntent(f.repository,order.id,session.guestId,f.stripe);
    const asserted=expect(pending).rejects.toMatchObject({code:'PAYMENT_OUTCOME_UNKNOWN'});
    await vi.advanceTimersByTimeAsync(12001);await asserted;
    expect(f.repository.orders.get(order.id)!.intentStartedAt).toBeDefined();expect(f.repository.orders.get(order.id)!.stripePaymentIntentId).toBeUndefined();
    const recovered=await prepareCheckoutIntent(f.repository,order.id,session.guestId,f.stripe);
    expect(recovered.paymentIntentId).toBe('pi_test1');expect(f.intents.size).toBe(1);
    const calls=vi.mocked(f.stripe.create).mock.calls;expect(calls[0][1]).toBe(calls[1][1]);
  });
});
