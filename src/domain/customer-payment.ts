import Stripe from 'stripe';
import { CheckoutError, addCustomerEvent, type CustomerOrder } from './customer-checkout.js';
import type { CustomerCheckoutRepository } from '../infrastructure/persistence/customer-checkout.js';
import { isBookableService } from './order-service.js';

export type CheckoutIntent = { id:string; client_secret:string|null; amount:number; amount_received:number; currency:string; status:string; livemode:boolean; metadata:Record<string,string> };
export type CheckoutStripeEvent = {id:string;type:string;data:{object:CheckoutIntent}};
export interface CheckoutStripe {
  live:boolean;
  create(order:CustomerOrder,key:string):Promise<CheckoutIntent>;
  retrieve(id:string):Promise<CheckoutIntent>;
  event(body:Buffer,signature:string,secret:string):CheckoutStripeEvent;
}
export const CHECKOUT_STRIPE_DEADLINE_MS=12_000;
export async function checkoutStripeOperation<T>(operation:()=>Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>reject(new CheckoutError(503,'PAYMENT_OUTCOME_UNKNOWN','Payment status could not be confirmed in time. Recover this same order before trying another payment.')),CHECKOUT_STRIPE_DEADLINE_MS);
    })]);
  }finally{clearTimeout(timer);}
}
export function configuredStripe():CheckoutStripe {
  const key=process.env.STRIPE_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) throw new CheckoutError(503,'PAYMENTS_NOT_CONFIGURED','Payments are not configured.');
  const stripe=new Stripe(key,{timeout:10_000,maxNetworkRetries:0});
  return {live:key.startsWith('sk_live_'),
    create:(order,idempotencyKey)=>stripe.paymentIntents.create({amount:order.amountCents,currency:order.currency,
      automatic_payment_methods:{enabled:true},metadata:{orderId:order.id,guestId:order.guestId,quoteVersion:order.quoteVersion,source:'stylere-shopify-app'}},{idempotencyKey}),
    retrieve:id=>stripe.paymentIntents.retrieve(id),
    event:(body,signature,secret)=>stripe.webhooks.constructEvent(body,signature,secret) as unknown as CheckoutStripeEvent,
  };
}
export function verifyCheckoutIntent(order:CustomerOrder,intent:CheckoutIntent,stripe:CheckoutStripe,bound=true) {
  if (!isBookableService(order.serviceType) || !order.guestId || !Number.isSafeInteger(order.amountCents) || order.amountCents<=0 || order.currency!=='usd') throw new CheckoutError(409,'ORDER_NOT_PAYABLE','This order is not payable.');
  if (!/^pi_[A-Za-z0-9]+$/.test(intent.id) || (bound && order.stripePaymentIntentId!==intent.id) ||
    intent.amount!==order.amountCents || intent.currency!==order.currency || intent.livemode!==stripe.live ||
    intent.metadata?.orderId!==order.id || intent.metadata?.guestId!==order.guestId || intent.metadata?.quoteVersion!==order.quoteVersion || intent.metadata?.source!=='stylere-shopify-app') {
    throw new CheckoutError(409,'PAYMENT_RECEIPT_MISMATCH','Payment does not match this order and its saved quote.');
  }
}
export async function prepareCheckoutIntent(repo:CustomerCheckoutRepository,orderId:string,guestId:string,stripe:CheckoutStripe) {
  // Commit the reservation before contacting Stripe. An uncertain outcome can reuse the
  // same key within Stripe's retention window, but never start a new charge days later.
  await repo.locked(orderId,guestId,async order=>{
    if (['cancelled','failed'].includes(order.status)) throw new CheckoutError(409,'ORDER_NOT_PAYABLE','This order is not payable.');
    if (!order.intentStartedAt) order.intentStartedAt=new Date();
  });
  return repo.locked(orderId,guestId,async order=>{
    let intent:CheckoutIntent;
    const boundIntent=order.stripePaymentIntentId;
    if (boundIntent) intent=await checkoutStripeOperation(()=>stripe.retrieve(boundIntent));
    else {
      if (!order.intentStartedAt || Date.now()-order.intentStartedAt.getTime()>23*60*60*1000) throw new CheckoutError(409,'PAYMENT_RECONCILIATION_REQUIRED','The earlier payment initialization needs support review before another charge can be started.');
      intent=await checkoutStripeOperation(()=>stripe.create(order,`customer-checkout:${order.id}:${order.quoteVersion}`));
      verifyCheckoutIntent(order,intent,stripe,false);
      order.stripePaymentIntentId=intent.id;
      order.paymentIntentId=intent.id;
      order.updatedAt=new Date();
    }
    verifyCheckoutIntent(order,intent,stripe);
    if (!intent.client_secret || !intent.client_secret.startsWith(`${intent.id}_secret_`)) throw new CheckoutError(503,'PAYMENT_INTENT_UNAVAILABLE','The payment form is not available. Retry this order.');
    return {guestId:order.guestId,orderId:order.id,paymentIntentId:intent.id,clientSecret:intent.client_secret,amountCents:order.amountCents,currency:order.currency,status:intent.status};
  });
}
export async function settleCheckout(repo:CustomerCheckoutRepository,orderId:string,guestId:string|undefined,intent:CheckoutIntent,stripe:CheckoutStripe) {
  return repo.locked(orderId,guestId,async order=>{
    verifyCheckoutIntent(order,intent,stripe);
    if (intent.status!=='succeeded') throw new CheckoutError(402,'PAYMENT_NOT_CONFIRMED','Payment is not confirmed. Check payment status before trying again.');
    if (intent.amount_received!==order.amountCents) throw new CheckoutError(409,'PAYMENT_RECEIPT_MISMATCH','The received payment does not match the saved quote.');
    if (order.paymentStatus!=='paid') {
      order.paymentStatus='paid';
      if (order.status==='pending') order.status='confirmed';
      order.updatedAt=new Date();
      addCustomerEvent(order,'confirmed','Payment verified. Delivery booking is pending.');
    }
    return structuredClone(order);
  });
}
