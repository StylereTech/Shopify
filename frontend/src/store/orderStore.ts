import { create } from 'zustand';
import type { Address, ContactInfo, Order, OrderDraft, OrderItem, ServiceType, Store } from '../types';
import { customerDraftPayload, customerUuid, readCustomerOrder } from '../lib/customerContracts';
import { CustomerRequestError } from '../api/customerSession';

export interface CheckoutRequest { requestId: string; payload: OrderDraft; revision: number; phase: 'prepared' | 'unknown' }
interface CheckoutState {
  guestId: string | null;
  revision: number;
  draft: OrderDraft;
  currentOrder: Order | null;
  checkoutRequest: CheckoutRequest | null;
  storageIssue: string | null;
}
interface OrderStore extends CheckoutState {
  bindGuest(guestId: string | null): void;
  setServiceType(type: ServiceType): void;
  setPickupAddress(address: Partial<Address>): void;
  setDropoffAddress(address: Partial<Address>): void;
  setContact(contact: Partial<ContactInfo>): void;
  setNotes(notes: string): void;
  setItems(items: OrderItem[]): void;
  setSelectedStore(store: Store): void;
  prepareCheckout(): CheckoutRequest;
  markCheckoutUncertain(requestId: string): void;
  rejectCheckout(requestId: string, revision: number): boolean;
  acceptCheckout(order: Order, requestId: string, revision: number): boolean;
  setCurrentOrder(order: Order, revision: number): boolean;
  setPaymentIntentId(id: string, orderId: string, revision: number): boolean;
  clearDraft(): boolean;
  resetAll(): void;
}
const KEY = 'stylere-customer-checkout-v2';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const initial = (): CheckoutState => ({ guestId: null, revision: 0, draft: {}, currentOrder: null, checkoutRequest: null, storageIssue: null });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const storageMessage = 'The saved checkout could not be read or saved. Review your order history before starting another checkout.';
function persist(storage: StoragePort, state: CheckoutState, required = false) {
  try {
    const encoded = JSON.stringify(state);
    storage.setItem(KEY, encoded);
    if (required && storage.getItem(KEY) !== encoded) throw new Error('Storage did not retain the request.');
    return true;
  } catch {
    if (required) throw new CustomerRequestError('This browser could not save a recoverable checkout request. Enable local storage before continuing.', 0, 'STORAGE_UNAVAILABLE');
    return false;
  }
}
function restore(storage: StoragePort): CheckoutState {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return initial();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('Invalid saved checkout.');
    const row = data as CheckoutState;
    const guestId = row.guestId == null ? null : customerUuid(row.guestId);
    if (!Number.isSafeInteger(row.revision) || row.revision < 0 || !row.draft || typeof row.draft !== 'object' || Array.isArray(row.draft)) throw new Error('Invalid saved revision.');
    // Only data written by this version is restored, and all field values must
    // remain plain bounded JSON. Authoritative receipts are validated separately.
    const encodedDraft = JSON.stringify(row.draft);
    if (encodedDraft.length > 40000) throw new Error('Saved checkout is too large.');
    for (const key of ['pickupAddress','dropoffAddress','contact'] as const) {
      const value = row.draft[key];
      if (value != null && (typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(part => typeof part !== 'string' || part.length > 1000))) throw new Error('Invalid saved input.');
    }
    if (row.draft.serviceType != null && !['logo_pickup','item_delivery'].includes(row.draft.serviceType)) throw new Error('Invalid service.');
    if (row.draft.notes != null && (typeof row.draft.notes !== 'string' || row.draft.notes.length > 2000)) throw new Error('Invalid notes.');
    if (row.draft.items != null && (!Array.isArray(row.draft.items) || row.draft.items.length > 100 || row.draft.items.some(item => !item || typeof item.name !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1))) throw new Error('Invalid items.');
    const currentOrder = guestId && row.currentOrder ? readCustomerOrder(row.currentOrder, guestId) : null;
    const pick = (value: unknown, keys: string[]) => {
      if (value == null) return undefined;
      const record = value as Record<string, string>;
      return Object.fromEntries(keys.filter(key => record[key] != null).map(key => [key, record[key]]));
    };
    const draft: OrderDraft = {
      serviceType: row.draft.serviceType,
      pickupAddress: pick(row.draft.pickupAddress, ['street','city','state','zip','country','unit']),
      dropoffAddress: pick(row.draft.dropoffAddress, ['street','city','state','zip','country','unit']),
      contact: pick(row.draft.contact, ['name','phone','email']),
      notes: row.draft.notes,
      items: row.draft.items?.map(item => {
        if (item.name.length > 200 || item.quantity > 999 || (item.description != null && (typeof item.description !== 'string' || item.description.length > 1000))) throw new Error('Invalid saved item.');
        return { name: item.name, quantity: item.quantity, description: item.description };
      }),
    };
    if (row.draft.orderId != null) {
      if (!currentOrder || row.draft.orderId !== currentOrder.id) throw new Error('Saved order does not match its receipt.');
      draft.orderId = currentOrder.id; draft.pricing = currentOrder.pricing;
      if (row.draft.paymentIntentId != null) {
        if (!/^pi_[A-Za-z0-9]+$/.test(row.draft.paymentIntentId)) throw new Error('Invalid payment identifier.');
        draft.paymentIntentId = row.draft.paymentIntentId;
      }
    }
    let checkoutRequest: CheckoutRequest | null = null;
    if (row.checkoutRequest) {
      if (!guestId || row.checkoutRequest.revision !== row.revision) throw new Error('Saved request is not bound to this checkout.');
      checkoutRequest = { requestId: customerUuid(row.checkoutRequest.requestId), payload: customerDraftPayload(row.checkoutRequest.payload), revision: row.revision, phase: 'unknown' };
      if (JSON.stringify(checkoutRequest.payload) !== JSON.stringify(customerDraftPayload(draft)) || draft.orderId) throw new Error('Saved request does not match its draft.');
    }
    return { guestId, revision: row.revision, draft: clone(draft), currentOrder, checkoutRequest, storageIssue: typeof row.storageIssue === 'string' ? storageMessage : null };
  } catch { return { ...initial(), storageIssue: storageMessage }; }
}
export const createOrderStore = (storage: StoragePort) => create<OrderStore>()((set, get) => {
  const commit = (next: CheckoutState, required = false) => {
    const saved = persist(storage, next, required);
    set({ ...next, storageIssue: saved ? next.storageIssue : storageMessage });
  };
  const state = (): CheckoutState => { const { guestId, revision, draft, currentOrder, checkoutRequest, storageIssue } = get(); return { guestId, revision, draft, currentOrder, checkoutRequest, storageIssue }; };
  const edit = (patch: Partial<OrderDraft>) => {
    const previous = state();
    if (previous.checkoutRequest) throw new CustomerRequestError('Check the saved request before editing this delivery.', 409, 'UNRESOLVED_REQUEST');
    commit({ ...previous, revision: previous.revision + 1, draft: { ...previous.draft, ...patch, orderId: undefined, paymentIntentId: undefined, pricing: undefined }, currentOrder: null });
  };
  return {
    ...restore(storage),
    bindGuest(guestId) {
      const next = guestId == null ? null : customerUuid(guestId);
      if (get().guestId === next) return;
      commit({ ...initial(), guestId: next, revision: get().revision + 1, storageIssue: get().storageIssue });
    },
    setServiceType: serviceType => edit({ serviceType }),
    setPickupAddress: address => edit({ pickupAddress: { ...get().draft.pickupAddress, ...address } }),
    setDropoffAddress: address => edit({ dropoffAddress: { ...get().draft.dropoffAddress, ...address } }),
    setContact: contact => edit({ contact: { ...get().draft.contact, ...contact } }),
    setNotes: notes => edit({ notes }),
    setItems: items => edit({ items: clone(items) }),
    setSelectedStore: selectedStore => edit({ selectedStore }),
    prepareCheckout() {
      const previous = state();
      if (!previous.guestId) throw new CustomerRequestError('Restore the checkout session first.', 401);
      if (previous.checkoutRequest) { persist(storage, previous, true); return clone(previous.checkoutRequest); }
      if (previous.storageIssue) throw new CustomerRequestError(storageMessage, 0, 'STORAGE_UNAVAILABLE');
      const request: CheckoutRequest = { requestId: crypto.randomUUID(), revision: previous.revision, payload: customerDraftPayload(previous.draft), phase: 'prepared' };
      commit({ ...previous, checkoutRequest: request }, true);
      return clone(request);
    },
    markCheckoutUncertain(requestId) {
      const previous = state();
      if (previous.checkoutRequest?.requestId === requestId) commit({ ...previous, checkoutRequest: { ...previous.checkoutRequest, phase: 'unknown' } });
    },
    rejectCheckout(requestId, revision) {
      const previous = state();
      if (previous.revision !== revision || previous.checkoutRequest?.requestId !== requestId) return false;
      commit({ ...previous, checkoutRequest: null });
      return true;
    },
    acceptCheckout(order, requestId, revision) {
      const previous = state(); const request = previous.checkoutRequest;
      if (!previous.guestId || previous.revision !== revision || !request || request.requestId !== requestId) return false;
      const verified = readCustomerOrder(order, previous.guestId, undefined, requestId);
      if (JSON.stringify(customerDraftPayload(verified)) !== JSON.stringify(request.payload)) throw new CustomerRequestError('The saved order does not match the submitted delivery. Check the request before continuing.', 409, 'MISMATCHED_RECEIPT');
      commit({ ...previous, currentOrder: verified, checkoutRequest: null, draft: { ...previous.draft, orderId: verified.id, pricing: verified.pricing, paymentIntentId: verified.paymentIntentId } }, true);
      return true;
    },
    setCurrentOrder(order, revision) {
      const previous = state();
      if (!previous.guestId || previous.revision !== revision || (previous.draft.orderId && previous.draft.orderId !== order.id)) return false;
      const verified = readCustomerOrder(order, previous.guestId, previous.draft.orderId);
      commit({ ...previous, currentOrder: verified });
      return true;
    },
    setPaymentIntentId(paymentIntentId, orderId, revision) {
      const previous = state();
      if (previous.revision !== revision || previous.draft.orderId !== orderId || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) return false;
      commit({ ...previous, draft: { ...previous.draft, paymentIntentId } }, true);
      return true;
    },
    clearDraft() {
      const previous = state();
      if (previous.checkoutRequest) return false;
      commit({ ...previous, revision: previous.revision + 1, draft: {}, currentOrder: null, storageIssue: null }, true);
      return true;
    },
    resetAll() { commit({ ...initial(), revision: get().revision + 1 }); },
  };
});
export const useOrderStore = createOrderStore({ getItem: key => globalThis.localStorage?.getItem(key) ?? null, setItem: (key, value) => globalThis.localStorage.setItem(key, value) });
