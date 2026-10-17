import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { MissingOrder, OrderDetails, OrderPrice, ReadError, SavedTime, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { useCustomerAction } from '../hooks/useCustomerAction';
import { useOrderStore } from '../store/orderStore';
import { customerApi } from '../api/client';
import { CustomerRequestError } from '../api/customerSession';
import { customerAccessLost, customerRecordUnavailable, customerErrorMessage, orderPath, readOrderLocation, safeHistoryReturn, terminalOrder, trackingPath } from '../lib/customerPageState';
import { executeCheckoutRequest } from '../lib/customerCheckoutAction';

export function OrderSummary() {
  const session = useCustomerSession();
  const { draft, revision } = useOrderStore();
  const { search } = useLocation();
  const hasOrderParameter = new URLSearchParams(search).has('orderId');
  const orderId = readOrderLocation(search, draft.orderId);
  return <AppShell title="Review your delivery" showBack backTo={orderId ? safeHistoryReturn(search) : '/address'} showNav={false} step={2}>
    <SessionNotice session={session} />
    {session.status === 'ready' && (orderId ? <SavedSummary key={session.key + ':' + orderId} session={session} orderId={orderId} /> : hasOrderParameter ? <MissingOrder /> : <PrepareSummary key={session.key + ':' + revision} session={session} revision={revision} />)}
  </AppShell>;
}
function PrepareSummary({ session, revision }: { session: ReturnType<typeof useCustomerSession>; revision: number }) {
  const navigate = useNavigate();
  const { draft, checkoutRequest, storageIssue } = useOrderStore();
  const { busy, begin } = useCustomerAction(session);
  const [error, setError] = useState<unknown>(null);
  const [notFound, setNotFound] = useState(false);
  const perform = async (mode: 'save' | 'recover' | 'resubmit') => {
    const scope = begin(() => useOrderStore.getState().revision === revision);
    if (!scope) return;
    setError(null); setNotFound(false);
    try {
      const order = await executeCheckoutRequest({ session, mode, signal: scope.signal, current: scope.current });
      if (order && scope.current()) navigate(orderPath('summary', order.id), { replace: true });
    } catch (caught) {
      if (scope.current()) { setError(caught); setNotFound(mode === 'recover' && caught instanceof CustomerRequestError && caught.status === 404); }
    } finally { scope.finish(); }
  };
  if (!draft.serviceType && !checkoutRequest) return <div className="customer-notice"><p>Add pickup and delivery details before reviewing a price.</p><Link className="customer-button" to="/address">Enter delivery details</Link></div>;
  return <div className="customer-stack">
    {storageIssue && <p className="customer-notice" data-tone="error" role="alert">{storageIssue}</p>}
    {error != null && <div className="customer-notice" data-tone="error" role="alert"><p>{customerErrorMessage(error)}</p>{customerAccessLost(error) && <button type="button" className="customer-button secondary" onClick={() => session.retry()}>Restore session</button>}</div>}
    {checkoutRequest ? <section className="customer-card"><h2>Check your saved request</h2><p>The previous result is not yet verified. We will check the same request before allowing another checkout.</p>
      <button type="button" className="customer-button" disabled={busy} onClick={() => void perform('recover')}>{busy ? 'Checking saved request…' : 'Recover saved request'}</button>
      {notFound && <><p>No saved order was found for this request. You can safely resend the same details with the same request reference.</p><button type="button" className="customer-button secondary" disabled={busy} onClick={() => void perform('resubmit')}>Resend saved request</button></>}
    </section> : <section className="customer-card"><h2>Save and review the price</h2><p>Pickup: {draft.pickupAddress?.street}, {draft.pickupAddress?.city}</p><p>Destination: {draft.dropoffAddress?.street}, {draft.dropoffAddress?.city}</p><p>Saving these details creates an unpaid order for review. It does not authorize a payment or book a courier.</p>
      <button type="button" className="customer-button" disabled={busy || !!storageIssue} onClick={() => void perform('save')}>{busy ? 'Saving your request…' : 'Save details and view price'}</button><Link to="/address">Edit delivery details</Link>
    </section>}
    <Link to="/orders">Check your order history</Link>
  </div>;
}
function SavedSummary({ session, orderId }: { session: ReturnType<typeof useCustomerSession>; orderId: string }) {
  const query = useQuery({ queryKey: ['customer-order', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getOrder(orderId, signal), retry: false, refetchOnMount: 'always', staleTime: 0 });
  const order = query.isFetchedAfterMount && !customerRecordUnavailable(query.error) ? query.data : undefined;
  return <div className="customer-stack">
    {!query.isFetchedAfterMount && !query.isError && <p role="status">Verifying your saved order…</p>}
    {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
    {order && <><SavedTime timestamp={query.dataUpdatedAt} stale={query.isError} /><OrderDetails order={order} /><OrderPrice order={order} />
      {order.paymentStatus === 'paid' || terminalOrder(order.status) ? <Link className="customer-button" to={trackingPath(order.id)}>View order updates</Link> : !query.isError && <Link className="customer-button" to={orderPath('payment', order.id)}>Continue to payment</Link>}
      {query.isError && <p className="customer-muted">Refresh this order successfully before continuing to payment.</p>}
    </>}
  </div>;
}