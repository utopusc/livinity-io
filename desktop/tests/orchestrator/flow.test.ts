import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * flow.test.ts mocks every real-module collaborator flow.ts imports directly
 * (state-store/secrets-vault/cf-verify/connected-probe/install-invoke/log) --
 * mirrors install-invoke.test.ts's mocking discipline. `decide-resume-point`
 * is deliberately left UNMOCKED (imported for real) so the REAL branching
 * ladder is exercised end-to-end, not a stubbed decision.
 */

const readStateMock = vi.hoisted(() => vi.fn());
const patchStateMock = vi.hoisted(() => vi.fn());
const vaultGetMock = vi.hoisted(() => vi.fn());
const verifyAndProbeMock = vi.hoisted(() => vi.fn());
const isInstalledAndHealthyMock = vi.hoisted(() => vi.fn());
const deriveAddressMock = vi.hoisted(() => vi.fn());
const isInstallInFlightMock = vi.hoisted(() => vi.fn());
const logSafeMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/main/storage/state-store', () => ({
  readState: readStateMock,
  patchState: patchStateMock,
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vaultGetMock,
}));

vi.mock('../../src/main/cloudflare/cf-verify', () => ({
  verifyAndProbe: verifyAndProbeMock,
}));

vi.mock('../../src/main/orchestrator/connected-probe', () => ({
  isInstalledAndHealthy: isInstalledAndHealthyMock,
  deriveAddress: deriveAddressMock,
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  isInstallInFlight: isInstallInFlightMock,
}));

vi.mock('../../src/main/log', () => ({
  logSafe: logSafeMock,
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { enterFlow, resumeFlow } from '../../src/main/orchestrator/flow';

function resetMocks(): void {
  readStateMock.mockReset().mockResolvedValue(null);
  patchStateMock.mockReset().mockResolvedValue({ version: 1, currentStep: 'x' });
  vaultGetMock.mockReset().mockResolvedValue(null);
  verifyAndProbeMock.mockReset().mockResolvedValue({ kind: 'network' });
  isInstalledAndHealthyMock.mockReset().mockResolvedValue(false);
  deriveAddressMock.mockReset().mockResolvedValue(null);
  isInstallInFlightMock.mockReset().mockReturnValue(false);
  logSafeMock.mockClear();
}

describe('flow (enterFlow / resumeFlow)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('enterFlow: a healthy box (D-03) returns live-success without any CF/install detour', async () => {
    isInstalledAndHealthyMock.mockResolvedValue(true);
    deriveAddressMock.mockResolvedValue('bruce.livinity.io');
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'live-success', address: 'bruce.livinity.io' });
    expect(patchStateMock).toHaveBeenCalledWith({ flowStep: 'live-success' });
  });

  it('enterFlow: a fresh entry (no state at all) returns wsl-detect, resume:false', async () => {
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'wsl-detect', resume: false });
  });

  it('enterFlow: a past WSL sub-step ledger hint resumes (resume:true)', async () => {
    readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', flowStep: 'wsl-detect' });
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'wsl-detect', resume: true });
  });

  it('resumeFlow: nothing to resume (fresh state) -> null, so the renderer keeps its normal auth route', async () => {
    const route = await resumeFlow();
    expect(route).toBeNull();
  });

  it('resumeFlow: a healthy box returns the live-success route, never null', async () => {
    isInstalledAndHealthyMock.mockResolvedValue(true);
    deriveAddressMock.mockResolvedValue(null);
    const route = await resumeFlow();
    expect(route).toEqual({ kind: 'live-success', address: null });
  });

  it('resumeFlow: a past mid-install ledger hint resumes to installing, never null', async () => {
    readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', flowStep: 'installing' });
    const route = await resumeFlow();
    expect(route).toEqual({ kind: 'installing' });
  });

  it('cfWasEntered derives from subLabel+zoneName; not-yet-past-WSL routes to cf-wizard (no vault token in this fixture)', async () => {
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
      flowStep: 'cf-wizard',
    });
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'cf-wizard' });
    expect(verifyAndProbeMock).not.toHaveBeenCalled();
  });

  // CR-01 regression: the cf-handoff Continue seam. A CF-COMPLETED state
  // (subLabel+zoneName+tunnelId all persisted by cf-provision, no flowStep
  // yet) must advance past the CF wizard into WSL provisioning -- before the
  // cfComplete signal existed, this exact fixture bounced back to cf-wizard
  // forever and dead-ended the whole Free/BYOD flow.
  it('CR-01: a CF-completed entry (tunnelId persisted, verified token, no ledger) advances to wsl-detect, never cf-wizard', async () => {
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
      tunnelId: 'tun-123',
    });
    vaultGetMock.mockImplementation((key: string) => Promise.resolve(key === 'cfToken' ? 'fake-token' : null));
    verifyAndProbeMock.mockResolvedValue({ kind: 'verified', accountId: 'a1' });
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'wsl-detect', resume: false });
    expect(route.kind).not.toBe('cf-wizard');
  });

  it('a stale CF token re-check (cfWasEntered + about to skip CF) routes to cf-reconnect', async () => {
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
      flowStep: 'wsl-detect',
    });
    vaultGetMock.mockImplementation((key: string) => Promise.resolve(key === 'cfToken' ? 'fake-token' : null));
    verifyAndProbeMock.mockResolvedValue({ kind: 'token-invalid' });
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'cf-reconnect' });
    expect(verifyAndProbeMock).toHaveBeenCalledWith('fake-token');
  });

  it('the CF stale-token re-check is skipped once the box is already healthy (never a blind extra probe)', async () => {
    isInstalledAndHealthyMock.mockResolvedValue(true);
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
    });
    vaultGetMock.mockResolvedValue('fake-token');
    const route = await enterFlow();
    expect(route.kind).toBe('live-success');
    expect(verifyAndProbeMock).not.toHaveBeenCalled();
  });

  it('the CF stale-token re-check is skipped once install is mid-run (never a blind extra probe)', async () => {
    isInstallInFlightMock.mockReturnValue(true);
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
    });
    vaultGetMock.mockResolvedValue('fake-token');
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'installing' });
    expect(verifyAndProbeMock).not.toHaveBeenCalled();
  });

  it('persists the ledger pointer via patchState({ flowStep }) on every successful compute', async () => {
    readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', flowStep: 'connected-check' });
    const route = await enterFlow();
    expect(route).toEqual({ kind: 'connected-check' });
    expect(patchStateMock).toHaveBeenCalledWith({ flowStep: 'connected-check' });
  });

  describe('WR-01 regression: launch-time resumeFlow must never self-pollinate the ledger', () => {
    /** Stateful readState/patchState pair -- the second launch reads whatever the first persisted. */
    function wireStatefulStore(initial: Record<string, unknown>): () => Record<string, unknown> {
      let stored: Record<string, unknown> = { ...initial };
      readStateMock.mockImplementation(() => Promise.resolve(stored));
      patchStateMock.mockImplementation((patch: Record<string, unknown>) => {
        stored = { ...stored, ...patch };
        return Promise.resolve(stored);
      });
      return () => stored;
    }

    it('two sequential resumeFlow() calls against an initially-empty state BOTH return null (no polluting flowStep persisted)', async () => {
      const getStored = wireStatefulStore({ version: 1, currentStep: 'x' });

      const first = await resumeFlow();
      const second = await resumeFlow();

      expect(first).toBeNull();
      expect(second).toBeNull(); // pre-fix, the first call persisted flowStep='wsl-detect' and the second hijacked the launch
      expect(getStored().flowStep).toBeUndefined();
    });

    it('a BYOD user who has NOT yet done CF setup still routes to cf-wizard on the next launch (never straight into the WSL wizard)', async () => {
      const getStored = wireStatefulStore({ version: 1, currentStep: 'x' });

      // First authenticated launch -- pre-CF, indistinguishable from Pro:
      // nothing to resume, and nothing may be persisted here.
      expect(await resumeFlow()).toBeNull();
      expect(getStored().flowStep).toBeUndefined();

      // The user then progresses mid-CF (domain picked -> subLabel/zoneName
      // persisted, provisioning unfinished -- no tunnelId) and relaunches:
      // the next launch must re-enter the CF wizard, not the WSL wizard.
      await patchStateMock({ subLabel: 'liv', zoneName: 'example.com' });
      expect(await resumeFlow()).toEqual({ kind: 'cf-wizard' });
    });

    it('enterFlow (the user-consented Continue) STILL persists the fresh-entry pointer -- the post-reboot --hidden resume depends on it', async () => {
      const getStored = wireStatefulStore({ version: 1, currentStep: 'x' });

      const route = await enterFlow();

      expect(route).toEqual({ kind: 'wsl-detect', resume: false });
      expect(getStored().flowStep).toBe('wsl-detect');
      // ...and the NEXT launch resumes into the wizard (D-09).
      expect(await resumeFlow()).toEqual({ kind: 'wsl-detect', resume: true });
    });

    it('resumeFlow still persists a CONCRETE (non-fresh) route -- only the "nothing has started" shape is exempt', async () => {
      const getStored = wireStatefulStore({ version: 1, currentStep: 'x', flowStep: 'connected-check' });

      const route = await resumeFlow();

      expect(route).toEqual({ kind: 'connected-check' });
      expect(getStored().flowStep).toBe('connected-check');
    });
  });

  describe('THE LOAD-BEARING TEST (criterion 1): the double-entry guard', () => {
    it('two overlapping enterFlow() calls never double-provision -- the mocked collaborator is called at most once', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(true);
      deriveAddressMock.mockResolvedValue('bruce.livinity.io');

      const [first, second] = await Promise.all([enterFlow(), enterFlow()]);

      expect(isInstalledAndHealthyMock).toHaveBeenCalledTimes(1);
      expect(first).toEqual({ kind: 'live-success', address: 'bruce.livinity.io' });
      // The second, guarded call gets the SAME safe verdict without ever
      // touching the live-probe collaborator a second time.
      expect(second).toEqual({ kind: 'wsl-detect', resume: false });
    });

    it('an overlapping resumeFlow() while enterFlow() is in flight is ALSO guarded (resume-overlapping-a-fresh-entry, T-05-03)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(true);
      deriveAddressMock.mockResolvedValue('bruce.livinity.io');

      const [enterResult, resumeResult] = await Promise.all([enterFlow(), resumeFlow()]);

      expect(isInstalledAndHealthyMock).toHaveBeenCalledTimes(1);
      expect(enterResult).toEqual({ kind: 'live-success', address: 'bruce.livinity.io' });
      expect(resumeResult).toBeNull(); // the guarded call's safe verdict maps to null in resumeFlow
    });

    it('a THIRD, sequential call after both complete runs a fresh, un-guarded computation', async () => {
      await Promise.all([enterFlow(), enterFlow()]);
      isInstalledAndHealthyMock.mockClear();

      isInstalledAndHealthyMock.mockResolvedValue(true);
      deriveAddressMock.mockResolvedValue('bruce.livinity.io');
      const route = await enterFlow();

      expect(route).toEqual({ kind: 'live-success', address: 'bruce.livinity.io' });
      expect(isInstalledAndHealthyMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('the schema-valid safe-union degrade on a thrown collaborator', () => {
    it('a thrown readState degrades to { kind: "wsl-detect", resume: false } -- never a rejected promise', async () => {
      readStateMock.mockRejectedValue(new Error('disk error'));
      await expect(enterFlow()).resolves.toEqual({ kind: 'wsl-detect', resume: false });
    });

    it('a thrown isInstalledAndHealthy degrades to the same safe FlowRoute -- never the non-existent generic-orchestrator kind', async () => {
      isInstalledAndHealthyMock.mockRejectedValue(new Error('probe blew up'));
      const route = await enterFlow();
      expect(route).toEqual({ kind: 'wsl-detect', resume: false });
      expect((route as { kind: string }).kind).not.toBe('generic-orchestrator');
    });

    it('a thrown verifyAndProbe (while the CF gate is reached) degrades the whole computation, not just cfVerify', async () => {
      readStateMock.mockResolvedValue({
        version: 1,
        currentStep: 'x',
        subLabel: 'liv',
        zoneName: 'example.com',
        flowStep: 'wsl-detect',
      });
      vaultGetMock.mockResolvedValue('fake-token');
      verifyAndProbeMock.mockRejectedValue(new Error('cf blew up'));
      const route = await enterFlow();
      expect(route).toEqual({ kind: 'wsl-detect', resume: false });
    });

    it('a thrown patchState still returns the correctly-computed route (persistence failure is non-fatal)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(true);
      deriveAddressMock.mockResolvedValue(null);
      patchStateMock.mockRejectedValue(new Error('write failed'));
      const route = await enterFlow();
      expect(route).toEqual({ kind: 'live-success', address: null });
    });

    it('resumeFlow degrades the same way on a thrown collaborator -- maps to null, never a rejected promise', async () => {
      readStateMock.mockRejectedValue(new Error('disk error'));
      await expect(resumeFlow()).resolves.toBeNull();
    });
  });
});
