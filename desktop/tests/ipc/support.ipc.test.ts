import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * support.ipc.test.ts mocks every collaborator registerSupportIpc composes —
 * support/diagnostics-bundle.ts's exportDiagnostics, uninstall/remove-executor.ts's
 * executeRemove/finishRemove, storage/secrets-vault.ts's vaultGet,
 * storage/state-store.ts's readState, platform/auth-client.ts's getMe, and
 * wsl/install-invoke.ts's isInstallInFlight — plus electron's ipcMain/shell, and
 * captures each ipcMain.handle registration by channel string (the same
 * captured-callback technique cf.ipc.test.ts/engine.ipc.test.ts/update.ipc.test.ts
 * use). This file's job is proving DELEGATION + the D-12 secret-free offer gate +
 * the W3 defense-in-depth install-gate + the B2 enum-allowlisted CF-dashboard open
 * + the I5-sibling single-sender contract (registerSupportIpc RETURNS
 * { pushRemoveProgress }).
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

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: (...args: unknown[]) => openExternalMock(...args) },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/support/diagnostics-bundle', () => ({
  exportDiagnostics: vi.fn(),
}));

vi.mock('../../src/main/uninstall/remove-executor', () => ({
  executeRemove: vi.fn(),
  finishRemove: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  isInstallInFlight: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import type { State } from '../../shared/ipc-contract';
import { exportDiagnostics } from '../../src/main/support/diagnostics-bundle';
import { executeRemove, finishRemove } from '../../src/main/uninstall/remove-executor';
import { vaultGet } from '../../src/main/storage/secrets-vault';
import { readState } from '../../src/main/storage/state-store';
import { getMe } from '../../src/main/platform/auth-client';
import { isInstallInFlight } from '../../src/main/wsl/install-invoke';
import { registerSupportIpc } from '../../src/main/ipc/support.ipc';

const exportDiagnosticsMock = vi.mocked(exportDiagnostics);
const executeRemoveMock = vi.mocked(executeRemove);
const finishRemoveMock = vi.mocked(finishRemove);
const vaultGetMock = vi.mocked(vaultGet);
const readStateMock = vi.mocked(readState);
const getMeMock = vi.mocked(getMe);
const isInstallInFlightMock = vi.mocked(isInstallInFlight);

/** No handler return may ever carry a secret-shaped key (mirrors
 * cf.ipc.test.ts/engine.ipc.test.ts's identical scan — T-05-01/T-07-15). */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const FULL_RECEIPTS_STATE: State = {
  version: 1,
  currentStep: 'start',
  tunnelId: 't1',
  accountId: 'a1',
  zoneId: 'z1',
  zoneName: 'example.com',
  subLabel: 'home',
};

const freeByodMe = {
  ok: true as const,
  user: {
    userId: 'u1',
    username: 'bruce',
    email: 'a@b.co',
    emailVerified: true,
    is_admin: false,
    free_byod: true,
  },
};

const nonFreeByodMe = {
  ok: true as const,
  user: { ...freeByodMe.user, free_byod: false },
};

// Mutable so a test can simulate both a live main window (webContents.send
// observable) and the null case (no window yet).
let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> } } | null = null;
let pushRemoveProgress: (p: { stepId: string; status: string }) => void;

describe('support.ipc', () => {
  beforeAll(() => {
    const handles = registerSupportIpc({ getMainWindow: () => mockWindow as never });
    pushRemoveProgress = handles.pushRemoveProgress as never;
  });

  beforeEach(() => {
    exportDiagnosticsMock.mockClear();
    executeRemoveMock.mockClear();
    finishRemoveMock.mockClear();
    vaultGetMock.mockReset();
    readStateMock.mockReset();
    getMeMock.mockReset();
    isInstallInFlightMock.mockReset().mockReturnValue(false);
    openExternalMock.mockClear();
    mockWindow = null;
  });

  describe('registration', () => {
    it('registers a handler for support:exportDiagnostics and each of the 4 remove:* invoke channels', () => {
      for (const channel of [
        CHANNELS.supportExportDiagnostics,
        CHANNELS.removeGetOffer,
        CHANNELS.removeExecute,
        CHANNELS.removeFinish,
        CHANNELS.removeOpenCfDashboard,
      ]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });

    it('does NOT register an invoke handler for the remove:progress push channel (it is a main -> renderer send)', () => {
      expect(getHandler(CHANNELS.removeProgress)).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.removeProgress, expect.anything());
    });
  });

  describe('support:exportDiagnostics', () => {
    it('delegates to exportDiagnostics() and returns its secret-free outcome', async () => {
      const handler = getHandler(CHANNELS.supportExportDiagnostics)!;
      exportDiagnosticsMock.mockResolvedValueOnce({ outcome: 'saved' });

      const result = await handler({});

      expect(exportDiagnosticsMock).toHaveBeenCalled();
      expect(result).toEqual({ outcome: 'saved' });
    });

    it('rejects a hostile stray payload WITHOUT calling exportDiagnostics (IN-04), returning the safe default', async () => {
      const handler = getHandler(CHANNELS.supportExportDiagnostics)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(exportDiagnosticsMock).not.toHaveBeenCalled();
      expect(result).toEqual({ outcome: 'failed' });
    });

    it('survives exportDiagnostics throwing and returns the safe default', async () => {
      const handler = getHandler(CHANNELS.supportExportDiagnostics)!;
      exportDiagnosticsMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({});

      expect(result).toEqual({ outcome: 'failed' });
    });
  });

  describe('remove:getOffer (D-12 secret-free main-side gate)', () => {
    it('offers CF teardown ONLY when tier=free_byod AND all 5 receipts present AND a cfToken is vaulted', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;
      vaultGetMock.mockImplementation(async (key: string) => {
        if (key === 'session') return 'session-value';
        if (key === 'cfToken') return 'cf-token-abc';
        return null;
      });
      getMeMock.mockResolvedValueOnce(freeByodMe);
      readStateMock.mockResolvedValueOnce(FULL_RECEIPTS_STATE);

      const result = await handler({});

      expect(result).toEqual({ offerCfTeardown: true, apexHost: 'home.example.com' });
      expect(hasSecretKey(result)).toBe(false);
    });

    it('does NOT offer when the account is not free_byod', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;
      vaultGetMock.mockResolvedValue('session-value');
      getMeMock.mockResolvedValueOnce(nonFreeByodMe);
      readStateMock.mockResolvedValueOnce(FULL_RECEIPTS_STATE);

      const result = await handler({});

      expect(result).toEqual({ offerCfTeardown: false, apexHost: null });
    });

    it('does NOT offer when a CF receipt is missing from state (partial provisioning)', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;
      vaultGetMock.mockResolvedValue('session-value');
      getMeMock.mockResolvedValueOnce(freeByodMe);
      readStateMock.mockResolvedValueOnce({ ...FULL_RECEIPTS_STATE, zoneName: undefined });

      const result = await handler({});

      expect(result).toEqual({ offerCfTeardown: false, apexHost: null });
    });

    it('does NOT offer when no cfToken is vaulted, even with tier+receipts eligible', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;
      vaultGetMock.mockImplementation(async (key: string) => (key === 'session' ? 'session-value' : null));
      getMeMock.mockResolvedValueOnce(freeByodMe);
      readStateMock.mockResolvedValueOnce(FULL_RECEIPTS_STATE);

      const result = await handler({});

      expect(result).toEqual({ offerCfTeardown: false, apexHost: null });
    });

    it('rejects a hostile stray payload WITHOUT computing the offer (IN-04), returning the safe default', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(vaultGetMock).not.toHaveBeenCalled();
      expect(result).toEqual({ offerCfTeardown: false, apexHost: null });
    });

    it('survives a thrown collaborator and returns the safe default (never a token/receipt leak)', async () => {
      const handler = getHandler(CHANNELS.removeGetOffer)!;
      vaultGetMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({});

      expect(result).toEqual({ offerCfTeardown: false, apexHost: null });
    });
  });

  describe('remove:execute (W3 defense-in-depth + W4 main-owns-steps)', () => {
    it('refuses the ENTIRE run when isInstallInFlight() is true, WITHOUT calling executeRemove at all', async () => {
      const handler = getHandler(CHANNELS.removeExecute)!;
      isInstallInFlightMock.mockReturnValue(true);

      const result = await handler({}, { cf: true, distro: true, clear: true });

      expect(executeRemoveMock).not.toHaveBeenCalled();
      expect(result).toEqual({ blockedByInstall: true, steps: [] });
    });

    it('delegates to executeRemove with the parsed choices + onProgress=pushRemoveProgress, returning its ack verbatim', async () => {
      const handler = getHandler(CHANNELS.removeExecute)!;
      executeRemoveMock.mockResolvedValueOnce({
        blockedByInstall: false,
        steps: ['stop-engine', 'distro-remove', 'credential-clear'],
      });

      const result = await handler({}, { cf: false, distro: true, clear: true });

      expect(executeRemoveMock).toHaveBeenCalledWith(
        { cf: false, distro: true, clear: true },
        expect.objectContaining({ onProgress: expect.any(Function) })
      );
      expect(result).toEqual({
        blockedByInstall: false,
        steps: ['stop-engine', 'distro-remove', 'credential-clear'],
      });
    });

    it('rejects a malformed choices payload WITHOUT calling executeRemove, returning the safe default', async () => {
      const handler = getHandler(CHANNELS.removeExecute)!;

      const result = await handler({}, { cf: 'yes' });

      expect(executeRemoveMock).not.toHaveBeenCalled();
      expect(result).toEqual({ blockedByInstall: false, steps: [] });
    });

    it('survives executeRemove throwing and returns the safe default', async () => {
      const handler = getHandler(CHANNELS.removeExecute)!;
      executeRemoveMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({}, { cf: true, distro: true, clear: true });

      expect(result).toEqual({ blockedByInstall: false, steps: [] });
    });
  });

  describe('remove:finish', () => {
    it('delegates to finishRemove() and resolves to undefined', async () => {
      const handler = getHandler(CHANNELS.removeFinish)!;

      const result = await handler({});

      expect(finishRemoveMock).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('rejects a hostile stray payload WITHOUT calling finishRemove (IN-04)', async () => {
      const handler = getHandler(CHANNELS.removeFinish)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(finishRemoveMock).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('survives finishRemove throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.removeFinish)!;
      finishRemoveMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('remove:openCfDashboard (B2 enum-allowlisted, never a renderer URL)', () => {
    it('opens ONLY the fixed https://dash.cloudflare.com literal', async () => {
      const handler = getHandler(CHANNELS.removeOpenCfDashboard)!;

      await handler({});

      expect(openExternalMock).toHaveBeenCalledWith('https://dash.cloudflare.com');
      expect(openExternalMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a hostile stray payload (e.g. a renderer-supplied url) WITHOUT calling shell.openExternal at all (IN-04)', async () => {
      const handler = getHandler(CHANNELS.removeOpenCfDashboard)!;

      await handler({}, { url: 'https://evil.example.com' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('survives shell.openExternal throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.removeOpenCfDashboard)!;
      openExternalMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toBeUndefined();
    });
  });

  describe('pushRemoveProgress (mirrors update.ipc.ts\'s I5 pushUpdateStatus)', () => {
    it('sends CHANNELS.removeProgress to the current main window webContents', () => {
      const sendMock = vi.fn();
      mockWindow = { webContents: { send: sendMock } };

      pushRemoveProgress({ stepId: 'stop-engine', status: 'active' });

      expect(sendMock).toHaveBeenCalledWith(CHANNELS.removeProgress, { stepId: 'stop-engine', status: 'active' });
    });

    it('does not throw when getMainWindow() returns null — the push is a no-op', () => {
      mockWindow = null;
      expect(() => pushRemoveProgress({ stepId: 'stop-engine', status: 'active' })).not.toThrow();
    });
  });
});
