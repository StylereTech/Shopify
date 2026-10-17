import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ReadError, SavedTime, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { customerApi } from '../api/client';
import { customerRecordUnavailable, dateTime, historyLocation, historyPath, money, ORDER_STATUSES, orderPath, statusLabel, trackingPath } from '../lib/customerPageState';

export function OrderHistory() {
  const session = useCustomerSession();
  const { search } = useLocation();
  const { page, status } = historyLocation(search);
  return <AppShell title="Your orders"><SessionNotice session={session} />{session.status === 'ready' && <History key={session.key + ':' + page + ':' + (status ?? 'all')} session={session} page={page} status={status} />}</AppShell>;
}
function History({ session, page, status }: { session: ReturnType<typeof useCustomerSession>; page: number; status?: import('../types').OrderStatus }) {
  const query = useQuery({ queryKey: ['customer-orders', session.key, page, status ?? 'all'], queryFn: ({ signal }) => customerApi(session).listOrders({ page, status }, signal), retry: false, refetchOnMount: 'always', staleTime: 0 });
  const data = query.isFetchedAfterMount && !customerRecordUnavailable(query.error) ? query.data : undefined;
  const back = historyPath(page, status);
  return <div className="customer-stack">
    <p className="customer-muted">Orders saved in this browser's secure guest session. Orders from another device or an expired session are not included.</p>
    <nav className="customer-tabs" aria-label="Order status filters"><Link to={historyPath(1)} aria-current={!status ? 'page' : undefined}>All orders</Link>{ORDER_STATUSES.map(value => <Link key={value} to={historyPath(1, value)} aria-current={status === value ? 'page' : undefined}>{statusLabel(value)}</Link>)}</nav>
    {!query.isFetchedAfterMount && !query.isError && <p role="status">Loading your orders…</p>}
    {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
    {data && <><SavedTime timestamp={query.dataUpdatedAt} stale={query.isError} />
      {data.orders.length === 0 ? <div className="customer-notice"><p>{page > 1 ? 'There are no orders on this page.' : status ? 'No orders match this status.' : 'No orders have been saved in this browser session.'}</p>{page === 1 && !status && <Link to="/order">Arrange a delivery</Link>}</div> : data.orders.map(order => <Link key={order.id} className="customer-card customer-card-link" to={(order.paymentStatus === 'paid' ? trackingPath(order.id) : orderPath('summary', order.id)) + (order.paymentStatus === 'paid' ? '?' : '&') + 'returnTo=' + encodeURIComponent(back)}>
        <div className="customer-row"><strong>Order {order.id}</strong><span className="customer-tag">{statusLabel(order.status)}</span></div>
        <p>{order.pickupAddress.city} → {order.dropoffAddress.city}</p><p className="customer-muted">{dateTime(order.createdAt)}</p><p>{money(order.amountCents / 100)} · {order.paymentStatus === 'paid' ? 'Paid' : 'Payment not confirmed'}</p>
      </Link>)}
      <nav className="customer-actions" aria-label="Order pages">{page > 1 && <Link className="customer-button secondary" to={historyPath(page - 1, status)}>Previous page</Link>}{page < data.pagination.pages && <Link className="customer-button secondary" to={historyPath(page + 1, status)}>Next page</Link>}</nav>
      <p className="customer-muted">Page {page}{data.pagination.pages > 0 ? ' of ' + data.pagination.pages : ''} · {data.pagination.total} matching {data.pagination.total === 1 ? 'order' : 'orders'}</p>
    </>}
  </div>;
}
