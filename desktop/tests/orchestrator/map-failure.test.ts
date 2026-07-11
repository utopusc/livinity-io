import { describe, it, expect } from 'vitest';
import { mapFailure } from '../../src/main/orchestrator/map-failure';

/**
 * Flat table (mirrors tests/wsl/map-install-exit.test.ts / tests/cloudflare/decide-scope-verdict.test.ts
 * style) -- one input->output row per real failure surface, zero mocks.
 *
 * The load-bearing property (Pitfall 2/3, 05-RESEARCH.md): exit 75 and exit 1
 * are BOTH heavily overloaded install.sh exit codes -- these rows exist to
 * prove failReason text (not exit code alone) decides `disk` vs `generic` and
 * `no-tunnel-410` vs `generic`.
 */
describe('mapFailure', () => {
  describe('wsl-install surface -- exit 75 (disambiguated, NOT synonymous with disk-too-small)', () => {
    it('exit 75 + "Only 8gb free on /" reason -> disk (the real disk-too-small shape)', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 75, failReason: 'Only 8gb free on /' })).toEqual({
        screen: 'disk',
        retryStep: 'installing',
      });
    });

    it('exit 75 + "needs at least 15GB" reason -> disk (alternate disk phrasing)', () => {
      expect(
        mapFailure({ surface: 'wsl-install', exitCode: 75, failReason: 'This install needs at least 15GB free' })
      ).toEqual({ screen: 'disk', retryStep: 'installing' });
    });

    it('exit 75 + "Docker daemon failed to start" reason -> generic, NOT disk (Pitfall 2)', () => {
      expect(
        mapFailure({ surface: 'wsl-install', exitCode: 75, failReason: 'Docker daemon failed to start' })
      ).toEqual({ screen: 'generic', copy: 'Docker daemon failed to start', retryStep: 'installing' });
    });

    it('exit 75 with no failReason at all -> generic (never disk without corroborating text)', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 75 })).toEqual({
        screen: 'generic',
        copy: '',
        retryStep: 'installing',
      });
    });
  });

  describe('wsl-install surface -- exit 1 (disambiguated, the 410 tunnel-token case)', () => {
    it('exit 1 + curl "error: 410" diagnostic text -> no-tunnel-410 (Pitfall 3)', () => {
      expect(
        mapFailure({
          surface: 'wsl-install',
          exitCode: 1,
          failReason: 'curl: (22) The requested URL returned error: 410',
        })
      ).toEqual({ screen: 'no-tunnel-410', retryStep: 'installing' });
    });

    it('exit 1 + NO_TUNNEL reason text -> no-tunnel-410 (alternate platform error code)', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 1, failReason: 'platform said NO_TUNNEL' })).toEqual({
        screen: 'no-tunnel-410',
        retryStep: 'installing',
      });
    });

    it('exit 1 + curl "error: 7 failed to connect" -> generic, NOT no-tunnel-410 (network reason is not 410)', () => {
      expect(
        mapFailure({ surface: 'wsl-install', exitCode: 1, failReason: 'curl: (7) failed to connect' })
      ).toEqual({ screen: 'generic', copy: 'curl: (7) failed to connect', retryStep: 'installing' });
    });

    it('exit 1 + a 401-shaped reason -> generic, NOT no-tunnel-410 (401 is not 410)', () => {
      expect(
        mapFailure({ surface: 'wsl-install', exitCode: 1, failReason: 'curl: (22) The requested URL returned error: 401' })
      ).toEqual({ screen: 'generic', copy: 'curl: (22) The requested URL returned error: 401', retryStep: 'installing' });
    });
  });

  describe('wsl-install surface -- non-overloaded exits delegate to the EXISTING mapInstallExit', () => {
    it('exit 65 (systemd not PID1) -> systemd-retry, via mapInstallExit delegation', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 65 })).toEqual({
        screen: 'systemd-retry',
        retryStep: 'installing',
      });
    });

    it('exit 64 (EX_USAGE -- our bug) -> our-bug, via mapInstallExit delegation', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 64 })).toEqual({
        screen: 'our-bug',
        retryStep: 'installing',
      });
    });

    it('an unmapped non-zero exit (137) -> generic, via mapInstallExit generic-failure delegation', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: 137 })).toEqual({
        screen: 'generic',
        copy: '',
        retryStep: 'installing',
      });
    });

    it('a null exit code (spawn died with no code) -> generic', () => {
      expect(mapFailure({ surface: 'wsl-install', exitCode: null })).toEqual({
        screen: 'generic',
        copy: '',
        retryStep: 'installing',
      });
    });
  });

  describe('cf surface', () => {
    it('token-invalid -> cf-reconnect, retry re-enters cf-token', () => {
      expect(mapFailure({ surface: 'cf', verdict: 'token-invalid' })).toEqual({
        screen: 'cf-reconnect',
        retryStep: 'cf-token',
      });
    });

    it('network -> generic (no dedicated CF-network screen exists yet)', () => {
      expect(mapFailure({ surface: 'cf', verdict: 'network' })).toEqual({
        screen: 'generic',
        retryStep: 'wsl-detect',
      });
    });

    it('scope-missing -> generic (no dedicated CF-scope screen exists yet)', () => {
      expect(mapFailure({ surface: 'cf', verdict: 'scope-missing' })).toEqual({
        screen: 'generic',
        retryStep: 'wsl-detect',
      });
    });
  });

  describe('platform surface', () => {
    it('status 410 -> no-tunnel-410, retry re-enters installing', () => {
      expect(mapFailure({ surface: 'platform', status: 410 })).toEqual({
        screen: 'no-tunnel-410',
        retryStep: 'installing',
      });
    });

    it('status 401 -> login, retry re-enters routing', () => {
      expect(mapFailure({ surface: 'platform', status: 401 })).toEqual({
        screen: 'login',
        retryStep: 'routing',
      });
    });

    it('status 402 -> no-entitlement, retry re-enters routing', () => {
      expect(mapFailure({ surface: 'platform', status: 402 })).toEqual({
        screen: 'no-entitlement',
        retryStep: 'routing',
      });
    });
  });

  describe('wsl-feature / distro-install surfaces (existing Phase-4 unions, no dedicated screen yet)', () => {
    it('wsl-feature surface -> generic catch-all', () => {
      expect(mapFailure({ surface: 'wsl-feature', kind: 'bios-blocked' })).toEqual({
        screen: 'generic',
        retryStep: 'wsl-detect',
      });
    });

    it('distro-install surface -> generic catch-all', () => {
      expect(mapFailure({ surface: 'distro-install', kind: 'checksum-mismatch' })).toEqual({
        screen: 'generic',
        retryStep: 'wsl-detect',
      });
    });
  });
});
