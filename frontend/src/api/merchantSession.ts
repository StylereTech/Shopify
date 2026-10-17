export class MerchantRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = 'MerchantRequestError';
    this.status = status;
    this.code = code;
  }
}

export const isMerchantAccessDenied = (error: unknown) => error instanceof MerchantRequestError && (error.status === 401 || error.status === 403);
export const staleMerchantSession = () => new MerchantRequestError('This account session changed. Reload the page before continuing.', 0, 'STALE_SESSION');

export interface MerchantSession {
  key: string;
  owner: string | null;
  current(): boolean;
  assertCurrent(): void;
  request(path: string, init?: RequestInit): Promise<unknown>;
}
type Scope = { token?: string | null; current?: () => boolean; signal?: AbortSignal };
export type MerchantTransport = (path: string, init?: RequestInit, scope?: Scope) => Promise<unknown>;

function statusMessage(status: number) {
  if (status === 401) return 'Your merchant session has ended. Sign in again.';
  if (status === 403) return 'This merchant account does not have access to this action.';
  if (status === 404) return 'The requested record was not found for this merchant account.';
  if (status === 409) return 'This request conflicts with an existing record. Refresh before trying again.';
  if (status === 400 || status === 422) return 'The request could not be accepted. Check the information and try again.';
  if (status === 429) return 'Too many requests. Wait a moment before trying again.';
  return 'The merchant service could not confirm this request. Try again when the service is available.';
}
export function createMerchantTransport({ base = '/shopify', fetcher = globalThis.fetch, timeoutMs = 15000 }: {
  base?: string; fetcher?: typeof fetch; timeoutMs?: number;
} = {}): MerchantTransport {
  return async (path, init = {}, scope = {}) => {
    let safeSegments = false;
    try { safeSegments = path.split('?')[0].split('/').every(segment => { const decoded = decodeURIComponent(segment); return !['.', '..'].includes(decoded) && !/[\\/]/.test(decoded); }); }
    catch { /* Malformed URL encodings are not request destinations. */ }
    if (!/^\/api\/merchant(?:\/|\?|$)/.test(path) || /[\\#\r\n]/.test(path) || !safeSegments) {
      throw new MerchantRequestError('Invalid merchant request destination.', 0, 'INVALID_PATH');
    }
    const current = scope.current ?? (() => true);
    const assertCurrent = () => { if (!current()) throw staleMerchantSession(); };
    assertCurrent();
    const controller = new AbortController();
    const signals = [init.signal, scope.signal].filter((signal): signal is AbortSignal => !!signal);
    let timedOut = false;
    const abort = () => controller.abort();
    const aborted = () => timedOut
      ? new MerchantRequestError('The request timed out. Its result is not confirmed; refresh before repeating a change.', 0, 'TIMEOUT')
      : new MerchantRequestError('The request was cancelled. Its result is not confirmed.', 0, 'ABORTED');
    for (const signal of signals) {
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) controller.abort();
    }
    let rejectCancellation: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectCancellation = () => reject(aborted());
      controller.signal.addEventListener('abort', rejectCancellation, { once: true });
      if (controller.signal.aborted) rejectCancellation();
    });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const operation = async () => {
        if (controller.signal.aborted) throw aborted();
        const headers = new Headers(init.headers);
        headers.delete('Authorization');
        headers.set('Accept', 'application/json');
        if (init.body !== undefined && init.body !== null) headers.set('Content-Type', 'application/json');
        if (scope.token) headers.set('Authorization', `Bearer ${scope.token}`);
        const response = await fetcher(`${base.replace(/\/$/, '')}${path}`, {
          ...init, headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        });
        assertCurrent();
        if (controller.signal.aborted) throw aborted();
        // Preserve HTTP status even if a proxy returns HTML instead of JSON.
        if (!response.ok) throw new MerchantRequestError(statusMessage(response.status), response.status);
        if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type') ?? '')) {
          throw new MerchantRequestError('The merchant service returned an unreadable response.', response.status, 'INVALID_RESPONSE');
        }
        const data: unknown = await response.json();
        assertCurrent();
        if (controller.signal.aborted) throw aborted();
        return data;
      };
      return await Promise.race([operation(), cancelled]);
    } catch (error) {
      assertCurrent();
      if (error instanceof MerchantRequestError) throw error;
      if (controller.signal.aborted) throw aborted();
      throw new MerchantRequestError('The merchant service could not be reached or its response could not be read. The result is not confirmed.', 0, 'NETWORK_OR_RESPONSE');
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', abort);
      if (rejectCancellation) controller.signal.removeEventListener('abort', rejectCancellation);
    }
  };
}
export const merchantRequest = createMerchantTransport({ base: import.meta.env?.VITE_API_URL ?? '/shopify' });

export function createMerchantSession({ key, owner, token, current, signal, transport = merchantRequest }: {
  key: string; owner: string | null; token: string | null; current: () => boolean; signal?: AbortSignal; transport?: MerchantTransport;
}): MerchantSession {
  const assertCurrent = () => { if (!owner || !token || !current()) throw staleMerchantSession(); };
  return { key, owner, current: () => !!owner && !!token && current(), assertCurrent,
    request: async (path, init) => { assertCurrent(); return transport(path, init, { token, current, signal }); },
  };
}
