import { MerchantRequestError, type MerchantSession } from './merchantSession';

export const dashboardTabs = ['overview', 'orders', 'tracking', 'settings', 'billing', 'team'] as const;
export type DashboardTab = typeof dashboardTabs[number];
export const activeOrderStatuses = ['quoted', 'pending', 'confirmed', 'accepted', 'assigned', 'driver_assigned', 'en_route_pickup', 'picked_up', 'en_route', 'in_transit', 'en_route_dropoff'] as const;
export const orderStatuses = [...activeOrderStatuses, 'delivered', 'failed', 'cancelled', 'canceled'] as const;
export type DashboardLocation = { tab: DashboardTab; status: string; page: number; trackingPage: number };
export type OrderRecord = {
  id: string; merchant_id: string; source: 'standalone' | 'shopify'; source_order_id: string | null;
  status: string; service_type: string; customer_name: string | null; customer_phone: string | null;
  customer_email: string | null; delivery_address: string | null; declared_amount_cents: number | null;
  items: { name: string; quantity: number }[]; created_at: string; updated_at: string;
  completed_at: string | null; payment_status: string | null;
};
export type Ownership = { standalone: 'owned_records_only'; shopify: 'linked' | 'not_linked'; linked_shop_count: number; historical_unassigned: 'excluded' };
export type OrderPage = { orders: OrderRecord[]; pagination: { page: number; limit: number; total: number; pages: number }; ownership: Ownership };
export type Settings = { store_name: string; store_address: string; store_phone: string; city: string; state: string; zip: string; email: string; first_name: string; last_name: string };
export type StaffRecord = { id: string; email: string; role: string; first_name: string | null; last_name: string | null; is_active: boolean; created_at: string };
export type CreateOrderInput = { request_id: string; customer_name: string; customer_phone?: string; customer_email?: string; delivery_address: string; declared_amount_cents: number; items?: { name: string; quantity: number }[] };
const fail = (): never => { throw new MerchantRequestError('The saved data could not be verified. Refresh and review the record before continuing.'); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown) => typeof value === 'string' ? value : fail();
const nonempty = (value: unknown) => { const result = text(value); return result.trim() ? result : fail(); };
const nullable = (value: unknown) => value === null ? null : text(value);
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail();
const date = (value: unknown) => { const result = text(value); return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) && Number.isFinite(Date.parse(result)) ? result : fail(); };
const array = <T>(value: unknown, parse: (item: unknown) => T): T[] => Array.isArray(value) ? value.map(parse) : fail();
const uuid = (value: string) => /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
const unique = <T extends { id: string }>(rows: T[]) => new Set(rows.map(row => row.id)).size === rows.length ? rows : fail();

export function parseOrderRecord(value: unknown, owner: string | null): OrderRecord {
  const row = object(value);
  if (row.merchant_id !== owner || !owner || !['standalone', 'shopify'].includes(String(row.source))) return fail();
  return { id: nonempty(row.id), merchant_id: owner, source: row.source as OrderRecord['source'], source_order_id: nullable(row.source_order_id),
    status: nonempty(row.status), service_type: nonempty(row.service_type), customer_name: nullable(row.customer_name), customer_phone: nullable(row.customer_phone),
    customer_email: nullable(row.customer_email), delivery_address: nullable(row.delivery_address), declared_amount_cents: row.declared_amount_cents === null ? null : count(row.declared_amount_cents),
    items: array(row.items, value => { const item = object(value), quantity = count(item.quantity); return quantity > 0 ? { name: nonempty(item.name), quantity } : fail(); }),
    created_at: date(row.created_at), updated_at: date(row.updated_at), completed_at: row.completed_at === null ? null : date(row.completed_at), payment_status: nullable(row.payment_status) };
}
function ownership(value: unknown): Ownership {
  const row = object(value), linked = count(row.linked_shop_count);
  if (row.standalone !== 'owned_records_only' || row.historical_unassigned !== 'excluded' || !['linked', 'not_linked'].includes(String(row.shopify)) || (row.shopify === 'linked') !== (linked > 0)) return fail();
  return { standalone: 'owned_records_only', historical_unassigned: 'excluded', shopify: row.shopify as Ownership['shopify'], linked_shop_count: linked };
}
export function parseOrderPage(value: unknown, owner: string | null, expected: { page: number; limit: number; status?: string; active?: boolean }): OrderPage {
  const data = object(value), page = object(data.pagination);
  const pagination = { page: count(page.page), limit: count(page.limit), total: count(page.total), pages: count(page.pages) };
  const orders = unique(array(data.orders, value => parseOrderRecord(value, owner)));
  const offset = (pagination.page - 1) * pagination.limit;
  if (pagination.page !== expected.page || pagination.limit !== expected.limit || pagination.pages !== Math.ceil(pagination.total / pagination.limit)
    || orders.length > pagination.limit || (orders.length ? offset + orders.length > pagination.total : pagination.total > offset)
    || (expected.status && orders.some(order => order.status !== expected.status))
    || (expected.active && orders.some(order => !(activeOrderStatuses as readonly string[]).includes(order.status)))) return fail();
  return { orders, pagination, ownership: ownership(data.ownership) };
}
function parseSettings(value: unknown): Settings {
  const row = object(value);
  const result = Object.fromEntries(['store_name', 'store_address', 'store_phone', 'city', 'state', 'zip', 'email', 'first_name', 'last_name'].map(key => [key, row[key] === null ? '' : text(row[key])])) as Settings;
  if (!result.store_name.trim() || !result.email.trim()) return fail();
  return result;
}
function parseStaff(value: unknown): StaffRecord {
  const row = object(value);
  if (typeof row.is_active !== 'boolean') return fail();
  return { id: nonempty(row.id), email: nonempty(row.email), role: nonempty(row.role), first_name: nullable(row.first_name), last_name: nullable(row.last_name), is_active: row.is_active, created_at: date(row.created_at) };
}
export function parseDashboardLocation(params: URLSearchParams): DashboardLocation {
  const page = (key: string) => { const value = params.get(key) || '1'; return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1; };
  return { tab: dashboardTabs.includes(params.get('tab') as DashboardTab) ? params.get('tab') as DashboardTab : 'overview',
    status: orderStatuses.includes(params.get('status') as typeof orderStatuses[number]) ? params.get('status')! : '', page: page('page'), trackingPage: page('trackingPage') };
}
export function dashboardSearch(location: DashboardLocation) {
  const result = new URLSearchParams({ tab: location.tab });
  if (location.status) result.set('status', location.status);
  if (location.page > 1) result.set('page', String(location.page));
  if (location.trackingPage > 1) result.set('trackingPage', String(location.trackingPage));
  return '?' + result.toString();
}
export const orderDetailPath = (id: string, context: DashboardLocation) => `/merchant/orders/${encodeURIComponent(id)}?returnTo=${encodeURIComponent('/merchant/dashboard' + dashboardSearch(context))}`;
export const money = (cents: number | null) => cents === null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function dollarsToCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new MerchantRequestError('Enter a nonnegative dollar amount with no more than two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.'), cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new MerchantRequestError('The declared order value is too large.');
  return cents;
}
const pendingKey = (owner: string) => `stylere:merchant-manual-request:${owner}`;
export function pendingOrderRequest(owner: string | null) { try { const id = owner && sessionStorage.getItem(pendingKey(owner)); return id && uuid(id) ? id : null; } catch { return null; } }
export function rememberOrderRequest(owner: string | null, id: string | null) {
  if (!owner) return false;
  try {
    if (id && uuid(id)) { sessionStorage.setItem(pendingKey(owner), id); return sessionStorage.getItem(pendingKey(owner)) === id; }
    if (id === null) { sessionStorage.removeItem(pendingKey(owner)); return true; }
  } catch { /* Do not create a record without retaining its recovery identity. */ }
  return false;
}

export function createMerchantDashboardApi(session: MerchantSession) {
  const request = async (path: string, init: RequestInit = {}) => { const data = await session.request('/api/merchant' + path, init); session.assertCurrent(); return data; };
  return {
    async dashboard(signal: AbortSignal) {
      const data = object(await request('/dashboard', { signal })), merchant = object(data.merchant), stats = object(data.stats);
      if (merchant.id !== session.owner || data.stats_scope !== 'all_owned_orders' || data.completion_timezone !== 'UTC') return fail();
      const recent = unique(array(data.recent_orders, value => parseOrderRecord(value, session.owner))); if (recent.length > 5) return fail();
      const totals = { active: count(stats.active), pending: count(stats.pending), completed_today: count(stats.completed_today), failed: count(stats.failed), total: count(stats.total), completion_time_unknown: count(stats.completion_time_unknown) };
      if (totals.active + totals.pending + totals.failed + totals.completed_today + totals.completion_time_unknown > totals.total || recent.length > totals.total) return fail();
      return { merchant: { id: nonempty(merchant.id), store_name: nonempty(merchant.store_name), plan: nonempty(merchant.plan), plan_status: nonempty(merchant.plan_status) },
        stats: totals,
        recent_orders: recent, ownership: ownership(data.ownership) };
    },
    async orders(query: { page: number; limit: number; status?: string; active?: boolean }, signal: AbortSignal) {
      if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50 || !Number.isSafeInteger((query.page - 1) * query.limit)
        || (query.status && !(orderStatuses as readonly string[]).includes(query.status)) || (query.active && query.status)) return fail();
      const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
      if (query.status) params.set('status', query.status); if (query.active) params.set('active', 'true');
      return parseOrderPage(await request('/orders?' + params, { signal }), session.owner, query);
    },
    async createOrder(input: CreateOrderInput, signal: AbortSignal) {
      if (!uuid(input.request_id) || !input.customer_name.trim() || !input.delivery_address.trim() || count(input.declared_amount_cents) !== input.declared_amount_cents) return fail();
      const data = object(await request('/orders', { method: 'POST', body: JSON.stringify(input), signal })), order = parseOrderRecord(data.order, session.owner);
      if (data.request_id !== input.request_id.toLowerCase() || typeof data.replayed !== 'boolean' || order.source !== 'standalone' || order.customer_name !== input.customer_name || order.delivery_address !== input.delivery_address
        || order.declared_amount_cents !== input.declared_amount_cents || (order.customer_phone || '') !== (input.customer_phone || '')
        || (order.customer_email || '').toLowerCase() !== (input.customer_email || '').toLowerCase()
        || JSON.stringify(order.items) !== JSON.stringify(input.items || [])) return fail();
      return order;
    },
    async recoverOrder(requestId: string, signal: AbortSignal) {
      if (!uuid(requestId)) return fail();
      const data = object(await request(`/orders/requests/${encodeURIComponent(requestId)}`, { signal })), order = parseOrderRecord(data.order, session.owner);
      if (data.request_id !== requestId.toLowerCase() || order.source !== 'standalone') return fail();
      return order;
    },
    async settings(signal: AbortSignal) { return parseSettings(await request('/settings', { signal })); },
    async updateSettings(input: Settings, signal: AbortSignal) {
      const body = { store_name: input.store_name, store_address: input.store_address, store_phone: input.store_phone,
        city: input.city, state: input.state, zip: input.zip, first_name: input.first_name, last_name: input.last_name };
      const saved = parseSettings(await request('/settings', { method: 'PUT', body: JSON.stringify(body), signal }));
      if (Object.entries(body).some(([key, value]) => saved[key as keyof Settings] !== value)) return fail();
      return saved;
    },
    async billing(signal: AbortSignal) {
      const data = object(await request('/billing', { signal }));
      const invoices = unique(array(data.invoices, value => { const row = object(value); return { id: nonempty(row.id), amount_cents: count(row.amount_cents), status: nonempty(row.status), created_at: date(row.created_at), period_start: row.period_start == null ? null : date(row.period_start), period_end: row.period_end == null ? null : date(row.period_end) }; }));
      return { invoices, plan: nonempty(data.plan), plan_status: nonempty(data.plan_status) };
    },
    async billingPortal(signal: AbortSignal) {
      const data = object(await request('/billing/portal', { method: 'POST', signal }));
      let url: URL; try { url = new URL(text(data.portal_url)); } catch { return fail(); }
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.port || url.username || url.password) return fail();
      return url.href;
    },
    async team(signal: AbortSignal) { return unique(array(object(await request('/team', { signal })).staff, parseStaff)); },
    async addStaff(email: string, signal: AbortSignal) {
      const saved = parseStaff(object(await request('/team', { method: 'POST', body: JSON.stringify({ email, role: 'staff' }), signal })).staff_member);
      if (saved.email.toLowerCase() !== email.toLowerCase() || saved.role !== 'staff') return fail();
      return saved;
    },
  };
}
export type MerchantDashboardApi = ReturnType<typeof createMerchantDashboardApi>;
