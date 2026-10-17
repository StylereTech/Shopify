import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { StorreeOrder } from '../infrastructure/persistence/postgres-repositories.js';

export class CheckoutError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
const address = z.object({
  street: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/).transform(s => s.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/), country: z.literal('US'),
  unit: z.string().trim().max(80).optional(),
}).strict();
export const customerCreateSchema = z.object({
  requestId: z.string().uuid().transform(s => s.toLowerCase()),
  serviceType: z.enum(['logo_pickup', 'item_delivery']), pickupAddress: address, dropoffAddress: address,
  contact: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().regex(/^\+?[\d ()-]{10,30}$/)
    .refine(value=>/^(?:1)?\d{10}$/.test(value.replace(/\D/g,'')),'Enter a US phone number.')
    .transform(value=>{const digits=value.replace(/\D/g,'');return `+${digits.length===10?'1':''}${digits}`;}), email: z.string().trim().email().max(254) }).strict(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(160), quantity: z.number().int().min(1).max(100), description: z.string().trim().max(500).optional() }).strict()).max(50).default([]),
  notes: z.string().trim().max(1000).optional(),
}).strict();
export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export const customerStatusSchema = z.enum(['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed']);
export type CustomerEvent = { status: string; timestamp: string; description: string };
export type GuestSession = { id: string; tokenHash: string; expiresAt: Date; revokedAt?: Date };
export interface CustomerOrder extends StorreeOrder {
  guestId: string; requestId: string; fingerprint: string; amountCents: number; currency: 'usd'; quoteVersion: string;
  intentStartedAt?: Date; dispatchStatus: 'pending' | 'in_progress' | 'unknown' | 'submitted'; dispatchStartedAt?: Date;
  events: CustomerEvent[];
}
export function fingerprintCreate(input: CustomerCreate): string {
  // The parsed schema fixes key order and normalizes values before this hash.
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export function customerPrice(service: CustomerCreate['serviceType']) {
  const delivery = service === 'logo_pickup' ? 699 : 899;
  const serviceFee = 199;
  const tax = Math.round((delivery + serviceFee) * 8 / 100);
  const amountCents = delivery + serviceFee + tax;
  return { amountCents, quoteVersion: 'direct-tariff-v1', pricing: { subtotal: 0, deliveryFee: delivery / 100, serviceFee: serviceFee / 100, tax: tax / 100, total: amountCents / 100, estimatedMinutes: service === 'logo_pickup' ? 35 : 50 } };
}
export function addCustomerEvent(order: CustomerOrder, status: string, description: string) {
  if (!order.events.some(event => event.status === status)) order.events.push({ status, description, timestamp: new Date().toISOString() });
}
export function customerOrderDto(order: CustomerOrder) {
  return {
    id: order.id, guestId: order.guestId, requestId: order.requestId, serviceType: order.serviceType, status: order.status,
    pickupAddress: order.pickupAddress, dropoffAddress: order.dropoffAddress, contact: order.contact, items: order.items, notes: order.notes,
    pricing: order.pricing, amountCents: order.amountCents, currency: order.currency, quoteVersion: order.quoteVersion,
    paymentIntentId: order.stripePaymentIntentId, paymentStatus: order.paymentStatus, dispatchStatus: order.dispatchStatus,
    deliveryId: order.dispatchId, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
    trackingUrl: `/shopify/tracking/${encodeURIComponent(order.id)}`,
  };
}
