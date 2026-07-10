import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import os from 'node:os';

/**
 * wsl.ipc.test.ts mocks every impure collaborator registerWslIpc composes
 * (wsl-exec, elevate, disk-probe, distro-install, install-invoke, state-
 * store, node:fs, node:child_process) plus the repo's log module, and
 * captures each ipcMain.handle registration by channel string — the same
 * captured-handler-callback technique cf.ipc.test.ts uses, mirrored here for
 * the WSL IPC boundary. decide-wsl-state / parse-wsl-list / wslconfig /
 * decide-resource-defaults are deliberately NOT mocked: they are pure,
 * zero-IO modules, so the tests exercise the REAL branching/merge logic
 * (04-PATTERNS.md Category I) rather than a stub. decide-wsl-state IS wrapped
 * with vi.fn(actual) via importOriginal so its real behavior still runs while
 * call-args stay assertable — this is how the "wsl:enable never hardcodes an
 * exit code inline, it always routes through decideWslState" invariant gets
 * a direct spy assertion, not just a behavioral one.
 */

const { handleMock, getHandler } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handleMock: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    }),
    getHandler: (channel: string) => handlers.get(channel),
  };
});

const openExternalMock = vi.hoisted(() => vi.fn());
const setLoginItemSettingsMock = vi.hoisted(() => vi.fn());
const getPathMock = vi.hoisted(() => vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\livinity-desktop'));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: (...args: unknown[]) => openExternalMock(...args) },
  app: {
    setLoginItemSettings: (...args: unknown[]) => setLoginItemSettingsMock(...args),
    getPath: (...args: unknown[]) => getPathMock(...args),
  },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execWsl: vi.fn(),
}));

vi.mock('../../src/main/wsl/elevate', () => ({
  runElevatedWslInstall: vi.fn(),
}));

vi.mock('../../src/main/wsl/disk-probe', () => ({
  getFreeDiskGb: vi.fn(),
  getVirtualizationEnabled: vi.fn(),
  getVmLaunchError: vi.fn(),
}));

vi.mock('../../src/main/wsl/distro-install', () => ({
  provisionDistro: vi.fn(),
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  runInstall: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
  patchState: vi.fn(),
}));

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// decide-wsl-state stays REAL (pure, zero-IO) — wrapped in vi.fn(actual) so
// its true branching logic still runs while every call remains spy-able
// (04-PATTERNS.md Category I: "keep REAL pure helpers so the orchestrator's
// actual branching logic is exercised, not a stub").
vi.mock('../../src/main/wsl/decide-wsl-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/wsl/decide-wsl-state')>();
  return { ...actual, decideWslState: vi.fn(actual.decideWslState) };
});

import { CHANNELS } from '../../shared/ipc-contract';
import { execWsl } from '../../src/main/wsl/wsl-exec';
import { runElevatedWslInstall } from '../../src/main/wsl/elevate';
import { getFreeDiskGb, getVirtualizationEnabled, getVmLaunchError } from '../../src/main/wsl/disk-probe';
import { provisionDistro } from '../../src/main/wsl/distro-install';
import { runInstall } from '../../src/main/wsl/install-invoke';
import { readState, patchState } from '../../src/main/storage/state-store';
import { decideWslState } from '../../src/main/wsl/decide-wsl-state';
import { registerWslIpc } from '../../src/main/ipc/wsl.ipc';
import type { WslDownloadUpdate, WslInstallUpdate } from '../../shared/ipc-contract';
import { promises as fsPromises } from 'node:fs';
import { spawn } from 'node:child_process';

const execWslMock = vi.mocked(execWsl);
const runElevatedWslInstallMock = vi.mocked(runElevatedWslInstall);
const getFreeDiskGbMock = vi.mocked(getFreeDiskGb);
const getVirtualizationEnabledMock = vi.mocked(getVirtualizationEnabled);
const getVmLaunchErrorMock = vi.mocked(getVmLaunchError);
const provisionDistroMock = vi.mocked(provisionDistro);
const runInstallMock = vi.mocked(runInstall);
const readStateMock = vi.mocked(readState);
const patchStateMock = vi.mocked(patchState);
const decideWslStateMock = vi.mocked(decideWslState);
const readFileMock = vi.mocked(fsPromises.readFile);
const writeFileMock = vi.mocked(fsPromises.writeFile);
const spawnMock = vi.mocked(spawn);

/**
 * Recursively scans a handler return value for any KEY that looks like a
 * secret (token/secret). No Wsl* result schema carries a secret field, so no
 * handler return may ever carry LIVOS_API_KEY/LIVOS_CF_TOKEN/etc (mirrors
 * cf.ipc.test.ts's hasSecretKey, T-04-06).
 */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const READY_STATUS = { code: 0, stdout: '', stderr: '' };
const REGISTERED_LIST = { code: 0, stdout: 'livinity\n', stderr: '' };
const EMPTY_LIST = { code: 0, stdout: '', stderr: '' };

/** Mutable so a test can simulate both a live main window and the null case. */
let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> } } | null = null;

describe('wsl.ipc', () => {
  beforeAll(() => {
    registerWslIpc({ getMainWindow: () => mockWindow as never });
  });

  beforeEach(() => {
    execWslMock.mockReset();
    runElevatedWslInstallMock.mockReset();
    getFreeDiskGbMock.mockReset();
    getVirtualizationEnabledMock.mockReset();
    getVmLaunchErrorMock.mockReset();
    provisionDistroMock.mockReset();
    runInstallMock.mockReset();
    readStateMock.mockReset();
    patchStateMock.mockReset();
    decideWslStateMock.mockClear();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    spawnMock.mockReset();
    openExternalMock.mockClear();
    setLoginItemSettingsMock.mockClear();
    mockWindow = null;

    // Sensible defaults so a test that doesn't care about a given
    // collaborator doesn't have to stub it explicitly.
    readStateMock.mockResolvedValue(null);
    patchStateMock.mockResolvedValue({ version: 1, currentStep: 'x' });
    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    writeFileMock.mockResolvedValue(undefined);
  });

  describe('registration', () => {
    it('registers a handler for each of the 9 wsl:* invoke channels', () => {
      for (const channel of [
        CHANNELS.wslDetect,
        CHANNELS.wslEnable,
        CHANNELS.wslCheckBios,
        CHANNELS.wslRestartNow,
        CHANNELS.wslDistroInstall,
        CHANNELS.wslInstallInvoke,
        CHANNELS.wslConfigGet,
        CHANNELS.wslConfigApply,
        CHANNELS.wslOpenExternal,
      ]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });

    it('does NOT register invoke handlers for the two push channels (main -> renderer sends)', () => {
      expect(getHandler(CHANNELS.wslDownloadUpdate)).toBeUndefined();
      expect(getHandler(CHANNELS.wslInstallUpdate)).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.wslDownloadUpdate, expect.anything());
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.wslInstallUpdate, expect.anything());
    });
  });

  describe('wsl:detect', () => {
    it('rejects a hostile stray payload WITHOUT calling execWsl, returning the conservative needs-enable default', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(execWslMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'needs-enable' });
    });

    it('happy path: clean status + registered distro + no reboot pending -> ready', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'ready' });
      expect(getVmLaunchErrorMock).toHaveBeenCalledWith(true);
    });

    it('the reactive getVmLaunchError result feeds decideWslState as launchError, producing bios-blocked even though the distro is registered and status is clean', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce('0x80370102');
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'bios-blocked' });
      expect(decideWslStateMock).toHaveBeenCalledWith(
        expect.objectContaining({ launchError: '0x80370102' })
      );
    });

    it('a persisted wsl-restart flag + a CLEAN --status is recognized as a completed reboot: the stale flag is cleared, the login item disarmed, and the verdict proceeds to ready — never a permanent needs-reboot loop (WR-02 regression)', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', wslStep: 'wsl-restart' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'ready' });
      expect(patchStateMock).toHaveBeenCalledWith({ wslStep: undefined });
      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: false });
    });

    it('a persisted wsl-restart flag + clean status but no distro yet clears the flag and proceeds to distro-missing (WR-02 regression)', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : EMPTY_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', wslStep: 'wsl-restart' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'distro-missing' });
      expect(patchStateMock).toHaveBeenCalledWith({ wslStep: undefined });
    });

    it('a persisted wsl-restart flag + a NON-ZERO --status (the reboot genuinely did not complete the enable) keeps the flag and classifies needs-enable', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? { code: 1, stdout: '', stderr: '' } : EMPTY_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', wslStep: 'wsl-restart' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'needs-enable' });
      expect(patchStateMock).not.toHaveBeenCalled();
      expect(setLoginItemSettingsMock).not.toHaveBeenCalled();
    });

    it('a non-zero --status exit is needs-enable, never bios-blocked, even with no launch probe run', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? { code: 1, stdout: '', stderr: '' } : EMPTY_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);

      const result = await handler({});

      expect(result).toEqual({ kind: 'needs-enable' });
    });

    it('wsl.exe entirely absent (null status exit) -> wsl-missing', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? { code: null, stdout: '', stderr: '' } : EMPTY_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);

      const result = await handler({});

      expect(result).toEqual({ kind: 'wsl-missing' });
    });

    it('clean status but the livinity distro not yet registered -> distro-missing', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : EMPTY_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);

      const result = await handler({});

      expect(result).toEqual({ kind: 'distro-missing' });
    });

    it('survives execWsl throwing and returns the conservative needs-enable default, never rejects', async () => {
      const handler = getHandler(CHANNELS.wslDetect)!;
      execWslMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ kind: 'needs-enable' });
    });
  });

  describe('wsl:enable', () => {
    it('rejects a hostile stray payload WITHOUT calling runElevatedWslInstall, returning a safe error default', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(runElevatedWslInstallMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'error' });
    });

    it('a declined/dismissed UAC prompt (exitCode -1) is recoverable, not a fault', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;
      runElevatedWslInstallMock.mockResolvedValueOnce({ ok: false, exitCode: -1 });

      const result = await handler({});

      expect(result).toEqual({ kind: 'declined' });
      expect(patchStateMock).not.toHaveBeenCalled();
    });

    it('a clean success arms the D-04 hidden-resume login item and persists the restart step before returning needs-reboot', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;
      runElevatedWslInstallMock.mockResolvedValueOnce({ ok: true, exitCode: 0 });

      const result = await handler({});

      expect(patchStateMock).toHaveBeenCalledWith({ wslStep: 'wsl-restart' });
      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden'],
      });
      expect(result).toEqual({ kind: 'needs-reboot' });
    });

    it('exit code 14107 (BIOS-disabled virtualization) is routed through decideWslState and surfaces as the recoverable error outcome, NEVER bios-blocked (single-decider rule, no inline branch)', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;
      runElevatedWslInstallMock.mockResolvedValueOnce({ ok: false, exitCode: 14107 });

      const result = await handler({});

      expect(result).toEqual({ kind: 'error' });
      expect(result).not.toMatchObject({ kind: 'bios-blocked' });
      expect(decideWslStateMock).toHaveBeenCalledWith({ statusExit: 14107, launchError: null });
    });

    it('any other non-zero exit code also routes through decideWslState and surfaces as error, never bios-blocked', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;
      runElevatedWslInstallMock.mockResolvedValueOnce({ ok: false, exitCode: 1 });

      const result = await handler({});

      expect(result).toEqual({ kind: 'error' });
      expect(decideWslStateMock).toHaveBeenCalledWith({ statusExit: 1, launchError: null });
    });

    it('survives runElevatedWslInstall throwing and returns a safe error default, never rejects', async () => {
      const handler = getHandler(CHANNELS.wslEnable)!;
      runElevatedWslInstallMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ kind: 'error' });
    });
  });

  describe('wsl:checkBios', () => {
    it('rejects a hostile stray payload WITHOUT calling execWsl, returning the conservative needs-enable default', async () => {
      const handler = getHandler(CHANNELS.wslCheckBios)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(execWslMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'needs-enable' });
    });

    it('the proactive WMI virtualization hint being false is NEVER a sole gate: launchError null keeps the verdict off bios-blocked', async () => {
      const handler = getHandler(CHANNELS.wslCheckBios)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(false);
      getVmLaunchErrorMock.mockResolvedValueOnce(null);

      const result = await handler({});

      expect(result).not.toMatchObject({ kind: 'bios-blocked' });
      expect(result).toEqual({ kind: 'ready' });
    });

    it('a persisting reactive 0x80370102 re-check still returns bios-blocked (lets "Check again" clear once firmware is actually fixed)', async () => {
      const handler = getHandler(CHANNELS.wslCheckBios)!;
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValueOnce(true);
      getVmLaunchErrorMock.mockResolvedValueOnce('0x80370102');

      const result = await handler({});

      expect(result).toEqual({ kind: 'bios-blocked' });
    });

    it('survives execWsl throwing and returns the conservative needs-enable default, never rejects', async () => {
      const handler = getHandler(CHANNELS.wslCheckBios)!;
      execWslMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ kind: 'needs-enable' });
    });
  });

  describe('wsl:restartNow (USER-INITIATED ONLY — the sole reboot path in this file)', () => {
    it('rejects a hostile stray payload WITHOUT arming resume or spawning a restart', async () => {
      const handler = getHandler(CHANNELS.wslRestartNow)!;

      await handler({}, { unexpected: 'payload' });

      expect(patchStateMock).not.toHaveBeenCalled();
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('re-arms the hidden-resume login item, persists the restart step, and triggers a hidden shutdown /r /t 0', async () => {
      const handler = getHandler(CHANNELS.wslRestartNow)!;

      await handler({});

      expect(patchStateMock).toHaveBeenCalledWith({ wslStep: 'wsl-restart' });
      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden'],
      });
      expect(spawnMock).toHaveBeenCalledWith('shutdown', ['/r', '/t', '0'], { windowsHide: true });
    });

    it('survives patchState throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.wslRestartNow)!;
      patchStateMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toBeUndefined();
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });

  describe('wsl:distroInstall', () => {
    it('rejects a hostile stray payload WITHOUT calling provisionDistro', async () => {
      const handler = getHandler(CHANNELS.wslDistroInstall)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(provisionDistroMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'error' });
    });

    it('delegates to provisionDistro and returns its verdict', async () => {
      const handler = getHandler(CHANNELS.wslDistroInstall)!;
      provisionDistroMock.mockResolvedValueOnce({ kind: 'installed' });

      const result = await handler({});

      expect(provisionDistroMock).toHaveBeenCalled();
      expect(result).toEqual({ kind: 'installed' });
    });

    it('forwards download progress to the main window via wsl:downloadUpdate', async () => {
      const sendMock = vi.fn();
      mockWindow = { webContents: { send: sendMock } };
      let capturedOnUpdate: ((u: WslDownloadUpdate) => void) | undefined;
      provisionDistroMock.mockImplementationOnce(async (onUpdate) => {
        capturedOnUpdate = onUpdate;
        return { kind: 'installed' };
      });

      const handler = getHandler(CHANNELS.wslDistroInstall)!;
      await handler({});

      capturedOnUpdate!({ phase: 'downloading' });
      expect(sendMock).toHaveBeenCalledWith(CHANNELS.wslDownloadUpdate, { phase: 'downloading' });
    });

    it('does not throw when getMainWindow() returns null — progress forwarding is a no-op', async () => {
      mockWindow = null;
      let capturedOnUpdate: ((u: WslDownloadUpdate) => void) | undefined;
      provisionDistroMock.mockImplementationOnce(async (onUpdate) => {
        capturedOnUpdate = onUpdate;
        return { kind: 'installed' };
      });

      const handler = getHandler(CHANNELS.wslDistroInstall)!;
      await handler({});

      expect(() => capturedOnUpdate!({ phase: 'disk-check' })).not.toThrow();
    });

    it('survives provisionDistro throwing and returns a safe error default', async () => {
      const handler = getHandler(CHANNELS.wslDistroInstall)!;
      provisionDistroMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ kind: 'error' });
    });
  });

  describe('wsl:installInvoke', () => {
    it('rejects a hostile stray payload WITHOUT calling runInstall', async () => {
      const handler = getHandler(CHANNELS.wslInstallInvoke)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(runInstallMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'generic-failure' });
    });

    it('resolves tier "free" main-side when state carries subLabel + zoneName (the CF wizard already persisted them)', async () => {
      readStateMock.mockResolvedValueOnce({
        version: 1,
        currentStep: 'x',
        subLabel: 'liv',
        zoneName: 'example.com',
      });
      runInstallMock.mockResolvedValueOnce({ kind: 'ok' });

      const handler = getHandler(CHANNELS.wslInstallInvoke)!;
      const result = await handler({});

      expect(runInstallMock).toHaveBeenCalledWith({ tier: 'free' }, expect.any(Function));
      expect(result).toEqual({ kind: 'ok' });
    });

    it('resolves tier "pro" main-side when state carries neither subLabel nor zoneName', async () => {
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x' });
      runInstallMock.mockResolvedValueOnce({ kind: 'ok' });

      const handler = getHandler(CHANNELS.wslInstallInvoke)!;
      await handler({});

      expect(runInstallMock).toHaveBeenCalledWith({ tier: 'pro' }, expect.any(Function));
    });

    it('forwards install progress to the main window via wsl:installUpdate', async () => {
      const sendMock = vi.fn();
      mockWindow = { webContents: { send: sendMock } };
      let capturedOnUpdate: ((u: WslInstallUpdate) => void) | undefined;
      runInstallMock.mockImplementationOnce(async (_input, onUpdate) => {
        capturedOnUpdate = onUpdate;
        return { kind: 'ok' };
      });

      const handler = getHandler(CHANNELS.wslInstallInvoke)!;
      await handler({});

      capturedOnUpdate!({ phase: 'installing' });
      expect(sendMock).toHaveBeenCalledWith(CHANNELS.wslInstallUpdate, { phase: 'installing' });
    });

    it('survives runInstall throwing and returns a safe generic-failure default', async () => {
      const handler = getHandler(CHANNELS.wslInstallInvoke)!;
      runInstallMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ kind: 'generic-failure' });
    });
  });

  describe('wsl:configGet', () => {
    it('rejects a hostile stray payload WITHOUT touching the filesystem, returning the safe default snapshot', async () => {
      const handler = getHandler(CHANNELS.wslConfigGet)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(readFileMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ cpuRamTunable: true });
    });

    it('assembles a secret-free snapshot from real system facts + the disk probe + any already-set .wslconfig values, defaulting cpuRamTunable to true (D-16/D-17)', async () => {
      readFileMock.mockResolvedValueOnce(
        '# a user comment\n[wsl2]\nmemory=8GB\nprocessors=4\nkernelCommandLine=quiet\n'
      );
      getFreeDiskGbMock.mockResolvedValueOnce(120);

      const handler = getHandler(CHANNELS.wslConfigGet)!;
      const result = (await handler({})) as {
        totalRamGb: number;
        totalCores: number;
        freeDiskGb: number;
        current: { memoryGb?: number; processors?: number };
        cpuRamTunable: boolean;
        recommended: { memoryGb: number; processors: number; diskGb: number };
      };

      expect(result.totalRamGb).toBe(Math.floor(os.totalmem() / 1024 ** 3));
      expect(result.totalCores).toBe(os.cpus().length);
      expect(result.freeDiskGb).toBe(120);
      expect(result.current).toEqual({ memoryGb: 8, processors: 4 });
      expect(result.cpuRamTunable).toBe(true);
      expect(result.recommended.diskGb).toBeGreaterThanOrEqual(15);
      expect(hasSecretKey(result)).toBe(false);
    });

    it('tolerates a missing .wslconfig (ENOENT) — current memory/processors are left undefined', async () => {
      readFileMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      getFreeDiskGbMock.mockResolvedValueOnce(80);

      const handler = getHandler(CHANNELS.wslConfigGet)!;
      const result = (await handler({})) as { current: { memoryGb?: number; processors?: number } };

      expect(result.current).toEqual({ memoryGb: undefined, processors: undefined });
    });

    it('survives getFreeDiskGb throwing and returns the safe default snapshot, never rejects', async () => {
      getFreeDiskGbMock.mockRejectedValueOnce(new Error('boom'));

      const handler = getHandler(CHANNELS.wslConfigGet)!;
      await expect(handler({})).resolves.toMatchObject({ cpuRamTunable: true });
    });
  });

  describe('wsl:configApply (V5 gate: validate BEFORE any .wslconfig write, D-16)', () => {
    it('rejects a malformed payload (missing diskGb) WITHOUT ever calling fs.writeFile', async () => {
      const handler = getHandler(CHANNELS.wslConfigApply)!;

      const result = await handler({}, { memoryGb: 8 });

      expect(writeFileMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, reason: 'invalid_values' });
    });

    it('rejects an invalid resource value (diskGb below the 15GB floor) WITHOUT ever calling fs.writeFile', async () => {
      const handler = getHandler(CHANNELS.wslConfigApply)!;

      const result = await handler({}, { memoryGb: 8, processors: 4, diskGb: 5 });

      expect(writeFileMock).not.toHaveBeenCalled();
      expect(execWslMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, reason: 'invalid_values' });
    });

    it('happy path: read-merge-writes .wslconfig, resizes disk, shuts down to apply, and persists the choice to state', async () => {
      readFileMock.mockResolvedValueOnce('[wsl2]\nkernelCommandLine=quiet\n');
      execWslMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

      const handler = getHandler(CHANNELS.wslConfigApply)!;
      const result = await handler({}, { memoryGb: 8, processors: 4, diskGb: 64 });

      expect(writeFileMock).toHaveBeenCalledTimes(1);
      const writtenContent = writeFileMock.mock.calls[0][1] as string;
      expect(writtenContent).toContain('memory=8GB');
      expect(writtenContent).toContain('processors=4');
      expect(writtenContent).toContain('kernelCommandLine=quiet'); // untouched line preserved

      expect(execWslMock).toHaveBeenCalledWith(['--manage', 'livinity', '--resize', '64GB']);
      expect(execWslMock).toHaveBeenCalledWith(['--shutdown']);
      expect(patchStateMock).toHaveBeenCalledWith({
        wslResourceMemoryGb: 8,
        wslResourceProcessors: 4,
        wslResourceDiskGb: 64,
      });
      expect(result).toEqual({ ok: true });
    });

    it('a write failure returns { ok:false, reason:"write_failed" } and never attempts the disk resize/shutdown', async () => {
      readFileMock.mockResolvedValueOnce('');
      writeFileMock.mockRejectedValueOnce(new Error('EPERM'));

      const handler = getHandler(CHANNELS.wslConfigApply)!;
      const result = await handler({}, { memoryGb: 8, processors: 4, diskGb: 64 });

      expect(result).toEqual({ ok: false, reason: 'write_failed' });
      expect(execWslMock).not.toHaveBeenCalled();
    });

    it('a shutdown failure returns { ok:false, reason:"shutdown_failed" } even though the write succeeded', async () => {
      readFileMock.mockResolvedValueOnce('');
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(
          args[0] === '--shutdown' ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: '', stderr: '' }
        )
      );

      const handler = getHandler(CHANNELS.wslConfigApply)!;
      const result = await handler({}, { memoryGb: 8, processors: 4, diskGb: 64 });

      expect(writeFileMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: false, reason: 'shutdown_failed' });
      expect(patchStateMock).not.toHaveBeenCalled();
    });

    it('a disk-resize failure is best-effort/non-fatal — the apply still succeeds if the shutdown works', async () => {
      readFileMock.mockResolvedValueOnce('');
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(
          args[0] === '--manage' ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: '', stderr: '' }
        )
      );

      const handler = getHandler(CHANNELS.wslConfigApply)!;
      const result = await handler({}, { memoryGb: 8, processors: 4, diskGb: 64 });

      expect(result).toEqual({ ok: true });
    });
  });

  describe('wsl:openExternal (enum-allowlisted — no raw renderer URL ever reaches shell.openExternal)', () => {
    it('maps "bios-help" to a fixed help URL', async () => {
      const handler = getHandler(CHANNELS.wslOpenExternal)!;

      await handler({}, { target: 'bios-help' });

      expect(openExternalMock).toHaveBeenCalledWith(expect.stringContaining('https://'));
    });

    it('maps "arm-help" to a fixed help URL', async () => {
      const handler = getHandler(CHANNELS.wslOpenExternal)!;

      await handler({}, { target: 'arm-help' });

      expect(openExternalMock).toHaveBeenCalledWith(expect.stringContaining('https://'));
    });

    it('rejects a raw renderer-supplied URL without ever calling shell.openExternal', async () => {
      const handler = getHandler(CHANNELS.wslOpenExternal)!;

      await handler({}, { target: 'https://evil.example.com' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('only ever opens one of the two fixed help URLs (never a renderer-controlled value)', async () => {
      const handler = getHandler(CHANNELS.wslOpenExternal)!;

      await handler({}, { target: 'bios-help' });
      await handler({}, { target: 'arm-help' });
      await handler({}, { target: 'javascript:alert(1)' });
      await handler({}, { target: 'file:///etc/passwd' });

      expect(openExternalMock).toHaveBeenCalledTimes(2);
      for (const call of openExternalMock.mock.calls) {
        expect(String(call[0])).toMatch(/^https:\/\/livinity\.io\//);
      }
    });

    it('survives shell.openExternal throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.wslOpenExternal)!;
      openExternalMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { target: 'bios-help' })).resolves.toBeUndefined();
    });
  });

  describe('no-secret-in-response (no wsl:* handler return value carries a token/secret-named field)', () => {
    it('scans every handler return in a happy-path run', async () => {
      execWslMock.mockImplementation((args: string[]) =>
        Promise.resolve(args[0] === '--status' ? READY_STATUS : REGISTERED_LIST)
      );
      getVirtualizationEnabledMock.mockResolvedValue(true);
      getVmLaunchErrorMock.mockResolvedValue(null);
      getFreeDiskGbMock.mockResolvedValue(80);
      runElevatedWslInstallMock.mockResolvedValueOnce({ ok: true, exitCode: 0 });
      provisionDistroMock.mockResolvedValueOnce({ kind: 'installed' });
      runInstallMock.mockResolvedValueOnce({ kind: 'ok' });

      const results = [
        await getHandler(CHANNELS.wslDetect)!({}),
        await getHandler(CHANNELS.wslEnable)!({}),
        await getHandler(CHANNELS.wslCheckBios)!({}),
        await getHandler(CHANNELS.wslDistroInstall)!({}),
        await getHandler(CHANNELS.wslInstallInvoke)!({}),
        await getHandler(CHANNELS.wslConfigGet)!({}),
      ];

      for (const result of results) {
        expect(hasSecretKey(result)).toBe(false);
      }
    });
  });
});
