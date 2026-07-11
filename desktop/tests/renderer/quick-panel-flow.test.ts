import { describe, it, expect } from 'vitest';
import {
  formatMemRow,
  formatDiskRow,
  formatCpuRow,
  memPercent,
  usageUnavailableText,
} from '../../src/renderer/screens/quick-panel-flow';

/**
 * Flat table, one `it` per formatter row (mirrors tests/renderer/settings-flow.test.ts).
 * Pure, React-free, type-only imports from shared/ipc-contract.ts's UsageResult shape.
 */
describe('formatMemRow', () => {
  it('formats used/total kB as "x.x / y.y GB"', () => {
    expect(formatMemRow(1024 * 1024, 16 * 1024 * 1024)).toBe('1.0 / 16.0 GB');
  });

  it('rounds to one decimal place', () => {
    expect(formatMemRow(1536 * 1024, 3 * 1024 * 1024)).toBe('1.5 / 3.0 GB');
  });

  it('handles zero used', () => {
    expect(formatMemRow(0, 8 * 1024 * 1024)).toBe('0.0 / 8.0 GB');
  });
});

describe('formatDiskRow', () => {
  it('formats used/total kB as "x.x / y.y GB"', () => {
    expect(formatDiskRow(876543, 41943040)).toBe('0.8 / 40.0 GB');
  });

  it('handles used === total (full disk)', () => {
    expect(formatDiskRow(10 * 1024 * 1024, 10 * 1024 * 1024)).toBe('10.0 / 10.0 GB');
  });
});

describe('formatCpuRow', () => {
  it('formats load1/cpuCount as a rounded percentage', () => {
    expect(formatCpuRow(0.52, 8)).toBe('7%');
  });

  it('clamps above 100% (load exceeding core count)', () => {
    expect(formatCpuRow(16, 4)).toBe('100%');
  });

  it('clamps at 0% floor (never negative)', () => {
    expect(formatCpuRow(-1, 4)).toBe('0%');
  });

  it('cpuCount<=0 degrades to "0%" rather than dividing by zero / NaN', () => {
    expect(formatCpuRow(1, 0)).toBe('0%');
  });
});

describe('memPercent', () => {
  it('computes a rounded 0-100 percentage for the RAM bar width', () => {
    expect(memPercent(4 * 1024 * 1024, 16 * 1024 * 1024)).toBe(25);
  });

  it('clamps at 100 (used > total, a defensive edge)', () => {
    expect(memPercent(20 * 1024 * 1024, 16 * 1024 * 1024)).toBe(100);
  });

  it('memTotalKb<=0 degrades to 0 rather than dividing by zero / NaN', () => {
    expect(memPercent(100, 0)).toBe(0);
  });
});

describe('usageUnavailableText', () => {
  it('engine-stopped -> a calm "start your engine" message', () => {
    expect(usageUnavailableText('engine-stopped')).toBe('Start your engine to see usage.');
  });

  it('probe-failed -> a calm "could not read usage" message', () => {
    expect(usageUnavailableText('probe-failed')).toBe("Couldn't read usage right now.");
  });
});
