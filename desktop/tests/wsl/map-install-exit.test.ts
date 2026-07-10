import { describe, it, expect } from 'vitest';
import { mapInstallExit } from '../../src/main/wsl/map-install-exit';

/**
 * Flat table (mirrors tests/cloudflare/decide-scope-verdict.test.ts /
 * tests/platform/backoff.test.ts style) -- one exit code per row, zero mocks.
 * D-14's exact ladder: every documented install.sh exit code maps to exactly
 * one verdict.
 */
describe('mapInstallExit', () => {
  it('maps 0 to ok', () => {
    expect(mapInstallExit(0)).toEqual({ kind: 'ok' });
  });

  it('maps 65 to systemd-retry (systemd not PID1)', () => {
    expect(mapInstallExit(65)).toEqual({ kind: 'systemd-retry' });
  });

  it('maps 75 to disk-too-small (<15GB, slipped past the pre-check)', () => {
    expect(mapInstallExit(75)).toEqual({ kind: 'disk-too-small' });
  });

  it('maps 64 to our-bug (EX_USAGE -- args we built wrong)', () => {
    expect(mapInstallExit(64)).toEqual({ kind: 'our-bug' });
  });

  it('maps a generic non-zero exit (1) to generic-failure', () => {
    expect(mapInstallExit(1)).toEqual({ kind: 'generic-failure' });
  });

  it('maps any unmapped non-zero exit (137) to generic-failure', () => {
    expect(mapInstallExit(137)).toEqual({ kind: 'generic-failure' });
  });

  it('maps null (spawn died with no code) to generic-failure', () => {
    expect(mapInstallExit(null)).toEqual({ kind: 'generic-failure' });
  });
});
