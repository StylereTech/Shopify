import { CheckoutError, addCustomerEvent, type CustomerOrder } from './customer-checkout.js';
import type { CustomerCheckoutRepository } from '../infrastructure/persistence/customer-checkout.js';
import { DoorDashDriveClient, DoorDashError, type DoorDashDelivery } from '../infrastructure/doordash/doordash-client.js';

export interface CustomerDeliveryProvider {
  create(order:CustomerOrder):Promise<DoorDashDelivery>;
  get(externalId:string):Promise<DoorDashDelivery | undefined>;
}
export function configuredCustomerDelivery():CustomerDeliveryProvider {
  const {DOORDASH_DEVELOPER_ID,DOORDASH_KEY_ID,DOORDASH_SIGNING_SECRET,DEFAULT_PICKUP_PHONE}=process.env;
  if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET || !DEFAULT_PICKUP_PHONE) throw new CheckoutError(503,'DELIVERY_NOT_CONFIGURED','Delivery booking is temporarily unavailable.');
  const client=new DoorDashDriveClient({developerId:DOORDASH_DEVELOPER_ID,keyId:DOORDASH_KEY_ID,signingSecret:DOORDASH_SIGNING_SECRET,timeoutMs:10_000});
  const address=(a:Record<string,unknown>)=>`${a.street}${a.unit ? ` ${a.unit}` : ''}, ${a.city}, ${a.state} ${a.zip}`;
  const phone=(input:string)=>{ const digits=input.replace(/\D/g,''); return `+${digits.length===10?'1':''}${digits}`; };
  return {
    create:order=>client.createDelivery({external_delivery_id:`stylere_${order.id}`,
      pickup_address:address(order.pickupAddress),pickup_business_name:process.env.DEFAULT_PICKUP_NAME||'Style.re pickup',
      pickup_phone_number:phone(DEFAULT_PICKUP_PHONE),pickup_reference_tag:order.id,
      pickup_instructions:`Order ${order.id}: ${order.items.map(item=>`${item.quantity}x ${item.name}`).join(', ')}`.slice(0,1000),
      dropoff_address:address(order.dropoffAddress),dropoff_phone_number:phone(String(order.contact.phone)),
      dropoff_contact_given_name:String(order.contact.name).split(' ')[0],dropoff_contact_send_notifications:false,
      dropoff_instructions:order.notes||'Please ring the doorbell on arrival.',action_if_undeliverable:'return_to_pickup'}),
    get:async externalId=>{try{return await client.getDelivery(externalId);}catch(error){if(error instanceof DoorDashError && error.statusCode===404)return undefined;throw error;}},
  };
}
export function safeProviderTrackingUrl(raw?:string) {
  if (!raw) return undefined;
  try {const url=new URL(raw);return url.protocol==='https:' && (url.hostname==='doordash.com'||url.hostname.endsWith('.doordash.com')) && !url.username && !url.password ? url.href : undefined;}catch{return undefined;}
}
function deliveryState(raw:string) {
  const status=raw.toLowerCase();
  if (['created','pending','queued'].includes(status)) return 'confirmed';
  if (['assigned','delivery_assigned','en_route_to_pickup'].includes(status))return 'assigned';
  if (['picked_up','pickup_complete'].includes(status))return 'picked_up';
  if (['in_progress','active','en_route_to_dropoff'].includes(status))return 'in_transit';
  if (['delivered','completed','dropoff_complete'].includes(status))return 'delivered';
  if (['cancelled','canceled','failed'].includes(status))return 'cancelled';
  return undefined;
}
const progress=['pending','confirmed','assigned','picked_up','in_transit','delivered'];
export function applyDeliveryObservation(order:CustomerOrder,delivery:DoorDashDelivery) {
  if (delivery.external_delivery_id!==`stylere_${order.id}` || typeof delivery.delivery_status!=='string') throw new CheckoutError(503,'DELIVERY_RECEIPT_MISMATCH','Delivery status could not be verified.');
  order.doordashExternalId=delivery.external_delivery_id;
  order.doordashDeliveryId=typeof delivery.id==='string'?delivery.id:delivery.external_delivery_id;
  order.dispatchId=delivery.external_delivery_id;
  order.doordashTrackingUrl=safeProviderTrackingUrl(delivery.tracking_url) ?? order.doordashTrackingUrl;
  order.dispatchStatus='submitted';
  const next=deliveryState(delivery.delivery_status);
  if (next && !['delivered','cancelled','failed'].includes(order.status) && (next==='cancelled' || progress.indexOf(next)>progress.indexOf(order.status))) {
    order.status=next;
    // This records when the backend observed a transition, not a fabricated provider event time.
    addCustomerEvent(order,next,`Delivery provider reported ${next.replace(/_/g,' ')}.`);
  }
  order.updatedAt=new Date();
}
export async function dispatchCustomerOrder(repo:CustomerCheckoutRepository,id:string,provider:()=>CustomerDeliveryProvider) {
  // Validate configuration before claiming. Missing configuration leaves a recoverable pending booking.
  let delivery:CustomerDeliveryProvider;
  try {delivery=provider();}catch{return;}
  const claimed=await repo.locked(id,undefined,async order=>{
    if (order.paymentStatus!=='paid' || ['cancelled','failed','delivered'].includes(order.status) || order.dispatchStatus==='submitted')return undefined;
    if (order.dispatchStatus==='in_progress' && order.dispatchStartedAt && Date.now()-order.dispatchStartedAt.getTime()<60_000)return undefined;
    const reconcile=order.dispatchStatus!=='pending';
    order.dispatchStatus='in_progress'; order.dispatchStartedAt=new Date();
    return {order:structuredClone(order),reconcile};
  });
  if (!claimed)return;
  try {
    // A timeout or process crash must be reconciled before another create call.
    const result=(claimed.reconcile ? await delivery.get(`stylere_${id}`):undefined) ?? await delivery.create(claimed.order);
    await repo.locked(id,undefined,async order=>applyDeliveryObservation(order,result));
  }catch{
    // Never convert an uncertain provider outcome into success or blindly start a new delivery.
    await repo.locked(id,undefined,async order=>{if(order.dispatchStatus!=='submitted')order.dispatchStatus='unknown';});
  }
}
