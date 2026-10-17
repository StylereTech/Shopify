import type { Address, ContactInfo, CustomerChat, CustomerOrderPage, CustomerPaymentReceipt, Order, OrderDraft, OrderItem, OrderStatus, PaymentIntent, PricingQuote, TrackingStatus } from '../types';
import { CustomerRequestError } from '../api/customerSession';

type RecordValue = Record<string, unknown>;
const failure = () => new CustomerRequestError('The checkout service returned incomplete or mismatched information. Refresh before continuing.', 0, 'INVALID_RESPONSE');
export function customerObject(value: unknown): RecordValue { if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure(); return value as RecordValue; }
function text(value: unknown, max = 200): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw failure(); return value.trim(); }
function optionalText(value: unknown, max = 200): string | undefined { return value == null || (typeof value === 'string' && !value.trim()) ? undefined : text(value, max); }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw failure(); return value as number; }
function date(value: unknown): string { const result = text(value, 60); if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw failure(); return result; }
export function customerUuid(value: unknown): string { const result = text(value, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw failure(); return result.toLowerCase(); }
export function customerOrderId(value: unknown): string { const result = text(value, 100); if (!/^[a-zA-Z0-9_-]{8,100}$/.test(result)) throw failure(); return result; }
const statuses = new Set<OrderStatus>(['pending','confirmed','assigned','picked_up','in_transit','delivered','cancelled','failed']);
function status(value: unknown): OrderStatus { if (!statuses.has(value as OrderStatus)) throw failure(); return value as OrderStatus; }
function address(value: unknown): Address {
  const row = customerObject(value);
  const result = { street: text(row.street), city: text(row.city, 100), state: text(row.state, 2).toUpperCase(), zip: text(row.zip, 10), country: text(row.country, 2).toUpperCase(), unit: optionalText(row.unit, 80) };
  if (!/^[A-Z]{2}$/.test(result.state) || !/^\d{5}(?:-\d{4})?$/.test(result.zip) || result.country !== 'US') throw failure();
  return result;
}
function contact(value: unknown): ContactInfo {
  const row = customerObject(value); const result = { name: text(row.name, 120), phone: text(row.phone, 30), email: text(row.email, 254) };
  const digits = result.phone.replace(/\D/g, '');
  if (!/^\+?[0-9 ()-]{10,30}$/.test(result.phone) || !/^(?:1)?\d{10}$/.test(digits) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw failure();
  result.phone = '+' + (digits.length === 10 ? '1' : '') + digits;
  return result;
}
function items(value: unknown): OrderItem[] {
  if (!Array.isArray(value) || value.length > 50) throw failure();
  return value.map(value => { const row = customerObject(value); return { name: text(row.name, 160), quantity: integer(row.quantity, 1, 100), description: optionalText(row.description, 500) }; });
}
function dollars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw failure();
  return value;
}
function pricing(value: unknown): PricingQuote {
  const row = customerObject(value);
  const result = { subtotal: dollars(row.subtotal), deliveryFee: dollars(row.deliveryFee), serviceFee: dollars(row.serviceFee), tax: dollars(row.tax), total: dollars(row.total), estimatedMinutes: integer(row.estimatedMinutes, 0, 10080) };
  if (Math.round((result.subtotal + result.deliveryFee + result.serviceFee + result.tax) * 100) !== Math.round(result.total * 100) || result.total <= 0) throw failure();
  return result;
}
export function customerDraftPayload(value: OrderDraft): OrderDraft {
  const row = customerObject(value);
  if (row.serviceType !== 'logo_pickup' && row.serviceType !== 'item_delivery') throw new CustomerRequestError('Choose a delivery service before continuing.', 400, 'INVALID_DRAFT');
  try {
    return { serviceType: row.serviceType, pickupAddress: address(row.pickupAddress), dropoffAddress: address(row.dropoffAddress), contact: contact(row.contact), items: items(row.items ?? []), notes: optionalText(row.notes, 1000) };
  } catch { throw new CustomerRequestError('Complete the pickup address, destination and contact information before continuing.', 400, 'INVALID_DRAFT'); }
}
export function readCustomerOrder(value: unknown, guestId: string, expectedId?: string, requestId?: string): Order {
  const row = customerObject(value); const id = customerOrderId(row.id); const guest = customerUuid(row.guestId); const request = customerUuid(row.requestId);
  if (guest !== guestId || (expectedId && id !== expectedId) || (requestId && request !== requestId)) throw failure();
  if (row.serviceType !== 'logo_pickup' && row.serviceType !== 'item_delivery') throw failure();
  if (!['unpaid','paid','failed'].includes(String(row.paymentStatus))) throw failure();
  const quote = pricing(row.pricing);
  const amountCents = integer(row.amountCents, 1, 10000000);
  if (row.currency !== 'usd' || amountCents !== Math.round(quote.total * 100)) throw failure();
  return { id, guestId: guest, requestId: request, amountCents, currency: 'usd', serviceType: row.serviceType, status: status(row.status), pickupAddress: address(row.pickupAddress), dropoffAddress: address(row.dropoffAddress), contact: contact(row.contact), items: items(row.items), notes: optionalText(row.notes, 2000), pricing: quote, paymentStatus: row.paymentStatus as Order['paymentStatus'], paymentIntentId: optionalText(row.paymentIntentId), deliveryId: optionalText(row.deliveryId), createdAt: date(row.createdAt), updatedAt: date(row.updatedAt), estimatedDeliveryTime: row.estimatedDeliveryTime == null ? undefined : date(row.estimatedDeliveryTime) };
}
export function readCustomerOrderPage(value: unknown, guestId: string, requestedPage: number): CustomerOrderPage {
  const row = customerObject(value); const pager = customerObject(row.pagination);
  if (customerUuid(row.guestId) !== guestId || !Array.isArray(row.orders)) throw failure();
  const pagination = { page: integer(pager.page, 1), limit: integer(pager.limit, 1, 100), total: integer(pager.total), pages: integer(pager.pages) };
  if (pagination.page !== requestedPage || pagination.pages !== Math.ceil(pagination.total / pagination.limit) || row.orders.length > pagination.limit) throw failure();
  const orders = row.orders.map(value => readCustomerOrder(value, guestId));
  if (new Set(orders.map(order => order.id)).size !== orders.length || orders.length > pagination.total) throw failure();
  return { guestId, orders, pagination };
}
export function readCustomerIntent(value: unknown, guestId: string, orderId: string): PaymentIntent {
  const row = customerObject(value);
  if (customerUuid(row.guestId) !== guestId || customerOrderId(row.orderId) !== orderId || row.currency !== 'usd') throw failure();
  const paymentIntentId = text(row.paymentIntentId);
  const clientSecret = text(row.clientSecret, 500);
  if (!/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId) || paymentIntentId.startsWith('pi_mock_') || !clientSecret.startsWith(paymentIntentId + '_secret_')) throw failure();
  const intentStatus = text(row.status, 60);
  if (!['requires_payment_method','requires_confirmation','requires_action','processing','requires_capture','canceled','succeeded'].includes(intentStatus)) throw failure();
  return { guestId, orderId, paymentIntentId, clientSecret, amountCents: integer(row.amountCents, 1, 10000000), currency: 'usd', status: intentStatus };
}
export function readCustomerPaymentReceipt(value: unknown, guestId: string, orderId: string, intentId: string): CustomerPaymentReceipt {
  const row = customerObject(value);
  if (row.success !== true || customerUuid(row.guestId) !== guestId || row.orderId !== orderId || row.paymentIntentId !== intentId || row.paymentStatus !== 'paid' || typeof row.dispatched !== 'boolean') throw failure();
  return { success: true, guestId, orderId, paymentIntentId: intentId, paymentStatus: 'paid', dispatched: row.dispatched };
}
export function readCustomerTracking(value: unknown, guestId: string, orderId: string): TrackingStatus {
  const row = customerObject(value);
  if (customerUuid(row.guestId) !== guestId || row.orderId !== orderId || !Array.isArray(row.timeline) || row.timeline.length > 100) throw failure();
  const timeline = row.timeline.map(value => { const event = customerObject(value); return { status: status(event.status), timestamp: date(event.timestamp), description: text(event.description, 1000) }; });
  if (!['recorded','live','unavailable'].includes(String(row.availability)) || !['unpaid','paid','failed'].includes(String(row.paymentStatus))) throw failure();
  let providerTrackingUrl: string | undefined;
  if (row.providerTrackingUrl != null) {
    const url = new URL(text(row.providerTrackingUrl, 2000));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'doordash.com' || url.hostname.endsWith('.doordash.com'))) throw failure();
    providerTrackingUrl = url.href;
  }
  return { guestId, orderId, status: status(row.status), availability: row.availability as TrackingStatus['availability'], paymentStatus: row.paymentStatus as TrackingStatus['paymentStatus'], dispatchStatus: text(row.dispatchStatus, 50), providerTrackingUrl, driverName: optionalText(row.driverName), driverPhone: optionalText(row.driverPhone, 30), estimatedMinutes: row.estimatedMinutes == null ? undefined : integer(row.estimatedMinutes, 0, 10080), timeline };
}
export function readCustomerChat(value: unknown, guestId: string, orderId: string): CustomerChat {
  const row = customerObject(value);
  if (customerUuid(row.guestId) !== guestId || row.orderId !== orderId || typeof row.available !== 'boolean' || !Array.isArray(row.messages) || row.messages.length > 100) throw failure();
  const messages = row.messages.map(value => { const message = customerObject(value); if (message.orderId !== orderId || !['customer','driver','system'].includes(String(message.sender))) throw failure(); return { id: text(message.id), orderId, sender: message.sender as 'customer'|'driver'|'system', message: text(message.message, 2000), timestamp: date(message.timestamp) }; });
  return { guestId, orderId, available: row.available, messages };
}
