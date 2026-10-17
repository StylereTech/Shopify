import { CustomerRequestError } from '../api/customerSession';
import type { OrderStatus } from '../types';

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed'];
export const statusLabel = (status: OrderStatus) => ({ pending: 'Awaiting payment', confirmed: 'Payment confirmed', assigned: 'Courier assigned', picked_up: 'Picked up', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled', failed: 'Delivery issue' })[status];
export const terminalOrder = (status: OrderStatus) => ['delivered', 'cancelled', 'failed'].includes(status);
export const money = (dollars: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
export const dateTime = (value: string | number) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
export const orderPath = (page: 'summary' | 'payment' | 'confirmation', id: string) => '/' + page + '?orderId=' + encodeURIComponent(id);
export const trackingPath = (id: string) => '/tracking/' + encodeURIComponent(id);
export function readOrderLocation(search: string, fallback?: string): string | undefined {
  const params = new URLSearchParams(search);
  const values = params.getAll('orderId');
  if (values.length > 1) return undefined;
  const value = values.length ? values[0] : fallback;
  return value && /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : undefined;
}
export function historyLocation(search: string): { page: number; status?: OrderStatus } {
  const params = new URLSearchParams(search);
  const number = Number(params.get('page') || 1);
  const status = params.get('status') as OrderStatus;
  return { page: Number.isSafeInteger(number) && number > 0 && number <= 100000 ? number : 1, status: ORDER_STATUSES.includes(status) ? status : undefined };
}
export function historyPath(page: number, status?: OrderStatus) {
  const query = new URLSearchParams({ page: String(page) });
  if (status) query.set('status', status);
  return '/orders?' + query;
}
export function safeHistoryReturn(search: string) {
  const value = new URLSearchParams(search).get('returnTo');
  if (!value || !/^\/orders(?:\?|$)/.test(value) || /[\\#\r\n]/.test(value)) return '/orders';
  const { page, status } = historyLocation(value.slice('/orders'.length));
  return historyPath(page, status);
}
export function customerAccessLost(error: unknown) {
  return error instanceof CustomerRequestError && ([401, 403].includes(error.status) || ['STALE_SESSION', 'GUEST_SESSION_CHANGED', 'GUEST_SESSION_EXPIRED'].includes(error.code));
}
export function customerRecordUnavailable(error: unknown) {
  return customerAccessLost(error) || (error instanceof CustomerRequestError && [404, 410].includes(error.status));
}
export function customerErrorMessage(error: unknown) {
  return error instanceof CustomerRequestError ? error.message : 'We could not verify this request. Try refreshing its saved status.';
}
