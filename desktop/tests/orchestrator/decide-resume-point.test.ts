import { describe, it, expect } from 'vitest';
import { decideResumePoint } from '../../src/main/orchestrator/decide-resume-point';

/**
 * Flat table (mirrors tests/wsl/decide-wsl-state.test.ts style) -- one row
 * per signal combination in the plan's <behavior> block, zero mocks.
 *
 * The load-bearing property: LIVE PROBE IS TRUTH. `installedHealthy` (D-03)
 * is checked FIRST, before any ledger-driven CF/WSL re-entry -- exactly as
 * decide-wsl-state's reactive BIOS check is checked before the exit-code
 * buckets. The SECOND load-bearing property (D-10 / criterion 5): a
 * Pro/legacy signal (cfWasEntered=false) can NEVER reach { kind:'cf-wizard' }
 * or { kind:'cf-reconnect' } -- the CF branch is gated on cfWasEntered===true.
 */
describe('decideResumePoint', () => {
  it('installedHealthy=true (D-03 fast-path) -> live-success, checked FIRST before any CF/WSL re-entry', () => {
    expect(
      decideResumePoint({
        installedHealthy: true,
        cfWasEntered: true,
        ledgerFlowStep: 'cf-wizard',
        cfVerify: 'token-invalid',
      })
    ).toEqual({ kind: 'live-success', address: null });
  });

  it('ledgerFlowStep=installing + not healthy -> installing (idempotent re-run, never resume mid-marker)', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        ledgerFlowStep: 'installing',
        cfVerify: null,
      })
    ).toEqual({ kind: 'installing' });
  });

  it('installMidRun=true (a LIVE probe of an active install child) + not healthy -> installing, even with no ledger hint', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: undefined,
        cfVerify: null,
        installMidRun: true,
      })
    ).toEqual({ kind: 'installing' });
  });

  it('cfWasEntered=true + cfVerify=token-invalid (stale on re-verify) -> cf-reconnect', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        ledgerFlowStep: 'wsl-detect',
        cfVerify: 'token-invalid',
      })
    ).toEqual({ kind: 'cf-reconnect' });
  });

  it('cfWasEntered=true + cfVerify=ok + not yet at WSL -> cf-wizard', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        ledgerFlowStep: 'cf-wizard',
        cfVerify: 'ok',
      })
    ).toEqual({ kind: 'cf-wizard' });
  });

  it('cfWasEntered=true + cfVerify=null (no re-verify performed yet) + not yet at WSL -> cf-wizard', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        ledgerFlowStep: undefined,
        cfVerify: null,
      })
    ).toEqual({ kind: 'cf-wizard' });
  });

  // CR-01 regression: the cf-handoff -> WSL entry seam. Without the
  // cfComplete gate on Rule 3b, this signal combination (CF entered AND
  // finished, ledger not yet at WSL) bounced back to cf-wizard forever --
  // the Free/BYOD user could never reach WSL provisioning.
  it('cfWasEntered=true + cfComplete=true (tunnelId persisted) + no ledger -> wsl-detect, NEVER back into cf-wizard', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        cfComplete: true,
        ledgerFlowStep: undefined,
        cfVerify: 'ok',
      })
    ).toEqual({ kind: 'wsl-detect', resume: false });
  });

  it('cfComplete=true + a WSL ledger step still resumes the WSL sub-flow (resume:true)', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        cfComplete: true,
        ledgerFlowStep: 'wsl-detect',
        cfVerify: 'ok',
      })
    ).toEqual({ kind: 'wsl-detect', resume: true });
  });

  it('cfComplete=true does NOT gate Rule 3a: a stale token after CF completed still routes to cf-reconnect', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        cfComplete: true,
        ledgerFlowStep: undefined,
        cfVerify: 'token-invalid',
      })
    ).toEqual({ kind: 'cf-reconnect' });
  });

  it('cfComplete=false (mid-CF-wizard, e.g. domain picked but provisioning unfinished) still re-enters cf-wizard', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: true,
        cfComplete: false,
        ledgerFlowStep: undefined,
        cfVerify: 'ok',
      })
    ).toEqual({ kind: 'cf-wizard' });
  });

  it('ledgerFlowStep=connected-check (killed mid-probe, install had exited 0) -> connected-check', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: 'connected-check',
        cfVerify: null,
      })
    ).toEqual({ kind: 'connected-check' });
  });

  it('no ledger / fresh entry (nothing recorded) -> wsl-detect, resume:false', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: undefined,
        cfVerify: null,
      })
    ).toEqual({ kind: 'wsl-detect', resume: false });
  });

  it('ledgerFlowStep set to a WSL step + not healthy -> wsl-detect, resume:true', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: 'wsl-detect',
        cfVerify: null,
      })
    ).toEqual({ kind: 'wsl-detect', resume: true });
  });

  it('ledgerFlowStep set to "resource" (a WSL sub-step) + not healthy -> wsl-detect, resume:true', () => {
    expect(
      decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: 'resource',
        cfVerify: null,
      })
    ).toEqual({ kind: 'wsl-detect', resume: true });
  });

  describe('D-10 GUARD (criterion 5): cfWasEntered=false NEVER yields cf-wizard or cf-reconnect', () => {
    it('Pro-shaped signal set 1: no ledger, no cfVerify -> wsl-detect (never cf-wizard)', () => {
      const result = decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: undefined,
        cfVerify: null,
      });
      expect(result.kind).not.toBe('cf-wizard');
      expect(result.kind).not.toBe('cf-reconnect');
      expect(result).toEqual({ kind: 'wsl-detect', resume: false });
    });

    it('Pro-shaped signal set 2: ledgerFlowStep=wsl-detect -> wsl-detect (never cf-wizard)', () => {
      const result = decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: 'wsl-detect',
        cfVerify: null,
      });
      expect(result.kind).not.toBe('cf-wizard');
      expect(result.kind).not.toBe('cf-reconnect');
      expect(result).toEqual({ kind: 'wsl-detect', resume: true });
    });

    it('Pro-shaped signal set 3: a stray token-invalid cfVerify (should never happen for Pro) STILL never yields cf-reconnect', () => {
      const result = decideResumePoint({
        installedHealthy: false,
        cfWasEntered: false,
        ledgerFlowStep: 'cf-wizard',
        cfVerify: 'token-invalid',
      });
      expect(result.kind).not.toBe('cf-wizard');
      expect(result.kind).not.toBe('cf-reconnect');
    });
  });

  it('live-success carries a non-null address when provided (renderer display)', () => {
    expect(
      decideResumePoint({
        installedHealthy: true,
        cfWasEntered: false,
        ledgerFlowStep: undefined,
        cfVerify: null,
        address: 'bruce.livinity.io',
      })
    ).toEqual({ kind: 'live-success', address: 'bruce.livinity.io' });
  });
});
