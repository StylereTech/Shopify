import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CheckoutError, customerCreateSchema, customerOrderDto, customerPrice, customerStatusSchema, fingerprintCreate, type CustomerOrder } from '../domain/customer-checkout.js';
import { checkoutStripeOperation, configuredStripe, prepareCheckoutIntent, settleCheckout, verifyCheckoutIntent, type CheckoutStripe } from '../domain/customer-payment.js';
import { configuredCustomerDelivery, dispatchCustomerOrder, applyDeliveryObservation, safeProviderTrackingUrl, type CustomerDeliveryProvider } from '../domain/customer-dispatch.js';
import type { CustomerCheckoutRepository } from '../infrastructure/persistence/customer-checkout.js';
import { createCustomerSessionRouter, customerGuard, guestOf, handled } from './customer-session.js';

let configuredRepository:CustomerCheckoutRepository|undefined;
export function setCustomerCheckoutRepository(repo:CustomerCheckoutRepository) {configuredRepository=repo;}
export interface CustomerCheckoutOptions { repository?:CustomerCheckoutRepository; allowedOrigins?:string[]; stripe?:()=>CheckoutStripe; delivery?:()=>CustomerDeliveryProvider; webhookSecret?:()=>string|undefined }
function dependencies(options:CustomerCheckoutOptions) {
  return {repository:()=>{const repo=options.repository??configuredRepository;if(!repo)throw new CheckoutError(503,'CHECKOUT_NOT_CONFIGURED','Checkout storage is not configured.');return repo;},
    stripe:options.stripe??configuredStripe,delivery:options.delivery??configuredCustomerDelivery};
}
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S> {
  const result=schema.safeParse(input);
  if(!result.success)throw new CheckoutError(400,'INVALID_REQUEST','Check the supplied fields and try again.');
  return result.data;
}
const orderId=z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const listSchema=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20),status:z.union([customerStatusSchema,z.literal('active')]).optional()}).strict();
async function owned(repo:CustomerCheckoutRepository,id:string,guestId:string) {
  const order=await repo.get(parse(orderId,id),guestId);
  if(!order)throw new CheckoutError(404,'ORDER_NOT_FOUND','Order not found.');
  return order;
}
export function createCustomerOrdersRouter(options:CustomerCheckoutOptions={}) {
  const {repository,delivery}=dependencies(options);
  const router=Router();
  router.use(createCustomerSessionRouter(repository,options.allowedOrigins));
  router.use('/orders',customerGuard(repository,options.allowedOrigins));
  router.post('/orders/create',handled(async(req,res)=>{
    const input=parse(customerCreateSchema,req.body);
    const guest=guestOf(res);
    const quote=customerPrice(input.serviceType);
    const now=new Date();
    const order:CustomerOrder={...input,id:`SR-${randomUUID()}`,guestId:guest.id,fingerprint:fingerprintCreate(input),
      ...quote,currency:'usd',status:'pending',paymentStatus:'unpaid',merchantNotified:false,dispatchStatus:'pending',createdAt:now,updatedAt:now,
      events:[{status:'pending',timestamp:now.toISOString(),description:'Order saved. Payment has not been confirmed.'}]};
    const saved=await repository().create(order);
    return res.status(saved.replayed?200:201).json({...customerOrderDto(saved.order),replayed:saved.replayed});
  }));
  router.get('/orders/requests/:requestId',handled(async(req,res)=>{
    const requestId=parse(z.string().uuid(),req.params.requestId).toLowerCase();
    const order=await repository().byRequest(guestOf(res).id,requestId);
    if(!order)throw new CheckoutError(404,'ORDER_NOT_FOUND','No saved order was found for this request.');
    return res.json(customerOrderDto(order));
  }));
  const list=handled(async(req,res)=>{
    const query=parse(listSchema,{...req.query,...(req.path==='/orders/active'?{status:'active'}:{})});
    const guestId=guestOf(res).id;
    const result=await repository().list(guestId,query.page,query.limit,query.status);
    return res.json({guestId,orders:result.orders.map(customerOrderDto),pagination:{page:query.page,limit:query.limit,total:result.total,pages:Math.ceil(result.total/query.limit)}});
  });
  router.get('/orders',list);
  router.get('/orders/active',list);
  router.get('/orders/:id',handled(async(req,res)=>res.json(customerOrderDto(await owned(repository(),req.params.id,guestOf(res).id)))));
  router.get('/orders/:id/tracking',handled(async(req,res)=>{
    const repo=repository(); const guestId=guestOf(res).id;
    let order=await owned(repo,req.params.id,guestId);
    let availability:'recorded'|'live'|'unavailable'='recorded';
    let driverName:string|undefined; let estimatedMinutes:number|undefined;
    if(order.doordashExternalId && !['delivered','cancelled','failed'].includes(order.status)) {
      try {
        const result=await delivery().get(order.doordashExternalId);
        if(!result)throw new Error('No verified delivery status.');
        order=await repo.locked(order.id,guestId,async current=>{applyDeliveryObservation(current,result);return structuredClone(current);});
        availability='live';
        driverName=typeof result.dasher_name==='string'?result.dasher_name.slice(0,100):undefined;
        const eta=Date.parse(result.dropoff_eta??result.dropoff_time_estimated??'');
        if(Number.isFinite(eta) && eta>Date.now())estimatedMinutes=Math.ceil((eta-Date.now())/60000);
      }catch{availability='unavailable';}
    }
    return res.json({guestId,orderId:order.id,status:order.status,paymentStatus:order.paymentStatus,dispatchStatus:order.dispatchStatus,
      availability,driverName,estimatedMinutes,providerTrackingUrl:safeProviderTrackingUrl(order.doordashTrackingUrl),timeline:order.events.slice(0,32)});
  }));
  router.get('/orders/:id/chat',handled(async(req,res)=>{
    const order=await owned(repository(),req.params.id,guestOf(res).id);
    return res.json({guestId:order.guestId,orderId:order.id,available:false,availability:'unavailable',messages:[],reason:'Courier messaging is not connected.'});
  }));
  router.post('/orders/:id/chat',handled(async(req,res)=>{
    await owned(repository(),req.params.id,guestOf(res).id);
    throw new CheckoutError(503,'CHAT_UNAVAILABLE','Courier messaging is not connected. Your message was not sent.');
  }));
  return router;
}
export function createCustomerPaymentsRouter(options:CustomerCheckoutOptions={}) {
  const {repository,stripe,delivery}=dependencies(options);
  const router=Router(); const guard=customerGuard(repository,options.allowedOrigins);
  router.post('/payments/intent',guard,handled(async(req,res)=>{
    const input=parse(z.object({orderId}).strict(),req.body);
    const guestId=guestOf(res).id;
    await owned(repository(),input.orderId,guestId);
    return res.json(await prepareCheckoutIntent(repository(),input.orderId,guestId,stripe()));
  }));
  router.post('/payments/confirm',guard,handled(async(req,res)=>{
    const input=parse(z.object({orderId,paymentIntentId:z.string().regex(/^pi_[A-Za-z0-9]+$/).max(100)}).strict(),req.body);
    const repo=repository(); const guestId=guestOf(res).id; const order=await owned(repo,input.orderId,guestId);
    if(order.stripePaymentIntentId!==input.paymentIntentId)throw new CheckoutError(409,'PAYMENT_RECEIPT_MISMATCH','Payment does not match this order.');
    const gateway=stripe(); const intent=await checkoutStripeOperation(()=>gateway.retrieve(input.paymentIntentId));
    await settleCheckout(repo,input.orderId,guestId,intent,gateway);
    await dispatchCustomerOrder(repo,input.orderId,delivery);
    const saved=await owned(repo,input.orderId,guestId);
    return res.json({success:true,guestId,orderId:saved.id,paymentIntentId:saved.stripePaymentIntentId,paymentStatus:'paid',dispatched:saved.dispatchStatus==='submitted',dispatchStatus:saved.dispatchStatus,trackingUrl:`/shopify/tracking/${encodeURIComponent(saved.id)}`});
  }));
  router.post('/payments/stripe-webhook',handled(async(req,res)=>{
    const secret=options.webhookSecret?.()??process.env.STRIPE_WEBHOOK_SECRET;
    if(!secret)throw new CheckoutError(503,'WEBHOOK_NOT_CONFIGURED','Payment webhook is not configured.');
    const signature=req.header('stripe-signature');
    const raw=(req as typeof req & {rawBody?:Buffer}).rawBody;
    if(!signature || !Buffer.isBuffer(raw))throw new CheckoutError(400,'INVALID_SIGNATURE','Missing stripe-signature or raw request body.');
    const gateway=stripe();
    let event;
    try {event=gateway.event(raw,signature,secret);}catch{throw new CheckoutError(400,'INVALID_SIGNATURE','Invalid payment webhook signature.');}
    if(!['payment_intent.succeeded','payment_intent.payment_failed'].includes(event.type))return res.json({received:true});
    const intent=event.data.object;
    if(intent.metadata?.source!=='stylere-shopify-app')return res.json({received:true,ignored:'unrelated'});
    const repo=repository(); const order=await repo.get(intent.metadata.orderId);
    // Unowned legacy and merchant-only records never become guest orders via webhook metadata.
    if(!order)return res.json({received:true,ignored:'unowned_order'});
    if(!order.stripePaymentIntentId)throw new CheckoutError(503,'PAYMENT_BINDING_PENDING','The payment binding is pending reconciliation.');
    verifyCheckoutIntent(order,intent,gateway);
    if(event.type==='payment_intent.succeeded') {
      await settleCheckout(repo,order.id,undefined,intent,gateway);
      await dispatchCustomerOrder(repo,order.id,delivery);
    }else {
      await repo.locked(order.id,undefined,async current=>{
        verifyCheckoutIntent(current,intent,gateway);
        if(current.paymentStatus!=='paid' && current.status==='pending') {current.paymentStatus='failed';current.updatedAt=new Date();}
      });
    }
    return res.json({received:true});
  }));
  return router;
}
