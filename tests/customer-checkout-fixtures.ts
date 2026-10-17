import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { CheckoutError, type CustomerOrder, type GuestSession } from '../src/domain/customer-checkout.js';
import type { CustomerCheckoutRepository } from '../src/infrastructure/persistence/customer-checkout.js';
import { createCustomerOrdersRouter, createCustomerPaymentsRouter, type CustomerCheckoutOptions } from '../src/api/customer-checkout.js';
import type { CheckoutIntent, CheckoutStripe } from '../src/domain/customer-payment.js';
import type { CustomerDeliveryProvider } from '../src/domain/customer-dispatch.js';

export class MemoryCustomerRepository implements CustomerCheckoutRepository {
  sessions=new Map<string,GuestSession>(); orders=new Map<string,CustomerOrder>(); private tail=Promise.resolve();
  async createSession(session:GuestSession){this.sessions.set(session.id,structuredClone(session));}
  async findSession(hash:string){return structuredClone([...this.sessions.values()].find(s=>s.tokenHash===hash&&!s.revokedAt&&s.expiresAt.getTime()>Date.now()));}
  async revokeSession(id:string){const found=this.sessions.get(id);if(found)found.revokedAt=new Date();}
  private async serial<T>(run:()=>Promise<T>):Promise<T>{const prior=this.tail;let release!:()=>void;this.tail=new Promise<void>(resolve=>{release=resolve;});await prior;try{return await run();}finally{release();}}
  async create(order:CustomerOrder){return this.serial(async()=>{const found=await this.byRequest(order.guestId,order.requestId);if(found){if(found.fingerprint!==order.fingerprint)throw new CheckoutError(409,'REQUEST_CONFLICT','Different payload.');return {order:found,replayed:true};}this.orders.set(order.id,structuredClone(order));return {order:structuredClone(order),replayed:false};});}
  async get(id:string,guestId?:string){const order=this.orders.get(id);return order && ['logo_pickup','item_delivery'].includes(order.serviceType) && (!guestId||order.guestId===guestId)?structuredClone(order):undefined;}
  async byRequest(guestId:string,requestId:string){return structuredClone([...this.orders.values()].find(o=>o.guestId===guestId&&o.requestId===requestId));}
  async list(guestId:string,page:number,limit:number,status?:string){const found=[...this.orders.values()].filter(o=>o.guestId===guestId&&['logo_pickup','item_delivery'].includes(o.serviceType)&&(!status||status===o.status||(status==='active'&&['pending','confirmed','assigned','picked_up','in_transit'].includes(o.status))));return {orders:structuredClone(found.slice((page-1)*limit,page*limit)),total:found.length};}
  async locked<T>(id:string,guestId:string|undefined,run:(order:CustomerOrder)=>Promise<T>){return this.serial(async()=>{const order=await this.get(id,guestId);if(!order)throw new CheckoutError(404,'ORDER_NOT_FOUND','Order not found.');const result=await run(order);this.orders.set(id,structuredClone(order));return result;});}
}
export const origin='https://checkout.example.test';
export function draft(){return {requestId:randomUUID(),serviceType:'item_delivery',pickupAddress:{street:'1 Main St',city:'Dallas',state:'TX',zip:'75201',country:'US'},dropoffAddress:{street:'2 Oak Ln',city:'Dallas',state:'TX',zip:'75203',country:'US'},contact:{name:'Test Customer',phone:'+12145551234',email:'customer@example.test'},items:[{name:'Shirt',quantity:1}]};}
export function fixture(overrides:Partial<CustomerCheckoutOptions>={}){
  const repository=new MemoryCustomerRepository();
  const intents=new Map<string,CheckoutIntent>();
  const stripe:CheckoutStripe={live:false,create:vi.fn(async(order,key)=>{
    const existing=[...intents.values()].find(i=>i.metadata.orderId===order.id);if(existing)return structuredClone(existing);
    const id=`pi_test${intents.size+1}`;const intent:CheckoutIntent={id,client_secret:`${id}_secret_test`,status:'requires_payment_method',amount:order.amountCents,amount_received:0,currency:order.currency,livemode:false,metadata:{orderId:order.id,guestId:order.guestId,quoteVersion:order.quoteVersion,source:'stylere-shopify-app'}};intents.set(id,intent);void key;return structuredClone(intent);}),
    retrieve:vi.fn(async id=>{const found=intents.get(id);if(!found)throw new Error('not found');return structuredClone(found);}),
    event:vi.fn((body,signature)=>{if(signature!=='valid')throw new Error('bad signature');return JSON.parse(body.toString());})};
  const deliveries=new Map<string,any>();
  const delivery:CustomerDeliveryProvider={create:vi.fn(async order=>{const id=`stylere_${order.id}`;const saved={id:'dd_1',external_delivery_id:id,tracking_url:'https://track.doordash.com/live',delivery_status:'created'};deliveries.set(id,saved);return saved;}),get:vi.fn(async id=>deliveries.get(id))};
  const options={repository,allowedOrigins:[origin],stripe:()=>stripe,delivery:()=>delivery,webhookSecret:()=> 'whsec_fixture',...overrides};
  const app=express().use(express.json({verify:(req,_res,body)=>{(req as typeof req & {rawBody:Buffer}).rawBody=Buffer.from(body);}})).use('/api',createCustomerOrdersRouter(options)).use('/api',createCustomerPaymentsRouter(options));
  const login=async()=>{const response=await request(app).post('/api/customer/session').set('Origin',origin).send({}).expect(201);return {guestId:response.body.guestId as string,cookie:response.headers['set-cookie'][0].split(';')[0] as string};};
  const headers=(session:{guestId:string;cookie:string})=>({'Cookie':session.cookie,'X-Stylere-Guest-Id':session.guestId,'Origin':origin});
  const create=async(session:{guestId:string;cookie:string},input=draft())=>(await request(app).post('/api/orders/create').set(headers(session)).send(input).expect(201)).body;
  const pay=async(session:{guestId:string;cookie:string},id:string)=>{const receipt=await request(app).post('/api/payments/intent').set(headers(session)).send({orderId:id}).expect(200);const intent=intents.get(receipt.body.paymentIntentId)!;intent.status='succeeded';intent.amount_received=intent.amount;return receipt.body;};
  return {app,repository,stripe,delivery,intents,deliveries,login,headers,create,pay};
}
