import { CustomerRequestError, customerRequest, staleCustomerSession, type CustomerSession, type CustomerTransport } from '../api/customerSession';
import { customerObject, customerUuid } from '../lib/customerContracts';

export const CUSTOMER_SESSION_NOTICE = 'stylere-customer-session-notice';
export interface CustomerSessionSnapshot {
  key: string;
  guestId: string | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
}
type StoragePort = Pick<Storage, 'setItem'>;
export function createCustomerSessionController({ transport = customerRequest, bindGuest, storage, events, now = Date.now }: {
  transport?: CustomerTransport; bindGuest(id: string | null): void;
  storage?: StoragePort; events?: Pick<Window, 'addEventListener' | 'removeEventListener'>; now?: () => number;
}) {
  let revision = 0, started = false;
  let generation = new AbortController();
  let pending: Promise<void> | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let snapshot: CustomerSessionSnapshot = { key: 'customer-session-0', guestId: null, status: 'loading', error: null };
  const listeners = new Set<() => void>();
  const publish = (changes: Partial<CustomerSessionSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach(listener => listener());
  };
  const rotate = (changes: Partial<CustomerSessionSnapshot>) => {
    generation.abort(); generation = new AbortController(); revision++;
    clearTimeout(expiry); expiry = undefined;
    publish({ ...changes, key: `customer-session-${revision}` });
  };
  const parse = (data: unknown) => {
    const row = customerObject(data); const guestId = customerUuid(row.guestId);
    const expires = typeof row.expiresAt === 'string' ? Date.parse(row.expiresAt) : NaN;
    if (!Number.isFinite(expires) || expires <= now()) throw new CustomerRequestError('The checkout session has expired. Restore it before continuing.', 401, 'GUEST_SESSION_EXPIRED');
    return { guestId, expires };
  };
  const notice = (id: string | null) => {
    try { storage?.setItem(CUSTOMER_SESSION_NOTICE, JSON.stringify({ guestId: id, nonce: crypto.randomUUID() })); } catch { /* Server ownership checks still enforce the cookie identity. */ }
  };
  const fail = (error: unknown) => rotate({ guestId: null, status: 'error', error: error instanceof Error ? error.message : 'Checkout could not be restored. Try again.' });
  const refresh = (): Promise<void> => {
    if (pending) return pending;
    rotate({ guestId: null, status: 'loading', error: null });
    const epoch = revision, signal = generation.signal;
    const current = () => revision === epoch;
    const run = async () => {
      try {
        const created = parse(await transport('/customer/session', { method: 'POST', body: '{}' }, { current, signal }));
        // A second tab may have replaced the shared cookie while POST was pending.
        const verified = parse(await transport('/customer/session', {}, { guestId: created.guestId, current, signal }));
        if (!current()) return;
        if (verified.guestId !== created.guestId) throw staleCustomerSession();
        bindGuest(verified.guestId);
        publish({ guestId: verified.guestId, status: 'ready', error: null });
        expiry = setTimeout(() => { if (current()) fail(new CustomerRequestError('The checkout session has expired. Restore it before continuing.', 401, 'GUEST_SESSION_EXPIRED')); }, Math.min(verified.expires - now(), 2147483647));
        notice(verified.guestId);
      } catch (error) { if (current()) fail(error); }
    };
    const job = run(); pending = job;
    void job.finally(() => { if (pending === job) pending = null; });
    return job;
  };
  const storageChanged = (event: Event) => {
    const change = event as StorageEvent;
    if (change.key !== CUSTOMER_SESSION_NOTICE && change.key !== null) return;
    // A same-owner readiness notice should not cause tabs to refresh each other.
    try { if (change.newValue && JSON.parse(change.newValue).guestId === snapshot.guestId && snapshot.status === 'ready') return; } catch { /* Unknown notice invalidates the visible scope. */ }
    rotate({ guestId: null, status: 'error', error: 'The checkout session changed in another tab. Restore it before continuing.' });
  };
  const capture = (): CustomerSession => {
    const { key, guestId } = snapshot; const signal = generation.signal;
    const current = () => !signal.aborted && snapshot.key === key && snapshot.guestId === guestId && !!guestId && snapshot.status === 'ready';
    const assertCurrent = () => { if (!current()) throw staleCustomerSession(); };
    return { key, guestId, current, assertCurrent, request: async (path, init = {}) => {
      assertCurrent();
      try { const result = await transport(path, init, { guestId, signal, current }); assertCurrent(); return result; }
      catch (error) {
        if (current() && error instanceof CustomerRequestError && (error.status === 401 || error.code === 'GUEST_SESSION_CHANGED')) fail(error);
        throw error;
      }
    } };
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    start: () => { if (started) return; started = true; events?.addEventListener('storage', storageChanged); void refresh(); },
    retry: refresh,
    capture,
    end: async () => {
      if (pending) throw new CustomerRequestError('Checkout session recovery is in progress.', 409, 'BUSY');
      const session = capture(); session.assertCurrent();
      const job = (async () => {
        await session.request('/customer/session', { method: 'DELETE', body: '{}' });
        session.assertCurrent();
        bindGuest(null); notice(null);
        rotate({ guestId: null, status: 'error', error: 'This checkout session has ended. Start a new session to continue.' });
      })();
      pending = job;
      try { await job; } finally { if (pending === job) pending = null; }
    },
    dispose: () => { events?.removeEventListener('storage', storageChanged); clearTimeout(expiry); generation.abort(); revision++; started = false; pending = null; },
  };
}
