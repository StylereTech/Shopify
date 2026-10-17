import type { Pool, PoolClient } from 'pg';
import { CheckoutError, type CustomerOrder, type GuestSession } from '../../domain/customer-checkout.js';

export interface CustomerCheckoutRepository {
  createSession(session: GuestSession): Promise<void>;
  findSession(tokenHash: string): Promise<GuestSession | undefined>;
  revokeSession(id: string): Promise<void>;
  create(order: CustomerOrder): Promise<{ order: CustomerOrder; replayed: boolean }>;
  get(id: string, guestId?: string): Promise<CustomerOrder | undefined>;
  byRequest(guestId: string, requestId: string): Promise<CustomerOrder | undefined>;
  list(guestId: string, page: number, limit: number, status?: string): Promise<{ orders: CustomerOrder[]; total: number }>;
  locked<T>(id: string, guestId: string | undefined, run: (order: CustomerOrder) => Promise<T>): Promise<T>;
}
const selectOrder = `SELECT o.*, o.created_at AT TIME ZONE 'UTC' AS created_utc, o.updated_at AT TIME ZONE 'UTC' AS updated_utc,
  c.guest_id, c.request_id, c.request_fingerprint, c.amount_cents, c.currency, c.quote_version,
  c.stripe_payment_intent_id AS bound_intent, c.intent_started_at, c.dispatch_status, c.dispatch_started_at, c.events
  FROM customer_checkout_orders c JOIN storree_orders o ON o.id=c.order_id`;
const eligible = `o.service_type IN ('logo_pickup','item_delivery') AND o.merchant_account_id IS NULL`;
function fromRow(row: Record<string, any>): CustomerOrder {
  return { id: row.id, serviceType: row.service_type, status: row.status, pickupAddress: row.pickup_address, dropoffAddress: row.dropoff_address,
    items: row.items, contact: row.contact, notes: row.notes ?? undefined, pricing: row.pricing, paymentStatus: row.payment_status,
    paymentIntentId: row.bound_intent ?? undefined, stripePaymentIntentId: row.bound_intent ?? undefined,
    doordashExternalId: row.doordash_external_id ?? undefined, doordashDeliveryId: row.doordash_delivery_id ?? undefined,
    doordashTrackingUrl: row.doordash_tracking_url ?? undefined, dispatchId: row.dispatch_id ?? undefined, merchantNotified: row.merchant_notified,
    createdAt: new Date(row.created_utc), updatedAt: new Date(row.updated_utc), guestId: row.guest_id, requestId: row.request_id,
    fingerprint: row.request_fingerprint, amountCents: row.amount_cents, currency: row.currency, quoteVersion: row.quote_version,
    intentStartedAt: row.intent_started_at ? new Date(row.intent_started_at) : undefined,
    dispatchStatus: row.dispatch_status, dispatchStartedAt: row.dispatch_started_at ? new Date(row.dispatch_started_at) : undefined,
    events: row.events };
}
export class PostgresCustomerCheckoutRepository implements CustomerCheckoutRepository {
  constructor(private readonly pool: Pool) {}
  async createSession(s: GuestSession) { await this.pool.query('INSERT INTO customer_guest_sessions(id,token_hash,expires_at) VALUES($1,$2,$3)', [s.id,s.tokenHash,s.expiresAt]); }
  async findSession(hash: string): Promise<GuestSession | undefined> {
    const {rows} = await this.pool.query('SELECT * FROM customer_guest_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()', [hash]);
    return rows[0] ? {id:rows[0].id,tokenHash:rows[0].token_hash,expiresAt:new Date(rows[0].expires_at)} : undefined;
  }
  async revokeSession(id: string) { await this.pool.query('UPDATE customer_guest_sessions SET revoked_at=NOW() WHERE id=$1', [id]); }
  private async transaction<T>(run:(client:PoolClient)=>Promise<T>) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async create(order: CustomerOrder) {
    return this.transaction(async client => {
      // Lock the guest row before insert so duplicate creates cannot leave orphan orders.
      const active = await client.query('SELECT id FROM customer_guest_sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE', [order.guestId]);
      if (!active.rowCount) throw new CheckoutError(401,'GUEST_SESSION_EXPIRED','The checkout session has expired.');
      const retired = await client.query('SELECT 1 FROM customer_retired_requests WHERE guest_id=$1 AND request_id=$2', [order.guestId,order.requestId]);
      if (retired.rowCount) throw new CheckoutError(410,'ORDER_RETIRED','This completed order has reached its retention limit. Start a new request.');
      const prior = await client.query(`${selectOrder} WHERE c.guest_id=$1 AND c.request_id=$2 AND ${eligible}`, [order.guestId,order.requestId]);
      if (prior.rows[0]) {
        const found = fromRow(prior.rows[0]);
        if (found.fingerprint !== order.fingerprint) throw new CheckoutError(409,'REQUEST_CONFLICT','This request ID belongs to a different order draft.');
        return {order:found,replayed:true};
      }
      await client.query(`INSERT INTO storree_orders(id,service_type,status,pickup_address,dropoff_address,items,contact,notes,pricing,payment_status,created_at,updated_at)
        VALUES($1,$2,'pending',$3,$4,$5,$6,$7,$8,'unpaid',NOW() AT TIME ZONE 'UTC',NOW() AT TIME ZONE 'UTC')`,
      [order.id,order.serviceType,JSON.stringify(order.pickupAddress),JSON.stringify(order.dropoffAddress),JSON.stringify(order.items),JSON.stringify(order.contact),order.notes ?? null,JSON.stringify(order.pricing)]);
      await client.query(`INSERT INTO customer_checkout_orders(order_id,guest_id,request_id,request_fingerprint,amount_cents,currency,quote_version,events)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [order.id,order.guestId,order.requestId,order.fingerprint,order.amountCents,order.currency,order.quoteVersion,JSON.stringify(order.events)]);
      const saved = await client.query(`${selectOrder} WHERE c.order_id=$1`, [order.id]);
      return {order:fromRow(saved.rows[0]),replayed:false};
    });
  }
  async get(id:string,guestId?:string) {
    const {rows} = await this.pool.query(`${selectOrder} WHERE c.order_id=$1 AND ($2::uuid IS NULL OR c.guest_id=$2) AND ${eligible}`, [id,guestId??null]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  async byRequest(guestId:string,requestId:string) {
    const retired = await this.pool.query('SELECT 1 FROM customer_retired_requests WHERE guest_id=$1 AND request_id=$2', [guestId,requestId]);
    if (retired.rowCount) throw new CheckoutError(410,'ORDER_RETIRED','This completed order has reached its retention limit.');
    const {rows} = await this.pool.query(`${selectOrder} WHERE c.guest_id=$1 AND c.request_id=$2 AND ${eligible}`, [guestId,requestId]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  async list(guestId:string,page:number,limit:number,status?:string) {
    return this.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const filter = `c.guest_id=$1 AND ($2::text IS NULL OR o.status=$2 OR ($2='active' AND o.status IN ('pending','confirmed','assigned','picked_up','in_transit'))) AND ${eligible}`;
      const count = await client.query(`SELECT COUNT(*)::integer AS total FROM customer_checkout_orders c JOIN storree_orders o ON o.id=c.order_id WHERE ${filter}`, [guestId,status??null]);
      const {rows} = await client.query(`${selectOrder} WHERE ${filter} ORDER BY o.created_at DESC,o.id LIMIT $3 OFFSET $4`, [guestId,status??null,limit,(page-1)*limit]);
      return {orders:rows.map(fromRow),total:count.rows[0].total as number};
    });
  }
  async locked<T>(id:string,guestId:string|undefined,run:(order:CustomerOrder)=>Promise<T>):Promise<T> {
    return this.transaction(async client => {
      const {rows} = await client.query(`${selectOrder} WHERE c.order_id=$1 AND ($2::uuid IS NULL OR c.guest_id=$2) AND ${eligible} FOR UPDATE OF c,o`, [id,guestId??null]);
      if (!rows[0]) throw new CheckoutError(404,'ORDER_NOT_FOUND','Order not found.');
      const order = fromRow(rows[0]);
      const result = await run(order);
      await client.query(`UPDATE customer_checkout_orders SET stripe_payment_intent_id=$2,intent_started_at=$3,dispatch_status=$4,dispatch_started_at=$5,events=$6 WHERE order_id=$1`,
        [id,order.stripePaymentIntentId??null,order.intentStartedAt??null,order.dispatchStatus,order.dispatchStartedAt??null,JSON.stringify(order.events)]);
      await client.query(`UPDATE storree_orders SET status=$2,payment_status=$3,payment_intent_id=$4,stripe_payment_intent_id=$4,doordash_external_id=$5,doordash_delivery_id=$6,doordash_tracking_url=$7,dispatch_id=$8,updated_at=$9::timestamptz AT TIME ZONE 'UTC' WHERE id=$1`,
        [id,order.status,order.paymentStatus,order.stripePaymentIntentId??null,order.doordashExternalId??null,order.doordashDeliveryId??null,order.doordashTrackingUrl??null,order.dispatchId??null,order.updatedAt.toISOString()]);
      return result;
    });
  }
}
