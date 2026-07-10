import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * cf.ipc.test.ts mocks every orchestrator registerCfIpc composes (cf-verify,
 * cf-provision) plus the vault + auth-client the provision handler reads the
 * username from, and captures each ipcMain.handle registration by channel
 * string — the same captured-callback technique auth.ipc.test.ts uses, mirrored
 * here for the CF IPC boundary. deep-link is deliberately NOT mocked: it is a
 * pure, dependency-free URL builder, so the tests assert the enum handler opens
 * the EXACT frozen builder URL.
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

vi.mock('../../src/main/cloudflare/cf-verify', () => ({
  verifyAndProbe: vi.fn(),
  getZonesFromVault: vi.fn(),
  selectDomainProbe: vi.fn(),
  recheckZone: vi.fn(),
}));

vi.mock('../../src/main/cloudflare/cf-provision', () => ({
  provisionTunnelAndDns: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import {
  verifyAndProbe,
  getZonesFromVault,
  selectDomainProbe,
  recheckZone,
} from '../../src/main/cloudflare/cf-verify';
import { provisionTunnelAndDns } from '../../src/main/cloudflare/cf-provision';
import { buildTokenDeepLink, buildAddSiteDeepLink } from '../../src/main/cloudflare/deep-link';
import { vaultGet } from '../../src/main/storage/secrets-vault';
import { getMe } from '../../src/main/platform/auth-client';
import { registerCfIpc } from '../../src/main/ipc/cf.ipc';
import type { CfProvisionUpdate } from '../../shared/ipc-contract';

const verifyAndProbeMock = vi.mocked(verifyAndProbe);
const getZonesFromVaultMock = vi.mocked(getZonesFromVault);
const selectDomainProbeMock = vi.mocked(selectDomainProbe);
const recheckZoneMock = vi.mocked(recheckZone);
const provisionTunnelAndDnsMock = vi.mocked(provisionTunnelAndDns);
const vaultGetMock = vi.mocked(vaultGet);
const getMeMock = vi.mocked(getMe);

/**
 * Recursively scans a handler return value for any KEY that looks like a secret
 * (token/secret). The Cf* result schemas are secret-free by construction, so no
 * handler return may ever carry the CF token or the connector token (T-03-02).
 */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const signedInMe = {
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

// Mutable so a test can simulate both a live main window (webContents.send
// observable) and the null case (no window yet).
let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> } } | null = null;

describe('cf.ipc', () => {
  beforeAll(() => {
    registerCfIpc({ getMainWindow: () => mockWindow as never });
  });

  beforeEach(() => {
    verifyAndProbeMock.mockClear();
    getZonesFromVaultMock.mockClear();
    selectDomainProbeMock.mockClear();
    recheckZoneMock.mockClear();
    provisionTunnelAndDnsMock.mockClear();
    vaultGetMock.mockClear();
    getMeMock.mockClear();
    openExternalMock.mockClear();
    mockWindow = null;
  });

  describe('registration', () => {
    it('registers a handler for each of the 6 cf:* invoke channels', () => {
      for (const channel of [
        CHANNELS.cfVerifyToken,
        CHANNELS.cfGetZones,
        CHANNELS.cfSelectDomain,
        CHANNELS.cfRecheckZone,
        CHANNELS.cfProvision,
        CHANNELS.cfOpenExternal,
      ]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });

    it('does NOT register an invoke handler for the cf:provisionUpdate push channel (it is a main -> renderer send)', () => {
      expect(getHandler(CHANNELS.cfProvisionUpdate)).toBeUndefined();
      expect(handleMock).not.toHaveBeenCalledWith(CHANNELS.cfProvisionUpdate, expect.anything());
    });
  });

  describe('cf:verifyToken', () => {
    it('rejects a malformed payload (empty token) WITHOUT calling verifyAndProbe, returning a safe token-invalid default', async () => {
      const handler = getHandler(CHANNELS.cfVerifyToken)!;

      const result = await handler({}, { token: '' });

      expect(verifyAndProbeMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'token-invalid' });
    });

    it('delegates to verifyAndProbe with the pasted token and returns its verdict, never a secret', async () => {
      const handler = getHandler(CHANNELS.cfVerifyToken)!;
      verifyAndProbeMock.mockResolvedValueOnce({
        kind: 'verified',
        rows: [
          { scope: 'tunnel', ok: true },
          { scope: 'dns', ok: true },
          { scope: 'zone', ok: true },
        ],
      });

      const result = await handler({}, { token: 'cf-token-abc' });

      expect(verifyAndProbeMock).toHaveBeenCalledWith('cf-token-abc');
      expect(result).toMatchObject({ kind: 'verified' });
      expect(hasSecretKey(result)).toBe(false);
    });
  });

  describe('cf:getZones', () => {
    it('delegates to getZonesFromVault and returns its secret-free zone list', async () => {
      const handler = getHandler(CHANNELS.cfGetZones)!;
      getZonesFromVaultMock.mockResolvedValueOnce({
        ok: true,
        zones: [{ id: 'z1', name: 'example.com', status: 'active' }],
      });

      const result = await handler({});

      expect(getZonesFromVaultMock).toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true });
      expect(hasSecretKey(result)).toBe(false);
    });

    it('rejects a hostile stray payload with the safe union WITHOUT calling getZonesFromVault (IN-04)', async () => {
      const handler = getHandler(CHANNELS.cfGetZones)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(getZonesFromVaultMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, reason: 'network' });
    });
  });

  describe('cf:selectDomain', () => {
    it('rejects a malformed payload (missing subLabel) WITHOUT calling selectDomainProbe', async () => {
      const handler = getHandler(CHANNELS.cfSelectDomain)!;

      const result = await handler({}, { zoneId: 'z1' });

      expect(selectDomainProbeMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'network' });
    });

    it('delegates (zoneId, subLabel) to selectDomainProbe and returns its result', async () => {
      const handler = getHandler(CHANNELS.cfSelectDomain)!;
      selectDomainProbeMock.mockResolvedValueOnce({ kind: 'ready' });

      const result = await handler({}, { zoneId: 'z1', subLabel: 'home' });

      expect(selectDomainProbeMock).toHaveBeenCalledWith('z1', 'home');
      expect(result).toEqual({ kind: 'ready' });
    });
  });

  describe('cf:recheckZone', () => {
    it('rejects a malformed payload (missing zoneId) WITHOUT calling recheckZone', async () => {
      const handler = getHandler(CHANNELS.cfRecheckZone)!;

      const result = await handler({}, {});

      expect(recheckZoneMock).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'network' });
    });

    it('delegates to recheckZone and returns its result', async () => {
      const handler = getHandler(CHANNELS.cfRecheckZone)!;
      recheckZoneMock.mockResolvedValueOnce({ kind: 'pending', nameServers: ['ns1.example', 'ns2.example'] });

      const result = await handler({}, { zoneId: 'z1' });

      expect(recheckZoneMock).toHaveBeenCalledWith('z1');
      expect(result).toMatchObject({ kind: 'pending' });
    });
  });

  describe('cf:provision', () => {
    it('rejects a malformed payload (non-boolean takeOver) WITHOUT calling provisionTunnelAndDns', async () => {
      const handler = getHandler(CHANNELS.cfProvision)!;

      const result = await handler({}, { takeOver: 'yes' });

      expect(provisionTunnelAndDnsMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ kind: 'error' });
    });

    it('resolves the username main-side from the vault session and delegates to provisionTunnelAndDns, returning a secret-free summary', async () => {
      const handler = getHandler(CHANNELS.cfProvision)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockResolvedValueOnce(signedInMe);
      provisionTunnelAndDnsMock.mockResolvedValueOnce({
        kind: 'ready',
        summary: { address: 'home.example.com', tunnelName: 'bruce-box', recordsLabel: '1 DNS record + tunnel route' },
      });

      const result = await handler({}, { takeOver: false });

      expect(vaultGetMock).toHaveBeenCalledWith('session');
      expect(getMeMock).toHaveBeenCalledWith('sess-1');
      expect(provisionTunnelAndDnsMock).toHaveBeenCalledWith(
        { username: 'bruce', takeOver: false },
        expect.any(Function)
      );
      expect(result).toMatchObject({ kind: 'ready' });
      expect(hasSecretKey(result)).toBe(false);
    });

    it('resolves username to null when there is no vault session, without calling getMe', async () => {
      const handler = getHandler(CHANNELS.cfProvision)!;
      vaultGetMock.mockResolvedValueOnce(null);
      provisionTunnelAndDnsMock.mockResolvedValueOnce({ kind: 'network' });

      await handler({}, {});

      expect(getMeMock).not.toHaveBeenCalled();
      expect(provisionTunnelAndDnsMock).toHaveBeenCalledWith(
        { username: null, takeOver: undefined },
        expect.any(Function)
      );
    });

    it('forwards provisioning progress to the main window via CHANNELS.cfProvisionUpdate', async () => {
      const sendMock = vi.fn();
      mockWindow = { webContents: { send: sendMock } };
      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockResolvedValueOnce(signedInMe);
      let capturedOnUpdate: ((u: CfProvisionUpdate) => void) | undefined;
      provisionTunnelAndDnsMock.mockImplementationOnce(async (_input, onUpdate) => {
        capturedOnUpdate = onUpdate;
        return { kind: 'network' };
      });

      const handler = getHandler(CHANNELS.cfProvision)!;
      await handler({}, { takeOver: true });

      capturedOnUpdate!({ phase: 'tunnel' });
      expect(sendMock).toHaveBeenCalledWith(CHANNELS.cfProvisionUpdate, { phase: 'tunnel' });
    });

    it('does not throw when getMainWindow() returns null — progress forwarding is a no-op', async () => {
      mockWindow = null;
      vaultGetMock.mockResolvedValueOnce(null);
      let capturedOnUpdate: ((u: CfProvisionUpdate) => void) | undefined;
      provisionTunnelAndDnsMock.mockImplementationOnce(async (_input, onUpdate) => {
        capturedOnUpdate = onUpdate;
        return { kind: 'network' };
      });

      const handler = getHandler(CHANNELS.cfProvision)!;
      await handler({}, {});

      expect(() => capturedOnUpdate!({ phase: 'ingress' })).not.toThrow();
    });
  });

  describe('cf:openExternal (enum-allowlisted — no raw renderer URL ever reaches shell.openExternal)', () => {
    it('maps "token-form" to the fixed buildTokenDeepLink() URL', async () => {
      const handler = getHandler(CHANNELS.cfOpenExternal)!;

      await handler({}, { target: 'token-form' });

      expect(openExternalMock).toHaveBeenCalledWith(buildTokenDeepLink());
    });

    it('maps "add-site" to the fixed buildAddSiteDeepLink() URL', async () => {
      const handler = getHandler(CHANNELS.cfOpenExternal)!;

      await handler({}, { target: 'add-site' });

      expect(openExternalMock).toHaveBeenCalledWith(buildAddSiteDeepLink());
    });

    it('rejects a raw renderer-supplied URL without ever calling shell.openExternal', async () => {
      const handler = getHandler(CHANNELS.cfOpenExternal)!;

      await handler({}, { target: 'https://evil.example.com' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('only ever opens one of the two fixed builder URLs (never a renderer-controlled value)', async () => {
      const handler = getHandler(CHANNELS.cfOpenExternal)!;
      const allowed = new Set([buildTokenDeepLink(), buildAddSiteDeepLink()]);

      await handler({}, { target: 'token-form' });
      await handler({}, { target: 'add-site' });
      await handler({}, { target: 'javascript:alert(1)' });
      await handler({}, { target: 'file:///etc/passwd' });

      expect(openExternalMock).toHaveBeenCalledTimes(2);
      for (const call of openExternalMock.mock.calls) {
        expect(allowed.has(call[0] as string)).toBe(true);
      }
    });
  });

  describe('exception safety (T-03-16: no handler lets an exception cross the IPC boundary)', () => {
    it('cf:verifyToken survives verifyAndProbe throwing and returns { kind: "network" }, never rejects', async () => {
      const handler = getHandler(CHANNELS.cfVerifyToken)!;
      verifyAndProbeMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { token: 'cf-token-abc' })).resolves.toEqual({ kind: 'network' });
    });

    it('cf:getZones survives getZonesFromVault throwing and returns { ok:false, reason:"network" }', async () => {
      const handler = getHandler(CHANNELS.cfGetZones)!;
      getZonesFromVaultMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({})).resolves.toEqual({ ok: false, reason: 'network' });
    });

    it('cf:selectDomain survives selectDomainProbe throwing and returns { kind: "network" }', async () => {
      const handler = getHandler(CHANNELS.cfSelectDomain)!;
      selectDomainProbeMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { zoneId: 'z1', subLabel: 'home' })).resolves.toEqual({ kind: 'network' });
    });

    it('cf:recheckZone survives recheckZone throwing and returns { kind: "network" }', async () => {
      const handler = getHandler(CHANNELS.cfRecheckZone)!;
      recheckZoneMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { zoneId: 'z1' })).resolves.toEqual({ kind: 'network' });
    });

    it('cf:provision survives provisionTunnelAndDns throwing and returns { kind:"error", reason:"internal_error" }', async () => {
      const handler = getHandler(CHANNELS.cfProvision)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockResolvedValueOnce(signedInMe);
      provisionTunnelAndDnsMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { takeOver: false })).resolves.toEqual({
        kind: 'error',
        reason: 'internal_error',
      });
    });

    it('cf:provision survives getMe throwing (session read) and returns a safe error union', async () => {
      const handler = getHandler(CHANNELS.cfProvision)!;
      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, {})).resolves.toEqual({ kind: 'error', reason: 'internal_error' });
      expect(provisionTunnelAndDnsMock).not.toHaveBeenCalled();
    });

    it('cf:openExternal survives shell.openExternal throwing and never rejects', async () => {
      const handler = getHandler(CHANNELS.cfOpenExternal)!;
      openExternalMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { target: 'token-form' })).resolves.toBeUndefined();
    });
  });

  describe('no-secret-in-response (T-03-02: the CF token / connector token never return across IPC)', () => {
    it('no cf:* handler return value carries a token/secret-named field', async () => {
      verifyAndProbeMock.mockResolvedValueOnce({
        kind: 'verified',
        rows: [
          { scope: 'tunnel', ok: true },
          { scope: 'dns', ok: true },
          { scope: 'zone', ok: true },
        ],
      });
      getZonesFromVaultMock.mockResolvedValueOnce({
        ok: true,
        zones: [{ id: 'z1', name: 'example.com', status: 'active' }],
      });
      selectDomainProbeMock.mockResolvedValueOnce({ kind: 'ready' });
      recheckZoneMock.mockResolvedValueOnce({ kind: 'active' });
      vaultGetMock.mockResolvedValueOnce('sess-1');
      getMeMock.mockResolvedValueOnce(signedInMe);
      provisionTunnelAndDnsMock.mockResolvedValueOnce({
        kind: 'ready',
        summary: { address: 'home.example.com', tunnelName: 'bruce-box', recordsLabel: '1 DNS record + tunnel route' },
      });

      const results = [
        await getHandler(CHANNELS.cfVerifyToken)!({}, { token: 'cf-token-abc' }),
        await getHandler(CHANNELS.cfGetZones)!({}),
        await getHandler(CHANNELS.cfSelectDomain)!({}, { zoneId: 'z1', subLabel: 'home' }),
        await getHandler(CHANNELS.cfRecheckZone)!({}, { zoneId: 'z1' }),
        await getHandler(CHANNELS.cfProvision)!({}, { takeOver: false }),
      ];

      for (const result of results) {
        expect(hasSecretKey(result)).toBe(false);
      }
    });
  });
});
