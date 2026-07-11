import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * login-item.test.ts mocks electron's `app.setLoginItemSettings` and the
 * state-store `readState`/`patchState` collaborators — login-item.ts is the
 * SOLE `setLoginItemSettings` call site in the app (mirrors
 * tests/ipc/wsl.ipc.test.ts's electron mock shape, the file this plan's
 * Task 2 refactors to route through this module instead of calling
 * `app.setLoginItemSettings` directly).
 */

const setLoginItemSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: (...args: unknown[]) => setLoginItemSettingsMock(...args),
  },
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
  patchState: vi.fn(),
}));

import { readState, patchState } from '../../src/main/storage/state-store';
import { syncLoginItem, setStartAtLogin, getStartAtLogin } from '../../src/main/supervision/login-item';

const readStateMock = vi.mocked(readState);
const patchStateMock = vi.mocked(patchState);

describe('login-item', () => {
  beforeEach(() => {
    setLoginItemSettingsMock.mockClear();
    readStateMock.mockReset();
    patchStateMock.mockReset();
  });

  describe('syncLoginItem', () => {
    it('startAtLogin=undefined (default), wslStep=undefined -> openAtLogin=true (D-05 default on)', async () => {
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x' });

      await syncLoginItem();

      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
    });

    it('startAtLogin=false, wslStep=undefined -> openAtLogin=false (THE fix: falls back to the real preference, not hardcoded)', async () => {
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', startAtLogin: false });

      await syncLoginItem();

      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: false, args: ['--hidden'] });
    });

    it('startAtLogin=false, wslStep=wsl-restart -> openAtLogin=true (a pending reboot ALWAYS forces it on for that one relaunch, Phase-4 behavior preserved)', async () => {
      readStateMock.mockResolvedValueOnce({
        version: 1,
        currentStep: 'x',
        startAtLogin: false,
        wslStep: 'wsl-restart',
      });

      await syncLoginItem();

      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
    });

    it('startAtLogin=true, wslStep=undefined -> openAtLogin=true', async () => {
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', startAtLogin: true });

      await syncLoginItem();

      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
    });

    it('a null state (first run, no state.json yet) degrades to the default startAtLogin=true, no pending reboot', async () => {
      readStateMock.mockResolvedValueOnce(null);

      await syncLoginItem();

      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
    });
  });

  describe('setStartAtLogin', () => {
    it('persists {startAtLogin: enabled} THEN syncs (order asserted)', async () => {
      const callOrder: string[] = [];
      patchStateMock.mockImplementationOnce(async (patch) => {
        callOrder.push('patchState');
        return { version: 1, currentStep: 'x', ...patch };
      });
      readStateMock.mockImplementationOnce(async () => {
        callOrder.push('readState');
        return { version: 1, currentStep: 'x', startAtLogin: false };
      });

      await setStartAtLogin(false);

      expect(patchStateMock).toHaveBeenCalledWith({ startAtLogin: false });
      expect(callOrder).toEqual(['patchState', 'readState']);
      expect(setLoginItemSettingsMock).toHaveBeenCalledWith({ openAtLogin: false, args: ['--hidden'] });
    });
  });

  describe('getStartAtLogin', () => {
    it('returns the persisted startAtLogin value', async () => {
      readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', startAtLogin: false });

      expect(await getStartAtLogin()).toBe(false);
    });

    it('defaults to true when startAtLogin is unset (null state, first run)', async () => {
      readStateMock.mockResolvedValueOnce(null);

      expect(await getStartAtLogin()).toBe(true);
    });
  });
});
