import type { CustomerSession } from './customerSession';
import { CustomerRequestError } from './customerSession';
import type { OrderDraft, OrderStatus } from '../types';
import { customerDraftPayload, customerOrderId, customerUuid, readCustomerChat, readCustomerIntent, readCustomerOrder, readCustomerOrderPage, readCustomerPaymentReceipt, readCustomerTracking } from '../lib/customerContracts';

// Guest credentials stay in HttpOnly cookies; a captured public ID prevents
// cookie rotation from silently retargeting a request to another checkout.
export function customerApi(session: CustomerSession) {
  const owner = () => { session.assertCurrent(); return customerUuid(session.guestId); };
  const read = (path: string, signal?: AbortSignal) => session.request(path, { signal });
  const write = (path: string, body: unknown, signal?: AbortSignal) => session.request(path, { method: 'POST', body: JSON.stringify(body), signal });
  return {
    async createOrder(draft: OrderDraft, requestId: string, signal?: AbortSignal) {
      const guestId = owner(); const request = customerUuid(requestId);
      return readCustomerOrder(await write('/orders/create', { ...customerDraftPayload(draft), requestId: request }, signal), guestId, undefined, request);
    },
    async recoverOrder(requestId: string, signal?: AbortSignal) {
      const guestId = owner(); const request = customerUuid(requestId);
      return readCustomerOrder(await read('/orders/requests/' + request, signal), guestId, undefined, request);
    },
    async getOrder(orderId: string, signal?: AbortSignal) {
      const guestId = owner(); const id = customerOrderId(orderId);
      return readCustomerOrder(await read('/orders/' + encodeURIComponent(id), signal), guestId, id);
    },
    async listOrders({ page, status }: { page: number; status?: OrderStatus }, signal?: AbortSignal) {
      const guestId = owner();
      if (!Number.isSafeInteger(page) || page < 1) throw new CustomerRequestError('Invalid order page.', 400);
      const query = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) query.set('status', status);
      return readCustomerOrderPage(await read('/orders?' + query, signal), guestId, page);
    },
    async getTracking(orderId: string, signal?: AbortSignal) {
      const guestId = owner(); const id = customerOrderId(orderId);
      return readCustomerTracking(await read('/orders/' + encodeURIComponent(id) + '/tracking', signal), guestId, id);
    },
    async getChat(orderId: string, signal?: AbortSignal) {
      const guestId = owner(); const id = customerOrderId(orderId);
      return readCustomerChat(await read('/orders/' + encodeURIComponent(id) + '/chat', signal), guestId, id);
    },
    async createPaymentIntent(orderId: string, signal?: AbortSignal) {
      const guestId = owner(); const id = customerOrderId(orderId);
      return readCustomerIntent(await write('/payments/intent', { orderId: id }, signal), guestId, id);
    },
    async confirmPayment(paymentIntentId: string, orderId: string, signal?: AbortSignal) {
      const guestId = owner(); const id = customerOrderId(orderId);
      if (!/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) throw new CustomerRequestError('Invalid payment reference.', 400);
      return readCustomerPaymentReceipt(await write('/payments/confirm', { orderId: id, paymentIntentId }, signal), guestId, id, paymentIntentId);
    },
  };
}
export { CustomerRequestError as ApiError };
