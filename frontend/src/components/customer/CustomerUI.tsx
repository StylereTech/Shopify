import { Link } from 'react-router-dom';
import type { useCustomerSession } from '../../context/useCustomerSession';
import { customerAccessLost, customerErrorMessage, dateTime, money, statusLabel } from '../../lib/customerPageState';
import type { Order } from '../../types';
import { CustomerRequestError } from '../../api/customerSession';

type Session = ReturnType<typeof useCustomerSession>;
export function SessionNotice({ session }: { session: Session }) {
  if (session.status === 'loading') return <p role="status">Restoring your secure checkout session…</p>;
  if (session.status === 'error') return <div className="customer-notice" data-tone="error" role="alert"><p>{session.error || 'Your checkout session could not be restored.'}</p><button type="button" className="customer-button" onClick={() => session.retry()}>Restore session</button></div>;
  return null;
}
export function ReadError({ error, retry, session }: { error: unknown; retry: () => unknown; session: Session }) {
  const denied = customerAccessLost(error);
  const needsSupport = error instanceof CustomerRequestError && error.code === 'PAYMENT_RECONCILIATION_REQUIRED';
  return <div className="customer-notice" data-tone="error" role="alert"><p>{customerErrorMessage(error)}</p>
    {needsSupport ? <Link className="customer-button secondary" to="/support">Contact support</Link> : <button type="button" className="customer-button secondary" onClick={() => { if (denied) session.retry(); else void retry(); }}>{denied ? 'Restore session' : 'Try again'}</button>}
    <Link to="/orders">View your orders</Link>
  </div>;
}
export function MissingOrder() {
  return <div className="customer-notice"><p>Select an order to continue. No order has been verified on this page.</p><Link className="customer-button" to="/orders">View your orders</Link><Link to="/order">Start a delivery</Link></div>;
}
export function SavedTime({ timestamp, stale = false }: { timestamp: number; stale?: boolean }) {
  return <p className="customer-muted" role={stale ? 'status' : undefined}>{stale ? 'Refresh failed. Showing the last verified update: ' : 'Last verified: '}{dateTime(timestamp)}</p>;
}
export function OrderDetails({ order, showStatus = true }: { order: Order; showStatus?: boolean }) {
  return <section className="customer-card" aria-label="Saved order details">
    <div className="customer-row"><h2>Delivery details</h2>{showStatus && <span className="customer-tag">{statusLabel(order.status)}</span>}</div>
    <p className="customer-muted">Order {order.id}</p>
    <div><h3>Pickup</h3><p>{order.pickupAddress.street}{order.pickupAddress.unit ? ', ' + order.pickupAddress.unit : ''}<br />{order.pickupAddress.city}, {order.pickupAddress.state} {order.pickupAddress.zip}</p></div>
    <div><h3>Destination</h3><p>{order.dropoffAddress.street}{order.dropoffAddress.unit ? ', ' + order.dropoffAddress.unit : ''}<br />{order.dropoffAddress.city}, {order.dropoffAddress.state} {order.dropoffAddress.zip}</p></div>
    <div><h3>Contact</h3><p>{order.contact.name}<br />{order.contact.phone}<br />{order.contact.email}</p></div>
    {order.items.length > 0 && <div><h3>Items</h3><ul>{order.items.map((item, index) => <li key={index}>{item.quantity} × {item.name}{item.description ? ' — ' + item.description : ''}</li>)}</ul></div>}
    {order.notes && <div><h3>Delivery notes</h3><p>{order.notes}</p></div>}
  </section>;
}
export function OrderPrice({ order }: { order: Order }) {
  return <section className="customer-card" aria-label="Saved price"><h2>Delivery price</h2><dl className="customer-price-list">
    {order.pricing.subtotal > 0 && <div><dt>Subtotal</dt><dd>{money(order.pricing.subtotal)}</dd></div>}
    <div><dt>Delivery fee</dt><dd>{money(order.pricing.deliveryFee)}</dd></div><div><dt>Service fee</dt><dd>{money(order.pricing.serviceFee)}</dd></div><div><dt>Tax</dt><dd>{money(order.pricing.tax)}</dd></div>
    <div className="customer-price-total"><dt>Total</dt><dd>{money(order.amountCents / 100)}</dd></div>
  </dl><p className="customer-muted">Payment status: {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'failed' ? 'Not confirmed' : 'Unpaid'}. Delivery availability and timing are confirmed separately.</p></section>;
}
