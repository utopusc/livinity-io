import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * engine.test.ts mocks EVERY IO collaborator engine.ts imports directly
 * (state-store/wsl-exec/connected-probe/install-invoke/holder/log/electron) --
 * mirrors flow.test.ts's/wsl.ipc.test.ts's mocking discipline. Zero real
 * wsl.exe/tasklist/Notification is ever invoked. decide-supervision.ts and
 * notify-edges.ts are deliberately left UNMOCKED (pure, zero-IO deciders) so
 * the REAL respawn-gate ladder and edge-detector run end-to-end, not a stub.
 */

const readStateMock = vi.hoisted(() => vi.fn());
const patchStateMock = vi.hoisted(() => vi.fn());
const execWslMock = vi.hoisted(() => vi.fn());
const isInstalledAndHealthyMock = vi.hoisted(() => vi.fn());
const deriveAddressMock = vi.hoisted(() => vi.fn());
const isInstallInFlightMock = vi.hoisted(() => vi.fn());
const adoptOrSpawnHolderMock = vi.hoisted(() => vi.fn());
const killHolderMock = vi.hoisted(() => vi.fn());
const readHolderRecordMock = vi.hoisted(() => vi.fn());
const isPidAliveAsWslMock = vi.hoisted(() => vi.fn());
const logSafeMock = vi.hoisted(() => vi.fn());
const notificationIsSupportedMock = vi.hoisted(() => vi.fn(() => true));
const notificationShowMock = vi.hoisted(() => vi.fn());
const notificationCtorMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/main/storage/state-store', () => ({
  readState: readStateMock,
  patchState: patchStateMock,
}));

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execWsl: execWslMock,
}));

vi.mock('../../src/main/orchestrator/connected-probe', () => ({
  isInstalledAndHealthy: isInstalledAndHealthyMock,
  deriveAddress: deriveAddressMock,
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  isInstallInFlight: isInstallInFlightMock,
}));

vi.mock('../../src/main/supervision/holder', () => ({
  adoptOrSpawnHolder: adoptOrSpawnHolderMock,
  killHolder: killHolderMock,
  readHolderRecord: readHolderRecordMock,
  isPidAliveAsWsl: isPidAliveAsWslMock,
}));

vi.mock('../../src/main/log', () => ({
  logSafe: logSafeMock,
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  Notification: class {
    static isSupported = notificationIsSupportedMock;
    constructor(opts: unknown) {
      notificationCtorMock(opts);
    }
    show() {
      notificationShowMock();
    }
  },
}));

import {
  stopEngine,
  startEngine,
  restartEngine,
  getEngineStatus,
  supervisionTick,
  runHealthPass,
  startSupervision,
  openDashboardGated,
  openInBrowserGated,
  __resetHealthMemoryForTests,
} from '../../src/main/supervision/engine';

function resetMocks(): void {
  readStateMock.mockReset().mockResolvedValue(null);
  patchStateMock.mockReset().mockResolvedValue({ version: 1, currentStep: 'x' });
  execWslMock.mockReset().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  isInstalledAndHealthyMock.mockReset().mockResolvedValue(true);
  deriveAddressMock.mockReset().mockResolvedValue('bruce.livinity.io');
  isInstallInFlightMock.mockReset().mockReturnValue(false);
  adoptOrSpawnHolderMock.mockReset().mockResolvedValue(4242);
  killHolderMock.mockReset().mockResolvedValue(undefined);
  readHolderRecordMock.mockReset().mockResolvedValue({ pid: 4242, spawnedAt: '2026-01-01T00:00:00.000Z' });
  isPidAliveAsWslMock.mockReset().mockResolvedValue(true);
  logSafeMock.mockClear();
  notificationIsSupportedMock.mockReset().mockReturnValue(true);
  notificationShowMock.mockClear();
  notificationCtorMock.mockClear();
  __resetHealthMemoryForTests();
}

describe('engine (Task 1: desired-state lifecycle)', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('stopEngine', () => {
    it('persists engineDesiredState:"stopped" BEFORE killHolder and BEFORE execWsl (Pattern 3 ordering)', async () => {
      const order: string[] = [];
      patchStateMock.mockImplementation(async () => {
        order.push('patchState');
        return { version: 1, currentStep: 'x' };
      });
      killHolderMock.mockImplementation(async () => {
        order.push('killHolder');
      });
      execWslMock.mockImplementation(async () => {
        order.push('execWsl');
        return { code: 0, stdout: '', stderr: '' };
      });

      await stopEngine({ setStatus: vi.fn(), closeDashboard: vi.fn() });

      expect(order).toEqual(['patchState', 'killHolder', 'execWsl']);
      expect(patchStateMock).toHaveBeenCalledWith({ engineDesiredState: 'stopped' });
    });

    it("execWsl call is exactly ['--terminate','livinity'] -- never '--shutdown'", async () => {
      await stopEngine({ setStatus: vi.fn(), closeDashboard: vi.fn() });

      expect(execWslMock).toHaveBeenCalledWith(['--terminate', 'livinity']);
      const allArgs = execWslMock.mock.calls.flat(2) as unknown[];
      expect(allArgs).not.toContain('--shutdown');
    });

    it('source-scan: engine.ts never contains the literal "--shutdown" (Pitfall 3)', () => {
      const source = readFileSync(join(__dirname, '../../src/main/supervision/engine.ts'), 'utf8');
      expect(source).not.toContain('--shutdown');
      expect(source).toContain('--terminate');
    });

    it('fires setStatus("stopped") and closeDashboard', async () => {
      const setStatus = vi.fn();
      const closeDashboard = vi.fn();

      await stopEngine({ setStatus, closeDashboard });

      expect(setStatus).toHaveBeenCalledWith('stopped');
      expect(closeDashboard).toHaveBeenCalled();
    });

    it('degrades safely when a collaborator throws (never rejects, logs the exception)', async () => {
      patchStateMock.mockRejectedValue(new Error('disk full'));
      const setStatus = vi.fn();

      await expect(stopEngine({ setStatus, closeDashboard: vi.fn() })).resolves.toBeUndefined();

      expect(setStatus).not.toHaveBeenCalled();
      expect(logSafeMock).toHaveBeenCalledWith('engine.stop', { exception: true });
    });
  });

  describe('startEngine', () => {
    it('persists engineDesiredState:"running", boots the holder, runs the self-heal safety net, health-verifies, setStatus("running") on success', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(true);
      const setStatus = vi.fn();

      await startEngine({ setStatus });

      expect(patchStateMock).toHaveBeenCalledWith({ engineDesiredState: 'running' });
      expect(adoptOrSpawnHolderMock).toHaveBeenCalled();
      expect(execWslMock).toHaveBeenCalledWith([
        '-d',
        'livinity',
        '-u',
        'root',
        '--',
        'systemctl',
        'restart',
        'livos.service',
        'cloudflared',
      ]);
      expect(isInstalledAndHealthyMock).toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledWith('running');
    });

    it('setStatus("error") when health never verifies', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);
      const setStatus = vi.fn();

      await startEngine({ setStatus });

      expect(setStatus).toHaveBeenCalledWith('error');
    });

    it('degrades safely when a collaborator throws', async () => {
      adoptOrSpawnHolderMock.mockRejectedValue(new Error('spawn EPERM'));
      const setStatus = vi.fn();

      await expect(startEngine({ setStatus })).resolves.toBeUndefined();

      expect(setStatus).not.toHaveBeenCalled();
      expect(logSafeMock).toHaveBeenCalledWith('engine.start', { exception: true });
    });
  });

  describe('restartEngine', () => {
    it('terminates+reboots the livinity distro WITHOUT ever persisting engineDesiredState:"stopped" (stays running)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(true);
      const setStatus = vi.fn();

      await restartEngine({ setStatus });

      expect(execWslMock).toHaveBeenCalledWith(['--terminate', 'livinity']);
      expect(patchStateMock).not.toHaveBeenCalledWith({ engineDesiredState: 'stopped' });
      expect(setStatus).toHaveBeenCalledWith('running');
    });

    it('setStatus("error") when the post-restart health-verify never passes', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);
      const setStatus = vi.fn();

      await restartEngine({ setStatus });

      expect(setStatus).toHaveBeenCalledWith('error');
    });
  });

  describe('getEngineStatus', () => {
    it('returns {state,address,lastCheckedAt,desiredState} shaped for EngineStatusResultSchema, carrying no secret', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      isInstalledAndHealthyMock.mockResolvedValue(true);
      deriveAddressMock.mockResolvedValue('bruce.livinity.io');

      const result = await getEngineStatus();

      expect(result).toEqual({
        state: 'running',
        address: 'bruce.livinity.io',
        lastCheckedAt: expect.any(Number),
        desiredState: 'running',
      });
      expect(JSON.stringify(result).toLowerCase()).not.toMatch(/token|secret|cftoken|liv_k_/);
    });

    it('desiredState defaults to "stopped" when never persisted, state reflects it when unhealthy', async () => {
      readStateMock.mockResolvedValue(null);
      isInstalledAndHealthyMock.mockResolvedValue(false);

      const result = await getEngineStatus();

      expect(result.desiredState).toBe('stopped');
      expect(result.state).toBe('stopped');
    });

    it('desiredState=running but unhealthy => state "error" (something is wrong, not an intentional stop)', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      isInstalledAndHealthyMock.mockResolvedValue(false);

      const result = await getEngineStatus();

      expect(result.state).toBe('error');
    });

    it('degrades to a safe error shape when a collaborator throws', async () => {
      readStateMock.mockRejectedValue(new Error('fs error'));

      const result = await getEngineStatus();

      expect(result).toEqual({ state: 'error', address: null, lastCheckedAt: null, desiredState: 'stopped' });
    });
  });
});

describe('engine (Task 2: supervisionTick / runHealthPass / notifications / startSupervision / gated-open)', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('supervisionTick', () => {
    it('IN-06: isInstallInFlight()=true short-circuits immediately -- no readState/holderAlive/probe/respawn call', async () => {
      isInstallInFlightMock.mockReturnValue(true);

      await supervisionTick();

      expect(readStateMock).not.toHaveBeenCalled();
      expect(readHolderRecordMock).not.toHaveBeenCalled();
      expect(isInstalledAndHealthyMock).not.toHaveBeenCalled();
      expect(adoptOrSpawnHolderMock).not.toHaveBeenCalled();
    });

    it('desiredState="stopped", holder dead -> NO respawn (Pattern 3 trap)', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });
      readHolderRecordMock.mockResolvedValue(null); // holder dead

      await supervisionTick();

      expect(adoptOrSpawnHolderMock).not.toHaveBeenCalled();
    });

    it('desiredState="running", holder dead, not installing -> spawnHolder called + exactly one "recovered" notification', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      readHolderRecordMock.mockResolvedValue(null); // holder dead
      isInstalledAndHealthyMock.mockResolvedValue(true); // healthy again right after respawn

      await supervisionTick();

      expect(adoptOrSpawnHolderMock).toHaveBeenCalledTimes(1);
      expect(notificationCtorMock).toHaveBeenCalledTimes(1);
      expect(notificationShowMock).toHaveBeenCalledTimes(1);
    });

    it('desiredState="running", holder alive, healthy -> "ok", no notification on a stable healthy tick', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      readHolderRecordMock.mockResolvedValue({ pid: 4242, spawnedAt: '2026-01-01T00:00:00.000Z' });
      isPidAliveAsWslMock.mockResolvedValue(true);
      isInstalledAndHealthyMock.mockResolvedValue(true);

      await supervisionTick();

      expect(adoptOrSpawnHolderMock).not.toHaveBeenCalled();
      expect(execWslMock).not.toHaveBeenCalled(); // no self-heal needed
      expect(notificationCtorMock).not.toHaveBeenCalled();
    });

    it('desiredState="running", holder alive, unhealthy -> "heal" runs the D-06 self-heal command', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      readHolderRecordMock.mockResolvedValue({ pid: 4242, spawnedAt: '2026-01-01T00:00:00.000Z' });
      isPidAliveAsWslMock.mockResolvedValue(true);
      isInstalledAndHealthyMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      await supervisionTick();

      expect(execWslMock).toHaveBeenCalledWith([
        '-d',
        'livinity',
        '-u',
        'root',
        '--',
        'systemctl',
        'restart',
        'livos.service',
        'cloudflared',
      ]);
    });

    it('degrades safely when a collaborator throws mid-tick', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      readHolderRecordMock.mockRejectedValue(new Error('fs error'));

      await expect(supervisionTick()).resolves.toBeUndefined();
      expect(logSafeMock).toHaveBeenCalledWith('engine.tick', { exception: true });
    });
  });

  describe('runHealthPass (D-06 self-heal, shared by tick "heal" + resume/unlock onWake)', () => {
    // CR-01: every non-gate test runs against a desired-RUNNING engine --
    // runHealthPass now enforces the same two first-line gates the tick has.
    beforeEach(() => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
    });

    it('CR-01 regression: engineDesiredState="stopped" -> ZERO probe/execWsl calls (a wake never restarts a deliberately-stopped engine)', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });

      await runHealthPass();

      expect(isInstalledAndHealthyMock).not.toHaveBeenCalled();
      expect(execWslMock).not.toHaveBeenCalled();
      expect(notificationCtorMock).not.toHaveBeenCalled();
    });

    it('CR-01 regression: engineDesiredState never persisted (readState null) -> same gate, ZERO probe/execWsl calls', async () => {
      readStateMock.mockResolvedValue(null);

      await runHealthPass();

      expect(isInstalledAndHealthyMock).not.toHaveBeenCalled();
      expect(execWslMock).not.toHaveBeenCalled();
    });

    it('CR-01 regression: isInstallInFlight()=true -> ZERO collaborator calls (a wake never interleaves a heal with a live install.sh)', async () => {
      isInstallInFlightMock.mockReturnValue(true);

      await runHealthPass();

      expect(readStateMock).not.toHaveBeenCalled();
      expect(isInstalledAndHealthyMock).not.toHaveBeenCalled();
      expect(execWslMock).not.toHaveBeenCalled();
      expect(notificationCtorMock).not.toHaveBeenCalled();
    });

    it('unhealthy -> self-heal -> re-probe still down -> notifies "offline" (first-time down edge)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);

      await runHealthPass();

      expect(execWslMock).toHaveBeenCalledWith([
        '-d',
        'livinity',
        '-u',
        'root',
        '--',
        'systemctl',
        'restart',
        'livos.service',
        'cloudflared',
      ]);
      expect(notificationCtorMock).toHaveBeenCalledTimes(1);
    });

    it('a SECOND still-down pass right after does NOT repeat the notification (one-per-edge)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);

      await runHealthPass(); // 1st -- offline fires, memory becomes false
      notificationCtorMock.mockClear();
      await runHealthPass(); // 2nd -- still false->false, stable

      expect(notificationCtorMock).not.toHaveBeenCalled();
    });

    it('down, then a pass where repair succeeds -> notifies "recovered"', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);
      await runHealthPass(); // establishes down (memory=false), offline fired
      notificationCtorMock.mockClear();

      isInstalledAndHealthyMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true); // repair fixes it
      await runHealthPass();

      expect(notificationCtorMock).toHaveBeenCalledTimes(1);
    });

    it('down, then a later pass finds it healthy WITHOUT needing a repair -> "back-online" (passive recovery)', async () => {
      isInstalledAndHealthyMock.mockResolvedValue(false);
      await runHealthPass(); // establishes down
      notificationCtorMock.mockClear();

      isInstalledAndHealthyMock.mockResolvedValue(true); // first probe already healthy -- no repair path entered
      const execCallsBefore = execWslMock.mock.calls.length;
      await runHealthPass();

      expect(execWslMock.mock.calls.length).toBe(execCallsBefore); // no self-heal command ran
      expect(notificationCtorMock).toHaveBeenCalledTimes(1);
    });

    it('notifications are guarded by Notification.isSupported() -- graceful no-op, never throws', async () => {
      notificationIsSupportedMock.mockReturnValue(false);
      isInstalledAndHealthyMock.mockResolvedValue(false);

      await expect(runHealthPass()).resolves.toBeUndefined();
      expect(notificationCtorMock).not.toHaveBeenCalled();
    });

    it('degrades safely when a collaborator throws', async () => {
      isInstalledAndHealthyMock.mockRejectedValue(new Error('probe blew up'));

      await expect(runHealthPass()).resolves.toBeUndefined();
      expect(logSafeMock).toHaveBeenCalledWith('engine.healthPass', { exception: true });
    });
  });

  describe('WR-02: lifecycle serialization (one mutex for start/stop/restart/tick/heal)', () => {
    it('stopEngine invoked while a tick is mid-flight queues BEHIND the tick -- the tick never respawns the holder the user just stopped', async () => {
      let holderKilled = false;
      killHolderMock.mockImplementation(async () => {
        holderKilled = true;
      });
      readHolderRecordMock.mockImplementation(async () =>
        holderKilled ? null : { pid: 4242, spawnedAt: '2026-01-01T00:00:00.000Z' }
      );
      isPidAliveAsWslMock.mockResolvedValue(true);
      isInstalledAndHealthyMock.mockResolvedValue(true);

      let releaseTick: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        releaseTick = resolve;
      });
      readStateMock
        .mockImplementationOnce(async () => {
          await gate; // the tick hangs between its snapshot and holderAlive
          return { version: 1, currentStep: 'x', engineDesiredState: 'running' };
        })
        .mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });

      const tickP = supervisionTick();
      const stopP = stopEngine({ setStatus: vi.fn(), closeDashboard: vi.fn() });

      // Give an UN-serialized stop every chance to complete mid-tick (the
      // pre-fix interleaving: holder killed while the tick still holds its
      // stale 'running' snapshot -> 'respawn' -> holder resurrected forever).
      await new Promise((r) => setTimeout(r, 0));
      releaseTick?.();
      await Promise.all([tickP, stopP]);

      expect(adoptOrSpawnHolderMock).not.toHaveBeenCalled();
    });

    it('startEngine and stopEngine never interleave -- a stop invoked mid-start queues behind it (patchState order proves it)', async () => {
      const patches: unknown[] = [];
      patchStateMock.mockImplementation(async (p: unknown) => {
        patches.push(p);
        return { version: 1, currentStep: 'x' };
      });
      let releaseBoot: (() => void) | undefined;
      const bootGate = new Promise<void>((resolve) => {
        releaseBoot = resolve;
      });
      adoptOrSpawnHolderMock.mockImplementation(async () => {
        await bootGate; // start hangs mid-boot
        return 4242;
      });

      const startP = startEngine({ setStatus: vi.fn() });
      const stopP = stopEngine({ setStatus: vi.fn(), closeDashboard: vi.fn() });

      await new Promise((r) => setTimeout(r, 0));
      // The stop has NOT run yet -- only start's own 'running' persist landed.
      expect(patches).toEqual([{ engineDesiredState: 'running' }]);

      releaseBoot?.();
      await Promise.all([startP, stopP]);

      expect(patches).toEqual([{ engineDesiredState: 'running' }, { engineDesiredState: 'stopped' }]);
    });

    it("defense-in-depth: the respawn branch re-reads desiredState right before spawning -- a STOP that landed after the tick's snapshot wins", async () => {
      readStateMock
        .mockResolvedValueOnce({ version: 1, currentStep: 'x', engineDesiredState: 'running' }) // tick snapshot
        .mockResolvedValueOnce({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' }); // recheck: STOP landed
      readHolderRecordMock.mockResolvedValue(null); // holder dead

      await supervisionTick();

      expect(adoptOrSpawnHolderMock).not.toHaveBeenCalled();
    });
  });

  describe('startSupervision', () => {
    it('the interval callback is supervisionTick -- fires isInstallInFlight after intervalMs elapses', async () => {
      vi.useFakeTimers();
      try {
        const { stop } = startSupervision({}, { intervalMs: 1000 });
        expect(isInstallInFlightMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1000);
        // WR-02: the gate runs twice per tick by design -- once in the
        // wrapper (IN-06 literal-first-statement) and once at the serialized
        // body's start (an install could begin while the tick was queued).
        expect(isInstallInFlightMock).toHaveBeenCalledTimes(2);

        stop();
        await vi.advanceTimersByTimeAsync(5000);
        expect(isInstallInFlightMock).toHaveBeenCalledTimes(2); // stop() cleared the interval
      } finally {
        vi.useRealTimers();
      }
    });

    it('never overlaps a slow tick (re-entrancy guard) -- a second interval firing while the first is still in flight is skipped', async () => {
      vi.useFakeTimers();
      try {
        let releaseFirstTick: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
          releaseFirstTick = resolve;
        });
        readStateMock.mockImplementation(async () => {
          await gate; // the first tick hangs here until we release it
          return { version: 1, currentStep: 'x', engineDesiredState: 'stopped' };
        });

        const { stop } = startSupervision({}, { intervalMs: 1000 });

        await vi.advanceTimersByTimeAsync(1000); // 1st tick starts, hangs on readState
        await vi.advanceTimersByTimeAsync(1000); // 2nd interval firing -- must be skipped (still in flight)

        expect(readStateMock).toHaveBeenCalledTimes(1);

        releaseFirstTick?.();
        await vi.advanceTimersByTimeAsync(0);
        stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('openDashboardGated', () => {
    it('desiredState !== "running" -> focuses main window + navigates to Settings, never opens the dashboard window', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });
      const focus = vi.fn();
      const getMainWindow = vi.fn(() => ({ focus }));
      const navigateToSettings = vi.fn();
      const openDashboardWindow = vi.fn();

      await openDashboardGated({ getMainWindow, navigateToSettings, openDashboardWindow });

      expect(focus).toHaveBeenCalled();
      expect(navigateToSettings).toHaveBeenCalled();
      expect(openDashboardWindow).not.toHaveBeenCalled();
    });

    it('desiredState === "running" -> opens the dashboard window, never touches Settings navigation', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      const navigateToSettings = vi.fn();
      const openDashboardWindow = vi.fn();

      await openDashboardGated({ navigateToSettings, openDashboardWindow });

      expect(openDashboardWindow).toHaveBeenCalled();
      expect(navigateToSettings).not.toHaveBeenCalled();
    });
  });

  describe('openInBrowserGated', () => {
    it('desiredState !== "running" -> gates the same way as openDashboardGated (no dead tab)', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });
      const focus = vi.fn();
      const getMainWindow = vi.fn(() => ({ focus }));
      const navigateToSettings = vi.fn();
      const openExternal = vi.fn();

      await openInBrowserGated({ getMainWindow, navigateToSettings, openExternal });

      expect(focus).toHaveBeenCalled();
      expect(navigateToSettings).toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    });

    it('desiredState === "running" -> derives the address MAIN-SIDE and opens it externally', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      deriveAddressMock.mockResolvedValue('bruce.livinity.io');
      const openExternal = vi.fn();

      await openInBrowserGated({ openExternal });

      expect(openExternal).toHaveBeenCalledWith('https://bruce.livinity.io/');
    });

    it('desiredState === "running" but address cannot be derived -> no-op, never opens a bad URL', async () => {
      readStateMock.mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
      deriveAddressMock.mockResolvedValue(null);
      const openExternal = vi.fn();

      await openInBrowserGated({ openExternal });

      expect(openExternal).not.toHaveBeenCalled();
    });
  });
});
