import type { Merchant } from '../api/merchantApi';
import { MerchantRequestError, merchantRequest, staleMerchantSession, type MerchantTransport } from '../api/merchantSession';

const TOKEN_KEY = 'merchant_token';
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface MerchantAuthSnapshot {
  merchant: Merchant | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  sessionKey: string;
  sessionSignal: AbortSignal;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MerchantRequestError('The account response could not be verified.', 0, 'INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
function nonempty(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new MerchantRequestError('The account response is incomplete.', 0, 'INVALID_RESPONSE');
  return value;
}
export function parseMerchant(value: unknown): Merchant {
  const data = object(value);
  const result: Merchant = { id: nonempty(data.id), email: nonempty(data.email), store_name: nonempty(data.store_name), plan: nonempty(data.plan), plan_status: nonempty(data.plan_status) };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) {
    throw new MerchantRequestError('The account identity could not be verified.', 0, 'INVALID_RESPONSE');
  }
  for (const key of ['first_name', 'last_name', 'store_address', 'store_phone', 'city', 'state', 'zip'] as const) {
    if (data[key] !== undefined) {
      if (data[key] !== null && typeof data[key] !== 'string') throw new MerchantRequestError('The account response is incomplete.', 0, 'INVALID_RESPONSE');
      result[key] = data[key];
    }
  }
  if (data.onboarding_path !== undefined) result.onboarding_path = nonempty(data.onboarding_path);
  if (data.created_at !== undefined) {
    result.created_at = nonempty(data.created_at);
    if (!Number.isFinite(Date.parse(result.created_at))) throw new MerchantRequestError('The account creation date could not be verified.', 0, 'INVALID_RESPONSE');
  }
  return result;
}

export function createMerchantAuthController({ storage, transport = merchantRequest, events }: {
  storage: StoragePort; transport?: MerchantTransport; events?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}) {
  let mounted = false, revision = 0;
  let generation = new AbortController();
  let pendingAction: 'login' | 'logout' | null = null;
  const listeners = new Set<() => void>();
  const readToken = () => {
    try { return storage.getItem(TOKEN_KEY); }
    catch { throw new MerchantRequestError('Browser storage is unavailable. Enable site storage and try again.', 0, 'STORAGE'); }
  };
  let initialToken: string | null = null, initialError: string | null = null;
  try { initialToken = readToken(); } catch (error) { initialError = (error as Error).message; }
  let snapshot: MerchantAuthSnapshot = { merchant: null, token: initialToken, loading: !!initialToken, error: initialError, sessionKey: 'merchant-session-0', sessionSignal: generation.signal };
  const publish = (changes: Partial<MerchantAuthSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach(listener => listener());
  };
  const rotate = (changes: Partial<MerchantAuthSnapshot>) => {
    generation.abort();
    generation = new AbortController();
    revision++;
    pendingAction = null;
    publish({ ...changes, sessionKey: `merchant-session-${revision}`, sessionSignal: generation.signal });
  };
  const current = (epoch: number, token: string | null) => {
    try { return mounted && revision === epoch && snapshot.token === token && readToken() === token; }
    catch { return false; }
  };
  const clear = () => {
    try { storage.removeItem(TOKEN_KEY); }
    catch { throw new MerchantRequestError('The session could not be removed from browser storage. Enable site storage, then retry sign out.', 0, 'STORAGE'); }
    // Legacy cached profile is never used as account evidence.
    try { storage.removeItem('merchant_info'); } catch { /* Credential removal succeeded. */ }
    rotate({ merchant: null, token: null, loading: false, error: null });
  };
  const refresh = async () => {
    if (!mounted) return;
    let token: string | null;
    try { token = readToken(); }
    catch (error) { rotate({ merchant: null, token: null, loading: false, error: (error as Error).message }); return; }
    rotate({ merchant: null, token, loading: !!token, error: null });
    if (!token) return;
    const epoch = revision;
    try {
      const data = await transport('/api/merchant/auth/me', {}, { token, current: () => current(epoch, token), signal: generation.signal });
      const merchant = parseMerchant(data);
      if (!current(epoch, token)) return;
      publish({ merchant, loading: false, error: null });
    } catch (error) {
      if (!current(epoch, token)) return;
      if (error instanceof MerchantRequestError && error.status === 401) {
        try { clear(); } catch (storageError) { publish({ merchant: null, loading: false, error: (storageError as Error).message }); }
      } else publish({ merchant: null, loading: false, error: error instanceof Error ? error.message : 'Your account could not be checked. Retry when the service is available.' });
    }
  };
  const storageChanged = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key === TOKEN_KEY || storageEvent.key === null) void refresh();
  };
  const assertAction = (epoch: number, token: string | null, signal?: AbortSignal) => {
    if (signal?.aborted) throw new MerchantRequestError('The account action was cancelled.', 0, 'ABORTED');
    if (!current(epoch, token)) throw staleMerchantSession();
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    mount: () => {
      mounted = true;
      events?.addEventListener('storage', storageChanged);
      void refresh();
      return () => {
        mounted = false;
        generation.abort();
        revision++;
        pendingAction = null;
        events?.removeEventListener('storage', storageChanged);
      };
    },
    retry: refresh,
    isGenerationCurrent: (key: string, token: string | null) => snapshot.sessionKey === key && current(revision, token),
    isCurrent: (key: string, owner: string | null, token: string | null) => snapshot.sessionKey === key && !!owner && snapshot.merchant?.id === owner && current(revision, token),
    login: async (email: string, password: string, signal?: AbortSignal) => {
      if (pendingAction) throw new MerchantRequestError('An account action is already in progress.', 0, 'BUSY');
      const epoch = revision, token = snapshot.token;
      assertAction(epoch, token, signal);
      pendingAction = 'login';
      try {
        const data = object(await transport('/api/merchant/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), signal }, { current: () => current(epoch, token), signal: generation.signal }));
        const newToken = nonempty(data.token), merchant = parseMerchant(data.merchant);
        if (/\s/.test(newToken) || newToken.length > 16384 || merchant.email.toLowerCase() !== email.trim().toLowerCase()) throw new MerchantRequestError('The sign-in response could not be verified.', 0, 'INVALID_RESPONSE');
        assertAction(epoch, token, signal);
        try { storage.setItem(TOKEN_KEY, newToken); }
        catch { throw new MerchantRequestError('Sign in could not be saved. Enable browser site storage and try again.', 0, 'STORAGE'); }
        try { storage.removeItem('merchant_info'); } catch { /* Legacy cache is not used. */ }
        rotate({ merchant, token: newToken, loading: false, error: null });
      } finally { if (revision === epoch) pendingAction = null; }
    },
    logout: async (signal?: AbortSignal) => {
      if (pendingAction) throw new MerchantRequestError('An account action is already in progress.', 0, 'BUSY');
      const epoch = revision, token = snapshot.token;
      assertAction(epoch, token, signal);
      if (!token) return;
      pendingAction = 'logout';
      try {
        try {
          const result = object(await transport('/api/merchant/auth/logout', { method: 'POST', signal }, { token, current: () => current(epoch, token), signal: generation.signal }));
          if (result.ok !== true) throw new MerchantRequestError('Sign out could not be confirmed. Please retry.', 0, 'INVALID_RESPONSE');
        } catch (error) {
          if (!(error instanceof MerchantRequestError) || error.status !== 401) throw error;
        }
        assertAction(epoch, token, signal);
        clear();
      } finally { if (revision === epoch) pendingAction = null; }
    },
  };
}
