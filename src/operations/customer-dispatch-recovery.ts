import type { Pool } from 'pg';
import { PostgresCustomerCheckoutRepository } from '../infrastructure/persistence/customer-checkout.js';
import { configuredCustomerDelivery,dispatchCustomerOrder,type CustomerDeliveryProvider } from '../domain/customer-dispatch.js';

/** Scheduled recovery of paid customer bookings. Unknown outcomes are looked up by
 * stable external ID before any retry create. Dry-run never calls the provider. */
export async function recoverCustomerDispatch(pool:Pool,{apply=false,batchSize=20,provider=configuredCustomerDelivery}:{apply?:boolean;batchSize?:number;provider?:()=>CustomerDeliveryProvider}={}){
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100)throw new Error('Recovery batch must be1–100.');
  const {rows}=await pool.query<{id:string}>(`SELECT o.id FROM storree_orders o JOIN customer_checkout_orders c ON c.order_id=o.id
    WHERE o.payment_status='paid' AND o.status IN ('confirmed','assigned','picked_up','in_transit')
      AND c.dispatch_status IN ('pending','unknown','in_progress') AND o.merchant_account_id IS NULL
      AND o.service_type IN ('logo_pickup','item_delivery')
      AND (c.dispatch_started_at IS NULL OR c.dispatch_started_at<NOW()-INTERVAL '1 minute')
    ORDER BY c.dispatch_started_at NULLS FIRST,o.created_at,o.id LIMIT $1`,[batchSize]);
  let submitted=0;
  if(apply){
    const gateway=provider(); // Missing config is an observable job failure, never a successful no-op.
    const repo=new PostgresCustomerCheckoutRepository(pool);
    for(const {id} of rows){await dispatchCustomerOrder(repo,id,()=>gateway);if((await repo.get(id))?.dispatchStatus==='submitted')submitted++;}
  }
  return {mode:apply?'apply':'dry-run',eligible:rows.length,submitted,unresolved:apply?rows.length-submitted:rows.length,batchSize};
}
