/**
 * Advanced retry system with exponential backoff, jitter, and rate limit support.
 * Ported from OpenClaw's retry infrastructure.
 */

export type RetryConfig = {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
};

export type RetryInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  err: unknown;
  label?: string;
};

export type RetryOptions = RetryConfig & {
  label?: string;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  retryAfterMs?: (err: unknown) => number | undefined;
  onRetry?: (info: RetryInfo) => void;
};

export const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  minDelayMs: 300,
  maxDelayMs: 30_000,
  jitter: 0.1,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const clampNumber = (value: unknown, fallback: number, min?: number, max?: number) => {
  const next = asFiniteNumber(value);
  if (next === undefined) {
    return fallback;
  }
  const floor = typeof min === 'number' ? min : Number.NEGATIVE_INFINITY;
  const ceiling = typeof max === 'number' ? max : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(next, floor), ceiling);
};

export function resolveRetryConfig(
  defaults: Required<RetryConfig> = DEFAULT_RETRY_CONFIG,
  overrides?: RetryConfig
): Required<RetryConfig> {
  const attempts = Math.max(1, Math.round(clampNumber(overrides?.attempts, defaults.attempts, 1)));
  const minDelayMs = Math.max(0, Math.round(clampNumber(overrides?.minDelayMs, defaults.minDelayMs, 0)));
  const maxDelayMs = Math.max(minDelayMs, Math.round(clampNumber(overrides?.maxDelayMs, defaults.maxDelayMs, 0)));
  const jitter = clampNumber(overrides?.jitter, defaults.jitter, 0, 1);
  return { attempts, minDelayMs, maxDelayMs, jitter };
}

function applyJitter(delayMs: number, jitter: number): number {
  if (jitter <= 0) {
    return delayMs;
  }
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(delayMs * (1 + offset)));
}

/**
 * Retry an async function with exponential backoff.
 *
 * @example
 * // Simple usage with number of attempts
 * const result = await retryAsync(() => fetchData(), 5);
 *
 * @example
 * // Advanced usage with options
 * const result = await retryAsync(
 *   () => fetchData(),
 *   {
 *     attempts: 5,
 *     minDelayMs: 500,
 *     maxDelayMs: 30000,
 *     jitter: 0.2,
 *     label: 'fetch-data',
 *     shouldRetry: (err) => isNetworkError(err),
 *     retryAfterMs: (err) => extractRetryAfter(err),
 *     onRetry: (info) => console.log(`Retry ${info.attempt}/${info.maxAttempts}`),
 *   }
 * );
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  attemptsOrOptions: number | RetryOptions = 3,
  initialDelayMs = 300
): Promise<T> {
  // Simple mode: just number of attempts
  if (typeof attemptsOrOptions === 'number') {
    const attempts = Math.max(1, Math.round(attemptsOrOptions));
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i === attempts - 1) {
          break;
        }
        const delay = initialDelayMs * 2 ** i;
        await sleep(delay);
      }
    }
    throw lastErr ?? new Error('Retry failed');
  }

  // Advanced mode: full options object
  const options = attemptsOrOptions;

  const resolved = resolveRetryConfig(DEFAULT_RETRY_CONFIG, options);
  const maxAttempts = resolved.attempts;
  const minDelayMs = resolved.minDelayMs;
  const maxDelayMs =
    Number.isFinite(resolved.maxDelayMs) && resolved.maxDelayMs > 0
      ? resolved.maxDelayMs
      : Number.POSITIVE_INFINITY;
  const jitter = resolved.jitter;
  const shouldRetry = options.shouldRetry ?? (() => true);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        break;
      }

      // Check for Retry-After header from rate limiting
      const retryAfterMs = options.retryAfterMs?.(err);
      const hasRetryAfter = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs);

      // Calculate delay with exponential backoff
      const baseDelay = hasRetryAfter
        ? Math.max(retryAfterMs, minDelayMs)
        : minDelayMs * 2 ** (attempt - 1);

      let delay = Math.min(baseDelay, maxDelayMs);
      delay = applyJitter(delay, jitter);
      delay = Math.min(Math.max(delay, minDelayMs), maxDelayMs);

      // Notify about retry
      options.onRetry?.({
        attempt,
        maxAttempts,
        delayMs: delay,
        err,
        label: options.label,
      });

      await sleep(delay);
    }
  }

  throw lastErr ?? new Error('Retry failed');
}

/**
 * Create a retry wrapper with preset configuration.
 */
export function createRetryWrapper(defaultOptions: RetryOptions) {
  return async <T>(fn: () => Promise<T>, overrideOptions?: Partial<RetryOptions>): Promise<T> => {
    return retryAsync(fn, { ...defaultOptions, ...overrideOptions });
  };
}

export default retryAsync;
