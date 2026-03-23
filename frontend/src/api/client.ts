// ─── API Client ───────────────────────────────────────────────────────────────
// Communicates with Shopify backend (/api/*) which proxies to api.stylere.app

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const STYLERE_API = import.meta.env.VITE_STYLERE_API_URL || 'https://api.stylere.app';

class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(
    status: number,
    message: string,
    data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let data: unknown;
    try { data = await res.json(); } catch { /* empty */ }
    throw new ApiError(res.status, `Request failed: ${res.status}`, data);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return {} as T;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

import type {
  Order,
  OrderDraft,
  TrackingStatus,
  ChatMessage,
  PaymentIntent,
  Store,
  PricingQuote,
} from '../types';

export const api = {
  // Orders
  createOrder: (draft: OrderDraft) =>
    request<Order>(`${BASE_URL}/orders/create`, {
      method: 'POST',
      body: JSON.stringify(draft),
    }),

  getOrder: (id: string) =>
    request<Order>(`${BASE_URL}/orders/${id}`),

  getActiveOrders: () =>
    request<Order[]>(`${BASE_URL}/orders/active`),

  getTracking: (id: string) =>
    request<TrackingStatus>(`${BASE_URL}/orders/${id}/tracking`),

  // Chat
  getChat: (orderId: string) =>
    request<ChatMessage[]>(`${BASE_URL}/orders/${orderId}/chat`),

  sendMessage: (orderId: string, message: string) =>
    request<ChatMessage>(`${BASE_URL}/orders/${orderId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Payments
  createPaymentIntent: (orderId: string, amount: number) =>
    request<PaymentIntent>(`${BASE_URL}/payments/intent`, {
      method: 'POST',
      body: JSON.stringify({ orderId, amount }),
    }),

  confirmPayment: (paymentIntentId: string, orderId: string) =>
    request<{ success: boolean; orderId: string; dispatched?: boolean; trackingUrl?: string }>(
      `${BASE_URL}/payments/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ paymentIntentId, orderId }),
      }
    ),

  // Stores
  getNearbyStores: (lat: number, lng: number, radius?: number) =>
    request<Store[]>(
      `${BASE_URL}/stores/nearby?lat=${lat}&lng=${lng}&radius=${radius ?? 10}`
    ),

  // Pricing quote (from Style.re backend)
  getQuote: (_draft: Partial<OrderDraft>): Promise<PricingQuote> => {
    // Optimistic mock until backend wired — real call is POST to stylere API
    return Promise.resolve({
      subtotal: 0,
      deliveryFee: 7.99,
      serviceFee: 1.99,
      tax: 0.80,
      total: 10.78,
      estimatedMinutes: 45,
    });
  },
};

// Direct Style.re backend calls (bypasses Shopify proxy)
export const stylereApi = {
  getTracking: (orderId: string) =>
    request<TrackingStatus>(`${STYLERE_API}/api/orders/${orderId}/tracking`),

  getChat: (orderId: string) =>
    request<ChatMessage[]>(`${STYLERE_API}/api/chat/messages?orderId=${orderId}`),

  sendMessage: (orderId: string, message: string, sender: string) =>
    request<ChatMessage>(`${STYLERE_API}/api/chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ orderId, message, sender }),
    }),
};

export { ApiError };
