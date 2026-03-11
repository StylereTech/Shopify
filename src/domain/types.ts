export type DeliveryServiceLevel = 'one_hour' | 'same_day';

export type DeliveryStatus =
  | 'quoted'
  | 'pending'
  | 'accepted'
  | 'driver_assigned'
  | 'en_route_pickup'
  | 'picked_up'
  | 'en_route_dropoff'
  | 'delivered'
  | 'failed'
  | 'canceled';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MerchantDeliveryConfig {
  merchantId: string;
  shopDomain: string;
  storreeMerchantId: string;
  pickupLocation: Coordinates;
  shopifyLocationId?: string;
  radiusKm: number;
  oneHourEnabled: boolean;
  sameDayEnabled: boolean;
  oneHourCutoffHourLocal: number;
  sameDayCutoffHourLocal: number;
  baseFeeCents: number;
  pricePerKmCents: number;
  platformMarkupPercent: number;
  timezone: string;
  isActive: boolean;
}

export interface DeliveryQuoteRequest {
  merchantConfig: MerchantDeliveryConfig;
  dropoffLocation: Coordinates;
  orderSubtotalCents: number;
  requestedAt: Date;
}

export interface DeliveryQuote {
  serviceLevel: DeliveryServiceLevel;
  feeCents: number;
  etaMinutes: number;
  message: string;
}

export interface ShopifyOrderPayload {
  id: string;
  orderNumber: string;
  shopDomain: string;
  shippingMethodCode: string;
  customerAddress: Coordinates;
  lineItems: Array<{ sku: string; quantity: number; name: string }>;
}

export interface DeliveryJob {
  id: string;
  shopifyOrderId: string;
  merchantId: string;
  serviceLevel: DeliveryServiceLevel;
  status: DeliveryStatus;
  dispatchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface ShopInstallation {
  shopDomain: string;
  encryptedAccessToken: EncryptedSecret;
  scopes: string[];
  installedAt: Date;
  carrierServiceId?: string;
}

export interface OAuthState {
  state: string;
  shopDomain: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface WebhookEvent {
  id: string;
  topic: string;
  shopDomain: string;
  receivedAt: Date;
  status: 'received' | 'processed' | 'failed';
  payload: unknown;
  errorMessage?: string;
}

export interface DispatchAttempt {
  id: string;
  jobId: string;
  attemptedAt: Date;
  success: boolean;
  retryCount: number;
  errorClass?: 'retryable' | 'terminal';
  errorMessage?: string;
  providerStatusCode?: number;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
