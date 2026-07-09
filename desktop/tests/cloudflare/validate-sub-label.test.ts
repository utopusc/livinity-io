import { describe, it, expect } from 'vitest';
import { validateSubLabel } from '../../src/main/cloudflare/validate-sub-label';

describe('validateSubLabel', () => {
  it('accepts the "liv" default', () => {
    expect(validateSubLabel('liv')).toEqual({ ok: true });
  });

  it('accepts a single character', () => {
    expect(validateSubLabel('a')).toEqual({ ok: true });
  });

  it('accepts an inner hyphen', () => {
    expect(validateSubLabel('chat-liv')).toEqual({ ok: true });
  });

  it('accepts digits', () => {
    expect(validateSubLabel('liv2')).toEqual({ ok: true });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateSubLabel('  liv  ')).toEqual({ ok: true });
  });

  it('rejects empty string with "empty"', () => {
    expect(validateSubLabel('')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects whitespace-only with "empty"', () => {
    expect(validateSubLabel('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a dotted label with a DISTINCT "dots" error (T-03-06)', () => {
    expect(validateSubLabel('liv.box')).toEqual({ ok: false, error: 'dots' });
  });

  it('rejects a full FQDN with "dots" (dots checked before charset)', () => {
    expect(validateSubLabel('liv.example.com')).toEqual({ ok: false, error: 'dots' });
  });

  it('rejects uppercase with "charset"', () => {
    expect(validateSubLabel('LIV')).toEqual({ ok: false, error: 'charset' });
  });

  it('rejects a leading hyphen with "charset"', () => {
    expect(validateSubLabel('-liv')).toEqual({ ok: false, error: 'charset' });
  });

  it('rejects a trailing hyphen with "charset"', () => {
    expect(validateSubLabel('liv-')).toEqual({ ok: false, error: 'charset' });
  });

  it('rejects an illegal character (SSRF/host-injection gate) with "charset"', () => {
    expect(validateSubLabel('liv/box')).toEqual({ ok: false, error: 'charset' });
  });

  it('accepts a 63-char label (DNS label max)', () => {
    expect(validateSubLabel('a'.repeat(63))).toEqual({ ok: true });
  });

  it('rejects a 64-char label with "length"', () => {
    expect(validateSubLabel('a'.repeat(64))).toEqual({ ok: false, error: 'length' });
  });
});
