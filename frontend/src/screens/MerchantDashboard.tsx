import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMerchantAuth } from '../context/merchantAuthState';
import { useMerchantSession } from '../context/useMerchantSession';
import { isMerchantAccessDenied, MerchantRequestError, type MerchantSession } from '../api/merchantSession';
import { createMerchantDashboardApi, dashboardTabs, dashboardSearch, parseDashboardLocation, orderDetailPath,
  orderStatuses, dollarsToCents, money, pendingOrderRequest, rememberOrderRequest,
  type MerchantDashboardApi, type DashboardLocation, type OrderRecord, type OrderPage, type Ownership, type Settings, type CreateOrderInput,
} from '../api/merchantDashboardApi';
import logo from '../assets/stylere_logo.jpg';
import './merchant-dashboard.css';

type PanelProps = { session: MerchantSession; api: MerchantDashboardApi; context: DashboardLocation };
const tabLabels = { overview: 'Overview', orders: 'Orders', tracking: 'Tracking', settings: 'Settings', billing: 'Billing', team: 'Team' };
const label = (value: string | null) => value ? value.replaceAll('_', ' ').replace(/^\w/, first => first.toUpperCase()) : 'Not recorded';
const dateLabel = (value: string) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const queryOptions = { retry: false as const, gcTime: 0, refetchOnWindowFocus: false };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be confirmed. Please retry.';
const queryPrefix = (session: MerchantSession) => ['merchant-dashboard', session.key];

function usePanelScope(session: MerchantSession) {
  const scope = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController(); scope.current = controller;
    return () => controller.abort();
  }, [session.key]);
  return useMemo(() => ({ scope, current: () => Boolean(scope.current && !scope.current.signal.aborted && session.current()) }), [session]);
}
function Failure({ error, retry, busy = false }: { error: unknown; retry?: () => void; busy?: boolean }) {
  return <div role="alert" className="merchant-workspace__notice merchant-workspace__notice--error">
    <p>{errorMessage(error)}</p><div className="merchant-workspace__actions">
      {retry && <button type="button" className="mw-button mw-button--secondary" disabled={busy} onClick={retry}>Try again</button>}
      {isMerchantAccessDenied(error) && <><Link to="/merchant/login">Sign in again</Link><Link to="/merchant/dashboard?tab=billing">Review billing access</Link></>}
    </div>
  </div>;
}
function Loading({ children }: { children: ReactNode }) { return <p role="status" className="merchant-workspace__empty">{children}</p>; }
function OwnershipNotice({ value }: { value: Ownership }) {
  return <div className="merchant-workspace__scope">
    <p>{value.shopify === 'linked' ? value.linked_shop_count + ' verified Shopify ' + (value.linked_shop_count === 1 ? 'store is' : 'stores are') + ' linked to this account.' : 'No verified Shopify store is linked to this account. Shopify order coverage is unavailable.'}</p>
    <p>These views include orders assigned to this merchant. Historical orders without verified ownership are excluded.</p>
  </div>;
}
function Status({ value }: { value: string | null }) { return <span className={'merchant-workspace__status is-' + (value || 'unknown')}>{label(value)}</span>; }
function OrdersList({ orders, context }: { orders: OrderRecord[]; context: DashboardLocation }) {
  return <ul className="merchant-workspace__orders">{orders.map(order => <li key={order.id}>
    <Link className="merchant-workspace__order" to={orderDetailPath(order.id, context)}>
      <div className="merchant-workspace__order-copy"><strong>{order.customer_name || 'Customer name not recorded'}</strong><span className="merchant-workspace__id">Order {order.id}</span>
        {order.delivery_address && <span>{order.delivery_address}</span>}<small>{dateLabel(order.created_at)} UTC · {order.source === 'shopify' ? 'Shopify' : 'Manual record'}</small></div>
      <div className="merchant-workspace__order-state"><Status value={order.status} /><span>Declared value: {money(order.declared_amount_cents)}</span><span className="merchant-workspace__open">View order →</span></div>
    </Link>
  </li>)}</ul>;
}
function Pagination({ data, context, active, busy }: { data: OrderPage; context: DashboardLocation; active: boolean; busy: boolean }) {
  const { page, pages, total, limit } = data.pagination;
  const href = (value: number) => '/merchant/dashboard' + dashboardSearch({ ...context, [active ? 'trackingPage' : 'page']: value });
  if (pages <= 1 && page <= 1) return null;
  return <nav className="merchant-workspace__pagination" aria-label={active ? 'Tracking pages' : 'Order pages'}>
    <p>{data.orders.length ? 'Showing ' + ((page - 1) * limit + 1) + '–' + ((page - 1) * limit + data.orders.length) + ' of ' + total : total + ' matching orders'} · Page {page}</p>
    <div className="merchant-workspace__actions">
      {page > Math.max(1, pages) && <Link to={href(1)} className="mw-button mw-button--secondary">First page</Link>}
      {page > 1 && !busy ? <Link to={href(page - 1)} className="mw-button mw-button--secondary" aria-label={active ? 'Previous tracking page' : 'Previous orders page'}>Previous</Link> : <button type="button" className="mw-button mw-button--secondary" disabled>Previous</button>}
      {page < pages && !busy ? <Link to={href(page + 1)} className="mw-button mw-button--secondary" aria-label={active ? 'Next tracking page' : 'Next orders page'}>Next</Link> : <button type="button" className="mw-button mw-button--secondary" disabled>Next</button>}
    </div>
  </nav>;
}
function OverviewPanel({ session, api, context }: PanelProps) {
  const result = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), 'overview'], queryFn: ({ signal }) => api.dashboard(signal), enabled: session.current() });
  return <section aria-labelledby="merchant-overview-title">
    <div className="merchant-workspace__heading"><div><h1 id="merchant-overview-title">Overview</h1><p>Your merchant orders at a glance.</p></div><button className="mw-button mw-button--secondary" disabled={result.isFetching} onClick={() => void result.refetch()}>Refresh overview</button></div>
    {result.isPending ? <Loading>Loading order overview…</Loading> : result.isError ? <Failure error={result.error} retry={() => void result.refetch()} busy={result.isFetching} /> : result.data && <>
      <OwnershipNotice value={result.data.ownership} />
      <div className="merchant-workspace__metrics">{[
        ['Active deliveries', result.data.stats.active], ['Pending orders', result.data.stats.pending],
        ['Completed today (UTC)', result.data.stats.completed_today], ['Failed / cancelled', result.data.stats.failed],
      ].map(([name, value]) => <div className="merchant-workspace__card" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
      <p className="merchant-workspace__note">Current status counts cover all {result.data.stats.total} owned orders. Today uses recorded completion times in UTC.</p>
      {result.data.stats.completion_time_unknown > 0 && <p className="merchant-workspace__notice">{result.data.stats.completion_time_unknown} delivered {result.data.stats.completion_time_unknown === 1 ? 'order has' : 'orders have'} no recorded completion time and {result.data.stats.completion_time_unknown === 1 ? 'is' : 'are'} excluded from today’s count.</p>}
      <div className="merchant-workspace__card"><h2>Recent orders</h2><p className="merchant-workspace__note">The five most recently created owned orders.</p>
        {result.data.recent_orders.length ? <OrdersList orders={result.data.recent_orders} context={context} /> : <p className="merchant-workspace__empty">No owned orders have been recorded.</p>}
        <Link className="merchant-workspace__text-link" to={'/merchant/dashboard' + dashboardSearch({ ...context, tab: 'orders' })}>View all orders →</Link>
      </div>
    </>}
  </section>;
}


function OrderComposer({ session, api, context, close }: PanelProps & { close: () => void }) {
  const scope = usePanelScope(session), queryClient = useQueryClient(), heading = useRef<HTMLHeadingElement | null>(null), locked = useRef(false);
  const [draft, setDraft] = useState({ customer_name: '', customer_phone: '', customer_email: '', delivery_address: '', amount: '' });
  const [requestId, setRequestId] = useState(() => pendingOrderRequest(session.owner));
  const [attempt, setAttempt] = useState<CreateOrderInput | null>(null);
  const [saved, setSaved] = useState<OrderRecord | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const recovery = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), 'create-recovery', requestId],
    enabled: Boolean(requestId) && !attempt && !saved && session.current(), queryFn: ({ signal }) => api.recoverOrder(requestId!, signal) });
  const accept = useCallback((order: OrderRecord) => {
    if (!scope.current()) return;
    setSaved(order); setError(null); setAttempt(null); setRequestId(null); rememberOrderRequest(session.owner, null);
    void queryClient.invalidateQueries({ queryKey: queryPrefix(session), predicate: query => ['overview', 'orders', 'tracking'].includes(String(query.queryKey[2])) });
  }, [scope, session, queryClient]);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (requestId && recovery.data && !saved) accept(recovery.data); }, [accept, recovery.data, requestId, saved]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!scope.current() || locked.current || saved || recovery.isFetching || isMerchantAccessDenied(error) || isMerchantAccessDenied(recovery.error)) return;
    let value: CreateOrderInput;
    try {
      value = attempt || { request_id: requestId || crypto.randomUUID(), customer_name: draft.customer_name.trim(), customer_phone: draft.customer_phone.trim() || undefined,
        customer_email: draft.customer_email.trim().toLowerCase() || undefined, delivery_address: draft.delivery_address.trim(), declared_amount_cents: dollarsToCents(draft.amount), items: [] };
      if (!value.customer_name || !value.delivery_address) throw new MerchantRequestError('Enter the customer name and delivery address.');
    } catch (failure) { setError(failure); return; }
    if (!rememberOrderRequest(session.owner, value.request_id)) { setError(new MerchantRequestError('Browser session storage is unavailable. Enable it before saving so an interrupted request can be recovered safely.')); return; }
    locked.current = true; setBusy(true); setError(null); setAttempt(value); setRequestId(value.request_id);
    try { const order = await api.createOrder(value, scope.scope.current!.signal); if (scope.current()) accept(order); }
    catch (failure) { if (scope.current()) {
      setError(failure);
      // A validation rejection has not created a record; uncertain outcomes keep the exact submitted payload.
      if (failure instanceof MerchantRequestError && failure.status === 400) setAttempt(null);
    } }
    finally { if (scope.current()) { locked.current = false; setBusy(false); } }
  };
  async function recover() {
    if (!scope.current() || locked.current) return;
    const result = await recovery.refetch();
    if (scope.current() && !result.error && result.data) accept(result.data);
  }
  const recoveryDenied = isMerchantAccessDenied(recovery.error) || isMerchantAccessDenied(error);
  return <section className="merchant-workspace__card merchant-workspace__composer" aria-labelledby="manual-order-title">
    <div className="merchant-workspace__heading"><h2 id="manual-order-title" ref={heading} tabIndex={-1}>New manual order</h2><button type="button" className="mw-button mw-button--secondary" onClick={close} disabled={busy}>Close form</button></div>
    <p className="merchant-workspace__note">Record an order for your store. This saves a manual record; it does not charge a customer, quote a delivery, or dispatch a driver.</p>
    {saved ? <div role="status" className="merchant-workspace__notice"><p>A saved record is confirmed for this request.</p><p>Order {saved.id} · {label(saved.status)} · Payment: {label(saved.payment_status)}</p><Link to={orderDetailPath(saved.id, context)}>Review the saved order →</Link></div>
      : recoveryDenied ? <Failure error={isMerchantAccessDenied(error) ? error : recovery.error} retry={() => void recover()} />
      : <>
        {Boolean(error) && <Failure error={error} />}
        {error instanceof MerchantRequestError && error.status === 409 && <p className="merchant-workspace__notice">This request conflicts with saved details. Check the saved order or <Link to="/support">contact support</Link> before continuing. A new request will not be created.</p>}
        {requestId && <div className="merchant-workspace__notice">
          <p>{recovery.isFetching ? 'Checking whether this request already saved an order…' : 'A request is being kept for this order. An unconfirmed response does not mean the save failed.'}</p>
          {attempt ? <p>Your submitted details are locked. Retry uses the same request and details.</p> : <p>If no saved record is found, re-enter the original details. The same request ID will be reused.</p>}
          <button type="button" className="mw-button mw-button--secondary" disabled={busy || recovery.isFetching} onClick={() => void recover()}>Check saved order</button>
          {recovery.isError && <p role="alert">{recovery.error instanceof MerchantRequestError && recovery.error.status === 404 ? 'No saved order is confirmed for this request yet.' : errorMessage(recovery.error)}</p>}
        </div>}
        <form className="merchant-workspace__form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy || recovery.isFetching || Boolean(attempt)}>
            <div className="merchant-workspace__fields">
              <label htmlFor="manual-customer">Customer name<input id="manual-customer" required maxLength={200} value={draft.customer_name} onChange={event => setDraft(value => ({ ...value, customer_name: event.target.value }))} /></label>
              <label htmlFor="manual-phone">Phone <small>(optional)</small><input id="manual-phone" type="tel" maxLength={50} value={draft.customer_phone} onChange={event => setDraft(value => ({ ...value, customer_phone: event.target.value }))} /></label>
              <label htmlFor="manual-email">Email <small>(optional)</small><input id="manual-email" type="email" maxLength={254} value={draft.customer_email} onChange={event => setDraft(value => ({ ...value, customer_email: event.target.value }))} /></label>
              <label htmlFor="manual-amount">Declared order value (USD)<input id="manual-amount" required inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} aria-describedby="manual-amount-help" /><small id="manual-amount-help">Merchandise value for this record. This is not a payment or delivery quote.</small></label>
              <label htmlFor="manual-address" className="merchant-workspace__wide">Delivery address<textarea id="manual-address" required maxLength={1000} rows={3} value={draft.delivery_address} onChange={event => setDraft(value => ({ ...value, delivery_address: event.target.value }))} /></label>
            </div>
          </fieldset>
          <button className="mw-button" type="submit" disabled={busy || recovery.isFetching || (error instanceof MerchantRequestError && error.status === 409)}>{busy ? 'Saving record…' : attempt ? 'Retry same request' : 'Save order record'}</button>
        </form>
      </>}
  </section>;
}
function OrdersPanel({ session, api, context, tracking = false }: PanelProps & { tracking?: boolean }) {
  const [params, setParams] = useSearchParams(), newButton = useRef<HTMLButtonElement | null>(null);
  const [composer, setComposer] = useState(() => !tracking && Boolean(pendingOrderRequest(session.owner)));
  const page = tracking ? context.trackingPage : context.page;
  const result = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), tracking ? 'tracking' : 'orders', page, tracking ? '' : context.status],
    enabled: session.current(), queryFn: ({ signal }) => api.orders({ page, limit: 20, ...(tracking ? { active: true } : { status: context.status || undefined }) }, signal),
    refetchInterval: tracking ? 15000 : false });
  return <section aria-labelledby="merchant-orders-title">
    <div className="merchant-workspace__heading"><div><h1 id="merchant-orders-title">{tracking ? 'Tracking' : 'Orders'}</h1><p>{tracking ? 'All pending and in-progress owned orders, including older records. Updates refresh every 15 seconds while this view is open.' : 'Find an owned order or save a manual record.'}</p></div>
      <div className="merchant-workspace__actions"><button type="button" className="mw-button mw-button--secondary" disabled={result.isFetching} onClick={() => void result.refetch()}>Refresh {tracking ? 'tracking' : 'orders'}</button>
        {!tracking && <button type="button" ref={newButton} className="mw-button" disabled={composer || isMerchantAccessDenied(result.error)} onClick={() => setComposer(true)}>New Order</button>}</div>
    </div>
    {!tracking && <label htmlFor="merchant-status" className="merchant-workspace__filter">Order status
      <select id="merchant-status" value={context.status} onChange={event => { const next = new URLSearchParams(params); next.set('tab', 'orders'); if (event.target.value) next.set('status', event.target.value); else next.delete('status'); next.delete('page'); setParams(next); }}>
        <option value="">All statuses</option>{orderStatuses.map(status => <option key={status} value={status}>{label(status)}</option>)}
      </select>
    </label>}
    {composer && !tracking && !isMerchantAccessDenied(result.error) && <OrderComposer key={dashboardSearch(context)} session={session} api={api} context={context} close={() => { setComposer(false); newButton.current?.focus(); }} />}
    {result.isPending ? <Loading>Loading {tracking ? 'active deliveries' : 'orders'}…</Loading> : result.isError ? <Failure error={result.error} retry={() => void result.refetch()} busy={result.isFetching} /> : result.data && <>
      <OwnershipNotice value={result.data.ownership} />
      {tracking && <p className="merchant-workspace__note">Status updates are not a live driver-location feed. Open an order for its available tracking information.</p>}
      {result.isFetching && <p role="status" className="merchant-workspace__note">Refreshing records…</p>}
      <div className="merchant-workspace__card">{result.data.orders.length ? <OrdersList orders={result.data.orders} context={context} /> : <p className="merchant-workspace__empty">{page > Math.max(1, result.data.pagination.pages) ? 'This page no longer contains orders. Return to the first page.' : tracking ? 'No active owned deliveries were returned.' : 'No owned orders match this filter.'}</p>}</div>
      <Pagination data={result.data} context={context} active={tracking} busy={result.isFetching} />
    </>}
  </section>;
}


function SettingsEditor({ value, session, api }: { value: Settings; session: MerchantSession; api: MerchantDashboardApi }) {
  const [draft, setDraft] = useState(value), [busy, setBusy] = useState(false), [needsReview, setNeedsReview] = useState(false);
  const [error, setError] = useState<unknown>(null), [notice, setNotice] = useState('');
  const scope = usePanelScope(session), locked = useRef(false), queryClient = useQueryClient();
  async function reload() {
    if (!scope.current() || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const saved = await api.settings(scope.scope.current!.signal);
      if (!scope.current()) return;
      setDraft(saved); setNeedsReview(false); setError(null); setNotice('Saved settings loaded. Review them before making another change.');
      queryClient.setQueryData([...queryPrefix(session), 'settings'], saved);
    } catch (failure) { if (scope.current()) setError(failure); }
    finally { if (scope.current()) { locked.current = false; setBusy(false); } }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!scope.current() || locked.current || needsReview || isMerchantAccessDenied(error)) return;
    const input = Object.fromEntries(Object.entries(draft).map(([key, text]) => [key, text.trim()])) as Settings;
    if (!input.store_name) { setError(new MerchantRequestError('Enter your store name.')); return; }
    locked.current = true; setBusy(true); setError(null); setNotice('');
    try {
      const saved = await api.updateSettings(input, scope.scope.current!.signal);
      if (!scope.current()) return;
      setDraft(saved); queryClient.setQueryData([...queryPrefix(session), 'settings'], saved); setNotice('Your saved settings are confirmed.');
    } catch (failure) { if (scope.current()) { setError(failure); setNeedsReview(true); } }
    finally { if (scope.current()) { locked.current = false; setBusy(false); } }
  }
  const fields = [
    ['store_name', 'Store name', 200], ['store_phone', 'Store phone', 50], ['first_name', 'First name', 100], ['last_name', 'Last name', 100],
    ['store_address', 'Store address', 500], ['city', 'City', 100], ['state', 'State', 100], ['zip', 'ZIP code', 20],
  ] as const;
  return <div className="merchant-workspace__card">
    <p className="merchant-workspace__note">Account email: <strong>{draft.email}</strong>. Changes here update the store profile.</p>
    {notice && <p role="status" className="merchant-workspace__notice">{notice}</p>}
    {Boolean(error) && <Failure error={error} />}
    {needsReview && <div className="merchant-workspace__notice"><p>The last save is not confirmed. Reload saved settings before making another change; leaving this page does not reverse a request already received by the server.</p><button type="button" className="mw-button mw-button--secondary" disabled={busy} onClick={() => void reload()}>Reload saved settings</button></div>}
    {!isMerchantAccessDenied(error) && <form className="merchant-workspace__form" onSubmit={save} aria-busy={busy}>
      <fieldset disabled={busy || needsReview}><div className="merchant-workspace__fields">{fields.map(([key, name, max]) =>
        <label key={key} htmlFor={'merchant-setting-' + key} className={key === 'store_address' ? 'merchant-workspace__wide' : undefined}>{name}
          <input id={'merchant-setting-' + key} required={key === 'store_name'} type={key === 'store_phone' ? 'tel' : 'text'} maxLength={max} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} />
        </label>)}</div></fieldset>
      <button type="submit" className="mw-button" disabled={busy || needsReview}>{busy ? 'Checking saved settings…' : 'Save settings'}</button>
    </form>}
  </div>;
}
function SettingsPanel({ session, api }: PanelProps) {
  const result = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), 'settings'], queryFn: ({ signal }) => api.settings(signal), enabled: session.current() });
  return <section aria-labelledby="merchant-settings-title"><div className="merchant-workspace__heading"><div><h1 id="merchant-settings-title">Settings</h1><p>Review the saved store profile before editing.</p></div></div>
    {result.isPending ? <Loading>Loading saved settings…</Loading> : result.isError ? <Failure error={result.error} retry={() => void result.refetch()} busy={result.isFetching} /> : result.data && <SettingsEditor value={result.data} session={session} api={api} />}
  </section>;
}
function BillingPanel({ session, api }: PanelProps) {
  const result = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), 'billing'], queryFn: ({ signal }) => api.billing(signal), enabled: session.current() });
  const scope = usePanelScope(session), locked = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  async function portal() {
    if (!scope.current() || locked.current || isMerchantAccessDenied(error)) return;
    locked.current = true; setBusy(true); setError(null);
    try { const url = await api.billingPortal(scope.scope.current!.signal); if (scope.current()) window.location.assign(url); }
    catch (failure) { if (scope.current()) setError(failure); }
    finally { if (scope.current()) { locked.current = false; setBusy(false); } }
  }
  return <section aria-labelledby="merchant-billing-title">
    <div className="merchant-workspace__heading"><div><h1 id="merchant-billing-title">Billing</h1><p>Review your subscription and recorded invoices.</p></div>
      <button type="button" className="mw-button" disabled={busy || isMerchantAccessDenied(error)} onClick={() => void portal()}>{busy ? 'Opening secure billing…' : 'Manage billing'}</button></div>
    <p className="merchant-workspace__note">Manage billing opens Stripe’s secure billing portal when it is available for this account.</p>
    {Boolean(error) && <Failure error={error} />}
    {result.isPending ? <Loading>Loading billing records…</Loading> : result.isError ? <Failure error={result.error} retry={() => void result.refetch()} busy={result.isFetching} /> : result.data && <>
      <div className="merchant-workspace__card merchant-workspace__plan"><div><h2>{label(result.data.plan)} plan</h2><Status value={result.data.plan_status} /></div><Link to="/merchant/pricing">View plan features</Link></div>
      <div className="merchant-workspace__card"><h2>Invoices</h2>{result.data.invoices.length ? <ul className="merchant-workspace__records">{result.data.invoices.map(invoice => <li key={invoice.id}>
        <div><strong>{money(invoice.amount_cents)}</strong><span className="merchant-workspace__id">Invoice {invoice.id}</span><span>{dateLabel(invoice.created_at)} UTC</span>
          {invoice.period_start && invoice.period_end && <small>Billing period: {dateLabel(invoice.period_start)} – {dateLabel(invoice.period_end)} UTC</small>}</div><Status value={invoice.status} />
      </li>)}</ul> : <p className="merchant-workspace__empty">No invoices were returned for this account.</p>}</div>
    </>}
  </section>;
}


function TeamPanel({ session, api, plan }: PanelProps & { plan: string }) {
  const growth = plan === 'growth';
  const result = useQuery({ ...queryOptions, queryKey: [...queryPrefix(session), 'team'], queryFn: ({ signal }) => api.team(signal), enabled: growth && session.current() });
  const scope = usePanelScope(session), locked = useRef(false), reviewRequired = useRef(false), queryClient = useQueryClient();
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [needsReview, setNeedsReview] = useState(false);
  const [error, setError] = useState<unknown>(null), [notice, setNotice] = useState('');
  async function refresh() {
    if (!scope.current() || locked.current) return;
    const response = await result.refetch();
    if (scope.current() && !response.error && response.data) { reviewRequired.current = false; setNeedsReview(false); setError(null); setNotice('Saved staff records loaded. Check the roster before adding another record.'); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!scope.current() || locked.current || reviewRequired.current || !result.data || result.isError || result.isFetching || isMerchantAccessDenied(error)) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError(new MerchantRequestError('Enter a valid staff email address.')); return; }
    if (result.data.some(member => member.email.toLowerCase() === address)) { setError(new MerchantRequestError('This email already has a staff record. Review the existing record.')); return; }
    locked.current = true; setBusy(true); setError(null); setNotice('');
    try {
      const member = await api.addStaff(address, scope.scope.current!.signal);
      if (!scope.current()) return;
      queryClient.setQueryData([...queryPrefix(session), 'team'], [...result.data, member]); setEmail('');
      setNotice('Staff record saved. No invitation email or sign-in access was created.');
    } catch (failure) { if (scope.current()) { reviewRequired.current = true; setNeedsReview(true); setError(failure); } }
    finally { if (scope.current()) { locked.current = false; setBusy(false); } }
  }
  return <section aria-labelledby="merchant-team-title"><div className="merchant-workspace__heading"><div><h1 id="merchant-team-title">Team</h1><p>Review staff records for your merchant account.</p></div>
    {growth && <button type="button" className="mw-button mw-button--secondary" disabled={busy || result.isFetching} onClick={() => void refresh()}>Refresh staff records</button>}</div>
    {!growth ? <div className="merchant-workspace__card"><h2>Staff records are a Growth plan feature</h2><p>Review your current subscription in Billing or compare plan features. Subscription changes must be confirmed in your billing account.</p>
      <div className="merchant-workspace__actions"><Link className="mw-button" to="/merchant/dashboard?tab=billing">Review billing</Link><Link className="mw-button mw-button--secondary" to="/merchant/pricing">Compare plans</Link></div></div> : <>
      <p className="merchant-workspace__notice">This is a staff roster. Adding a record does not send an invitation or create staff sign-in access.</p>
      {notice && <p role="status" className="merchant-workspace__notice">{notice}</p>}
      {Boolean(error) && <Failure error={error} />}
      {needsReview && <div className="merchant-workspace__notice"><p>The last addition is not confirmed. Refresh the roster and check the email before adding another record.</p><button type="button" className="mw-button mw-button--secondary" disabled={busy || result.isFetching} onClick={() => void refresh()}>Review saved roster</button></div>}
      {result.isPending ? <Loading>Loading staff records…</Loading> : result.isError ? <Failure error={result.error} retry={() => void refresh()} busy={result.isFetching} /> : result.data && !isMerchantAccessDenied(error) && <>
        <div className="merchant-workspace__card"><h2>Staff roster</h2>{result.data.length ? <ul className="merchant-workspace__records">{result.data.map(member => <li key={member.id}>
          <div><strong>{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}</strong><span>{member.email}</span><small>{label(member.role)} · Added {dateLabel(member.created_at)} UTC</small></div><Status value={member.is_active ? 'active' : 'inactive'} />
        </li>)}</ul> : <p className="merchant-workspace__empty">No staff records were returned.</p>}</div>
        <div className="merchant-workspace__card"><h2>Add staff record</h2><form className="merchant-workspace__form" onSubmit={add} aria-busy={busy}>
          <label htmlFor="merchant-staff-email">Staff email<input id="merchant-staff-email" type="email" required maxLength={254} value={email} disabled={busy || needsReview || result.isFetching} onChange={event => setEmail(event.target.value)} /></label>
          <button type="submit" className="mw-button" disabled={busy || needsReview || result.isFetching}>{busy ? 'Saving staff record…' : 'Add staff record'}</button>
        </form></div>
      </>}
    </>}
  </section>;
}
function MerchantDashboardSession({ session }: { session: MerchantSession }) {
  const auth = useMerchantAuth(), navigate = useNavigate(), [params] = useSearchParams();
  const context = parseDashboardLocation(params), api = useMemo(() => createMerchantDashboardApi(session), [session]);
  const scope = usePanelScope(session), locked = useRef(false);
  const [logoutError, setLogoutError] = useState<unknown>(null), [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    if (!scope.current() || locked.current) return;
    locked.current = true; setLoggingOut(true); setLogoutError(null);
    const controller = scope.scope.current!;
    try { await auth.logout(controller.signal); if (!controller.signal.aborted) navigate('/merchant/login', { replace: true }); }
    catch (failure) { if (scope.current()) setLogoutError(failure); }
    finally { if (scope.current()) { locked.current = false; setLoggingOut(false); } }
  }
  const props = { session, api, context };
  return <div className="merchant-workspace">
    <a className="merchant-workspace__skip" href="#merchant-content">Skip to dashboard content</a>
    <header className="merchant-workspace__header"><Link to="/merchant/dashboard?tab=overview" className="merchant-workspace__brand" aria-label="Style.re merchant overview"><img src={logo} alt="Style.re" /><span>Merchant workspace</span></Link>
      <div className="merchant-workspace__account"><span>{auth.merchant?.store_name || 'Your store'}</span><button type="button" className="mw-button mw-button--secondary" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? 'Signing out…' : 'Sign out'}</button></div>
    </header>
    <div className="merchant-workspace__layout"><aside className="merchant-workspace__sidebar"><nav aria-label="Merchant dashboard sections">{dashboardTabs.map(tab => <Link key={tab}
      to={'/merchant/dashboard' + dashboardSearch({ ...context, tab })} aria-current={context.tab === tab ? 'page' : undefined}>{tabLabels[tab]}{tab === 'team' && auth.merchant?.plan !== 'growth' && <small>Growth</small>}</Link>)}</nav>
      <Link className="merchant-workspace__support" to="/support">Contact support</Link></aside>
      <main id="merchant-content" tabIndex={-1} className="merchant-workspace__main">
        {Boolean(logoutError) && <Failure error={logoutError} />}
        {!session.current() ? <Failure error={new MerchantRequestError('Sign in again to open your merchant workspace.', 401)} /> : <>
          {context.tab === 'overview' && <OverviewPanel {...props} />}
          {context.tab === 'orders' && <OrdersPanel key="orders" {...props} />}
          {context.tab === 'tracking' && <OrdersPanel key="tracking" {...props} tracking />}
          {context.tab === 'settings' && <SettingsPanel {...props} />}
          {context.tab === 'billing' && <BillingPanel {...props} />}
          {context.tab === 'team' && <TeamPanel {...props} plan={auth.merchant?.plan || ''} />}
        </>}
      </main>
    </div>
  </div>;
}
export function MerchantDashboard() {
  const session = useMerchantSession();
  if (session.loading) return <div className="merchant-workspace"><Loading>Loading your merchant account…</Loading></div>;
  return <MerchantDashboardSession key={session.key} session={session} />;
}
export default MerchantDashboard;
