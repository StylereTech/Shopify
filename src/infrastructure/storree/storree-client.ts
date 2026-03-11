import { DeliveryServiceLevel, MerchantDeliveryConfig, ShopifyOrderPayload } from '../../domain/types.js';

export interface DispatchRequest {
  storreeMerchantId: string;
  serviceLevel: DeliveryServiceLevel;
  pickup: MerchantDeliveryConfig['pickupLocation'];
  dropoff: ShopifyOrderPayload['customerAddress'];
  externalReference: string;
  items: ShopifyOrderPayload['lineItems'];
  idempotencyKey: string;
}

export interface StorreeDispatchResult {
  dispatchId: string;
  accepted: boolean;
  status: 'accepted' | 'rejected';
  providerStatusCode?: number;
  latencyMs: number;
  errorClass?: 'retryable' | 'terminal';
}

export class StorreeDispatchError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly providerStatusCode?: number
  ) {
    super(message);
  }
}

export interface StorreeClient {
  createDispatch(request: DispatchRequest): Promise<StorreeDispatchResult>;
  checkConnectivity(): Promise<boolean>;
}

export class StorreeApiClient implements StorreeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    private readonly maxRetries: number
  ) {}

  async checkConnectivity(): Promise<boolean> {
    try {
      const r = await this.fetchWithTimeout(`${this.baseUrl}/health`, { method: 'GET' });
      return r.ok;
    } catch {
      return false;
    }
  }

  async createDispatch(request: DispatchRequest): Promise<StorreeDispatchResult> {
    const started = Date.now();
    let attempts = 0;

    while (attempts <= this.maxRetries) {
      attempts += 1;
      try {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/dispatches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Idempotency-Key': request.idempotencyKey
          },
          body: JSON.stringify({
            merchant_id: request.storreeMerchantId,
            service_level: request.serviceLevel,
            pickup: request.pickup,
            dropoff: request.dropoff,
            external_reference: request.externalReference,
            items: request.items
          })
        });

        const latencyMs = Date.now() - started;
        const payload = (await response.json().catch(() => ({}))) as { id?: string; accepted?: boolean; message?: string };

        if (response.ok) {
          const accepted = payload.accepted !== false;
          return {
            dispatchId: payload.id ?? `disp_${request.externalReference}`,
            accepted,
            status: accepted ? 'accepted' : 'rejected',
            providerStatusCode: response.status,
            latencyMs,
            errorClass: accepted ? undefined : 'terminal'
          };
        }

        if (response.status >= 500 || response.status === 429) {
          if (attempts <= this.maxRetries) continue;
          throw new StorreeDispatchError(payload.message ?? 'Storree temporary failure', true, response.status);
        }

        return {
          dispatchId: payload.id ?? `disp_${request.externalReference}`,
          accepted: false,
          status: 'rejected',
          providerStatusCode: response.status,
          latencyMs,
          errorClass: 'terminal'
        };
      } catch (error) {
        const latencyMs = Date.now() - started;
        if (error instanceof StorreeDispatchError) throw error;
        if (attempts <= this.maxRetries) continue;
        throw new StorreeDispatchError(`Storree network failure (${String(error)})`, true, undefined);
      }
    }

    throw new StorreeDispatchError('Storree retry exhaustion', true);
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
}

export class FakeStorreeClient implements StorreeClient {
  async checkConnectivity(): Promise<boolean> {
    return true;
  }

  async createDispatch(request: DispatchRequest): Promise<StorreeDispatchResult> {
    return {
      dispatchId: `disp_${request.externalReference}`,
      accepted: true,
      status: 'accepted',
      latencyMs: 5
    };
  }
}
