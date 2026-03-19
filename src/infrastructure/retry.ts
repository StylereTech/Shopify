/**
 * Exponential backoff retry utility.
 * Matches Style.re 1.1 behavior: 30s → 60s → 120s base cadence,
 * with jitter and configurable max delay.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    label?: string;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000, label = 'retryWithBackoff', onRetry } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;

      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      onRetry?.(attempt + 1, error);
      console.warn(
        `[${label}] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`,
        error instanceof Error ? error.message : error
      );
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Delay helper using exponential backoff formula.
 * attempt=0 → baseDelayMs, attempt=1 → 2×base, attempt=2 → 4×base, etc.
 */
export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponential + jitter, maxDelayMs);
}
