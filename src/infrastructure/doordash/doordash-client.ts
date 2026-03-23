/**
 * DoorDash Drive API client for Storree Shopify app.
 * 
 * Uses JWT-authenticated REST calls to DoorDash Drive v2 API.
 * Implements the StorreeClient interface so it can be swapped in
 * without changing orchestrator logic.
 */

import { createHmac } from 'node:crypto';
import { StorreeClient, DispatchRequest, StorreeDispatchResult, StorreeDispatchError } from '../storree/storree-client.js';

// ─── JWT Generation ──────────────────────────────────────────────────────────

function base64url(str: string | Buffer): string {
  const b = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateDoorDashJWT(developerId: string, keyId: string, signingSecret: string): string {
  const header = { alg: 'HS256', typ: 'JWT', 'dd-ver': 'DD-JWT-V1' } as Record<string, string>;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'doordash',
    iss: developerId,
    kid: keyId,
    exp: now + 300, // 5 minutes
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sig = createHmac('sha256', Buffer.from(signingSecret, 'base64'))
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64url(sig)}`;
}

// ─── Address formatting ───────────────────────────────────────────────────────

function formatPhoneE164(phone: string | undefined | null): string {
  if (!phone) return '+13464755016'; // Style.re admin fallback
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// ─── Geocoding helper ─────────────────────────────────────────────────────────

export async function geocodeAddress(address: string, googleApiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleApiKey}`;
    const res = await fetch(url);
    const data = await res.json() as { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } } }> };
    if (data.status === 'OK' && data.results[0]) {
      return data.results[0].geometry.location;
    }
  } catch {}
  return null;
}

// ─── DoorDash Drive Client ────────────────────────────────────────────────────

export interface DoorDashConfig {
  developerId: string;
  keyId: string;
  signingSecret: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface DoorDashDelivery {
  id: string;
  external_delivery_id: string;
  tracking_url: string;
  delivery_status: string;
  fee?: number;
  currency?: string;
  pickup_time_estimated?: string;
  dropoff_time_estimated?: string;
  dropoff_eta?: string;
  dasher_name?: string;
  dasher_dropoff_phone_number?: string;
  pickup_address?: string;
  dropoff_address?: string;
}

export class DoorDashDriveClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: DoorDashConfig) {
    this.baseUrl = config.baseUrl ?? 'https://openapi.doordash.com';
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  private jwt(): string {
    return generateDoorDashJWT(this.config.developerId, this.config.keyId, this.config.signingSecret);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.jwt()}`,
      'Content-Type': 'application/json',
    };
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      // Check DoorDash API connectivity by GETting a non-existent delivery.
      // 404 = API reachable and JWT is valid (resource not found but auth passed)
      // 401 = API reachable but credentials invalid
      // Network error = unreachable
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(
          `${this.baseUrl}/drive/v2/deliveries/health_check_${Date.now()}`,
          {
            method: 'GET',
            headers: this.headers(),
            signal: controller.signal,
          }
        );
        // 404 = not found but auth valid; 400 = bad request but reachable — both mean API is up
        return res.status !== 401 && res.status !== 403;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async createDelivery(payload: Record<string, unknown>): Promise<DoorDashDelivery> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/drive/v2/deliveries`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      }
    );

    const body = await res.json().catch(() => ({})) as DoorDashDelivery & { message?: string };

    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      throw new DoorDashError(
        body.message ?? `DoorDash API error ${res.status}`,
        retryable,
        res.status
      );
    }

    return body;
  }

  async getDelivery(externalId: string): Promise<DoorDashDelivery> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/drive/v2/deliveries/${externalId}`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );
    const body = await res.json().catch(() => ({})) as DoorDashDelivery;
    return body;
  }

  async cancelDelivery(externalId: string): Promise<void> {
    await this.fetchWithTimeout(
      `${this.baseUrl}/drive/v2/deliveries/${externalId}/cancel`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({}),
      }
    );
  }
}

export class DoorDashError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'DoorDashError';
  }
}

// ─── DoorDash → StorreeClient adapter ────────────────────────────────────────

export class DoorDashStorreeAdapter implements StorreeClient {
  private readonly dd: DoorDashDriveClient;
  private readonly merchantPickupAddress: string;
  private readonly merchantPickupPhone: string;
  private readonly merchantPickupName: string;
  private readonly twiliPhone: string;
  private readonly googleMapsKey?: string;

  constructor(opts: {
    doordash: DoorDashDriveClient;
    merchantPickupAddress: string;
    merchantPickupPhone?: string;
    merchantPickupName?: string;
    twilioPhone?: string;
    googleMapsKey?: string;
  }) {
    this.dd = opts.doordash;
    this.merchantPickupAddress = opts.merchantPickupAddress;
    this.merchantPickupPhone = formatPhoneE164(opts.merchantPickupPhone);
    this.merchantPickupName = opts.merchantPickupName ?? 'Store';
    this.twiliPhone = opts.twilioPhone ?? '+13464755016';
    this.googleMapsKey = opts.googleMapsKey;
  }

  async checkConnectivity(): Promise<boolean> {
    return this.dd.checkConnectivity();
  }

  private async reverseGeocode(lat: number, lng: number): Promise<string> {
    if (!this.googleMapsKey) return `${lat},${lng}`;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.googleMapsKey}`;
      const res = await fetch(url);
      const data = await res.json() as { status: string; results: Array<{ formatted_address: string }> };
      if (data.status === 'OK' && data.results[0]) {
        return data.results[0].formatted_address;
      }
    } catch {}
    return `${lat},${lng}`;
  }

  async createDispatch(request: DispatchRequest): Promise<StorreeDispatchResult> {
    const started = Date.now();

    try {
      const external_delivery_id = `storree_${request.idempotencyKey}`;

      const delivery = await this.dd.createDelivery({
        external_delivery_id,
        pickup_address: this.merchantPickupAddress,
        pickup_business_name: this.merchantPickupName,
        pickup_phone_number: this.merchantPickupPhone,
        pickup_instructions: `Order #${request.externalReference}. Pick up items and deliver to customer.`,
        pickup_reference_tag: `Order #${request.externalReference}`,
        // Drop-off — use Twilio intermediary phone so driver contacts us
        dropoff_phone_number: this.twiliPhone,
        dropoff_contact_given_name: 'Customer',
        dropoff_instructions: 'Please follow building signage. Ring doorbell or call upon arrival.',
        // Build a string address from coords via Google reverse geocode
        dropoff_address: await this.reverseGeocode(request.dropoff.lat, request.dropoff.lng),
        order_value: 0,
        pickup_window: {
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        },
        dropoff_window: {
          start_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          end_time: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
        },
        action_if_undeliverable: 'return_to_pickup',
      });

      const latencyMs = Date.now() - started;

      return {
        dispatchId: delivery.external_delivery_id,
        accepted: true,
        status: 'accepted',
        providerStatusCode: 200,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      if (err instanceof DoorDashError) {
        throw new StorreeDispatchError(err.message, err.retryable, err.statusCode);
      }
      throw new StorreeDispatchError(String(err), true);
    }
  }
}
