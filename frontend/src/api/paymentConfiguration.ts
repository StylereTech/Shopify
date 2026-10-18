import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { CustomerRequestError } from './customerSession';

const validKey = (value: unknown): value is string => typeof value === 'string' && /^pk_(test|live)_[a-zA-Z0-9]+$/.test(value);
const unavailable = () => new CustomerRequestError('Payment options are unavailable for this website. Your order remains unpaid.', 0, 'PAYMENT_CONFIGURATION_UNAVAILABLE');

/** The embedded release reads public deployment configuration without rebuilding
 * its payment chunk. Standalone builds can retain their explicit public key. */
export async function loadPaymentConfiguration(signal: AbortSignal, options: {
  fetcher?: typeof fetch; stripeLoader?: typeof loadStripe; compiledKey?: string; timeoutMs?: number;
} = {}): Promise<Stripe> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => controller.abort();
  let rejectAbort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(unavailable());
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    timer = setTimeout(cancel, options.timeoutMs ?? 15000);
  });
  const operation = async () => {
    if (controller.signal.aborted) throw unavailable();
    let key: unknown = options.compiledKey ?? import.meta.env.VITE_STRIPE_PK;
    if (!validKey(key)) {
      const response = await (options.fetcher ?? fetch)('/shopify/runtime-config.json', { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok || !/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) throw unavailable();
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value) || !('schemaVersion' in value) || value.schemaVersion !== 1 || !('stripePublishableKey' in value) || 'error' in value) throw unavailable();
      key = value.stripePublishableKey;
    }
    if (!validKey(key) || controller.signal.aborted) throw unavailable();
    const stripe = await (options.stripeLoader ?? loadStripe)(key);
    if (!stripe || controller.signal.aborted) throw unavailable();
    return stripe;
  };
  try { return await Promise.race([operation(), stopped]); }
  catch { throw unavailable(); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', rejectAbort); }
}
