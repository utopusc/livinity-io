import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * connected-probe.test.ts mocks every real-module collaborator
 * (wsl-exec/state-store/secrets-vault/auth-client/log) at the module level
 * so importing connected-probe.ts never touches a real wsl.exe spawn, the
 * DPAPI vault, disk, or the network -- mirrors cf-provision.test.ts's/
 * install-invoke.test.ts's mocking discipline. Every test additionally
 * injects its own collaborators + a TINY timing window via the `deps`
 * parameter (execWsl/fetch/readState/vaultGet/getMe/maxWaitMs/pollMs/
 * reachMaxWaitMs/reachPollMs) so the bounded-retry probes resolve in
 * milliseconds, never the real 15s/20s production windows.
 */

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execWsl: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
}));

import {
  isInstalledAndHealthy,
  deriveAddress,
  runConnectedProbe,
} from '../../src/main/orchestrator/connected-probe';

/** Tiny timing window shared by every bounded-retry test -- keeps the suite fast. */
const FAST_TIMING = { maxWaitMs: 30, pollMs: 10, reachMaxWaitMs: 30, reachPollMs: 10 };

describe('connected-probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isInstalledAndHealthy (D-03 fast-path)', () => {
    it('returns true on the first poll when execWsl exits 0', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const result = await isInstalledAndHealthy({ execWsl, ...FAST_TIMING });
      expect(result).toBe(true);
      expect(execWsl).toHaveBeenCalledTimes(1);
      const [args] = execWsl.mock.calls[0];
      expect(args).toEqual(
        expect.arrayContaining(['-d', 'livinity', '-u', 'root', '--', 'bash', '-lc'])
      );
      expect(args.join(' ')).toContain('systemctl is-active --quiet livos.service');
      expect(args.join(' ')).toContain('127.0.0.1:8080/');
    });

    it('returns false (bounded, does not hang) when execWsl never exits 0 within the window', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: '' });
      const start = Date.now();
      const result = await isInstalledAndHealthy({ execWsl, ...FAST_TIMING });
      const elapsed = Date.now() - start;
      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(2000);
      expect(execWsl.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('degrades to false (never throws) when execWsl rejects -- a probe glitch never false-blocks', async () => {
      const execWsl = vi.fn().mockRejectedValue(new Error('spawn failure'));
      const result = await isInstalledAndHealthy({ execWsl, ...FAST_TIMING });
      expect(result).toBe(false);
    });
  });

  describe('deriveAddress', () => {
    it('returns `${subLabel}.${zoneName}` when both are already persisted (free/BYOD)', async () => {
      const readState = vi.fn().mockResolvedValue({
        version: 1,
        currentStep: 'x',
        subLabel: 'liv',
        zoneName: 'example.com',
      });
      const vaultGet = vi.fn();
      const getMe = vi.fn();
      const address = await deriveAddress({ readState, vaultGet, getMe });
      expect(address).toBe('liv.example.com');
      expect(vaultGet).not.toHaveBeenCalled();
      expect(getMe).not.toHaveBeenCalled();
    });

    it('falls back to `${username}.livinity.io` via vaultGet(session)+getMe when subLabel/zoneName are absent (Pro/legacy)', async () => {
      const readState = vi.fn().mockResolvedValue({ version: 1, currentStep: 'x' });
      const vaultGet = vi.fn().mockResolvedValue('fake-session-cookie');
      const getMe = vi.fn().mockResolvedValue({
        ok: true,
        user: {
          userId: 'u1',
          username: 'bruce',
          email: 'b@example.com',
          emailVerified: true,
          is_admin: false,
          free_byod: false,
        },
      });
      const address = await deriveAddress({ readState, vaultGet, getMe });
      expect(address).toBe('bruce.livinity.io');
      expect(vaultGet).toHaveBeenCalledWith('session');
    });

    it('returns null when there is no session (never calls getMe)', async () => {
      const readState = vi.fn().mockResolvedValue(null);
      const vaultGet = vi.fn().mockResolvedValue(null);
      const getMe = vi.fn();
      const address = await deriveAddress({ readState, vaultGet, getMe });
      expect(address).toBeNull();
      expect(getMe).not.toHaveBeenCalled();
    });

    it('returns null when getMe resolves ok:false', async () => {
      const readState = vi.fn().mockResolvedValue(null);
      const vaultGet = vi.fn().mockResolvedValue('fake-session-cookie');
      const getMe = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      const address = await deriveAddress({ readState, vaultGet, getMe });
      expect(address).toBeNull();
    });

    it('degrades to null (never throws) when a collaborator rejects', async () => {
      const readState = vi.fn().mockRejectedValue(new Error('disk error'));
      const address = await deriveAddress({ readState });
      expect(address).toBeNull();
    });
  });

  describe('runConnectedProbe (D-05 three-probe verdict)', () => {
    it('probe1 ok + probe2 (fetch 200) ok -> connected, with the derived address', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const fetch = vi.fn().mockResolvedValue(true);
      const readState = vi
        .fn()
        .mockResolvedValue({ version: 1, currentStep: 'x', subLabel: 'liv', zoneName: 'example.com' });
      const result = await runConnectedProbe({ execWsl, fetch, readState, ...FAST_TIMING });
      expect(result).toEqual({ kind: 'connected', address: 'liv.example.com' });
      expect(fetch).toHaveBeenCalledWith('https://liv.example.com/');
    });

    it('probe1 fails -> still-confirming, and fetch is NEVER called (cheap-first ordering)', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: '' });
      const fetch = vi.fn().mockResolvedValue(true);
      const readState = vi
        .fn()
        .mockResolvedValue({ version: 1, currentStep: 'x', subLabel: 'liv', zoneName: 'example.com' });
      const result = await runConnectedProbe({ execWsl, fetch, readState, ...FAST_TIMING });
      expect(result).toEqual({ kind: 'still-confirming', address: 'liv.example.com' });
      expect(fetch).toHaveBeenCalledTimes(0);
    });

    it('probe1 ok + probe2 never 200 within the bounded window -> still-confirming (honest fallback, never blocks)', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const fetch = vi.fn().mockResolvedValue(false);
      const readState = vi
        .fn()
        .mockResolvedValue({ version: 1, currentStep: 'x', subLabel: 'liv', zoneName: 'example.com' });
      const start = Date.now();
      const result = await runConnectedProbe({ execWsl, fetch, readState, ...FAST_TIMING });
      const elapsed = Date.now() - start;
      expect(result).toEqual({ kind: 'still-confirming', address: 'liv.example.com' });
      expect(elapsed).toBeLessThan(2000);
      expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('a fetch that throws degrades to still-confirming (never throws, never false-blocks)', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const fetch = vi.fn().mockRejectedValue(new Error('network blip'));
      const readState = vi
        .fn()
        .mockResolvedValue({ version: 1, currentStep: 'x', subLabel: 'liv', zoneName: 'example.com' });
      await expect(
        runConnectedProbe({ execWsl, fetch, readState, ...FAST_TIMING })
      ).resolves.toEqual({ kind: 'still-confirming', address: 'liv.example.com' });
    });

    it('a null address (no state, no session) still yields a valid still-confirming verdict', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: '' });
      const fetch = vi.fn();
      const readState = vi.fn().mockResolvedValue(null);
      const vaultGet = vi.fn().mockResolvedValue(null);
      const result = await runConnectedProbe({ execWsl, fetch, readState, vaultGet, ...FAST_TIMING });
      expect(result).toEqual({ kind: 'still-confirming', address: null });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('a null address on an otherwise-healthy box never calls fetch and returns still-confirming', async () => {
      const execWsl = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const fetch = vi.fn();
      const readState = vi.fn().mockResolvedValue(null);
      const vaultGet = vi.fn().mockResolvedValue(null);
      const result = await runConnectedProbe({ execWsl, fetch, readState, vaultGet, ...FAST_TIMING });
      expect(result).toEqual({ kind: 'still-confirming', address: null });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
