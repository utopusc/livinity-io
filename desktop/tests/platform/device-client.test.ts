import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * device-client.test.ts drives the whole register -> openExternal -> poll ->
 * exchange -> vault -> wrong-account-guard state machine against a
 * vi.stubGlobal('fetch', ...) mock, with an injected instant `sleep` so the
 * 5s poll interval never actually waits in the test run. shell.openExternal,
 * vaultSet, getMe, and validateSession are all mocked -- this file never
 * touches a real Electron process, a live server, or a credential.
 */

const openExternalMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  shell: { openExternal: (...args: unknown[]) => openExternalMock(...args) },
  app: { getVersion: () => '0.1.0' },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultSet: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
}));

vi.mock('../../src/main/platform/session-manager', () => ({
  validateSession: vi.fn(),
}));

import { logSafe } from '../../src/main/log';
import { vaultSet } from '../../src/main/storage/secrets-vault';
import { getMe } from '../../src/main/platform/auth-client';
import { validateSession } from '../../src/main/platform/session-manager';
import { startDeviceLogin, cancelDeviceLogin } from '../../src/main/platform/device-client';

const logSafeMock = vi.mocked(logSafe);
const vaultSetMock = vi.mocked(vaultSet);
const getMeMock = vi.mocked(getMe);
const validateSessionMock = vi.mocked(validateSession);

/** Builds a minimal Response-shaped mock: .json() + .ok/.status. */
function mockResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const REGISTER_OK = {
  device_code: 'dc-1',
  user_code: 'ABCD-2345',
  verification_uri: 'https://livinity.io/device',
  expires_in: 900,
  interval: 5,
};

const instantSleep = () => Promise.resolve();

/** Drains pending microtasks across several real macrotask boundaries so a
 * fire-and-forget background poll loop (never awaited directly by the
 * caller, by design) has a chance to fully settle before assertions run. */
async function flushAsync(cycles = 30): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('device-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    openExternalMock.mockClear();
    logSafeMock.mockClear();
    vaultSetMock.mockClear();
    getMeMock.mockClear();
    validateSessionMock.mockClear();
  });

  afterEach(async () => {
    // Ensure no test leaves a background poll loop running into the next
    // test's module state (inFlight is module-level, shared across tests).
    cancelDeviceLogin();
    await flushAsync();
    vi.unstubAllGlobals();
  });

  it('registers, resolves ok:true with the userCode/expiresInMs, and opens the system browser at the fixed encoded deep link', async () => {
    // Default fallback for the background poll loop's next call (fire-and-
    // forget by design — it keeps running after this test's own
    // assertions). afterEach cancels + flushes it before the next test.
    fetchMock.mockResolvedValue(mockResponse(400, { error: 'authorization_pending' }));
    fetchMock.mockResolvedValueOnce(mockResponse(200, REGISTER_OK));

    const onUpdate = vi.fn();
    const result = await startDeviceLogin(onUpdate, { sleep: instantSleep });

    expect(result).toEqual({ ok: true, userCode: 'ABCD-2345', expiresInMs: 900000 });
    expect(openExternalMock).toHaveBeenCalledWith('https://livinity.io/device?code=ABCD-2345');
  });

  it('polls authorization_pending twice, then exchanges on a 200 access_token and reports approved exactly once', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(mockResponse(400, { error: 'authorization_pending' }))
      .mockResolvedValueOnce(mockResponse(400, { error: 'authorization_pending' }))
      .mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 86400 })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          success: true,
          session_token: 'sess-new',
          user: { id: 'u1', username: 'alice', email: 'a@b.co', emailVerified: true },
        })
      );
    validateSessionMock.mockResolvedValueOnce({ kind: 'byod-wizard' });
    getMeMock.mockResolvedValueOnce({
      ok: true,
      user: {
        userId: 'u1',
        username: 'alice',
        email: 'a@b.co',
        emailVerified: true,
        is_admin: false,
        free_byod: true,
      },
    });

    const onUpdate = vi.fn();
    const result = await startDeviceLogin(onUpdate, { sleep: instantSleep });
    expect(result.ok).toBe(true);

    await flushAsync();

    expect(vaultSetMock).toHaveBeenCalledWith('session', 'sess-new');
    expect(onUpdate).toHaveBeenCalledWith({ phase: 'waiting' });
    expect(onUpdate).toHaveBeenCalledWith({
      phase: 'approved',
      route: { kind: 'byod-wizard' },
      account: { email: 'a@b.co', username: 'alice' },
    });
    const approvedCalls = onUpdate.mock.calls.filter(([u]) => u.phase === 'approved');
    expect(approvedCalls).toHaveLength(1);
  });

  it('reports expired and stops polling on expired_token, without ever calling exchange', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(mockResponse(400, { error: 'expired_token' }));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'expired' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('reports a network error when a poll fetch throws, and never touches the vault', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'error', reason: 'network' });
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('reports already_exchanged on a 409 exchange response, and never writes the vault', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 86400 })
      )
      .mockResolvedValueOnce(mockResponse(409, { error: 'already_exchanged' }));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'error', reason: 'already_exchanged' });
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('reports session_revoked on a 401 exchange response carrying that error code', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 86400 })
      )
      .mockResolvedValueOnce(mockResponse(401, { error: 'session_revoked' }));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'error', reason: 'session_revoked' });
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('reports exchange_failed on a 401 exchange response with an unrecognized error code (e.g. invalid_token)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 86400 })
      )
      .mockResolvedValueOnce(mockResponse(401, { error: 'invalid_token' }));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'error', reason: 'exchange_failed' });
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('stops polling and reports cancelled after cancelDeviceLogin() is called, and never proceeds to exchange', async () => {
    // A single in-flight poll tick can already be underway (fire-and-forget
    // background loop) by the time this test's own continuation resumes and
    // calls cancelDeviceLogin() -- the default fallback keeps that one
    // straggler call harmless instead of crashing on an unmocked response.
    fetchMock.mockResolvedValue(mockResponse(400, { error: 'authorization_pending' }));
    fetchMock.mockResolvedValueOnce(mockResponse(200, REGISTER_OK));

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    cancelDeviceLogin();
    await flushAsync();

    expect(onUpdate).toHaveBeenCalledWith({ phase: 'cancelled' });
    expect(vaultSetMock).not.toHaveBeenCalled();
    // Cancellation must land before the loop ever reaches the exchange step.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/device/exchange'))
    ).toBe(false);
  });

  it('rejects a second startDeviceLogin while one is already running, without a duplicate register call', async () => {
    fetchMock.mockResolvedValue(mockResponse(400, { error: 'authorization_pending' }));
    fetchMock.mockResolvedValueOnce(mockResponse(200, REGISTER_OK));

    const onUpdate = vi.fn();
    const first = await startDeviceLogin(onUpdate, { sleep: instantSleep });
    expect(first.ok).toBe(true);

    const second = await startDeviceLogin(vi.fn(), { sleep: instantSleep });

    expect(second).toEqual({ ok: false, reason: 'already_running' });
    // Assert no DUPLICATE register call -- the background poll loop from
    // the first call may independently fire additional /token calls on its
    // own timing, which is not what this test is verifying.
    const registerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/device/register')
    );
    expect(registerCalls).toHaveLength(1);
  });

  it('returns { ok:false, reason:"network" } when the register fetch throws, without opening the browser', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await startDeviceLogin(vi.fn(), { sleep: instantSleep });

    expect(result).toEqual({ ok: false, reason: 'network' });
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('never passes the access_token or the session_token to onUpdate or to any logSafe call', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, REGISTER_OK))
      .mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-secret-value', token_type: 'Bearer', expires_in: 86400 })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          success: true,
          session_token: 'sess-secret-value',
          user: { id: 'u1', username: null, email: 'a@b.co', emailVerified: true },
        })
      );
    validateSessionMock.mockResolvedValueOnce({ kind: 'pro-wizard' });
    getMeMock.mockResolvedValueOnce({
      ok: true,
      user: {
        userId: 'u1',
        username: null,
        email: 'a@b.co',
        emailVerified: true,
        is_admin: false,
        free_byod: false,
      },
    });

    const onUpdate = vi.fn();
    await startDeviceLogin(onUpdate, { sleep: instantSleep });
    await flushAsync();

    for (const [update] of onUpdate.mock.calls) {
      expect(JSON.stringify(update)).not.toContain('jwt-secret-value');
      expect(JSON.stringify(update)).not.toContain('sess-secret-value');
    }
    for (const call of logSafeMock.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('jwt-secret-value');
      expect(JSON.stringify(call)).not.toContain('sess-secret-value');
    }
  });
});
