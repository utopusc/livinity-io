import { describe, it, expect } from 'vitest';
import { isTunnel410Resolved } from '../src/renderer/screens/no-tunnel-flow';
import type { FlowRoute } from '../shared/ipc-contract';

/**
 * WR-02 regression: by the time NoTunnel410 shows, the ledger holds a
 * concrete flowStep, so flow:resume ALWAYS returns a concrete route --
 * typically { kind:'wsl-detect', resume:true } -- whether or not the account
 * was fixed platform-side. The old "any non-null, non-cf-reconnect route is
 * resolved" predicate therefore turned every "Check again" click into a
 * blind multi-minute install re-run straight back into the same 410, and the
 * "Still not set up on our side yet" state was unreachable. Only routes that
 * positively prove progress past install may resolve the screen.
 */
describe('isTunnel410Resolved (NoTunnel410 "Check again", WR-02)', () => {
  it('live-success resolves (the box is up)', () => {
    expect(isTunnel410Resolved({ kind: 'live-success', address: 'bruce.livinity.io' })).toBe(true);
  });

  it('connected-check resolves (install exited 0, confirming reachability)', () => {
    expect(isTunnel410Resolved({ kind: 'connected-check' })).toBe(true);
  });

  it('THE REGRESSION ROW: wsl-detect resume:true (the route flow:resume ALWAYS returns after a 410 failure) is NOT resolved -- no blind install re-run', () => {
    expect(isTunnel410Resolved({ kind: 'wsl-detect', resume: true })).toBe(false);
  });

  it('every other route kind stays still-unresolved', () => {
    const unresolved: FlowRoute[] = [
      { kind: 'wsl-detect', resume: false },
      { kind: 'installing' },
      { kind: 'cf-wizard' },
      { kind: 'cf-reconnect' },
    ];
    for (const route of unresolved) {
      expect(isTunnel410Resolved(route)).toBe(false);
    }
  });

  it('null (genuinely nothing to resume) stays still-unresolved', () => {
    expect(isTunnel410Resolved(null)).toBe(false);
  });
});
