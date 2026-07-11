import { describe, it, expect } from 'vitest';
import {
  ALLOWED_ORIGIN,
  isAllowedNavigation,
  decideDashboardOpen,
} from '../../src/main/dashboard/decide-dashboard-nav';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/wsl/decide-wsl-state.test.ts).
 * The load-bearing property (T-06-06): isAllowedNavigation denies every URL that is not
 * an EXACT origin match, including the lookalike-host spoof row -- a prefix/startsWith
 * check alone would let 'http://localhost:8080.evil.com/' through, an exact-origin
 * comparison cannot.
 */
describe('ALLOWED_ORIGIN', () => {
  it('is the WSL2 localhost-forwarding target matching livinityd\'s in-distro bind', () => {
    expect(ALLOWED_ORIGIN).toBe('http://localhost:8080');
  });
});

describe('isAllowedNavigation', () => {
  it('http://localhost:8080/ -> true (exact origin, root path)', () => {
    expect(isAllowedNavigation('http://localhost:8080/')).toBe(true);
  });

  it('http://localhost:8080 (no trailing slash) -> true (bare origin)', () => {
    expect(isAllowedNavigation('http://localhost:8080')).toBe(true);
  });

  it('http://localhost:8080/apps/foo -> true (same origin, sub-path)', () => {
    expect(isAllowedNavigation('http://localhost:8080/apps/foo')).toBe(true);
  });

  it('https://evil.example/ -> false (different origin entirely)', () => {
    expect(isAllowedNavigation('https://evil.example/')).toBe(false);
  });

  it('http://localhost:9999/ -> false (different port = different origin)', () => {
    expect(isAllowedNavigation('http://localhost:9999/')).toBe(false);
  });

  it('file:///etc/passwd -> false (non-http origin)', () => {
    expect(isAllowedNavigation('file:///etc/passwd')).toBe(false);
  });

  it('SPOOF GUARD: http://localhost:8080.evil.com/ -> false (lookalike host, NOT a prefix-match bypass)', () => {
    expect(isAllowedNavigation('http://localhost:8080.evil.com/')).toBe(false);
  });

  it('SPOOF GUARD: https://localhost:8080/ -> false (protocol differs, origin differs)', () => {
    expect(isAllowedNavigation('https://localhost:8080/')).toBe(false);
  });

  it('malformed/unparseable url -> false (fail-closed, never throws)', () => {
    expect(isAllowedNavigation('not a url')).toBe(false);
  });

  it('empty string -> false (fail-closed)', () => {
    expect(isAllowedNavigation('')).toBe(false);
  });
});

describe('decideDashboardOpen', () => {
  it('healthy=true -> { mode: "direct" } (no interstitial flash)', () => {
    expect(decideDashboardOpen(true)).toEqual({ mode: 'direct' });
  });

  it('healthy=false -> { mode: "interstitial" } (poll+swap)', () => {
    expect(decideDashboardOpen(false)).toEqual({ mode: 'interstitial' });
  });
});
