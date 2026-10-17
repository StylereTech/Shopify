import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { MissingOrder, OrderDetails, OrderPrice, ReadError, SavedTime, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { useOrderStore } from '../store/orderStore';
import { customerApi } from '../api/client';
import { customerRecordUnavailable, orderPath, readOrderLocation, terminalOrder, trackingPath } from '../lib/customerPageState';

export function Confirmation() {
  const session = useCustomerSession();
  const { search } = useLocation();
  const { draft } = useOrderStore();
  const orderId = readOrderLocation(search, draft.orderId);
  return <AppShell title="Payment status" showBack backTo={orderId ? trackingPath(orderId) : '/orders'}><SessionNotice session={session} />{!orderId ? <MissingOrder /> : session.status === 'ready' && <ConfirmationStatus key={session.key + ':' + orderId} session={session} orderId={orderId} />}</AppShell>;
}
function ConfirmationStatus({ session, orderId }: { session: ReturnType<typeof useCustomerSession>; orderId: string }) {
  const query = useQuery({ queryKey: ['customer-order', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getOrder(orderId, signal), retry: false, refetchOnMount: 'always', staleTime: 0, refetchInterval: query => query.state.data?.paymentStatus === 'paid' || terminalOrder(query.state.data?.status ?? 'pending') ? false : 15000 });
  const order = query.isFetchedAfterMount && !customerRecordUnavailable(query.error) ? query.data : undefined;
  return <div className="customer-stack">
    {!query.isFetchedAfterMount && !query.isError && <p role="status">Verifying your payment status…</p>}
    {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
    {order && <><SavedTime timestamp={query.dataUpdatedAt} stale={query.isError} />
      <section className="customer-card"><h2>{order.paymentStatus === 'paid' ? 'Payment confirmed' : 'Payment is not confirmed'}</h2>
        {order.paymentStatus === 'paid' ? <p>{order.status === 'delivered' ? 'This order is recorded as delivered.' : order.status === 'cancelled' || order.status === 'failed' ? 'Your order has a delivery issue. Check its updates and contact support; this payment status does not confirm a refund.' : 'Your payment is recorded. Follow order updates for courier acceptance and delivery progress.'}</p>
          : <><p>No successful payment has been verified for this order. If you have already authorized payment, check its saved status before paying again.</p>{!terminalOrder(order.status) && !query.isError && <Link className="customer-button" to={orderPath('payment', order.id)}>Check payment status</Link>}</>}
        <Link className="customer-button secondary" to={trackingPath(order.id)}>View order updates</Link>
      </section><OrderDetails order={order} /><OrderPrice order={order} /><Link to="/order">Arrange another delivery</Link>
    </>}
  </div>;
}