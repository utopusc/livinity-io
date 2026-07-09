import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * session-manager.ts composes a REAL vault (secrets-vault.ts, against a
 * temp-dir vault.bin — same convention as tests/secrets-vault.test.ts) with a
 * MOCKED auth-client (getMe/getDashboard) so the 401-vs-network split (D-06/
 * D-12) can be asserted against real vault reads/writes without a live
 * network call. decideRoute (./decide-route) is left real — it's pure.
 */

let currentVaultDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => currentVaultDir },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('ENC:' + s)),
    decryptString: vi.fn((b: Buffer) => {
      const str = b.toString();
      if (!str.startsWith('ENC:')) throw new Error('bad ciphertext');
      return str.slice('ENC:'.length);
    }),
  },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
  getDashboard: vi.fn(),
}));

import { getMe, getDashboard } from '../../src/main/platform/auth-client';
import { vaultSet, vaultHas } from '../../src/main/storage/secrets-vault';
import { validateSession, signOut } from '../../src/main/platform/session-manager';

const getMeMock = vi.mocked(getMe);
const getDashboardMock = vi.mocked(getDashboard);

describe('session-manager', () => {
  beforeEach(async () => {
    currentVaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'liv-session-'));
    getMeMock.mockReset();
    getDashboardMock.mockReset();
  });

  afterEach(async () => {
    await fs.rm(currentVaultDir, { recursive: true, force: true });
  });

  describe('validateSession', () => {
    it('returns { kind: "login" } and never calls getMe when no vault session exists', async () => {
      const result = await validateSession();

      expect(result).toEqual({ kind: 'login' });
      expect(getMeMock).not.toHaveBeenCalled();
    });

    it('routes to byod-wizard when getMe/getDashboard both resolve ok (decideRoute wired)', async () => {
      await vaultSet('session', 'sess-abc');
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
      getDashboardMock.mockResolvedValueOnce({
        ok: true,
        billing: { active: true, plan: 'free', status: null, legacyFree: false, reason: null },
        apiKey: { hasKey: false, prefix: null },
        server: { online: false, url: '', provisioned: false },
      });

      const result = await validateSession();

      expect(result).toEqual({ kind: 'byod-wizard' });
    });

    it('on getMe 401: clears the vault session AND apiKey, and returns { kind: "login", expired: true } (D-06, CR-01)', async () => {
      await vaultSet('session', 'sess-abc');
      await vaultSet('apiKey', 'liv_k_stale_a');
      getMeMock.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await validateSession();

      expect(result).toEqual({ kind: 'login', expired: true });
      expect(await vaultHas('session')).toBe(false);
      expect(await vaultHas('apiKey')).toBe(false);
      expect(getDashboardMock).not.toHaveBeenCalled();
    });

    it('on getDashboard 401: clears the vault session AND apiKey, and returns { kind: "login", expired: true } (D-06, CR-01)', async () => {
      await vaultSet('session', 'sess-abc');
      await vaultSet('apiKey', 'liv_k_stale_a');
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
      getDashboardMock.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await validateSession();

      expect(result).toEqual({ kind: 'login', expired: true });
      expect(await vaultHas('session')).toBe(false);
      expect(await vaultHas('apiKey')).toBe(false);
    });

    it('on getMe network error: returns { kind: "error", reason: "network" } and leaves the vault UNTOUCHED (D-12, Pitfall 3)', async () => {
      await vaultSet('session', 'sess-abc');
      getMeMock.mockResolvedValueOnce({ ok: false, networkError: true });

      const result = await validateSession();

      expect(result).toEqual({ kind: 'error', reason: 'network' });
      expect(await vaultHas('session')).toBe(true);
      expect(getDashboardMock).not.toHaveBeenCalled();
    });

    it('on getDashboard network error: returns { kind: "error", reason: "network" } and leaves the vault UNTOUCHED (D-12, Pitfall 3)', async () => {
      await vaultSet('session', 'sess-abc');
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
      getDashboardMock.mockResolvedValueOnce({ ok: false, networkError: true });

      const result = await validateSession();

      expect(result).toEqual({ kind: 'error', reason: 'network' });
      expect(await vaultHas('session')).toBe(true);
    });
  });

  describe('signOut', () => {
    it('clears the vault session — no OAuth partition to clear post-pivot', async () => {
      await vaultSet('session', 'sess-abc');

      await signOut();

      expect(await vaultHas('session')).toBe(false);
    });

    it('also clears the cached apiKey (CR-01) — a key must never outlive its owning session', async () => {
      await vaultSet('session', 'sess-abc');
      await vaultSet('apiKey', 'liv_k_stale_a');

      await signOut();

      expect(await vaultHas('session')).toBe(false);
      expect(await vaultHas('apiKey')).toBe(false);
    });
  });
});
