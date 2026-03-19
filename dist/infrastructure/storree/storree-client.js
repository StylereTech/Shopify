export class StorreeDispatchError extends Error {
    retryable;
    providerStatusCode;
    constructor(message, retryable, providerStatusCode) {
        super(message);
        this.retryable = retryable;
        this.providerStatusCode = providerStatusCode;
    }
}
export class StorreeApiClient {
    baseUrl;
    apiKey;
    timeoutMs;
    maxRetries;
    constructor(baseUrl, apiKey, timeoutMs, maxRetries) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
        this.maxRetries = maxRetries;
    }
    async checkConnectivity() {
        try {
            const r = await this.fetchWithTimeout(`${this.baseUrl}/health`, { method: 'GET' });
            return r.ok;
        }
        catch {
            return false;
        }
    }
    async createDispatch(request) {
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
                const payload = (await response.json().catch(() => ({})));
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
                    if (attempts <= this.maxRetries)
                        continue;
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
            }
            catch (error) {
                const latencyMs = Date.now() - started;
                if (error instanceof StorreeDispatchError)
                    throw error;
                if (attempts <= this.maxRetries)
                    continue;
                throw new StorreeDispatchError(`Storree network failure (${String(error)})`, true, undefined);
            }
        }
        throw new StorreeDispatchError('Storree retry exhaustion', true);
    }
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        finally {
            clearTimeout(timer);
        }
    }
}
export class FakeStorreeClient {
    async checkConnectivity() {
        return true;
    }
    async createDispatch(request) {
        return {
            dispatchId: `disp_${request.externalReference}`,
            accepted: true,
            status: 'accepted',
            latencyMs: 5
        };
    }
}
