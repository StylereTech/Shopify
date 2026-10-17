// ─── Core Types ───────────────────────────────────────────────────────────────

export type ServiceType = 'logo_pickup' | 'item_delivery';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  unit?: string;
}

export interface ContactInfo {
  name: string;
  phone: string;
  email: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  description?: string;
}

export interface Store {
  id: string;
  name: string;
  address: Address;
  distance?: number;
  phone?: string;
}

export interface PricingQuote {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  estimatedMinutes: number;
}

export interface Order {
  guestId: string;
  requestId: string;
  amountCents: number;
  currency: 'usd';
  id: string;
  serviceType: ServiceType;
  status: OrderStatus;
  pickupAddress: Address;
  dropoffAddress: Address;
  items: OrderItem[];
  contact: ContactInfo;
  notes?: string;
  pricing: PricingQuote;
  paymentIntentId?: string;
  paymentStatus?: 'unpaid' | 'paid' | 'failed';
  trackingUrl?: string;
  deliveryId?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDeliveryTime?: string;
}

export interface TrackingStatus {
  guestId: string;
  orderId: string;
  status: OrderStatus;
  availability: 'recorded' | 'live' | 'unavailable';
  paymentStatus: 'unpaid' | 'paid' | 'failed';
  dispatchStatus: string;
  providerTrackingUrl?: string;
  driverName?: string;
  driverPhone?: string;
  currentLocation?: { lat: number; lng: number };
  estimatedMinutes?: number;
  trackingUrl?: string;
  timeline: TrackingEvent[];
}

export interface TrackingEvent {
  status: OrderStatus;
  timestamp: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  orderId: string;
  sender: 'customer' | 'driver' | 'system';
  message: string;
  timestamp: string;
}

export interface PaymentIntent {
  guestId: string;
  orderId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  currency: 'usd';
  status: string;
}

export interface CustomerOrderPage {
  guestId: string;
  orders: Order[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
export interface CustomerChat {
  guestId: string;
  orderId: string;
  available: boolean;
  messages: ChatMessage[];
}
export interface CustomerPaymentReceipt {
  success: true;
  guestId: string;
  orderId: string;
  paymentIntentId: string;
  paymentStatus: 'paid';
  dispatched: boolean;
  trackingUrl?: string;
}

// ─── App Flow State ───────────────────────────────────────────────────────────

export interface OrderDraft {
  serviceType?: ServiceType;
  pickupAddress?: Partial<Address>;
  dropoffAddress?: Partial<Address>;
  items?: OrderItem[];
  contact?: Partial<ContactInfo>;
  notes?: string;
  selectedStore?: Store;
  pricing?: PricingQuote;
  orderId?: string;
  paymentIntentId?: string;
}
