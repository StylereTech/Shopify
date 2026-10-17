import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomerTransport, CustomerRequestError } from '../src/api/customerSession';
import { createCustomerSessionController, CUSTOMER_SESSION_NOTICE } from '../src/context/customerSessionController';
import { createOrderStore } from '../src/store/orderStore';
import { customerApi } from '../src/api/client';
import { customerDraftPayload, readCustomerOrder, readCustomerOrderPage, readCustomerIntent, readCustomerTracking, readCustomerPaymentReceipt } from '../src/lib/customerContracts';

const guest = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const address = { street:'1 Main St', city:'Dallas', state:'TX', zip:'75201', country:'US' };
const draft = {serviceType:'logo_pickup' as const,pickupAddress:address,dropoffAddress:address,contact:{name:'Fixture Customer',email:'customer@example.test',phone:'+12145550100'},items:[{name:'Package',quantity:1}]};
const order = (patch: Record<string,unknown> = {}) => ({...draft,id:'SR-fixture-order',guestId:guest,requestId,status:'pending',paymentStatus:'unpaid',amountCents:970,currency:'usd',pricing:{subtotal:0,deliveryFee:6.99,serviceFee:1.99,tax:0.72,total:9.70,estimatedMinutes:35},createdAt:'2026-10-17T12:00:00Z',updatedAt:'2026-10-17T12:00:00Z',...patch});
const sessionData = (guestId = guest) => ({guestId,expiresAt:new Date(Date.now()+60000).toISOString()});
const storage = () => { const values = new Map<string,string>(); return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}}; };
const deferred = <T,>() => {let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const controllers: ReturnType<typeof createCustomerSessionController>[] = [];
function controller(options: Parameters<typeof createCustomerSessionController>[0]) {const result=createCustomerSessionController(options);controllers.push(result);return result;}
afterEach(()=>{controllers.splice(0).forEach(value=>value.dispose());vi.useRealTimers();});

describe('customer transport',()=>{
  it('uses same-origin cookie and captured public owner, stripping alternate credentials',async()=>{
    const fetcher=vi.fn(async()=>Response.json({ok:true}));
    await createCustomerTransport({fetcher})('/orders/create',{method:'POST',body:'{}',credentials:'include',headers:{Authorization:'Bearer wrong','X-Stylere-Guest-Id':other}},{guestId:guest});
    const [url,init]=fetcher.mock.calls[0];expect(url).toBe('/shopify/api/orders/create');expect(init).toMatchObject({credentials:'same-origin',redirect:'error',cache:'no-store'});
    expect(new Headers(init?.headers).get('X-Stylere-Guest-Id')).toBe(guest);expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
  it.each(['https://evil.test/orders','//evil.test/orders','/orders/../merchant','/orders/%2e%2e/merchant','/orders/%2fapi','/orders/a#fragment','/customer/session/extra','/payments/intent?x=1'])('rejects alternate destination %s',async(path)=>{
    const fetcher=vi.fn();await expect(createCustomerTransport({fetcher})(path)).rejects.toMatchObject({code:'INVALID_PATH'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves HTTP denial without exposing HTML or raw error data',async()=>{
    await expect(createCustomerTransport({fetcher:vi.fn(async()=>new Response('sensitive detail',{status:401}))})('/orders')).rejects.toMatchObject({status:401});
  });
  it.each(['PAYMENT_RECONCILIATION_REQUIRED','PAYMENT_OUTCOME_UNKNOWN','ORDER_RETIRED'])('preserves actionable safe error code %s without reflecting provider text',async(code)=>{
    const request=createCustomerTransport({fetcher:vi.fn(async()=>Response.json({code,error:'private upstream body'},{status:code==='ORDER_RETIRED'?410:409}))});
    try { await request('/payments/intent',{method:'POST',body:'{}'});throw new Error('Expected failure'); }
    catch(error){expect(error).toBeInstanceOf(CustomerRequestError);expect(error).toMatchObject({code});expect((error as Error).message).not.toContain('private upstream');if(code==='PAYMENT_RECONCILIATION_REQUIRED')expect((error as Error).message).toMatch(/support/);}
  });
  it('bounds a hung request that ignores abort and never repeats a write',async()=>{
    vi.useFakeTimers();const fetcher=vi.fn(()=>new Promise<Response>(()=>{}));const request=createCustomerTransport({fetcher,timeoutMs:50});
    const result=expect(request('/orders/create',{method:'POST',body:'{}'})).rejects.toMatchObject({code:'TIMEOUT'});
    await vi.advanceTimersByTimeAsync(51);await result;expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('keeps the deadline through body decoding',async()=>{
    vi.useFakeTimers();const response=Response.json({});vi.spyOn(response,'json').mockImplementation(()=>new Promise(()=>{}));
    const result=expect(createCustomerTransport({fetcher:vi.fn(async()=>response),timeoutMs:50})('/orders')).rejects.toMatchObject({code:'TIMEOUT'});
    await vi.advanceTimersByTimeAsync(51);await result;
  });
  it('rejects a late body after owner changes',async()=>{
    let current=true;const body=deferred<unknown>();const response=Response.json({});vi.spyOn(response,'json').mockImplementation(()=>body.promise);
    const result=createCustomerTransport({fetcher:vi.fn(async()=>response)})('/orders',{}, {current:()=>current});
    await Promise.resolve();current=false;body.resolve({orders:[]});await expect(result).rejects.toMatchObject({code:'STALE_SESSION'});
  });
  it('supports only the session end empty response',async()=>{
    const request=createCustomerTransport({fetcher:vi.fn(async()=>new Response(null,{status:204}))});
    expect(await request('/customer/session',{method:'DELETE'})).toBe(null);await expect(request('/orders')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  });
});
describe('customer session controller',()=>{
  it('single-flights initialization and verifies the cookie before exposing owner',async()=>{
    const response=deferred<unknown>();const transport=vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(sessionData());const bindGuest=vi.fn();const auth=controller({transport,bindGuest});
    const first=auth.retry();const second=auth.retry();expect(first).toBe(second);expect(transport).toHaveBeenCalledTimes(1);expect(bindGuest).not.toHaveBeenCalled();
    response.resolve(sessionData());await first;expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[1][2].guestId).toBe(guest);expect(bindGuest).toHaveBeenCalledWith(guest);expect(auth.getSnapshot()).toMatchObject({status:'ready',guestId:guest});
  });
  it('does not erase saved draft ownership on transient recovery failure',async()=>{
    const bindGuest=vi.fn();const auth=controller({transport:vi.fn().mockRejectedValue(new CustomerRequestError('Unavailable',503)),bindGuest});await auth.retry();expect(auth.getSnapshot().status).toBe('error');expect(bindGuest).not.toHaveBeenCalled();
  });
  it('hides obsolete data and rejects old responses after another-tab notice',async()=>{
    const events=new EventTarget();const delayed=deferred<unknown>();const transport=vi.fn().mockResolvedValueOnce(sessionData()).mockResolvedValueOnce(sessionData()).mockReturnValueOnce(delayed.promise);const auth=controller({transport,bindGuest:vi.fn(),events});
    auth.start();await auth.retry();const captured=auth.capture();const result=captured.request('/orders');
    const event=new Event('storage');Object.assign(event,{key:CUSTOMER_SESSION_NOTICE,newValue:JSON.stringify({guestId:other})});events.dispatchEvent(event);
    delayed.resolve({guestId:guest,orders:[]});await expect(result).rejects.toMatchObject({code:'STALE_SESSION'});expect(auth.getSnapshot()).toMatchObject({status:'error',guestId:null});
  });
  it('ignores another-tab readiness notice for the same ready owner',async()=>{
    const events=new EventTarget();const auth=controller({transport:vi.fn().mockResolvedValue(sessionData()),bindGuest:vi.fn(),events});auth.start();await auth.retry();const key=auth.getSnapshot().key;
    const event=new Event('storage');Object.assign(event,{key:CUSTOMER_SESSION_NOTICE,newValue:JSON.stringify({guestId:guest})});events.dispatchEvent(event);expect(auth.getSnapshot().key).toBe(key);
  });
  it('invalidates a ready session on an authoritative expiry',async()=>{
    const transport=vi.fn().mockResolvedValueOnce(sessionData()).mockResolvedValueOnce(sessionData()).mockRejectedValue(new CustomerRequestError('Expired',401,'GUEST_SESSION_EXPIRED'));const auth=controller({transport,bindGuest:vi.fn()});await auth.retry();await expect(auth.capture().request('/orders')).rejects.toMatchObject({status:401});expect(auth.getSnapshot().status).toBe('error');
  });
  it('does not let a delayed session end clear a replacement session',async()=>{
    const events=new EventTarget();const ending=deferred<unknown>();const bindGuest=vi.fn();const transport=vi.fn().mockResolvedValueOnce(sessionData()).mockResolvedValueOnce(sessionData()).mockReturnValueOnce(ending.promise);const auth=controller({transport,bindGuest,events});auth.start();await auth.retry();const result=auth.end();
    const event=new Event('storage');Object.assign(event,{key:CUSTOMER_SESSION_NOTICE,newValue:JSON.stringify({guestId:other})});events.dispatchEvent(event);ending.resolve(null);await expect(result).rejects.toMatchObject({code:'STALE_SESSION'});expect(bindGuest).not.toHaveBeenCalledWith(null);
  });
  it('ends a confirmed session with captured identity and clears its draft binding',async()=>{
    const bindGuest=vi.fn();const transport=vi.fn().mockResolvedValueOnce(sessionData()).mockResolvedValueOnce(sessionData()).mockResolvedValue(null);const auth=controller({transport,bindGuest});await auth.retry();await auth.end();expect(transport.mock.calls[2][2].guestId).toBe(guest);expect(bindGuest).toHaveBeenLastCalledWith(null);expect(auth.getSnapshot().status).toBe('error');
  });
  it('rejects an ignored-abort response after disposal',async()=>{
    const late=deferred<unknown>();const transport=vi.fn().mockResolvedValueOnce(sessionData()).mockResolvedValueOnce(sessionData()).mockReturnValueOnce(late.promise);const auth=controller({transport,bindGuest:vi.fn()});await auth.retry();const scope=auth.capture();const result=scope.request('/orders');auth.dispose();expect(scope.current()).toBe(false);late.resolve({orders:[]});await expect(result).rejects.toMatchObject({code:'STALE_SESSION'});
  });
});
function prepared() {const saved=storage();const store=createOrderStore(saved);store.getState().bindGuest(guest);store.getState().setServiceType(draft.serviceType);store.getState().setPickupAddress(address);store.getState().setDropoffAddress(address);store.getState().setContact(draft.contact);store.getState().setItems(draft.items);return{saved,store};}
describe('recoverable checkout store',()=>{
  it('durably reserves one request before submission and restores the exact request on reload',()=>{
    const {saved,store}=prepared();const first=store.getState().prepareCheckout();expect(store.getState().prepareCheckout()).toEqual(first);const restored=createOrderStore(saved);expect(restored.getState().checkoutRequest).toEqual({...first,phase:'unknown'});expect(restored.getState().prepareCheckout().requestId).toBe(first.requestId);
  });
  it('blocks submission if durable request storage fails',()=>{
    const {saved,store}=prepared();saved.setItem=()=>{throw new Error('Full');};expect(()=>store.getState().prepareCheckout()).toThrow(/save/);expect(store.getState().checkoutRequest).toBe(null);
  });
  it('refuses edits and clearing while an uncertain creation can still succeed',()=>{
    const {store}=prepared();const request=store.getState().prepareCheckout();store.getState().markCheckoutUncertain(request.requestId);expect(()=>store.getState().setNotes('Changed')).toThrow(/saved request/);expect(store.getState().clearDraft()).toBe(false);expect(store.getState().checkoutRequest?.requestId).toBe(request.requestId);
  });
  it('accepts only matching owner, request, revision and submitted payload',()=>{
    const {store}=prepared();const request=store.getState().prepareCheckout();const receipt=readCustomerOrder(order({requestId:request.requestId}),guest);
    expect(()=>store.getState().acceptCheckout({...receipt,guestId:other},request.requestId,request.revision)).toThrow();expect(()=>store.getState().acceptCheckout({...receipt,notes:'Changed'},request.requestId,request.revision)).toThrow();expect(store.getState().acceptCheckout(receipt,request.requestId,request.revision+1)).toBe(false);
    expect(store.getState().acceptCheckout(receipt,request.requestId,request.revision)).toBe(true);expect(store.getState().draft.orderId).toBe(receipt.id);expect(store.getState().checkoutRequest).toBe(null);
  });
  it('rejects an old receipt after the cookie owner changes',()=>{
    const {store}=prepared();const request=store.getState().prepareCheckout();store.getState().bindGuest(other);expect(store.getState().acceptCheckout(readCustomerOrder(order({requestId:request.requestId}),guest),request.requestId,request.revision)).toBe(false);expect(store.getState().draft).toEqual({});
  });
  it('preserves recovery when writing the successful receipt fails',()=>{
    const {saved,store}=prepared();const request=store.getState().prepareCheckout();saved.setItem=()=>{throw new Error('Full');};expect(()=>store.getState().acceptCheckout(readCustomerOrder(order({requestId:request.requestId}),guest),request.requestId,request.revision)).toThrow();expect(store.getState().checkoutRequest?.requestId).toBe(request.requestId);
  });
  it('rejects corrupted saved order identities and mismatched pending drafts',()=>{
    const {saved,store}=prepared();store.getState().prepareCheckout();const key=[...saved.values.keys()][0];const state=JSON.parse(saved.getItem(key)!);state.checkoutRequest.payload.notes='Changed';saved.setItem(key,JSON.stringify(state));expect(createOrderStore(saved).getState().storageIssue).not.toBe(null);
  });
  it('invalidates order/payment state when an editable draft changes',()=>{
    const {store}=prepared();const request=store.getState().prepareCheckout();store.getState().acceptCheckout(readCustomerOrder(order({requestId:request.requestId}),guest),request.requestId,request.revision);store.getState().setPaymentIntentId('pi_fixture','SR-fixture-order',request.revision);store.getState().setNotes('New instructions');expect(store.getState().draft.orderId).toBeUndefined();expect(store.getState().draft.paymentIntentId).toBeUndefined();expect(store.getState().currentOrder).toBe(null);
  });
});
describe('authoritative customer response contracts',()=>{
  it('normalizes optional blank input and rejects incomplete addresses/contact/item bounds',()=>{
    expect(customerDraftPayload({...draft,notes:' ',pickupAddress:{...address,unit:''},contact:{...draft.contact,phone:'(214) 555-0100'}})).toEqual(customerDraftPayload(draft));
    for(const patch of [{pickupAddress:{...address,street:' '}},{contact:{...draft.contact,email:'bad'}},{items:[{name:'Package',quantity:101}]},{notes:'x'.repeat(1001)}])expect(()=>customerDraftPayload({...draft,...patch})).toThrow();
  });
  it('rejects mismatched identities, malformed totals and unknown state',()=>{
    for(const patch of [{guestId:other},{amountCents:1},{currency:'eur'},{status:'success'},{pricing:{...order().pricing,total:NaN}},{pricing:{...order().pricing,tax:0.01}}])expect(()=>readCustomerOrder(order(patch),guest)).toThrow();
  });
  it('rejects history pages with wrong scope, duplicate identities or inconsistent totals',()=>{
    const page={guestId:guest,orders:[order()],pagination:{page:1,limit:20,total:1,pages:1}};expect(readCustomerOrderPage(page,guest,1).orders).toHaveLength(1);
    for(const value of [{...page,guestId:other},{...page,orders:[order(),order()]},{...page,pagination:{...page.pagination,pages:2}}])expect(()=>readCustomerOrderPage(value,guest,1)).toThrow();
  });
  it('binds payment form and paid receipt to the order and intent',()=>{
    const intent={guestId:guest,orderId:'SR-fixture-order',paymentIntentId:'pi_fixture',clientSecret:'pi_fixture_secret_fixture',amountCents:970,currency:'usd',status:'requires_payment_method'};expect(readCustomerIntent(intent,guest,intent.orderId).amountCents).toBe(970);
    for(const patch of [{paymentIntentId:'pi_mock_fake'},{clientSecret:'pi_other_secret_fixture'},{status:'paid'},{guestId:other}])expect(()=>readCustomerIntent({...intent,...patch},guest,intent.orderId)).toThrow();
    const receipt={success:true,guestId:guest,orderId:intent.orderId,paymentIntentId:intent.paymentIntentId,paymentStatus:'paid',dispatched:false};expect(readCustomerPaymentReceipt(receipt,guest,intent.orderId,intent.paymentIntentId).dispatched).toBe(false);expect(()=>readCustomerPaymentReceipt({...receipt,paymentStatus:'processing'},guest,intent.orderId,intent.paymentIntentId)).toThrow();
  });
  it('distinguishes recorded state from live provider state and rejects foreign map links',()=>{
    const tracking={guestId:guest,orderId:'SR-fixture-order',status:'confirmed',paymentStatus:'paid',dispatchStatus:'pending',availability:'recorded',timeline:[]};expect(readCustomerTracking(tracking,guest,tracking.orderId).availability).toBe('recorded');
    expect(readCustomerTracking({...tracking,providerTrackingUrl:'https://www.doordash.com/track/fixture'},guest,tracking.orderId).providerTrackingUrl).toBe('https://www.doordash.com/track/fixture');
    for(const providerTrackingUrl of ['https://evil.test/','https://doordash.com.evil.test/','javascript:alert(1)','https://user@doordash.com/'])expect(()=>readCustomerTracking({...tracking,providerTrackingUrl},guest,tracking.orderId)).toThrow();
  });
  it('payment API sends only the owned order identifier, never a client amount',async()=>{
    const request=vi.fn().mockResolvedValue({guestId:guest,orderId:'SR-fixture-order',paymentIntentId:'pi_fixture',clientSecret:'pi_fixture_secret_fixture',amountCents:970,currency:'usd',status:'requires_payment_method'});
    const api=customerApi({key:'fixture',guestId:guest,current:()=>true,assertCurrent:()=>{},request});await api.createPaymentIntent('SR-fixture-order');expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({orderId:'SR-fixture-order'});
  });
});
