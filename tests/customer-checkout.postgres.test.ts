import { createHash, randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest';
import { PostgresCustomerCheckoutRepository } from '../src/infrastructure/persistence/customer-checkout.js';
import { customerCreateSchema,customerPrice,fingerprintCreate,type CustomerOrder } from '../src/domain/customer-checkout.js';
import { retainCustomerOrders } from '../src/operations/customer-retention.js';
import { recoverCustomerDispatch } from '../src/operations/customer-dispatch-recovery.js';
import { draft } from './customer-checkout-fixtures.js';

// Never uses DATABASE_URL. The only allowed target is the dedicated disposable loopback cluster.
const localUrl=process.env.CUSTOMER_TEST_DATABASE_URL;
if(localUrl){const target=new URL(localUrl);if(target.hostname!=='127.0.0.1'||target.port!=='55437'||target.pathname!=='/merchant_order_audit')throw new Error('Customer tests require the isolated loopback audit database.');}
describe.skipIf(!localUrl)('customer checkout and retention against isolated Postgres',()=>{
  let pool:Pool;let repo:PostgresCustomerCheckoutRepository;let ownerA:string;let ownerB:string;let legacyCount:number;
  beforeAll(async()=>{
    pool=new Pool({connectionString:localUrl,max:3,connectionTimeoutMillis:2000,statement_timeout:10000,options:'-c timezone=America/Los_Angeles'});
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const directory=new URL('../src/infrastructure/db/migrations/',import.meta.url);
    for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()){
      if(name.startsWith('006_'))await pool.query("INSERT INTO storree_orders(id,service_type,status) VALUES('legacy','item_delivery','delivered')");
      await pool.query(await readFile(new URL(name,directory),'utf8'));
    }
    legacyCount=(await pool.query('SELECT COUNT(*)::integer AS total FROM customer_checkout_orders')).rows[0].total;
    repo=new PostgresCustomerCheckoutRepository(pool);
  },20000);
  afterAll(async()=>{await pool?.end();});
  beforeEach(async()=>{
    await pool.query('DELETE FROM customer_retired_requests; DELETE FROM storree_orders; DELETE FROM customer_guest_sessions');
    ownerA=randomUUID();ownerB=randomUUID();
    for(const id of [ownerA,ownerB])await repo.createSession({id,tokenHash:createHash('sha256').update(id).digest('hex'),expiresAt:new Date(Date.now()+86400000)});
  });
  function order(owner=ownerA,input=customerCreateSchema.parse(draft())):CustomerOrder{
    const now=new Date();return {...input,...customerPrice(input.serviceType),id:`SR-${randomUUID()}`,guestId:owner,fingerprint:fingerprintCreate(input),currency:'usd',status:'pending',paymentStatus:'unpaid',merchantNotified:false,dispatchStatus:'pending',createdAt:now,updatedAt:now,events:[{status:'pending',timestamp:now.toISOString(),description:'Saved unpaid order.'}]};
  }
  it('applies migrations without assigning ownership to historical rows',()=>{expect(legacyCount).toBe(0);});
  it('isolate owners and rejects unknown history on detail, request recovery and history counts',async()=>{
    const a=order();const b=order(ownerB);await repo.create(a);await repo.create(b);
    await pool.query("INSERT INTO storree_orders(id,service_type) VALUES('unowned','item_delivery'),('merchant','merchant_record')");
    expect(await repo.get(b.id,ownerA)).toBeUndefined();expect(await repo.get('unowned')).toBeUndefined();expect(await repo.get('merchant')).toBeUndefined();
    expect(await repo.byRequest(ownerA,b.requestId)).toBeUndefined();expect((await repo.list(ownerA,1,20)).orders.map(o=>o.id)).toEqual([a.id]);
  });
  it('serializes duplicate creation without orphan rows and rejects changed payload',async()=>{
    const a=order();const duplicate={...structuredClone(a),id:`SR-${randomUUID()}`};
    const results=await Promise.all([repo.create(a),repo.create(duplicate)]);expect(results[0].order.id).toBe(results[1].order.id);expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
    expect((await pool.query('SELECT COUNT(*)::integer AS total FROM storree_orders')).rows[0].total).toBe(1);
    await expect(repo.create({...duplicate,fingerprint:'different'})).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
  });
  it('writes and reads UTC timestamps even with a non-UTC database session',async()=>{
    const before=Date.now();const saved=(await repo.create(order())).order;expect(saved.createdAt.getTime()).toBeGreaterThanOrEqual(before-1000);expect(saved.createdAt.getTime()).toBeLessThanOrEqual(Date.now()+1000);
    await repo.locked(saved.id,ownerA,async current=>{current.updatedAt=new Date();});const found=await repo.get(saved.id,ownerA);expect(Math.abs(found!.updatedAt.getTime()-Date.now())).toBeLessThan(2000);
  });
  it('enforces unique durable Stripe bindings and rolls back failed mutation callbacks',async()=>{
    const a=order();const b=order();await repo.create(a);await repo.create(b);
    await repo.locked(a.id,ownerA,async current=>{current.stripePaymentIntentId='pi_bound';});
    await expect(repo.locked(b.id,ownerA,async current=>{current.stripePaymentIntentId='pi_bound';})).rejects.toMatchObject({code:'23505'});
    expect((await repo.get(b.id,ownerA))!.stripePaymentIntentId).toBeUndefined();
    await expect(repo.locked(a.id,ownerA,async current=>{current.paymentStatus='paid';throw new Error('rollback');})).rejects.toThrow('rollback');
    expect((await repo.get(a.id,ownerA))!.paymentStatus).toBe('unpaid');
  });
  it('refuses new writes using revoked guest credentials',async()=>{
    await repo.revokeSession(ownerA);expect(await repo.findSession(createHash('sha256').update(ownerA).digest('hex'))).toBeUndefined();
    await expect(repo.create(order())).rejects.toMatchObject({code:'GUEST_SESSION_EXPIRED'});
  });
  it('recovery dry-run avoids providers and apply reconciles only paid stale bookings',async()=>{
    const a=order();const unpaid=order();await repo.create(a);await repo.create(unpaid);
    await repo.locked(a.id,ownerA,async current=>{current.paymentStatus='paid';current.status='confirmed';current.dispatchStatus='unknown';current.dispatchStartedAt=new Date(Date.now()-120000);});
    let lookups=0;let creates=0;
    const provider=()=>({get:async(id:string)=>{lookups++;return {id:'dd_recovered',external_delivery_id:id,delivery_status:'created',tracking_url:'https://track.doordash.com/real'};},create:async()=>{creates++;throw new Error('Must reconcile first');}});
    expect(await recoverCustomerDispatch(pool,{provider})).toMatchObject({eligible:1,submitted:0});expect(lookups).toBe(0);
    expect(await recoverCustomerDispatch(pool,{apply:true,provider})).toMatchObject({eligible:1,submitted:1,unresolved:0});expect(lookups).toBe(1);expect(creates).toBe(0);
    expect((await repo.get(unpaid.id,ownerA))!.paymentStatus).toBe('unpaid');
  });
  it('dry-runs then fully deletes only settled completed orders older than90days and prevents replay',async()=>{
    const eligible=order();const recent=order();const uncertain=order();const unknown=order();const active=order();
    for(const item of [eligible,recent,uncertain,unknown,active])await repo.create(item);
    for(const item of [eligible,recent,uncertain,unknown]){
      await repo.locked(item.id,ownerA,async current=>{current.paymentStatus='paid';current.status='delivered';current.dispatchStatus=item.id===uncertain.id?'unknown':'submitted';current.stripePaymentIntentId=`pi_${item.id.replace(/-/g,'')}`;});
    }
    await pool.query("UPDATE storree_orders SET completed_at=NOW()-INTERVAL '91 days' WHERE id=ANY($1::text[])",[[eligible.id,uncertain.id]]);
    await pool.query('UPDATE storree_orders SET completed_at=NULL WHERE id=$1',[unknown.id]);
    expect(await retainCustomerOrders(pool)).toMatchObject({mode:'dry-run',eligible:1,deleted:0});expect(await repo.get(eligible.id,ownerA)).toBeDefined();
    expect(await retainCustomerOrders(pool,{apply:true,batchSize:1})).toMatchObject({eligible:1,deleted:1});
    expect((await pool.query('SELECT id FROM storree_orders WHERE id=$1',[eligible.id])).rows).toHaveLength(0);expect(await repo.get(eligible.id,ownerA)).toBeUndefined();
    await expect(repo.byRequest(ownerA,eligible.requestId)).rejects.toMatchObject({code:'ORDER_RETIRED'});await expect(repo.create(eligible)).rejects.toMatchObject({code:'ORDER_RETIRED'});
    expect((await repo.list(ownerA,1,20)).total).toBe(4);expect((await retainCustomerOrders(pool,{apply:true})).deleted).toBe(0);
  });
});
