import { describe, it, expect } from 'vitest';
import {
  decideScopeVerdict,
  type ProbeOutcomes,
} from '../../src/main/cloudflare/decide-scope-verdict';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/platform/decide-route.test.ts).
 * The load-bearing property: the verdict is decided purely by WHICH staged probe
 * failed after the token-alive gate — NEVER by any Cloudflare error identifier
 * (the catch-all 9109 is overloaded across invalid-token / missing-permission /
 * IP-restricted / max-auth-failures, so it can never disambiguate a scope).
 */
describe('decideScopeVerdict', () => {
  it('token-alive gate FIRST: a dead token short-circuits to token-invalid with NO scope attributed', () => {
    expect(
      decideScopeVerdict({ tokenAlive: false, zoneProbe: 'ok', tunnelProbe: 'ok' })
    ).toEqual({ kind: 'token-invalid' });
  });

  it('a dead token stays token-invalid even when a later probe was forbidden (never attribute a scope)', () => {
    expect(
      decideScopeVerdict({ tokenAlive: false, zoneProbe: 'forbidden', tunnelProbe: 'forbidden' })
    ).toEqual({ kind: 'token-invalid' });
  });

  it('an alive token with a zone-probe transport failure => network (couldn’t reach Cloudflare)', () => {
    expect(
      decideScopeVerdict({ tokenAlive: true, zoneProbe: 'network', tunnelProbe: 'skipped' })
    ).toEqual({ kind: 'network' });
  });

  it('an alive token with a tunnel-probe transport failure => network', () => {
    expect(
      decideScopeVerdict({ tokenAlive: true, zoneProbe: 'ok', tunnelProbe: 'network' })
    ).toEqual({ kind: 'network' });
  });

  it('alive + zone forbidden => scope-missing, zone row names Zone · Zone · Read (tunnel skipped => pending)', () => {
    expect(
      decideScopeVerdict({ tokenAlive: true, zoneProbe: 'forbidden', tunnelProbe: 'skipped' })
    ).toEqual({
      kind: 'scope-missing',
      rows: [
        { scope: 'tunnel', ok: false },
        { scope: 'dns', ok: true },
        { scope: 'zone', ok: false, missingLabel: 'Zone · Zone · Read' },
      ],
    });
  });

  it('alive + zone ok + tunnel forbidden => scope-missing, tunnel row names Account · Cloudflare Tunnel · Edit', () => {
    expect(
      decideScopeVerdict({ tokenAlive: true, zoneProbe: 'ok', tunnelProbe: 'forbidden' })
    ).toEqual({
      kind: 'scope-missing',
      rows: [
        { scope: 'tunnel', ok: false, missingLabel: 'Account · Cloudflare Tunnel · Edit' },
        { scope: 'dns', ok: true },
        { scope: 'zone', ok: true },
      ],
    });
  });

  it('alive + zone ok + tunnel ok => verified; dns row is ok:true-pending (its probe runs at selectDomain)', () => {
    expect(
      decideScopeVerdict({ tokenAlive: true, zoneProbe: 'ok', tunnelProbe: 'ok' })
    ).toEqual({
      kind: 'verified',
      rows: [
        { scope: 'tunnel', ok: true },
        { scope: 'dns', ok: true },
        { scope: 'zone', ok: true },
      ],
    });
  });

  it('rows are always exactly 3 entries, in the fixed [tunnel, dns, zone] render order', () => {
    const verified = decideScopeVerdict({ tokenAlive: true, zoneProbe: 'ok', tunnelProbe: 'ok' });
    const missing = decideScopeVerdict({
      tokenAlive: true,
      zoneProbe: 'forbidden',
      tunnelProbe: 'skipped',
    });
    for (const r of [verified, missing]) {
      // only the rows-bearing verdicts here
      if (r.kind === 'verified' || r.kind === 'scope-missing') {
        expect(r.rows).toHaveLength(3);
        expect(r.rows.map((row) => row.scope)).toEqual(['tunnel', 'dns', 'zone']);
      }
    }
  });

  it('9109 never decides: an extra CF error-code field is ignored (verdict-by-probe only)', () => {
    const base: ProbeOutcomes = { tokenAlive: true, zoneProbe: 'forbidden', tunnelProbe: 'skipped' };
    // Same classified probe outcomes + a stray CF error code => identical verdict.
    const withCode = { ...base, cfErrorCode: 9109 } as unknown as ProbeOutcomes;
    expect(decideScopeVerdict(withCode)).toEqual(decideScopeVerdict(base));
  });
});
