import { describe, it, expect } from 'vitest';
import { deriveTunnelName } from '../../src/main/cloudflare/derive-tunnel-name';

describe('deriveTunnelName', () => {
  it('derives livos-<username> from the platform username', () => {
    expect(deriveTunnelName({ username: 'drampa', subLabel: 'liv' })).toBe('livos-drampa');
  });

  it('falls back to livos-<subLabel> when username is null', () => {
    expect(deriveTunnelName({ username: null, subLabel: 'liv' })).toBe('livos-liv');
  });

  it('falls back to livos-<subLabel> when username is blank/whitespace', () => {
    expect(deriveTunnelName({ username: '   ', subLabel: 'liv' })).toBe('livos-liv');
  });

  it('lowercases the username so the name is stable/deterministic', () => {
    expect(deriveTunnelName({ username: 'Drampa', subLabel: 'liv' })).toBe('livos-drampa');
  });

  it('sanitizes illegal tunnel-name chars to a stable [a-z0-9-] slug', () => {
    const name = deriveTunnelName({ username: 'user_123', subLabel: 'liv' });
    expect(name).toBe('livos-user-123');
    // Only legal tunnel-name chars remain after the livos- prefix.
    expect(name.slice('livos-'.length)).toMatch(/^[a-z0-9-]+$/);
  });

  it('trims leading/trailing separators produced by sanitization', () => {
    expect(deriveTunnelName({ username: 'Bruce Öz!', subLabel: 'liv' })).toBe('livos-bruce-z');
  });

  it('falls back to livos-box when both username and subLabel are empty', () => {
    expect(deriveTunnelName({ username: null, subLabel: '' })).toBe('livos-box');
  });

  it('is deterministic — same inputs converge on the same name (D-14)', () => {
    const a = deriveTunnelName({ username: 'drampa', subLabel: 'liv' });
    const b = deriveTunnelName({ username: 'drampa', subLabel: 'liv' });
    expect(a).toBe(b);
  });
});
