import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * update.ipc.test.ts mocks every collaborator registerUpdateIpc composes —
 * update/updater.ts's getUpdateState/checkForUpdates/restartToUpdate, and
 * supervision/engine.ts's requestRestartToUpdate — plus electron's ipcMain,
 * and captures each ipcMain.handle registration by channel string (the same
 * captured-callback technique cf.ipc.test.ts/engine.ipc.test.ts use). This
 * file's job is proving DELEGATION + the I5 single-sender contract
 * (registerUpdateIpc RETURNS { pushUpdateStatus }, and nothing else in this
 * file ever raw-sends update:status) — the pure decide-update.ts reducer and
 * updater.ts's own once-per-version notify memory are already tested at 07-04.
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

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/update/updater', () => ({
  getUpdateState: vi.fn(),
  checkForUpdates: vi.fn(),
  restartToUpdate: vi.fn(),
}));

vi.mock('../../src/main/supervision/engine', () => ({
  requestRestartToUpdate: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import { getUpdateState, checkForUpdates, restartToUpdate } from '../../src/main/update/updater';
import { requestRestartToUpdate } from '../../src/main/supervision/engine';
import { registerUpdateIpc } from '../../src/main/ipc/update.ipc';

const getUpdateStateMock = vi.mocked(getUpdateState);
const checkForUpdatesMock = vi.mocked(checkForUpdates);
const requestRestartToUpdateMock = vi.mocked(requestRestartToUpdate);

/** No engine:* handler return may ever carry a secret-shaped key (mirrors
 * engine.ipc.test.ts's identical scan). */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const READY_STATE = {
  state: 'ready' as const,
  readyVersion: '2.0.0',
  currentVersion: '1.9.0',
  installBlocked: false,
};

// Mutable so a test can simulate both a live main window (webContents.send
// observable) and the null case (no window yet).
let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> } } | null = null;
let pushUpdateStatus: (s: typeof READY_STATE) => void;

describe('update.ipc', () => {
  beforeAll(() => {
    const handles = registerUpdateIpc({ getMainWindow: () => mockWindow as never });
    pushUpdateStatus = handles.pushUpdateStatus;
  });

  beforeEach(() => {
    getUpdateStateMock.mockClear();
    checkForUpdatesMock.mockClear();
    requestRestartToUpdateMock.mockClear();
    mockWindow = null;
  });

  describe('registration', () => {
    it('registers a handler for each of the 3 update:* invoke channels', () => {
      for (const channel of [CHANNELS.updateGetState, CHANNELS.updateCheck, CHANNELS.updateRestartToInstall]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });

    it('does NOT register an invoke handler for the update:status push channel (it is a main -> renderer send)', () => {
      expect(getHandler(CHANNELS.updateStatus)).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.updateStatus, expect.anything());
    });
  });

  describe('update:getState', () => {
    it('delegates to getUpdateState() and returns its secret-free state', async () => {
      const handler = getHandler(CHANNELS.updateGetState)!;
      getUpdateStateMock.mockReturnValueOnce(READY_STATE);

      const result = await handler({});

      expect(getUpdateStateMock).toHaveBeenCalled();
      expect(result).toEqual(READY_STATE);
      expect(hasSecretKey(result)).toBe(false);
    });

    it('rejects a hostile stray payload WITHOUT calling getUpdateState (IN-04), returning the safe default', async () => {
      const handler = getHandler(CHANNELS.updateGetState)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(getUpdateStateMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ state: 'failed', readyVersion: null, installBlocked: false });
    });

    it('survives getUpdateState throwing and returns the safe default', async () => {
      const handler = getHandler(CHANNELS.updateGetState)!;
      getUpdateStateMock.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      const result = await handler({});

      expect(result).toMatchObject({ state: 'failed' });
    });
  });

  describe('update:check', () => {
    it('delegates to checkForUpdates() and resolves to undefined', async () => {
      const handler = getHandler(CHANNELS.updateCheck)!;

      const result = await handler({});

      expect(checkForUpdatesMock).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('rejects a hostile stray payload WITHOUT calling checkForUpdates (IN-04)', async () => {
      const handler = getHandler(CHANNELS.updateCheck)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(checkForUpdatesMock).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('survives checkForUpdates throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.updateCheck)!;
      checkForUpdatesMock.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('update:restartToInstall', () => {
    it('delegates to requestRestartToUpdate with quitAndInstall=updater.ts\'s restartToUpdate export (Q1.3), returning {ok, blocked}', async () => {
      const handler = getHandler(CHANNELS.updateRestartToInstall)!;
      requestRestartToUpdateMock.mockResolvedValueOnce({ ok: true, blocked: false });

      const result = await handler({});

      expect(requestRestartToUpdateMock).toHaveBeenCalledWith({ quitAndInstall: restartToUpdate });
      expect(result).toEqual({ ok: true, blocked: false });
    });

    it('surfaces the D-06 install-gate block verbatim', async () => {
      const handler = getHandler(CHANNELS.updateRestartToInstall)!;
      requestRestartToUpdateMock.mockResolvedValueOnce({ ok: false, blocked: true });

      const result = await handler({});

      expect(result).toEqual({ ok: false, blocked: true });
    });

    it('rejects a hostile stray payload WITHOUT calling requestRestartToUpdate (IN-04), returning the safe default', async () => {
      const handler = getHandler(CHANNELS.updateRestartToInstall)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(requestRestartToUpdateMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, blocked: false });
    });

    it('survives requestRestartToUpdate throwing and returns the safe default', async () => {
      const handler = getHandler(CHANNELS.updateRestartToInstall)!;
      requestRestartToUpdateMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({});

      expect(result).toEqual({ ok: false, blocked: false });
    });
  });

  describe('pushUpdateStatus (I5 — the ONE update:status sender)', () => {
    it('sends CHANNELS.updateStatus to the current main window webContents', () => {
      const sendMock = vi.fn();
      mockWindow = { webContents: { send: sendMock } };

      pushUpdateStatus(READY_STATE);

      expect(sendMock).toHaveBeenCalledWith(CHANNELS.updateStatus, READY_STATE);
    });

    it('does not throw when getMainWindow() returns null — the push is a no-op', () => {
      mockWindow = null;
      expect(() => pushUpdateStatus(READY_STATE)).not.toThrow();
    });
  });
});
