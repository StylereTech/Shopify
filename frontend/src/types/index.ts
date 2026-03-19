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
  createdAt: string;
  updatedAt: string;
  estimatedDeliveryTime?: string;
}

export interface TrackingStatus {
  orderId: string;
  status: OrderStatus;
  driverName?: string;
  driverPhone?: string;
  currentLocation?: { lat: number; lng: number };
  estimatedMinutes?: number;
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
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
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
