/**
 * Backoff policy utilities for managing retry delays.
 * Provides predefined policies and AbortSignal support.
 */

export type BackoffPolicy = {
  initialMs: number;
  maxMs: number;
  factor: number;
  jitter: number;
};

/**
 * Predefined backoff policies for common use cases.
 */
export const BACKOFF_POLICIES = {
  /** Fast retries for local operations */
  aggressive: { initialMs: 100, maxMs: 5000, factor: 2, jitter: 0.1 },
  /** Standard policy for most operations */
  standard: { initialMs: 300, maxMs: 30000, factor: 2, jitter: 0.15 },
  /** Slow retries for external APIs */
  conservative: { initialMs: 1000, maxMs: 60000, factor: 1.5, jitter: 0.2 },
  /** Optimized for rate-limited APIs (like Gemini) */
  api: { initialMs: 500, maxMs: 30000, factor: 2, jitter: 0.25 },
  /** For LLM calls - longer initial wait */
  llm: { initialMs: 1000, maxMs: 60000, factor: 2, jitter: 0.3 },
  /** For database/storage operations */
  storage: { initialMs: 200, maxMs: 10000, factor: 2, jitter: 0.1 },
} as const;

/**
 * Compute the backoff delay for a given attempt.
 */
export function computeBackoff(policy: BackoffPolicy, attempt: number): number {
  const base = policy.initialMs * policy.factor ** Math.max(attempt - 1, 0);
  const jitter = base * policy.jitter * Math.random();
  return Math.min(policy.maxMs, Math.round(base + jitter));
}

/**
 * Compute all delays for a series of attempts (without jitter for predictability).
 */
export function computeBackoffSeries(policy: BackoffPolicy, attempts: number): number[] {
  const delays: number[] = [];
  for (let i = 1; i <= attempts; i++) {
    const base = policy.initialMs * policy.factor ** (i - 1);
    delays.push(Math.min(policy.maxMs, Math.round(base)));
  }
  return delays;
}

/**
 * Sleep for a given duration with AbortSignal support.
 */
export async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  if (signal?.aborted) {
    throw new Error('aborted');
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve();
    }, ms);

    const abortHandler = () => {
      clearTimeout(timeoutId);
      reject(new Error('aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

/**
 * Create a backoff iterator for manual control over retry timing.
 */
export function createBackoffIterator(policy: BackoffPolicy, maxAttempts: number) {
  return {
    next(attempt: number): number | null {
      if (attempt >= maxAttempts) {
        return null;
      }
      return computeBackoff(policy, attempt);
    },
  };
}

export default BACKOFF_POLICIES;
