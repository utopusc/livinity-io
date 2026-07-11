import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * engine.ipc.test.ts mocks every collaborator registerEngineIpc composes —
 * supervision/engine.ts (the desired-state lifecycle + D-10 gated-open),
 * supervision/login-item.ts (setStartAtLogin/getStartAtLogin), and
 * dashboard/dashboard-window.ts (openDashboardWindow/closeDashboardWindow) —
 * plus electron's ipcMain/shell/app, and captures each ipcMain.handle
 * registration by channel string (the same captured-callback technique
 * cf.ipc.test.ts/wsl.ipc.test.ts use). The D-10 gate DECISION itself
 * (stopped vs running) is engine.test.ts's job (06-07, already 33-tested
 * there) — this file's job is proving DELEGATION + that the deps THIS
 * module constructs (getMainWindow/navigateToSettings/openDashboardWindow/
 * openExternal) are correctly wired end to end, by driving the mocked
 * openDashboardGated/openInBrowserGated with a fake implementation that
 * exercises each dep in turn.
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
const openPathMock = vi.hoisted(() => vi.fn());
const getPathMock = vi.hoisted(() => vi.fn((_name: string) => '/fake/userData/logs'));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: {
    openExternal: (...args: unknown[]) => openExternalMock(...args),
    openPath: (...args: unknown[]) => openPathMock(...args),
  },
  app: { getPath: (...args: [string]) => getPathMock(...args) },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/supervision/engine', () => ({
  startEngine: vi.fn(),
  stopEngine: vi.fn(),
  restartEngine: vi.fn(),
  getEngineStatus: vi.fn(),
  openDashboardGated: vi.fn(),
  openInBrowserGated: vi.fn(),
}));

vi.mock('../../src/main/supervision/login-item', () => ({
  setStartAtLogin: vi.fn(),
  getStartAtLogin: vi.fn(),
}));

vi.mock('../../src/main/dashboard/dashboard-window', () => ({
  openDashboardWindow: vi.fn(),
  closeDashboardWindow: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import type { EngineDeps } from '../../src/main/supervision/engine';
import {
  startEngine,
  stopEngine,
  restartEngine,
  getEngineStatus,
  openDashboardGated,
  openInBrowserGated,
} from '../../src/main/supervision/engine';
import { setStartAtLogin, getStartAtLogin } from '../../src/main/supervision/login-item';
import { openDashboardWindow, closeDashboardWindow } from '../../src/main/dashboard/dashboard-window';
import { registerEngineIpc } from '../../src/main/ipc/engine.ipc';

const startEngineMock = vi.mocked(startEngine);
const stopEngineMock = vi.mocked(stopEngine);
const restartEngineMock = vi.mocked(restartEngine);
const getEngineStatusMock = vi.mocked(getEngineStatus);
const openDashboardGatedMock = vi.mocked(openDashboardGated);
const openInBrowserGatedMock = vi.mocked(openInBrowserGated);
const setStartAtLoginMock = vi.mocked(setStartAtLogin);
const getStartAtLoginMock = vi.mocked(getStartAtLogin);
const openDashboardWindowMock = vi.mocked(openDashboardWindow);
const closeDashboardWindowMock = vi.mocked(closeDashboardWindow);

/**
 * Recursively scans a handler return value for any KEY that looks like a
 * secret (token/secret). No engine:* handler return may ever carry one
 * (T-06-09) — EngineStatusResult is address+state only, and every other
 * handler resolves to a plain {ok}/{ok,startAtLogin}/undefined shape.
 */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const SAFE_STATUS_DEFAULT = {
  state: 'error' as const,
  address: null,
  lastCheckedAt: null,
  desiredState: 'stopped' as const,
};

const setStatusMock = vi.fn();
// Mutable so a test can simulate both a live main window (focus/send
// observable) and the null case (no window yet).
let mockWindow: { focus: ReturnType<typeof vi.fn>; webContents: { send: ReturnType<typeof vi.fn> } } | null = null;

describe('engine.ipc', () => {
  beforeAll(() => {
    registerEngineIpc({ getMainWindow: () => mockWindow as never, setStatus: setStatusMock });
  });

  beforeEach(() => {
    startEngineMock.mockClear().mockResolvedValue(undefined);
    stopEngineMock.mockClear().mockResolvedValue(undefined);
    restartEngineMock.mockClear().mockResolvedValue(undefined);
    getEngineStatusMock.mockClear().mockResolvedValue({
      state: 'running',
      address: 'home.example.com',
      lastCheckedAt: 1,
      desiredState: 'running',
    });
    openDashboardGatedMock.mockClear().mockResolvedValue(undefined);
    openInBrowserGatedMock.mockClear().mockResolvedValue(undefined);
    setStartAtLoginMock.mockClear().mockResolvedValue(undefined);
    getStartAtLoginMock.mockClear().mockResolvedValue(true);
    openDashboardWindowMock.mockClear().mockResolvedValue(undefined);
    closeDashboardWindowMock.mockClear();
    openExternalMock.mockClear().mockResolvedValue(undefined);
    openPathMock.mockClear().mockResolvedValue(undefined);
    getPathMock.mockClear();
    setStatusMock.mockClear();
    mockWindow = { focus: vi.fn(), webContents: { send: vi.fn() } };
  });

  describe('registration', () => {
    it('registers a handler for each of the 8 engine:* invoke channels', () => {
      for (const channel of [
        CHANNELS.engineStart,
        CHANNELS.engineStop,
        CHANNELS.engineRestart,
        CHANNELS.engineGetStatus,
        CHANNELS.engineSetStartAtLogin,
        CHANNELS.engineOpenDashboard,
        CHANNELS.engineOpenInBrowser,
        CHANNELS.engineOpenLogsFolder,
      ]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });

    it('does NOT register an invoke handler for the engine:navigate push channel (it is a main -> renderer send)', () => {
      expect(getHandler(CHANNELS.engineNavigate)).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.engineNavigate, expect.anything());
    });
  });

  describe('engine:start', () => {
    it('delegates to startEngine and returns { ok: true }', async () => {
      const handler = getHandler(CHANNELS.engineStart)!;
      const result = await handler({});
      expect(startEngineMock).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('rejects a hostile stray payload WITHOUT calling startEngine (IN-04), returning { ok: false }', async () => {
      const handler = getHandler(CHANNELS.engineStart)!;
      const result = await handler({}, { unexpected: 'payload' });
      expect(startEngineMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
    });

    it('survives startEngine throwing and returns { ok: false }, never rejects', async () => {
      const handler = getHandler(CHANNELS.engineStart)!;
      startEngineMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toEqual({ ok: false });
    });
  });

  describe('engine:stop', () => {
    it('delegates to stopEngine and returns { ok: true }', async () => {
      const handler = getHandler(CHANNELS.engineStop)!;
      const result = await handler({});
      expect(stopEngineMock).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('rejects a hostile stray payload WITHOUT calling stopEngine, returning { ok: false }', async () => {
      const handler = getHandler(CHANNELS.engineStop)!;
      const result = await handler({}, { unexpected: 'payload' });
      expect(stopEngineMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
    });

    it('survives stopEngine throwing and returns { ok: false }, never rejects', async () => {
      const handler = getHandler(CHANNELS.engineStop)!;
      stopEngineMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toEqual({ ok: false });
    });
  });

  describe('engine:restart', () => {
    it('delegates to restartEngine and returns { ok: true }', async () => {
      const handler = getHandler(CHANNELS.engineRestart)!;
      const result = await handler({});
      expect(restartEngineMock).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('rejects a hostile stray payload WITHOUT calling restartEngine, returning { ok: false }', async () => {
      const handler = getHandler(CHANNELS.engineRestart)!;
      const result = await handler({}, { unexpected: 'payload' });
      expect(restartEngineMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
    });

    it('survives restartEngine throwing and returns { ok: false }, never rejects', async () => {
      const handler = getHandler(CHANNELS.engineRestart)!;
      restartEngineMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toEqual({ ok: false });
    });
  });

  describe('engine:getStatus', () => {
    it('delegates to getEngineStatus and returns its result verbatim', async () => {
      const handler = getHandler(CHANNELS.engineGetStatus)!;
      const result = await handler({});
      expect(getEngineStatusMock).toHaveBeenCalled();
      expect(result).toEqual({
        state: 'running',
        address: 'home.example.com',
        lastCheckedAt: 1,
        desiredState: 'running',
      });
    });

    it('rejects a hostile stray payload WITHOUT calling getEngineStatus, returning the schema-valid safe default', async () => {
      const handler = getHandler(CHANNELS.engineGetStatus)!;
      const result = await handler({}, { unexpected: true });
      expect(getEngineStatusMock).not.toHaveBeenCalled();
      expect(result).toEqual(SAFE_STATUS_DEFAULT);
    });

    it('survives getEngineStatus throwing and returns the schema-valid safe default', async () => {
      const handler = getHandler(CHANNELS.engineGetStatus)!;
      getEngineStatusMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toEqual(SAFE_STATUS_DEFAULT);
    });
  });

  describe('engine:setStartAtLogin', () => {
    it('rejects a malformed payload (non-boolean enabled) WITHOUT calling setStartAtLogin, returning the current value', async () => {
      const handler = getHandler(CHANNELS.engineSetStartAtLogin)!;
      getStartAtLoginMock.mockResolvedValueOnce(true);
      const result = await handler({}, { enabled: 'yes' });
      expect(setStartAtLoginMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, startAtLogin: true });
    });

    it('delegates to setStartAtLogin and returns { ok: true, startAtLogin: enabled }', async () => {
      const handler = getHandler(CHANNELS.engineSetStartAtLogin)!;
      const result = await handler({}, { enabled: false });
      expect(setStartAtLoginMock).toHaveBeenCalledWith(false);
      expect(result).toEqual({ ok: true, startAtLogin: false });
    });

    it('survives setStartAtLogin throwing and returns a safe { ok:false, startAtLogin: current } union', async () => {
      const handler = getHandler(CHANNELS.engineSetStartAtLogin)!;
      setStartAtLoginMock.mockRejectedValueOnce(new Error('boom'));
      getStartAtLoginMock.mockResolvedValueOnce(true);
      const result = await handler({}, { enabled: false });
      expect(result).toEqual({ ok: false, startAtLogin: true });
    });
  });

  describe('engine:openLogsFolder', () => {
    it('ignores any renderer-supplied payload and calls shell.openPath with the fixed app.getPath("logs") path', async () => {
      const handler = getHandler(CHANNELS.engineOpenLogsFolder)!;
      getPathMock.mockReturnValueOnce('/fixed/logs/path');
      const result = await handler({}, { path: 'C:\\evil\\renderer\\supplied' });
      expect(getPathMock).toHaveBeenCalledWith('logs');
      expect(openPathMock).toHaveBeenCalledWith('/fixed/logs/path');
      expect(openPathMock).not.toHaveBeenCalledWith(expect.stringContaining('evil'));
      expect(result).toBeUndefined();
    });

    it('survives shell.openPath throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.engineOpenLogsFolder)!;
      openPathMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('engine:openDashboard (delegates to openDashboardGated, D-10 stopped-gate)', () => {
    it('delegates to openDashboardGated and resolves to undefined', async () => {
      const handler = getHandler(CHANNELS.engineOpenDashboard)!;
      const result = await handler({});
      expect(openDashboardGatedMock).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('stopped-gate: a fake desiredState=stopped implementation drives THIS module\'s wired getMainWindow/navigateToSettings deps -- focuses main + pushes engine:navigate, opens no window', async () => {
      openDashboardGatedMock.mockImplementationOnce(async (deps?: Partial<EngineDeps>) => {
        deps?.getMainWindow?.()?.focus();
        deps?.navigateToSettings?.();
      });
      const handler = getHandler(CHANNELS.engineOpenDashboard)!;
      await handler({});
      expect(mockWindow!.focus).toHaveBeenCalled();
      expect(mockWindow!.webContents.send).toHaveBeenCalledWith(CHANNELS.engineNavigate, { screen: 'settings' });
      expect(openDashboardWindowMock).not.toHaveBeenCalled();
    });

    it('running-gate: a fake desiredState=running implementation drives THIS module\'s wired openDashboardWindow dep (06-08)', async () => {
      openDashboardGatedMock.mockImplementationOnce(async (deps?: Partial<EngineDeps>) => {
        await deps?.openDashboardWindow?.();
      });
      const handler = getHandler(CHANNELS.engineOpenDashboard)!;
      await handler({});
      expect(openDashboardWindowMock).toHaveBeenCalled();
    });

    it('rejects a hostile stray payload WITHOUT calling openDashboardGated', async () => {
      const handler = getHandler(CHANNELS.engineOpenDashboard)!;
      const result = await handler({}, { unexpected: true });
      expect(openDashboardGatedMock).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('survives openDashboardGated throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.engineOpenDashboard)!;
      openDashboardGatedMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('engine:openInBrowser (delegates to openInBrowserGated, D-10 stopped-gate)', () => {
    it('takes no renderer payload, delegates to openInBrowserGated, and resolves to undefined', async () => {
      const handler = getHandler(CHANNELS.engineOpenInBrowser)!;
      const result = await handler({}, undefined);
      expect(openInBrowserGatedMock).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('stopped-gate: a fake desiredState=stopped implementation focuses main + pushes engine:navigate, WITHOUT opening an external URL (no dead 1033)', async () => {
      openInBrowserGatedMock.mockImplementationOnce(async (deps?: Partial<EngineDeps>) => {
        deps?.getMainWindow?.()?.focus();
        deps?.navigateToSettings?.();
      });
      const handler = getHandler(CHANNELS.engineOpenInBrowser)!;
      await handler({});
      expect(mockWindow!.focus).toHaveBeenCalled();
      expect(mockWindow!.webContents.send).toHaveBeenCalledWith(CHANNELS.engineNavigate, { screen: 'settings' });
      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('running-gate: a fake desiredState=running implementation opens a MAIN-SIDE-derived URL via THIS module\'s wired openExternal dep -- never renderer-supplied (the handler ignores any payload)', async () => {
      openInBrowserGatedMock.mockImplementationOnce(async (deps?: Partial<EngineDeps>) => {
        await deps?.openExternal?.('https://home.example.com/');
      });
      const handler = getHandler(CHANNELS.engineOpenInBrowser)!;
      await handler({}, { url: 'https://renderer-supplied.evil/' });
      expect(openExternalMock).toHaveBeenCalledWith('https://home.example.com/');
      expect(openExternalMock).not.toHaveBeenCalledWith(expect.stringContaining('evil'));
    });

    it('rejects a hostile stray payload WITHOUT calling openInBrowserGated', async () => {
      const handler = getHandler(CHANNELS.engineOpenInBrowser)!;
      const result = await handler({}, { url: 'https://evil.example.com' });
      expect(openInBrowserGatedMock).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('survives openInBrowserGated throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.engineOpenInBrowser)!;
      openInBrowserGatedMock.mockRejectedValueOnce(new Error('boom'));
      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('no-secret-in-response (T-06-09: no handler return value carries a token/secret field)', () => {
    it('no engine:* handler return value carries a token/secret-named field', async () => {
      const results = [
        await getHandler(CHANNELS.engineStart)!({}),
        await getHandler(CHANNELS.engineStop)!({}),
        await getHandler(CHANNELS.engineRestart)!({}),
        await getHandler(CHANNELS.engineGetStatus)!({}),
        await getHandler(CHANNELS.engineSetStartAtLogin)!({}, { enabled: true }),
        await getHandler(CHANNELS.engineOpenDashboard)!({}),
        await getHandler(CHANNELS.engineOpenInBrowser)!({}),
        await getHandler(CHANNELS.engineOpenLogsFolder)!({}),
      ];

      for (const result of results) {
        expect(hasSecretKey(result)).toBe(false);
      }
    });
  });
});
