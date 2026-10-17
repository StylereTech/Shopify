import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { MissingOrder, OrderDetails, ReadError, SavedTime, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { customerApi } from '../api/client';
import { customerAccessLost, customerRecordUnavailable, dateTime, orderPath, readOrderLocation, safeHistoryReturn, statusLabel, terminalOrder } from '../lib/customerPageState';

export function Tracking() {
  const session = useCustomerSession();
  const { orderId: value } = useParams();
  const { search } = useLocation();
  const orderId = readOrderLocation('', value);
  return <AppShell title="Order updates" showBack backTo={safeHistoryReturn(search)}><SessionNotice session={session} />{!orderId ? <MissingOrder /> : session.status === 'ready' && <TrackingStatus key={session.key + ':' + orderId} session={session} orderId={orderId} />}</AppShell>;
}
function TrackingStatus({ session, orderId }: { session: ReturnType<typeof useCustomerSession>; orderId: string }) {
  const orderQuery = useQuery({ queryKey: ['customer-order', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getOrder(orderId, signal), retry: false, refetchOnMount: 'always', staleTime: 0 });
  const order = orderQuery.isFetchedAfterMount && !customerRecordUnavailable(orderQuery.error) ? orderQuery.data : undefined;
  const query = useQuery({ queryKey: ['customer-tracking', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getTracking(orderId, signal), enabled: !!order && !orderQuery.isError, retry: false, refetchOnMount: 'always', staleTime: 0, refetchInterval: query => terminalOrder(query.state.data?.status ?? 'pending') || customerAccessLost(query.state.error) ? false : 15000 });
  const denied = customerRecordUnavailable(orderQuery.error) || customerRecordUnavailable(query.error);
  const tracking = query.isFetchedAfterMount && !denied ? query.data : undefined;
  return <div className="customer-stack">
    {!orderQuery.isFetchedAfterMount && !orderQuery.isError && <p role="status">Verifying your order…</p>}
    {orderQuery.isError && <ReadError session={session} error={orderQuery.error} retry={() => orderQuery.refetch()} />}
    {order && !denied && <>
      {!query.isFetchedAfterMount && !query.isError && !orderQuery.isError && <p role="status">Checking delivery updates…</p>}
      {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
      {tracking && <><section className="customer-card"><div className="customer-row"><h2>{statusLabel(tracking.status)}</h2><span className="customer-tag">{tracking.availability === 'live' ? 'Provider update' : 'Saved order status'}</span></div>
        <p>Order {orderId}</p><SavedTime timestamp={query.dataUpdatedAt} stale={query.isError || orderQuery.isError} />
        {!terminalOrder(tracking.status) && <p className="customer-muted">This page checks for updates every 15 seconds while open. A saved status is not a live location.</p>}
        {tracking.paymentStatus !== 'paid' ? <div className="customer-notice" data-tone="info"><p>Payment is not confirmed for this order.</p>{!terminalOrder(tracking.status) && !query.isError && !orderQuery.isError && <Link to={orderPath('payment', orderId)}>Check payment status</Link>}</div> : <p>Payment is confirmed. Courier assignment and delivery completion are separate updates.</p>}
        {tracking.availability === 'unavailable' && <p className="customer-muted">Courier tracking is not available for this order.</p>}
        {tracking.driverName && <p>Courier: {tracking.driverName}</p>}
        {tracking.estimatedMinutes != null && !terminalOrder(tracking.status) && <p>Latest provider estimate: {tracking.estimatedMinutes} minutes. Timing may change.</p>}
        {tracking.providerTrackingUrl && <a className="customer-button secondary" href={tracking.providerTrackingUrl} target="_blank" rel="noopener noreferrer">Open courier tracking ↗</a>}
      </section>
      <section className="customer-card"><h2>Recorded events</h2>{tracking.timeline.length ? <ol className="customer-timeline">{tracking.timeline.map((event, index) => <li key={event.timestamp + ':' + index}><strong>{statusLabel(event.status)}</strong><p>{event.description}</p><time dateTime={event.timestamp}>{dateTime(event.timestamp)}</time></li>)}</ol> : <p className="customer-muted">No delivery events have been recorded yet.</p>}</section></>}
      <OrderDetails order={order} showStatus={false} />
      <section className="customer-notice"><h2>Need help with this delivery?</h2><p>Courier chat is not connected. Support can help with order questions.</p><Link className="customer-button secondary" to="/support">View support options</Link></section>
    </>}
    {customerRecordUnavailable(query.error) && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
  </div>;
}
