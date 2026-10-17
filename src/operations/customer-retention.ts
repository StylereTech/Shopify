import type { Pool } from 'pg';

/** Approved policy: full local order deletion 90 days after authoritative completion.
 * External Stripe/DoorDash records are outside this process. Unknown, active, unpaid,
 * or uncertain deliveries are excluded. No historical completion time is inferred.
 */
export async function retainCustomerOrders(pool:Pool,{apply=false,batchSize=100}:{apply?:boolean;batchSize?:number}={}) {
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>500)throw new Error('Retention batch must be 1–500.');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query<{id:string;guest_id:string;request_id:string}>(`SELECT o.id,c.guest_id,c.request_id
      FROM storree_orders o JOIN customer_checkout_orders c ON c.order_id=o.id
      WHERE o.status='delivered' AND o.payment_status='paid' AND c.dispatch_status='submitted'
        AND o.completed_at IS NOT NULL AND o.completed_at<=NOW()-INTERVAL '90 days'
        AND o.merchant_account_id IS NULL AND o.service_type IN ('logo_pickup','item_delivery')
      ORDER BY o.completed_at,o.id LIMIT $1 FOR UPDATE OF o,c SKIP LOCKED`,[batchSize]);
    if(apply && rows.length) {
      for(const row of rows) await client.query(`INSERT INTO customer_retired_requests(guest_id,request_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[row.guest_id,row.request_id]);
      await client.query('DELETE FROM storree_orders WHERE id=ANY($1::text[])',[rows.map(row=>row.id)]);
    }
    await client.query('COMMIT');
    // Deliberately exclude IDs and customer data from scheduler output.
    return {mode:apply?'apply':'dry-run',eligible:rows.length,deleted:apply?rows.length:0,batchSize};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
