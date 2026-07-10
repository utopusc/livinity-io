import { describe, it, expect } from 'vitest';
import { isDistroRegistered, parseWslVersion } from '../../src/main/wsl/parse-wsl-list';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/cloudflare/decide-scope-verdict.test.ts).
 * The load-bearing property: both parsers key off exact-line equality / version
 * SHAPE only — never off localized narrative text or case-folding (D-01).
 */
describe('isDistroRegistered', () => {
  it('exact ASCII name match on a --quiet list line', () => {
    expect(isDistroRegistered('Ubuntu\nlivinity\ndocker-desktop', 'livinity')).toBe(true);
  });

  it('no match when the exact name is absent from the list', () => {
    expect(isDistroRegistered('Ubuntu\nUbuntu-24.04', 'livinity')).toBe(false);
  });

  it('trims whitespace + CRLF around a matching line', () => {
    expect(isDistroRegistered('  livinity  \r\n', 'livinity')).toBe(true);
  });

  it('exact-case only — never case-folds (a foreign locale must not change casing semantics)', () => {
    expect(isDistroRegistered('LIVINITY', 'livinity')).toBe(false);
  });

  it('no substring match — full-line equality only', () => {
    expect(isDistroRegistered('livinity-test\nmy-livinity', 'livinity')).toBe(false);
  });

  it('empty output => false', () => {
    expect(isDistroRegistered('', 'livinity')).toBe(false);
  });
});

describe('parseWslVersion', () => {
  it('matches the dotted version SHAPE from English-labeled output', () => {
    expect(parseWslVersion('WSL version: 2.5.7.0\nKernel version: 5.15')).toBe('2.5.7.0');
  });

  it('matches the version by shape even under a Turkish label (locale-safe)', () => {
    expect(parseWslVersion('Sürüm: 2.4.4')).toBe('2.4.4');
  });

  it('returns null when no version-shaped substring is present', () => {
    expect(parseWslVersion('no version here')).toBe(null);
  });
});
