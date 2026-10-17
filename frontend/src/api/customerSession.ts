export class CustomerRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 0, code = 'REQUEST_FAILED') {
    super(message); this.name = 'CustomerRequestError'; this.status = status; this.code = code;
  }
}

export interface CustomerSession {
  key: string;
  guestId: string | null;
  current(): boolean;
  assertCurrent(): void;
  request(path: string, init?: RequestInit): Promise<unknown>;
}
export type CustomerRequestScope = { guestId?: string | null; current?: () => boolean; signal?: AbortSignal };
export type CustomerTransport = (path: string, init?: RequestInit, scope?: CustomerRequestScope) => Promise<unknown>;
export const staleCustomerSession = () => new CustomerRequestError('This checkout session changed. Reload before continuing.', 409, 'STALE_SESSION');
const knownCodes = new Set(['GUEST_SESSION_CHANGED', 'GUEST_SESSION_EXPIRED', 'REQUEST_CONFLICT', 'PAYMENT_PENDING', 'PAYMENT_UNAVAILABLE', 'PAYMENT_RECONCILIATION_REQUIRED', 'PAYMENT_OUTCOME_UNKNOWN', 'ORDER_RETIRED']);
function messageFor(status: number, code: string) {
  if (code === 'PAYMENT_RECONCILIATION_REQUIRED') return 'An earlier payment setup needs support review before this order can accept a payment. Contact support with the order reference.';
  if (code === 'PAYMENT_OUTCOME_UNKNOWN') return 'Payment setup is not yet confirmed. Check the saved payment status for this same order before trying again.';
  if (code === 'ORDER_RETIRED') return 'This completed order has reached its retention limit and its details are no longer available. You can start a new delivery.';
  if (status === 401 || status === 403) return 'This browser no longer has access to the checkout. Restore the session before continuing.';
  if (status === 404) return 'This order or request was not found in this checkout session.';
  if (status === 409) return 'The request conflicts with the current checkout. Check its saved status before repeating it.';
  if (status === 400 || status === 422) return 'Check the delivery details and try again.';
  if (status === 402) return 'Payment is not confirmed. Check its status before trying again.';
  if (status === 429) return 'Too many requests. Wait a moment before trying again.';
  return 'The checkout service could not confirm the request. Its result is not yet known.';
}

export function createCustomerTransport({ fetcher = globalThis.fetch, timeoutMs = 15000 }: { fetcher?: typeof fetch; timeoutMs?: number } = {}): CustomerTransport {
  return async (path, init = {}, scope = {}) => {
    let safe = false;
    try { safe = path.split('?')[0].split('/').every(part => { const decoded = decodeURIComponent(part); return decoded !== '.' && decoded !== '..' && !/[\\/]/.test(decoded); }); } catch { /* Invalid encoding. */ }
    if (!/^\/(?:customer\/session|orders(?:[/?]|$)|payments\/(?:intent|confirm)$)/.test(path) || /[\\#\r\n]/.test(path) || !safe) {
      throw new CustomerRequestError('Invalid checkout request destination.', 0, 'INVALID_PATH');
    }
    if (path.startsWith('/customer/session') && path !== '/customer/session') throw new CustomerRequestError('Invalid session destination.', 0, 'INVALID_PATH');
    const current = scope.current ?? (() => true);
    const assertCurrent = () => { if (!current()) throw staleCustomerSession(); };
    assertCurrent();
    const controller = new AbortController();
    const signals = [init.signal, scope.signal].filter((signal): signal is AbortSignal => !!signal);
    let timedOut = false;
    const cancelledError = () => new CustomerRequestError(timedOut ? 'The request timed out. Check its saved status before repeating it.' : 'The request was cancelled. Its result is not confirmed.', 0, timedOut ? 'TIMEOUT' : 'ABORTED');
    const abort = () => controller.abort();
    for (const signal of signals) { signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); }
    let rejectAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(cancelledError());
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
      if (controller.signal.aborted) rejectAbort();
    });
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const operation = async () => {
        if (controller.signal.aborted) throw cancelledError();
        const headers = new Headers(init.headers);
        headers.delete('Authorization');
        headers.delete('X-Stylere-Guest-Id');
        headers.set('Accept', 'application/json');
        if (init.body != null) headers.set('Content-Type', 'application/json');
        if (scope.guestId) headers.set('X-Stylere-Guest-Id', scope.guestId);
        const response = await fetcher('/shopify/api' + path, { ...init, headers, signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
        assertCurrent();
        if (controller.signal.aborted) throw cancelledError();
        if (response.status === 204 && path === '/customer/session' && init.method === 'DELETE') return null;
        const json = /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type') ?? '');
        if (!response.ok) {
          let code = 'REQUEST_FAILED';
          if (json) { try { const data: unknown = await response.json(); if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string' && knownCodes.has(data.code)) code = data.code; } catch { /* Preserve HTTP status without exposing an error body. */ } }
          assertCurrent();
          if (controller.signal.aborted) throw cancelledError();
          throw new CustomerRequestError(messageFor(response.status, code), response.status, code);
        }
        if (!json) throw new CustomerRequestError('The checkout response could not be read.', response.status, 'INVALID_RESPONSE');
        const data: unknown = await response.json();
        assertCurrent();
        if (controller.signal.aborted) throw cancelledError();
        return data;
      };
      return await Promise.race([operation(), cancelled]);
    } catch (error) {
      assertCurrent();
      if (error instanceof CustomerRequestError) throw error;
      if (controller.signal.aborted) throw cancelledError();
      throw new CustomerRequestError('The checkout service could not be reached. Check the saved request before repeating a change.', 0, 'NETWORK_OR_RESPONSE');
    } finally {
      clearTimeout(timer);
      signals.forEach(signal => signal.removeEventListener('abort', abort));
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
    }
  };
}
export const customerRequest = createCustomerTransport();
