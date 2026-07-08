import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * auth.ipc.test.ts mocks every service registerAuthIpc composes (session-
 * manager, auth-client, decide-key-action, secrets-vault) and captures each
 * ipcMain.handle registration by channel string — same captured-callback
 * technique as tests/shell-preload.test.ts uses for the preload side, mirrored
 * here for the main-process ipcMain.handle side.
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

vi.mock('../../src/main/platform/session-manager', () => ({
  validateSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  login: vi.fn(),
  getMe: vi.fn(),
  getDashboard: vi.fn(),
  chooseFree: vi.fn(),
  mintKey: vi.fn(),
  probeKey: vi.fn(),
}));

vi.mock('../../src/main/platform/decide-key-action', () => ({
  decideKeyAction: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
  vaultSet: vi.fn(),
  vaultHas: vi.fn(),
  vaultDelete: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import { THROTTLE_AFTER } from '../../src/main/platform/backoff';
import { validateSession, signOut } from '../../src/main/platform/session-manager';
import {
  login,
  getMe,
  getDashboard,
  chooseFree,
  mintKey,
  probeKey,
} from '../../src/main/platform/auth-client';
import { decideKeyAction } from '../../src/main/platform/decide-key-action';
import { vaultGet, vaultSet, vaultHas, vaultDelete } from '../../src/main/storage/secrets-vault';
import { registerAuthIpc } from '../../src/main/ipc/auth.ipc';

const loginMock = vi.mocked(login);
const getMeMock = vi.mocked(getMe);
const getDashboardMock = vi.mocked(getDashboard);
const chooseFreeMock = vi.mocked(chooseFree);
const mintKeyMock = vi.mocked(mintKey);
const probeKeyMock = vi.mocked(probeKey);
const decideKeyActionMock = vi.mocked(decideKeyAction);
const validateSessionMock = vi.mocked(validateSession);
const signOutMock = vi.mocked(signOut);
const vaultGetMock = vi.mocked(vaultGet);
const vaultSetMock = vi.mocked(vaultSet);
const vaultHasMock = vi.mocked(vaultHas);
const vaultDeleteMock = vi.mocked(vaultDelete);

describe('auth.ipc', () => {
  beforeAll(() => {
    registerAuthIpc({ getMainWindow: () => null });
  });

  describe('auth:signInWithGoogle (severed — device-flow pivot, D-16/D-18)', () => {
    it('registers NO handler for auth:signInWithGoogle', () => {
      expect(getHandler('auth:signInWithGoogle')).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith('auth:signInWithGoogle', expect.anything());
    });
  });

  describe('auth:login', () => {
    it('rejects a malformed payload (missing password) WITHOUT calling auth-client.login', async () => {
      const handler = getHandler(CHANNELS.authLogin)!;

      const result = await handler({}, { email: 'a@b.co' });

      expect(loginMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false });
    });

    it('throttles after THROTTLE_AFTER consecutive failures (D-08) and resets the counter on success', async () => {
      const handler = getHandler(CHANNELS.authLogin)!;
      vi.useFakeTimers();
      vi.setSystemTime(0);

      loginMock.mockResolvedValue({ ok: false, status: 401, error: 'Invalid email or password' });

      for (let i = 0; i < THROTTLE_AFTER; i++) {
        await handler({}, { email: 'a@b.co', password: 'wrong' });
      }
      expect(loginMock).toHaveBeenCalledTimes(THROTTLE_AFTER);

      const throttled = await handler({}, { email: 'a@b.co', password: 'wrong' });
      expect(throttled).toMatchObject({ ok: false, status: 429, error: 'throttled' });
      expect((throttled as { retryAfterMs?: number }).retryAfterMs).toBeGreaterThan(0);
      // The throttled call must NOT have reached auth-client.login a 4th time.
      expect(loginMock).toHaveBeenCalledTimes(THROTTLE_AFTER);

      // Advance past the throttle window.
      vi.setSystemTime(120000);
      loginMock.mockResolvedValueOnce({
        ok: true,
        sessionValue: 'sess-1',
        user: { id: 'u1', username: null, email: 'a@b.co', emailVerified: true },
      });
      validateSessionMock.mockResolvedValueOnce({ kind: 'byod-wizard' });

      const success = await handler({}, { email: 'a@b.co', password: 'right' });
      expect(success).toEqual({ ok: true, route: { kind: 'byod-wizard' } });
      expect(vaultSetMock).toHaveBeenCalledWith('session', 'sess-1');

      // Counter reset: the NEXT single failure must NOT immediately re-throttle.
      loginMock.mockResolvedValueOnce({ ok: false, status: 401, error: 'Invalid email or password' });
      const afterReset = await handler({}, { email: 'a@b.co', password: 'wrong' });
      expect(afterReset).toMatchObject({ ok: false, status: 401, error: 'Invalid email or password' });

      vi.useRealTimers();
    });
  });

  describe('auth:getKeyAction (AUTH-06 mint-gating safety)', () => {
    it('calls decideKeyAction BEFORE mintKey, and calls mintKey("generate-key") exactly once when action is "mint"', async () => {
      const handler = getHandler(CHANNELS.authGetKeyAction)!;
      const callOrder: string[] = [];

      vaultGetMock.mockResolvedValueOnce('sess-1');
      vaultHasMock.mockResolvedValueOnce(false);
      getDashboardMock.mockImplementationOnce(async () => {
        callOrder.push('getDashboard');
        return {
          ok: true,
          billing: { active: true, plan: 'free', status: null, legacyFree: false, reason: null },
          apiKey: { hasKey: false, prefix: null },
          server: { online: false, url: '', provisioned: false },
        };
      });
      decideKeyActionMock.mockImplementationOnce(() => {
        callOrder.push('decideKeyAction');
        return 'mint';
      });
      mintKeyMock.mockImplementationOnce(async () => {
        callOrder.push('mintKey');
        return { ok: true, apiKey: 'liv_k_abcdef', prefix: 'liv_k_abc' };
      });

      const result = await handler({});

      expect(callOrder).toEqual(['getDashboard', 'decideKeyAction', 'mintKey']);
      expect(mintKeyMock).toHaveBeenCalledTimes(1);
      expect(mintKeyMock).toHaveBeenCalledWith('sess-1', 'generate-key');
      expect(mintKeyMock).not.toHaveBeenCalledWith(expect.anything(), 'regenerate-key');
      expect(vaultSetMock).toHaveBeenCalledWith('apiKey', 'liv_k_abcdef');
      expect(result).toEqual({ action: 'use-cached', prefix: 'liv_k_abc' });
    });

    it('does NOT call mintKey when decideKeyAction returns "use-cached"', async () => {
      const handler = getHandler(CHANNELS.authGetKeyAction)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      vaultHasMock.mockResolvedValueOnce(true);
      getDashboardMock.mockResolvedValueOnce({
        ok: true,
        billing: { active: true, plan: 'free', status: null, legacyFree: false, reason: null },
        apiKey: { hasKey: true, prefix: 'liv_k_abc' },
        server: { online: false, url: '', provisioned: false },
      });
      decideKeyActionMock.mockReturnValueOnce('use-cached');

      const result = await handler({});

      expect(mintKeyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ action: 'use-cached' });
    });

    it('handles "stale-reprompt" by clearing the vault apiKey and returning choice-screen, without calling mintKey', async () => {
      const handler = getHandler(CHANNELS.authGetKeyAction)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      vaultHasMock.mockResolvedValueOnce(true);
      getDashboardMock.mockResolvedValueOnce({
        ok: true,
        billing: { active: true, plan: 'free', status: null, legacyFree: false, reason: null },
        apiKey: { hasKey: false, prefix: null },
        server: { online: false, url: '', provisioned: false },
      });
      decideKeyActionMock.mockReturnValueOnce('stale-reprompt');

      const result = await handler({});

      expect(mintKeyMock).not.toHaveBeenCalled();
      expect(vaultDeleteMock).toHaveBeenCalledWith('apiKey');
      expect(result).toEqual({ action: 'choice-screen' });
    });

    it('resolves { action: "choice-screen" } WITHOUT throwing when getDashboard fails, and never calls decideKeyAction/mintKey (dashboard-failure guard)', async () => {
      const handler = getHandler(CHANNELS.authGetKeyAction)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      vaultHasMock.mockResolvedValueOnce(false);
      getDashboardMock.mockResolvedValueOnce({ ok: false, networkError: true });

      const result = await handler({});

      expect(result).toEqual({ action: 'choice-screen' });
      expect(decideKeyActionMock).not.toHaveBeenCalled();
      expect(mintKeyMock).not.toHaveBeenCalled();
    });
  });

  describe('auth:regenerateKey (the ONLY handler allowed to send regenerate-key)', () => {
    it('calls mintKey(session, "regenerate-key") and stores the new key on success', async () => {
      const handler = getHandler(CHANNELS.authRegenerateKey)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      mintKeyMock.mockResolvedValueOnce({ ok: true, apiKey: 'liv_k_new', prefix: 'liv_k_new' });

      const result = await handler({});

      expect(mintKeyMock).toHaveBeenCalledWith('sess-1', 'regenerate-key');
      expect(vaultSetMock).toHaveBeenCalledWith('apiKey', 'liv_k_new');
      expect(result).toEqual({ ok: true, prefix: 'liv_k_new' });
    });

    it('maps email_unverified/subscription_required failures through to the renderer', async () => {
      const handler = getHandler(CHANNELS.authRegenerateKey)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      mintKeyMock.mockResolvedValueOnce({ ok: false, reason: 'email_unverified' });

      const result = await handler({});

      expect(result).toEqual({ ok: false, reason: 'email_unverified' });
    });
  });

  describe('auth:probeKey', () => {
    it('rejects a malformed payload (missing key) WITHOUT calling probeKey', async () => {
      const handler = getHandler(CHANNELS.authProbeKey)!;

      const result = await handler({}, {});

      expect(probeKeyMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false });
    });

    it('stores the pasted key in the vault and returns { ok: true } on a valid probe', async () => {
      const handler = getHandler(CHANNELS.authProbeKey)!;
      probeKeyMock.mockResolvedValueOnce({ ok: true });

      const result = await handler({}, { key: 'liv_k_pasted' });

      expect(vaultSetMock).toHaveBeenCalledWith('apiKey', 'liv_k_pasted');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('auth:openExternal (enum-allowlisted, no raw renderer URL ever reaches shell.openExternal)', () => {
    it('maps "reset-password" to the fixed livinity.io URL', async () => {
      const handler = getHandler(CHANNELS.authOpenExternal)!;
      await handler({}, { target: 'reset-password' });
      expect(openExternalMock).toHaveBeenCalledWith('https://livinity.io/reset-password');
    });

    it('maps "pricing" to the fixed livinity.io URL', async () => {
      const handler = getHandler(CHANNELS.authOpenExternal)!;
      await handler({}, { target: 'pricing' });
      expect(openExternalMock).toHaveBeenCalledWith('https://livinity.io/pricing');
    });

    it('rejects an unknown target without ever calling shell.openExternal', async () => {
      const handler = getHandler(CHANNELS.authOpenExternal)!;
      openExternalMock.mockClear();

      await handler({}, { target: 'https://evil.example.com' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });
  });

  describe('auth:signOut / auth:getRoute / auth:chooseFree / auth:getAccount', () => {
    it('auth:signOut calls session-manager.signOut() and returns { ok: true }', async () => {
      const handler = getHandler(CHANNELS.authSignOut)!;

      const result = await handler({});

      expect(signOutMock).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('auth:getRoute delegates to validateSession()', async () => {
      const handler = getHandler(CHANNELS.authGetRoute)!;
      validateSessionMock.mockResolvedValueOnce({ kind: 'pro-wizard' });

      const result = await handler({});

      expect(result).toEqual({ kind: 'pro-wizard' });
    });

    it('auth:chooseFree calls chooseFree(session) and re-validates the route on success', async () => {
      const handler = getHandler(CHANNELS.authChooseFree)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      chooseFreeMock.mockResolvedValueOnce({ ok: true, free_byod: true });
      validateSessionMock.mockResolvedValueOnce({ kind: 'byod-wizard' });

      const result = await handler({});

      expect(chooseFreeMock).toHaveBeenCalledWith('sess-1');
      expect(result).toEqual({ ok: true, route: { kind: 'byod-wizard' } });
    });

    it('auth:chooseFree surfaces a has_paid_plan rejection without re-validating the route', async () => {
      const handler = getHandler(CHANNELS.authChooseFree)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      chooseFreeMock.mockResolvedValueOnce({ ok: false, reason: 'has_paid_plan' });

      const result = await handler({});

      expect(result).toEqual({ ok: false, reason: 'has_paid_plan' });
    });

    it('auth:getAccount returns null when signed out, and only safe email/username fields when signed in', async () => {
      const handler = getHandler(CHANNELS.authGetAccount)!;

      vaultGetMock.mockResolvedValueOnce(null);
      expect(await handler({})).toBe(null);

      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockResolvedValueOnce({
        ok: true,
        user: {
          userId: 'u1',
          username: 'bruce',
          email: 'a@b.co',
          emailVerified: true,
          is_admin: false,
          free_byod: true,
        },
      });
      expect(await handler({})).toEqual({ email: 'a@b.co', username: 'bruce' });
    });
  });
});
