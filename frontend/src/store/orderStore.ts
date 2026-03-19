import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderDraft, Order, ServiceType, Address, ContactInfo, OrderItem, Store, PricingQuote } from '../types';

interface OrderStore {
  // Draft (in-progress order)
  draft: OrderDraft;
  // Confirmed orders
  currentOrder: Order | null;

  // Draft setters
  setServiceType: (type: ServiceType) => void;
  setPickupAddress: (addr: Partial<Address>) => void;
  setDropoffAddress: (addr: Partial<Address>) => void;
  setContact: (contact: Partial<ContactInfo>) => void;
  setNotes: (notes: string) => void;
  setItems: (items: OrderItem[]) => void;
  setSelectedStore: (store: Store) => void;
  setPricing: (pricing: PricingQuote) => void;
  setOrderId: (id: string) => void;
  setPaymentIntentId: (id: string) => void;

  // Order actions
  setCurrentOrder: (order: Order) => void;
  clearDraft: () => void;
  resetAll: () => void;
}

const initialDraft: OrderDraft = {};

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      draft: initialDraft,
      currentOrder: null,

      setServiceType: (type) =>
        set((s) => ({ draft: { ...s.draft, serviceType: type } })),

      setPickupAddress: (addr) =>
        set((s) => ({
          draft: { ...s.draft, pickupAddress: { ...s.draft.pickupAddress, ...addr } },
        })),

      setDropoffAddress: (addr) =>
        set((s) => ({
          draft: { ...s.draft, dropoffAddress: { ...s.draft.dropoffAddress, ...addr } },
        })),

      setContact: (contact) =>
        set((s) => ({
          draft: { ...s.draft, contact: { ...s.draft.contact, ...contact } },
        })),

      setNotes: (notes) =>
        set((s) => ({ draft: { ...s.draft, notes } })),

      setItems: (items) =>
        set((s) => ({ draft: { ...s.draft, items } })),

      setSelectedStore: (store) =>
        set((s) => ({ draft: { ...s.draft, selectedStore: store } })),

      setPricing: (pricing) =>
        set((s) => ({ draft: { ...s.draft, pricing } })),

      setOrderId: (id) =>
        set((s) => ({ draft: { ...s.draft, orderId: id } })),

      setPaymentIntentId: (id) =>
        set((s) => ({ draft: { ...s.draft, paymentIntentId: id } })),

      setCurrentOrder: (order) => set({ currentOrder: order }),

      clearDraft: () => set({ draft: initialDraft }),

      resetAll: () => set({ draft: initialDraft, currentOrder: null }),
    }),
    {
      name: 'stylere-order-store',
      partialize: (state) => ({
        draft: state.draft,
        currentOrder: state.currentOrder,
      }),
    }
  )
);
