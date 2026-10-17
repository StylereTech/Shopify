import type { Plan, RegisterBody } from '../api/merchantApi';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function merchantInstallShop(input: string): string {
  const value = input.trim().toLowerCase();
  const invalid = () => new Error('Enter your Shopify store handle or its myshopify.com address. Example: your-store');
  if (!value) throw new Error('Enter your Shopify store name to continue.');
  let host = value;
  if (/^https?:\/\//.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { throw invalid(); }
    if (url.username || url.password || url.port || !url.hostname.endsWith('.myshopify.com')) throw invalid();
    host = url.hostname;
  }
  const handle = host.endsWith('.myshopify.com') ? host.slice(0, -'.myshopify.com'.length) : host;
  if (handle.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(handle)) throw invalid();
  return `${handle}.myshopify.com`;
}

export function confirmedMerchantPlans(value: unknown): Plan[] {
  if (!record(value) || !Array.isArray(value.plans) || value.plans.length === 0) throw new Error('Current plans are unavailable. Please try again.');
  const plans = value.plans.map((plan): Plan => {
    if (!record(plan) || typeof plan.id !== 'string' || !['access', 'growth'].includes(plan.id) || !text(plan.name)
      || typeof plan.price_cents !== 'number' || !Number.isSafeInteger(plan.price_cents) || plan.price_cents < 0
      || !Array.isArray(plan.features) || !plan.features.every(text)
      || (plan.price_display != null && typeof plan.price_display !== 'string')
      || (plan.popular !== undefined && typeof plan.popular !== 'boolean')) throw new Error('Current plan details could not be confirmed. Please try again.');
    return { id: plan.id, name: plan.name, price_cents: plan.price_cents, price_display: typeof plan.price_display === 'string' ? plan.price_display : '',
      features: plan.features, popular: plan.popular as boolean | undefined };
  });
  if (new Set(plans.map(plan => plan.id)).size !== plans.length) throw new Error('Current plan details could not be confirmed. Please try again.');
  return plans;
}

/** Current merchant plans are monthly; derive one price/period from integer cents. */
export const merchantPlanPrice = (plan: Plan) => `$${(plan.price_cents / 100).toFixed(2)}/month`;

export function confirmedRegistrationInput(form: RegisterBody, plans: Plan[]): RegisterBody {
  const email = form.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (form.password.length < 8) throw new Error('Use a password with at least 8 characters.');
  if (!form.store_name.trim()) throw new Error('Enter your store name.');
  if (!plans.some(plan => plan.id === form.plan)) throw new Error('Select a current plan before continuing.');
  const state = form.state?.trim().toUpperCase() || '';
  if (state && !/^[A-Z]{2}$/.test(state)) throw new Error('Enter a two-letter state code.');
  return { ...form, email, first_name: form.first_name.trim(), last_name: form.last_name.trim(), store_name: form.store_name.trim(), city: form.city?.trim() || '', state };
}

export function confirmedRegistration(value: unknown, expected: RegisterBody): { checkoutUrl: string | null } {
  if (!record(value) || !record(value.merchant) || !text(value.merchant.id)
    || value.merchant.email !== expected.email || value.merchant.plan !== expected.plan
    || !text(value.merchant.plan_status)) throw new Error('The account result could not be confirmed. Sign in to check your account before trying again.');
  if (value.checkout_url == null || value.checkout_url === '') return { checkoutUrl: null };
  if (typeof value.checkout_url !== 'string') throw new Error('The checkout link could not be confirmed. Sign in to check your account.');
  let url: URL;
  try { url = new URL(value.checkout_url); }
  catch { throw new Error('The checkout link could not be confirmed. Sign in to check your account.'); }
  // Stripe's own Checkout Session URL may carry a required fragment. Preserve it:
  // https://docs.stripe.com/api/checkout/sessions/object
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password) {
    throw new Error('The checkout link could not be confirmed. Sign in to check your account.');
  }
  return { checkoutUrl: url.href };
}

const tabs = new Set(['overview', 'orders', 'tracking', 'settings', 'billing', 'team']);
const statuses = new Set(['pending', 'assigned', 'picked_up', 'en_route', 'delivered', 'failed', 'cancelled']);
export function merchantDashboardReturn(value: string | null): string {
  const fallback = '/merchant/dashboard?tab=orders';
  if (!value || !value.startsWith('/merchant/dashboard?')) return fallback;
  const url = new URL(value, 'https://merchant.example');
  if (url.origin !== 'https://merchant.example' || url.pathname !== '/merchant/dashboard' || url.hash) return fallback;
  const params = new URLSearchParams();
  const tab = url.searchParams.get('tab');
  params.set('tab', tab && tabs.has(tab) ? tab : 'orders');
  for (const key of ['page', 'trackingPage']) {
    const page = url.searchParams.get(key);
    if (page && /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) && Number(page) > 0) params.set(key, String(Number(page)));
  }
  const status = url.searchParams.get('status');
  if (status && statuses.has(status)) params.set('status', status);
  return `/merchant/dashboard?${params}`;
}

export function merchantAuthReturn(value: string | null): string {
  const fallback = '/merchant/dashboard';
  if (!value || !value.startsWith('/') || value.includes('\\')) return fallback;
  let url: URL;
  try { url = new URL(value, 'https://merchant.example'); } catch { return fallback; }
  if (url.origin !== 'https://merchant.example' || url.hash) return fallback;
  if (url.pathname === '/merchant/dashboard') return url.search ? merchantDashboardReturn(`${url.pathname}${url.search}`) : fallback;
  const match = /^\/merchant\/orders\/([^/]+)$/.exec(url.pathname);
  if (!match) return fallback;
  let id: string;
  try { id = decodeURIComponent(match[1]); } catch { return fallback; }
  if (!id.trim() || id === '.' || id === '..' || /[/\\]/.test(id) || [...id].some(character => character.charCodeAt(0) < 32)) return fallback;
  const back = merchantDashboardReturn(url.searchParams.get('returnTo'));
  return `/merchant/orders/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(back)}`;
}

export interface MerchantDetailOrder {
  id: string; merchant_id: string; source: 'standalone' | 'shopify'; source_order_id: string;
  status: string; service_type: string; customer_name: string | null; customer_phone: string | null;
  customer_email: string | null; delivery_address: string | null; declared_amount_cents: number | null;
  items: { name: string; quantity: number }[]; created_at: string; updated_at: string;
  completed_at: string | null; payment_status: string | null;
}
export interface MerchantDispatchAttempt { id: string; attempted_at: string; success: boolean; retry_count: number; provider_status_code: number | null }
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function confirmedMerchantDetail(value: unknown, expectedId: string, owner: string): { order: MerchantDetailOrder; tracking: MerchantDispatchAttempt[] } {
  const invalid = () => new Error('Order details could not be confirmed. Refresh to try again.');
  if (!expectedId || !owner || !record(value) || !record(value.order) || !Array.isArray(value.tracking)) throw invalid();
  const order = value.order;
  if (order.id !== expectedId || order.merchant_id !== owner || typeof order.source !== 'string' || !['standalone', 'shopify'].includes(order.source)
    || !text(order.source_order_id) || !text(order.status) || !text(order.service_type)
    || !['customer_name','customer_phone','customer_email','delivery_address','payment_status'].every(key => nullableText(order[key]))
    || !(order.declared_amount_cents === null || count(order.declared_amount_cents))
    || !timestamp(order.created_at) || !timestamp(order.updated_at) || !(order.completed_at === null || timestamp(order.completed_at))
    || !Array.isArray(order.items) || !order.items.every(item => record(item) && text(item.name) && count(item.quantity) && item.quantity > 0)) throw invalid();
  if (!value.tracking.every(attempt => record(attempt) && text(attempt.id) && timestamp(attempt.attempted_at)
    && typeof attempt.success === 'boolean' && count(attempt.retry_count)
    && (attempt.provider_status_code === null || (count(attempt.provider_status_code) && attempt.provider_status_code >= 100 && attempt.provider_status_code <= 599)))
    || new Set(value.tracking.map(attempt => attempt.id)).size !== value.tracking.length) throw invalid();
  return { order: order as unknown as MerchantDetailOrder, tracking: value.tracking as MerchantDispatchAttempt[] };
}
