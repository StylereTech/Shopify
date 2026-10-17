import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { useOrderStore } from '../store/orderStore';
import { customerErrorMessage, orderPath } from '../lib/customerPageState';

export function Landing() {
  const session = useCustomerSession();
  return <AppShell title="From store to your door"><div className="customer-stack">
    <p className="customer-eyebrow">Style.re delivery</p>
    <p>Enter your pickup and destination, review the saved delivery price, then choose an available payment method.</p>
    <ol className="customer-journey" aria-label="How a delivery works">
      <li><strong>1. Add your details</strong><p>Tell us where the order is ready for pickup and where it needs to go.</p></li>
      <li><strong>2. Review and pay</strong><p>Check the saved addresses and price before authorizing payment.</p></li>
      <li><strong>3. Follow updates</strong><p>See recorded delivery progress. Courier availability and timing can vary.</p></li>
    </ol>
    <SessionNotice session={session} />
    {session.status === 'ready' && <StartDelivery key={session.key} current={session.current} />}
    <p className="customer-muted">Have your store order ready for collection. This flow arranges delivery; it does not purchase merchandise from the store.</p>
  </div></AppShell>;
}
function StartDelivery({ current }: { current: () => boolean }) {
  const navigate = useNavigate();
  const { draft, checkoutRequest, storageIssue, clearDraft, setServiceType } = useOrderStore();
  const [error, setError] = useState('');
  const start = () => { if (!current()) return; try { if (clearDraft()) { setServiceType('item_delivery'); navigate('/address'); } } catch (caught) { setError(customerErrorMessage(caught)); } };
  return <section className="customer-card">
    <h2>{checkoutRequest ? 'Finish your saved request' : draft.orderId ? 'Your saved order' : 'Ready to arrange a delivery?'}</h2>
    {(error || storageIssue) && <p role="alert" className="customer-notice" data-tone="error">{error || storageIssue}</p>}
    {checkoutRequest && <><p>A request is still being verified. Recover it before starting another delivery.</p><Link className="customer-button" to="/summary">Recover saved request</Link></>}
    {!checkoutRequest && draft.orderId && <Link className="customer-button" to={orderPath('summary', draft.orderId)}>Review saved order</Link>}
    {!checkoutRequest && !draft.orderId && draft.serviceType && <Link className="customer-button" to="/address">Continue your details</Link>}
    {!checkoutRequest && <button className={'customer-button' + (draft.serviceType || draft.orderId ? ' secondary' : '')} type="button" onClick={start}>{draft.serviceType || draft.orderId ? 'Start a new delivery' : 'Enter delivery details'}</button>}
    <Link to="/orders">View orders from this browser session</Link>
  </section>;
}
