import { describe, it, expect } from 'vitest';
import { decideResourceDefaults } from '../../src/main/wsl/decide-resource-defaults';

/**
 * Flat table (mirrors tests/platform/backoff.test.ts style) -- pure numeric
 * calculator, zero mocks.
 */
describe('decideResourceDefaults', () => {
  it('recommends ~50% RAM / cores-1 / a sensible disk budget on a high-end fixture', () => {
    const result = decideResourceDefaults({ totalRamBytes: 16 * 1024 ** 3, totalCores: 8, freeDiskGb: 200 });
    expect(result.memoryGb).toBe(8);
    expect(result.processors).toBe(7);
    expect(result.diskGb).toBeGreaterThanOrEqual(15);
  });

  it('recommends ~50% RAM / cores-1 / a sane disk budget on a mid-range fixture', () => {
    const result = decideResourceDefaults({ totalRamBytes: 8 * 1024 ** 3, totalCores: 4, freeDiskGb: 60 });
    expect(result.memoryGb).toBe(4);
    expect(result.processors).toBe(3);
    expect(result.diskGb).toBeGreaterThanOrEqual(15);
  });

  it('low-end guard: never recommends 0 cores, and never drops diskGb below the 15GB floor', () => {
    const result = decideResourceDefaults({ totalRamBytes: 4 * 1024 ** 3, totalCores: 2, freeDiskGb: 20 });
    expect(result.processors).toBeGreaterThanOrEqual(1);
    expect(result.diskGb).toBeGreaterThanOrEqual(15);
    expect(result.memoryGb).toBeLessThanOrEqual(4);
  });

  it('never recommends more RAM than total (single logical core, tiny RAM fixture)', () => {
    const result = decideResourceDefaults({ totalRamBytes: 1 * 1024 ** 3, totalCores: 1, freeDiskGb: 15 });
    expect(result.memoryGb).toBeGreaterThanOrEqual(1);
    expect(result.memoryGb).toBeLessThanOrEqual(1);
    expect(result.processors).toBe(1);
    expect(result.diskGb).toBe(15);
  });

  it('is deterministic -- the same input always produces the same output', () => {
    const input = { totalRamBytes: 16 * 1024 ** 3, totalCores: 8, freeDiskGb: 200 };
    expect(decideResourceDefaults(input)).toEqual(decideResourceDefaults(input));
  });

  it('every returned value is an integer', () => {
    const result = decideResourceDefaults({ totalRamBytes: 12 * 1024 ** 3, totalCores: 6, freeDiskGb: 77 });
    expect(Number.isInteger(result.memoryGb)).toBe(true);
    expect(Number.isInteger(result.processors)).toBe(true);
    expect(Number.isInteger(result.diskGb)).toBe(true);
  });
});
