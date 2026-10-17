import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { MERCHANT_RECORD_SERVICE } from '../../domain/order-service.js';

export class MerchantOrderError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
const pendingStatuses = ['quoted', 'pending', 'confirmed', 'accepted'];
const movingStatuses = ['assigned', 'driver_assigned', 'en_route_pickup', 'picked_up', 'en_route', 'in_transit', 'en_route_dropoff'];
export const merchantActiveStatuses = [...pendingStatuses, ...movingStatuses];
const statuses = [...merchantActiveStatuses, 'delivered', 'failed', 'cancelled', 'canceled'];
const text = z.string().trim().min(1);
const optionalText = z.string().trim().nullish().transform(value => value || null);
const itemSchema = z.object({ name: text.max(200), quantity: z.number().int().min(1).max(10000) });
const iso = z.preprocess(value => value instanceof Date ? value.toISOString() : value, z.string().datetime({ offset: true }));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalInput = z.string().trim().max(200).optional().transform(value => value || null);
export const merchantOrderInput = z.object({
  request_id: z.string().uuid().transform(value => value.toLowerCase()),
  customer_name: text.max(200), customer_phone: optionalInput,
  customer_email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().transform(value => value || null),
  delivery_address: text.max(1000), declared_amount_cents: count,
  items: z.array(itemSchema).max(100).default([]),
}).strict();

function verified<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new MerchantOrderError('The saved order data could not be verified.', 503);
  return result.data;
}
function integer(value: unknown): number {
  return verified(count, typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
}
const orderSchema = z.object({
  id: text, merchant_id: z.string().uuid(), source: z.enum(['standalone', 'shopify']), source_order_id: text,
  status: text, service_type: text, customer_name: optionalText, customer_phone: optionalText,
  customer_email: optionalText, delivery_address: optionalText, declared_amount_cents: count.nullable(),
  items: z.array(itemSchema), payment_status: optionalText, created_at: iso, updated_at: iso, completed_at: iso.nullable(),
});
export type MerchantOrderView = z.output<typeof orderSchema>;
export type MerchantOrderOwner = { id: string; store_address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
export type MerchantOrderFilters = { page: number; limit: number; status: string | null; active: boolean };
export function parseMerchantOrderFilters(query: Record<string, unknown>): MerchantOrderFilters {
  const positive = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new MerchantOrderError('Invalid order pagination.');
    return Number(value);
  };
  const page = positive(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = positive(query.limit, 20, 50);
  if (!Number.isSafeInteger((page - 1) * limit)) throw new MerchantOrderError('Invalid order pagination.');
  const status = query.status === undefined || query.status === 'all' ? null : query.status;
  if (status !== null && (typeof status !== 'string' || !statuses.includes(status))) throw new MerchantOrderError('Invalid order status.');
  if (query.active !== undefined && (typeof query.active !== 'string' || !['true', 'false'].includes(query.active))) throw new MerchantOrderError('Invalid active-order filter.');
  if (status && query.active === 'true') throw new MerchantOrderError('Choose either a status or active orders.');
  return { page, limit, status, active: query.active === 'true' };
}

// Both source branches require immutable, explicit ownership. Public merchant_configs never grants access.
const ownedOrders = `WITH owned_orders AS (
  SELECT o.id, o.id AS source_order_id, 'standalone'::text AS source, $1::text AS merchant_id,
    o.status, o.service_type, o.contact, o.dropoff_address, o.items, o.declared_amount_cents,
    o.payment_status, o.created_at AT TIME ZONE 'UTC' AS created_at, o.updated_at AT TIME ZONE 'UTC' AS updated_at, o.completed_at, o.merchant_request_id,
    o.merchant_request_fingerprint, NULL::text AS job_id
  FROM storree_orders o WHERE o.merchant_account_id = $1::uuid
  UNION ALL
  SELECT 'shopify:' || j.id, j.shopify_order_id, 'shopify', $1::text,
    j.status, j.service_level, jsonb_build_object('phone', j.customer_phone), '{}'::jsonb, '[]'::jsonb,
    NULL::bigint, NULL::text, j.created_at AT TIME ZONE 'UTC', j.updated_at AT TIME ZONE 'UTC', j.completed_at, NULL::uuid, NULL::text, j.id
  FROM delivery_jobs j
  JOIN merchant_shop_bindings b ON b.delivery_merchant_id = j.merchant_id AND b.shop_domain = j.shop_domain
  WHERE b.merchant_account_id = $1::uuid
)`;
const ownershipSql = `(SELECT COUNT(*) FROM merchant_shop_bindings WHERE merchant_account_id = $1::uuid)`;

function orderView(value: unknown): MerchantOrderView {
  const row = verified(z.record(z.unknown()), value);
  const contact = verified(z.object({ name: optionalText, phone: optionalText, email: optionalText }), row.contact);
  const address = verified(z.object({ formatted: optionalText, street: optionalText, unit: optionalText, city: optionalText, state: optionalText, zip: optionalText, country: optionalText }), row.dropoff_address);
  const deliveryAddress = address.formatted || [address.street, address.unit, address.city, address.state, address.zip, address.country].filter(Boolean).join(', ') || null;
  return verified(orderSchema, { ...row, customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email,
    delivery_address: deliveryAddress, declared_amount_cents: row.declared_amount_cents == null ? null : integer(row.declared_amount_cents), completed_at: row.completed_at ?? null });
}
function ownership(linkedCount: unknown) {
  const linked_shop_count = integer(linkedCount);
  return { standalone: 'owned_records_only' as const, shopify: linked_shop_count ? 'linked' as const : 'not_linked' as const,
    linked_shop_count, historical_unassigned: 'excluded' as const };
}

export class MerchantOrderRepository {
  constructor(private readonly db: Pick<Pool, 'query'>) {}

  async list(owner: string, filters: MerchantOrderFilters) {
    const { page, limit, status, active } = filters;
    const { rows } = await this.db.query(`${ownedOrders}, filtered_orders AS (
      SELECT * FROM owned_orders WHERE ($2::text IS NULL OR status = $2) AND (NOT $3::boolean OR status = ANY($6::text[]))
    ) SELECT (SELECT COUNT(*) FROM filtered_orders) AS total, ${ownershipSql} AS linked_shop_count,
      COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at DESC, p.id DESC) FROM
        (SELECT * FROM filtered_orders ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5) p), '[]'::jsonb) AS orders`,
    [owner, status, active, limit, (page - 1) * limit, merchantActiveStatuses]);
    const result = rows[0];
    const total = integer(result?.total);
    const orders = verified(z.array(z.unknown()).max(limit), result?.orders).map(orderView);
    return { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, ownership: ownership(result?.linked_shop_count) };
  }

  async dashboard(owner: string) {
    const { rows } = await this.db.query(`${ownedOrders} SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = ANY($2::text[])) AS active,
      COUNT(*) FILTER (WHERE status = ANY($3::text[])) AS pending,
      COUNT(*) FILTER (WHERE status IN ('failed','cancelled','canceled')) AS failed,
      COUNT(*) FILTER (WHERE status = 'delivered' AND completed_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
        AND completed_at < ((date_trunc('day', NOW() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC')) AS completed_today,
      COUNT(*) FILTER (WHERE status = 'delivered' AND completed_at IS NULL) AS completion_time_unknown,
      ${ownershipSql} AS linked_shop_count,
      COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at DESC, p.id DESC) FROM
        (SELECT * FROM owned_orders ORDER BY created_at DESC, id DESC LIMIT 5) p), '[]'::jsonb) AS recent_orders
      FROM owned_orders`, [owner, movingStatuses, pendingStatuses]);
    const row = rows[0];
    const stats = { active: integer(row?.active), pending: integer(row?.pending), completed_today: integer(row?.completed_today),
      failed: integer(row?.failed), total: integer(row?.total), completion_time_unknown: integer(row?.completion_time_unknown) };
    return { stats, recent_orders: verified(z.array(z.unknown()).max(5), row?.recent_orders).map(orderView),
      stats_scope: 'all_owned_orders' as const, completion_timezone: 'UTC' as const, ownership: ownership(row?.linked_shop_count) };
  }

  async detail(owner: string, id: string) {
    const { rows } = await this.db.query(`${ownedOrders} SELECT * FROM owned_orders WHERE id = $2`, [owner, id]);
    if (!rows[0]) throw new MerchantOrderError('Order not found', 404);
    const order = orderView(rows[0]);
    let tracking: Array<{ id: string; attempted_at: string; success: boolean; retry_count: number; provider_status_code: number | null }> = [];
    if (order.source === 'shopify') {
      const result = await this.db.query(`SELECT a.id, a.attempted_at AT TIME ZONE 'UTC' AS attempted_at, a.success, a.retry_count, a.provider_status_code
        FROM dispatch_attempts a JOIN delivery_jobs j ON j.id = a.job_id
        JOIN merchant_shop_bindings b ON b.delivery_merchant_id = j.merchant_id AND b.shop_domain = j.shop_domain
        WHERE b.merchant_account_id = $1::uuid AND j.id = $2 ORDER BY a.attempted_at DESC, a.id DESC LIMIT 100`, [owner, rows[0].job_id]);
      tracking = verified(z.array(z.object({ id: text, attempted_at: iso, success: z.boolean(), retry_count: count,
        provider_status_code: z.number().int().nullable() })).max(100), result.rows);
    }
    return { order, tracking };
  }

  async request(owner: string, requestId: string) {
    if (!z.string().uuid().safeParse(requestId).success) throw new MerchantOrderError('Invalid request ID.');
    const { rows } = await this.db.query(`${ownedOrders} SELECT * FROM owned_orders WHERE source = 'standalone' AND merchant_request_id = $2::uuid`, [owner, requestId]);
    if (!rows[0]) throw new MerchantOrderError('Order request not found', 404);
    return { request_id: requestId.toLowerCase(), order: orderView(rows[0]) };
  }

  async create(owner: MerchantOrderOwner, body: unknown) {
    const parsed = merchantOrderInput.safeParse(body);
    if (!parsed.success) throw new MerchantOrderError('Provide a request ID, customer, delivery address, declared amount in cents, and valid items.');
    const input = parsed.data;
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const { rows: inserted } = await this.db.query(`INSERT INTO storree_orders
      (id, merchant_account_id, merchant_request_id, merchant_request_fingerprint, service_type, status,
       pickup_address, dropoff_address, contact, items, pricing, declared_amount_cents, payment_status, created_at, updated_at)
      VALUES ($1,$2::uuid,$3::uuid,$4,$5,'pending',$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,'{}'::jsonb,$10,'unpaid',NOW() AT TIME ZONE 'UTC',NOW() AT TIME ZONE 'UTC')
      ON CONFLICT (merchant_account_id, merchant_request_id) WHERE merchant_request_id IS NOT NULL DO NOTHING RETURNING id`,
    [randomUUID(), owner.id, input.request_id, fingerprint, MERCHANT_RECORD_SERVICE,
      JSON.stringify({ street: owner.store_address ?? null, city: owner.city ?? null, state: owner.state ?? null, zip: owner.zip ?? null }),
      JSON.stringify({ formatted: input.delivery_address }), JSON.stringify({ name: input.customer_name, phone: input.customer_phone, email: input.customer_email }),
      JSON.stringify(input.items), input.declared_amount_cents]);
    const { rows } = await this.db.query(`${ownedOrders} SELECT * FROM owned_orders WHERE source = 'standalone' AND merchant_request_id = $2::uuid`, [owner.id, input.request_id]);
    if (!rows[0]) throw new MerchantOrderError('The recorded request could not be confirmed. Check this request ID before retrying.', 503);
    if (rows[0].merchant_request_fingerprint !== fingerprint) throw new MerchantOrderError('This request ID already belongs to different order details.', 409);
    return { request_id: input.request_id, order: orderView(rows[0]), replayed: inserted.length === 0 };
  }
}
