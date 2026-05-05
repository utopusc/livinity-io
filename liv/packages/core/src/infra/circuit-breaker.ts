/**
 * CircuitBreaker — Prevents cascade failures when Redis (or other services) become unreachable.
 *
 * States:
 * - CLOSED: Normal operation. Failures are counted. If threshold exceeded, transitions to OPEN.
 * - OPEN: Service is considered down. Calls are rejected immediately (fail-fast).
 *   After resetTimeoutMs, transitions to HALF_OPEN.
 * - HALF_OPEN: Testing recovery. Allows a limited number of test calls.
 *   On success, transitions to CLOSED. On failure, transitions back to OPEN.
 */

import { logger } from '../logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN */
  resetTimeoutMs?: number;
  /** Number of successful calls needed in HALF_OPEN to close the circuit */
  halfOpenMaxAttempts?: number;
  /** Optional name for logging */
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly name: string;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.halfOpenMaxAttempts = config.halfOpenMaxAttempts ?? 3;
    this.name = config.name ?? 'CircuitBreaker';
  }

  /** Get current circuit state */
  getState(): CircuitState {
    return this.state;
  }

  /** Get current failure count */
  getFailureCount(): number {
    return this.failureCount;
  }

  /** Record a failure. May transition CLOSED -> OPEN or HALF_OPEN -> OPEN. */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN sends us back to OPEN
      this.transitionTo('OPEN');
      return;
    }

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /** Record a success. May transition HALF_OPEN -> CLOSED. */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxAttempts) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  /** Check if the circuit allows a call through */
  isCallPermitted(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;

    // OPEN state: check if resetTimeout has elapsed
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
        return true;
      }
      return false;
    }

    return false;
  }

  /** Transition to a new state with logging and cleanup */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Clear any existing reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    switch (newState) {
      case 'OPEN':
        this.successCount = 0;
        logger.error(`${this.name}: OPEN — service unreachable`, {
          failureCount: this.failureCount,
          previousState: oldState,
        });
        // Schedule automatic transition to HALF_OPEN
        this.resetTimer = setTimeout(() => {
          if (this.state === 'OPEN') {
            this.transitionTo('HALF_OPEN');
          }
        }, this.resetTimeoutMs);
        break;

      case 'HALF_OPEN':
        this.successCount = 0;
        logger.info(`${this.name}: HALF_OPEN — testing recovery`, {
          previousState: oldState,
        });
        break;

      case 'CLOSED':
        this.failureCount = 0;
        this.successCount = 0;
        logger.info(`${this.name}: CLOSED — service recovered`, {
          previousState: oldState,
        });
        break;
    }
  }

  /** Clean up timers (call on shutdown) */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
