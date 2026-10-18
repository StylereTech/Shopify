import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { type StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import { AppShell } from '../components/layout/AppShell';
import { MissingOrder, OrderPrice, ReadError, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { useCustomerAction } from '../hooks/useCustomerAction';
import { useOrderStore } from '../store/orderStore';
import { customerApi } from '../api/client';
import { loadPaymentConfiguration } from '../api/paymentConfiguration';
import { CustomerRequestError } from '../api/customerSession';
import { customerRecordUnavailable, customerErrorMessage, money, orderPath, readOrderLocation, terminalOrder, trackingPath } from '../lib/customerPageState';
import { paymentIntentForOrder, verifiedStripeResult, waitForPaymentSdk } from '../lib/customerPaymentState';
import type { Order, PaymentIntent } from '../types';

export function Payment() {
  const session = useCustomerSession();
  const { search } = useLocation();
  const { draft } = useOrderStore();
  const orderId = readOrderLocation(search, draft.orderId);
  const navigate = useNavigate();
  // Stripe may append a client secret on return. It is never trusted as order
  // evidence or persisted; the server retrieves the intent for this owned order.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (orderId && (params.has('payment_intent_client_secret') || params.has('payment_intent') || params.has('redirect_status'))) navigate(orderPath('payment', orderId), { replace: true });
  }, [search, orderId, navigate]);
  return <AppShell title="Payment" showBack backTo={orderId ? orderPath('summary', orderId) : '/orders'} showNav={false} step={3}><SessionNotice session={session} />{!orderId ? <MissingOrder /> : session.status === 'ready' && <PaymentOrder key={session.key + ':' + orderId} session={session} orderId={orderId} />}</AppShell>;
}
function PaymentOrder({ session, orderId }: { session: ReturnType<typeof useCustomerSession>; orderId: string }) {
  const query = useQuery({ queryKey: ['customer-order', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getOrder(orderId, signal), retry: false, refetchOnMount: 'always', staleTime: 0 });
  const order = query.isFetchedAfterMount && !customerRecordUnavailable(query.error) ? query.data : undefined;
  return <div className="customer-stack">
    {!query.isFetchedAfterMount && !query.isError && <p role="status">Verifying the order before payment…</p>}
    {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
    {order && <><OrderPrice order={order} />
      {order.paymentStatus === 'paid' ? <div className="customer-notice" data-tone="info"><p>Payment is already confirmed for this order.</p><Link className="customer-button" to={orderPath('confirmation', order.id)}>View confirmation</Link></div>
        : terminalOrder(order.status) ? <div className="customer-notice"><p>This order cannot accept another payment.</p><Link to={trackingPath(order.id)}>View order updates</Link></div>
        : !query.isError && <PaymentSetup key={order.id + ':' + order.amountCents} session={session} order={order} />}
    </>}
  </div>;
}
function PaymentSetup({ session, order }: { session: ReturnType<typeof useCustomerSession>; order: Order }) {
  const navigate = useNavigate();
  const configuration = useQuery({ queryKey: ['customer-payment-configuration', session.key], queryFn: async ({ signal }) => { const stripe = await loadPaymentConfiguration(signal); session.assertCurrent(); return stripe; }, retry: false, structuralSharing: false, staleTime: 0, gcTime: 0 });
  const action = useCustomerAction(session);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const load = async () => {
    if (!configuration.data || configuration.isError || configuration.isPending) return;
    const scope = action.begin();
    if (!scope) return;
    setError(null); setIntent(null); setPending(false);
    try {
      const api = customerApi(session);
      const freshOrder = await api.getOrder(order.id, scope.signal);
      if (!scope.current()) return;
      if (freshOrder.paymentStatus === 'paid') { navigate(orderPath('confirmation', order.id), { replace: true }); return; }
      if (terminalOrder(freshOrder.status)) throw new CustomerRequestError('This order cannot accept another payment. View its updates for more information.', 409);
      if (freshOrder.amountCents !== order.amountCents || freshOrder.currency !== order.currency) throw new CustomerRequestError('The saved price changed. Return to the order review before continuing.', 409);
      const savedIntent = paymentIntentForOrder(await api.createPaymentIntent(order.id, scope.signal), freshOrder);
      if (!scope.current()) return;
      const store = useOrderStore.getState();
      if (store.draft.orderId === order.id) store.setPaymentIntentId(savedIntent.paymentIntentId, order.id, store.revision);
      if (savedIntent.status === 'succeeded') {
        await api.confirmPayment(savedIntent.paymentIntentId, order.id, scope.signal);
        if (scope.current()) navigate(orderPath('confirmation', order.id), { replace: true });
      } else if (['processing', 'requires_capture'].includes(savedIntent.status)) setPending(true);
      else if (savedIntent.status === 'canceled') throw new CustomerRequestError('This payment was cancelled. Contact support before starting another payment for this order.', 409);
      else setIntent(savedIntent);
    } catch (caught) { if (scope.current()) setError(caught); }
    finally { scope.finish(); }
  };
  if (configuration.isPending) return <p role="status">Loading secure payment options…</p>;
  if (configuration.isError || !configuration.data) return <div className="customer-notice" data-tone="error"><h2>Online payment is unavailable</h2><p>Payment options could not be loaded for this website. Your order remains unpaid.</p><button className="customer-button" type="button" onClick={() => void configuration.refetch()}>Retry payment options</button><Link to="/support">Contact support</Link></div>;
  return <section className="customer-card"><h2>Secure payment</h2>
    <p className="customer-muted">Available methods depend on this device, Stripe settings, and your order. Payment does not guarantee courier availability.</p>
    {error != null && <ReadError error={error} session={session} retry={load} />}
    {pending && <p className="customer-notice" data-tone="info" role="status">Your payment is still processing. Check its saved status before trying another method.</p>}
    {!intent && !(error instanceof CustomerRequestError && error.code === 'PAYMENT_RECONCILIATION_REQUIRED') && <button className="customer-button" type="button" disabled={action.busy} onClick={() => void load()}>{action.busy ? 'Checking payment…' : pending ? 'Check payment status' : 'Check payment and load methods'}</button>}
    {intent && <Elements key={intent.paymentIntentId} stripe={configuration.data} options={{ clientSecret: intent.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#b64017', colorText: '#18212b', colorBackground: '#ffffff', colorDanger: '#a33221', fontSizeBase: '16px', borderRadius: '10px' } } }}>
      <PaymentForm session={session} order={order} intent={intent} action={action} recheck={load} />
    </Elements>}
  </section>;
}
function PaymentForm({ session, order, intent, action, recheck }: { session: ReturnType<typeof useCustomerSession>; order: Order; intent: PaymentIntent; action: ReturnType<typeof useCustomerAction>; recheck: () => Promise<void> }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [complete, setComplete] = useState(false);
  const [wallets, setWallets] = useState<boolean | null>(null);
  const [elementError, setElementError] = useState(false);
  const [message, setMessage] = useState('');
  const [reconcile, setReconcile] = useState(false);
  const confirm = async (wallet?: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || reconcile) { wallet?.paymentFailed({ reason: 'fail' }); return; }
    const scope = action.begin();
    if (!scope) { wallet?.paymentFailed({ reason: 'fail' }); return; }
    setMessage('');
    let attempted = false;
    try {
      if (intent.status !== 'requires_action') {
        const validation = await waitForPaymentSdk(elements.submit(), scope.signal);
        if (!scope.current()) return;
        if (validation.error) { setMessage(validation.error.message || 'Check the payment details.'); wallet?.paymentFailed({ reason: 'invalid_payment_data' }); return; }
      }
      if (!scope.current()) return;
      attempted = true;
      const operation = intent.status === 'requires_action'
        ? stripe.handleNextAction({ clientSecret: intent.clientSecret })
        : stripe.confirmPayment({ elements, clientSecret: intent.clientSecret, confirmParams: { return_url: window.location.origin + '/shopify' + orderPath('payment', order.id) }, redirect: 'if_required' });
      const result = await waitForPaymentSdk(operation, scope.signal);
      if (!scope.current()) return;
      if (result.error) {
        const definite = result.error.type === 'card_error' || result.error.type === 'validation_error';
        setReconcile(!definite); setMessage(definite ? result.error.message || 'Payment was not accepted. Check your payment details.' : 'The payment result is not confirmed. Check its saved status before trying again.');
        wallet?.paymentFailed({ reason: 'fail' }); return;
      }
      const status = verifiedStripeResult(result.paymentIntent, intent);
      if (status !== 'succeeded') { setReconcile(true); setMessage('Payment is not yet confirmed. Check the saved payment status before trying again.'); return; }
      await customerApi(session).confirmPayment(intent.paymentIntentId, order.id, scope.signal);
      if (scope.current()) navigate(orderPath('confirmation', order.id), { replace: true });
    } catch (caught) {
      if (scope.current()) { setReconcile(attempted); setMessage(customerErrorMessage(caught)); wallet?.paymentFailed({ reason: 'fail' }); }
    } finally { scope.finish(); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void confirm(); };
  return <form className="customer-stack" onSubmit={submit}>
    {message && <p className="customer-notice" data-tone={reconcile ? 'info' : 'error'} role="alert">{message}</p>}
    {reconcile ? <button className="customer-button" type="button" disabled={action.busy} onClick={() => void recheck()}>Check payment status</button> : intent.status === 'requires_action' ? <button className="customer-button" type="button" disabled={!stripe || action.busy} onClick={() => void confirm()}>{action.busy ? 'Verifying payment…' : 'Continue payment verification'}</button> : <>
      <div className="customer-wallet" hidden={wallets === false} aria-label="Available express payment methods" style={action.busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <ExpressCheckoutElement options={{ layout: { maxColumns: 2, maxRows: 2 } }} onReady={event => setWallets(!!event.availablePaymentMethods && Object.values(event.availablePaymentMethods).some(Boolean))} onLoadError={() => setWallets(false)} onClick={event => { if (action.busy || !session.current()) event.reject(); else event.resolve(); }} onConfirm={event => void confirm(event)} />
      </div>
      {wallets === true && <p className="customer-separator">Or choose another method</p>}
      <PaymentElement options={{ layout: 'accordion' }} onChange={event => setComplete(event.complete)} onLoadError={() => setElementError(true)} onReady={() => setElementError(false)} />
      {elementError && <p className="customer-notice" data-tone="error" role="alert">Payment methods could not load. Refresh payment status to try again.</p>}
      <button className="customer-button" type="submit" disabled={!stripe || !elements || !complete || action.busy || elementError}>{action.busy ? 'Verifying payment…' : 'Pay ' + money(intent.amountCents / 100)}</button>
    </>}
    {!action.busy && !reconcile && <button className="customer-link-button" type="button" onClick={() => void recheck()}>Refresh payment status</button>}
    <p className="customer-muted">By continuing, you agree to the <Link to="/terms">Terms of Service</Link>. Payment information is collected by Stripe.</p>
  </form>;
}
