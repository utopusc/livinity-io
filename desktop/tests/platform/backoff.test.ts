import { describe, it, expect } from 'vitest';
import { nextBackoffMs, THROTTLE_AFTER, BACKOFF_CAP_MS } from '../../src/main/platform/backoff';

describe('nextBackoffMs', () => {
  it('is free (0ms) for the first 3 attempts', () => {
    expect(nextBackoffMs(0)).toBe(0);
    expect(nextBackoffMs(1)).toBe(0);
    expect(nextBackoffMs(2)).toBe(0);
  });

  it('throttles to 8s on the 4th consecutive failure (matches UI-SPEC example)', () => {
    expect(nextBackoffMs(3)).toBe(8000);
  });

  it('doubles to 16s on the 5th consecutive failure', () => {
    expect(nextBackoffMs(4)).toBe(16000);
  });

  it('doubles to 32s on the 6th consecutive failure', () => {
    expect(nextBackoffMs(5)).toBe(32000);
  });

  it('caps at 60s from the 7th consecutive failure onward', () => {
    expect(nextBackoffMs(6)).toBe(60000);
    expect(nextBackoffMs(10)).toBe(60000);
  });

  it('is monotonically non-decreasing across attempts 0..10', () => {
    let prev = -1;
    for (let attempt = 0; attempt <= 10; attempt++) {
      const value = nextBackoffMs(attempt);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it('exposes THROTTLE_AFTER and BACKOFF_CAP_MS constants', () => {
    expect(THROTTLE_AFTER).toBe(3);
    expect(BACKOFF_CAP_MS).toBe(60000);
  });
});
