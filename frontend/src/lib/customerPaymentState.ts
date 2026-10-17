import { CustomerRequestError } from '../api/customerSession';
import type { Order, PaymentIntent } from '../types';

export function paymentIntentForOrder(intent: PaymentIntent, order: Order) {
  if (intent.guestId !== order.guestId || intent.orderId !== order.id || intent.amountCents !== order.amountCents || intent.currency !== order.currency || (order.paymentIntentId && order.paymentIntentId !== intent.paymentIntentId)) throw new CustomerRequestError('The payment details do not match this order. Check the saved order before continuing.', 409, 'MISMATCHED_PAYMENT');
  return intent;
}
export function verifiedStripeResult(value: { id: string; amount: number; currency: string; status: string } | undefined, intent: PaymentIntent) {
  if (!value || value.id !== intent.paymentIntentId || value.amount !== intent.amountCents || value.currency !== intent.currency) throw new CustomerRequestError('The payment result could not be matched to this order. Check payment status before trying again.', 409, 'MISMATCHED_PAYMENT');
  return value.status;
}

// Stripe authentication may take longer than an API read. Bound the UI wait
// without treating a timeout as a failed charge: the caller must reconcile.
export async function waitForPaymentSdk<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs = 120000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new CustomerRequestError('Payment verification was interrupted. Check its saved status before trying again.', 0, 'SDK_ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    timer = setTimeout(() => reject(new CustomerRequestError('Payment verification took too long. Check its saved status before trying again.', 0, 'SDK_TIMEOUT')), timeoutMs);
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { if (timer) clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
}
