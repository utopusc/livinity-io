/**
 * src/main/platform/backoff.ts
 *
 * Pure D-08 exponential backoff calculator — the client-side compensating
 * control for the platform's login endpoints, which have no server-side
 * rate limiting today. The first THROTTLE_AFTER attempts are free; each
 * subsequent failure doubles the delay, capped at BACKOFF_CAP_MS. This
 * function only computes a number — the consumer (Plan 04) owns the actual
 * timing/countdown.
 *
 * Zero imports from the electron module, any Node built-in, or a scheduling
 * primitive — pure, unit-testable.
 */

export const THROTTLE_AFTER = 3;
export const BACKOFF_CAP_MS = 60000;

export function nextBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures < THROTTLE_AFTER) return 0;
  const ms = 8000 * 2 ** (consecutiveFailures - THROTTLE_AFTER);
  return Math.min(ms, BACKOFF_CAP_MS);
}
