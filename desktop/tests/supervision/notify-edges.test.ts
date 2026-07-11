import { describe, it, expect } from 'vitest';
import { decideNotification } from '../../src/main/supervision/notify-edges';

/**
 * Flat table, one `it` per prevHealthy x nowHealthy x repaired combination (mirrors
 * tests/wsl/decide-wsl-state.test.ts). The load-bearing property (D-08): exactly one
 * notification per real edge transition -- a stable state (true->true, false->false)
 * ALWAYS returns null, never a notification, no matter how many times a probe re-confirms
 * the same state. 'recovered' vs 'back-online' is disambiguated purely by the caller-owned
 * `repaired` flag on the false->true edge.
 */
describe('decideNotification', () => {
  it('true -> false : offline', () => {
    expect(decideNotification(true, false, false)).toBe('offline');
  });

  it('true -> false, repaired flag ignored on a down-edge : offline', () => {
    expect(decideNotification(true, false, true)).toBe('offline');
  });

  it('false -> true, repaired=false : back-online (passive reconnect)', () => {
    expect(decideNotification(false, true, false)).toBe('back-online');
  });

  it('false -> true, repaired=true : recovered (an active self-heal/respawn restored it)', () => {
    expect(decideNotification(false, true, true)).toBe('recovered');
  });

  it('true -> true (stable healthy, re-probed) : null, never per-probe', () => {
    expect(decideNotification(true, true, false)).toBeNull();
  });

  it('false -> false (stable unhealthy, re-probed) : null, never per-probe', () => {
    expect(decideNotification(false, false, false)).toBeNull();
  });

  it('false -> false, repaired flag ignored on a stable state : null', () => {
    expect(decideNotification(false, false, true)).toBeNull();
  });
});
