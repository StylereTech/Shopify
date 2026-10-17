import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMerchantSession } from '../../context/useMerchantSession';
import { isMerchantAccessDenied, MerchantRequestError } from '../../api/merchantSession';
import { confirmedMerchantDetail, merchantDashboardReturn } from '../../lib/merchantPageContracts';
import './merchant-pages.css';

const dateLabel = (value:string) => `${new Date(value).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short', timeZone:'UTC' })} UTC`;

export function MerchantOrderDetail() {
  const session = useMerchantSession();
  const { id = '' } = useParams<{ id:string }>();
  const [params] = useSearchParams();
  const backTo = merchantDashboardReturn(params.get('returnTo'));
  return <MerchantOrderDetailSession key={`${session.key}:${id}`} session={session} id={id} backTo={backTo} />;
}

function MerchantOrderDetailSession({ session, id, backTo }: { session:ReturnType<typeof useMerchantSession>; id:string; backTo:string }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = session.current();
  const { data, error, isPending, isFetching, isFetchedAfterMount, isError, refetch } = useQuery({
    queryKey:['merchant-order-detail',session.key,id],
    queryFn: async ({ signal }) => confirmedMerchantDetail(await session.request(`/api/merchant/orders/${encodeURIComponent(id)}`, { signal }),id,session.owner || ''),
    enabled:!!id && !!session.owner && current,
    staleTime:0,
    refetchOnMount:'always',
    retry:false,
  });
  const denied = !current || isMerchantAccessDenied(error);
  const missing = !id || (error instanceof MerchantRequestError && error.status === 404);
  const confirmed = current && isFetchedAfterMount && !isError ? data : undefined;
  const pending = session.loading || (!!id && !denied && (isPending || (!isFetchedAfterMount && !isError)));
  const retry = () => { if (mounted.current && session.current()) void refetch({ cancelRefetch:false }); };
  const signInTo = `/merchant/login?returnTo=${encodeURIComponent(`/merchant/orders/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(backTo)}`)}`;
  const readable = (value:string) => value.replace(/_/g,' ');
  return <div className="merchant-pages">
    <header><Link className="merchant-brand" to="/">Storree</Link><nav aria-label="Order navigation"><Link to={backTo}>Back to dashboard</Link><Link to="/support">Support</Link></nav></header>
    <main>
      <h1>Order detail</h1>
      {pending ? <p role="status">Loading order...</p> : denied ? <div role="alert" className="merchant-alert"><h2>Order access needs verification</h2><p>Sign in with the authorized merchant account or review your billing plan to access this order.</p><div className="merchant-actions"><Link to={signInTo}>Sign in again</Link><Link to="/merchant/dashboard?tab=billing">Review billing</Link></div></div>
        : missing ? <div role="alert" className="merchant-alert"><h2>Order not found</h2><p>This order is not available for your account. Return to your dashboard to select an order.</p></div>
        : isError || !confirmed ? <div role="alert" className="merchant-alert"><h2>Order could not be loaded</h2><p>Its details could not be confirmed. Try again or return to the dashboard.</p><button type="button" disabled={isFetching} onClick={retry}>{isFetching ? 'Refreshing…' : 'Retry order'}</button></div>
        : <>
          <div className="merchant-notice"><p><strong>Order reference:</strong> {confirmed.order.id}</p><p><strong>Recorded status:</strong> {readable(confirmed.order.status)}</p></div>
          {confirmed.order.source === 'standalone' && confirmed.order.service_type === 'merchant_record' && <p className="merchant-muted">This manual record does not book a delivery or charge the customer.</p>}
          <div className="merchant-actions"><button type="button" className="merchant-secondary" disabled={isFetching} onClick={retry}>{isFetching ? 'Refreshing…' : 'Refresh order'}</button>{isFetching && <span role="status">Checking the latest saved details…</span>}</div>
          <div className="merchant-grid merchant-section">
            <section className="merchant-card" aria-labelledby="order-customer"><h2 id="order-customer">Customer</h2><dl>
              <dt>Name</dt><dd>{confirmed.order.customer_name || 'Not recorded'}</dd><dt>Phone</dt><dd>{confirmed.order.customer_phone || 'Not recorded'}</dd><dt>Email</dt><dd>{confirmed.order.customer_email || 'Not recorded'}</dd>
            </dl></section>
            <section className="merchant-card" aria-labelledby="order-delivery"><h2 id="order-delivery">Order and delivery</h2><dl>
              <dt>Delivery address</dt><dd>{confirmed.order.delivery_address || 'Not recorded'}</dd>
              <dt>Declared order value</dt><dd>{confirmed.order.declared_amount_cents === null ? 'Not recorded' : `$${(confirmed.order.declared_amount_cents / 100).toFixed(2)}`}</dd>
              <dt>Payment status</dt><dd>{confirmed.order.payment_status ? readable(confirmed.order.payment_status) : 'Not recorded'}</dd>
              <dt>Created</dt><dd><time dateTime={confirmed.order.created_at}>{dateLabel(confirmed.order.created_at)}</time></dd>
              <dt>Last updated</dt><dd><time dateTime={confirmed.order.updated_at}>{dateLabel(confirmed.order.updated_at)}</time></dd>
              {confirmed.order.completed_at && <><dt>Completion recorded</dt><dd><time dateTime={confirmed.order.completed_at}>{dateLabel(confirmed.order.completed_at)}</time></dd></>}
            </dl></section>
          </div>
          <section className="merchant-card merchant-section" aria-labelledby="order-items"><h2 id="order-items">Recorded items</h2>{confirmed.order.items.length ? <ul className="merchant-list">{confirmed.order.items.map((item,index)=><li key={`${index}:${item.name}`}>{item.name} — Quantity {item.quantity}</li>)}</ul> : <p className="merchant-muted">No item details were recorded for this order.</p>}</section>
          <section className="merchant-card merchant-section" aria-labelledby="order-attempts"><h2 id="order-attempts">Delivery requests</h2>{confirmed.tracking.length ? <><p className="merchant-muted">An accepted request does not confirm that the order was delivered. Check the recorded order status for delivery progress.</p><ol className="merchant-list">{confirmed.tracking.map(attempt=><li key={attempt.id}><p><strong>{attempt.success ? 'Request accepted' : 'Request not accepted'}</strong></p><p><time dateTime={attempt.attempted_at}>{dateLabel(attempt.attempted_at)}</time></p></li>)}</ol></> : <p className="merchant-muted">No delivery requests were recorded for this order.</p>}</section>
        </>}
    </main>
  </div>;
}
export default MerchantOrderDetail;
