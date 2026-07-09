import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { logSafe } from '../../src/main/log';
import { callCf, shouldRetry, CfApiError, CF_API_BASE } from '../../src/main/cloudflare/cf-http';

const logSafeMock = vi.mocked(logSafe);

/** Builds a minimal Response-shaped mock: .text() + .ok/.status + headers.get(name). */
function mockRes(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

/** A CF success envelope wrapping `result`. */
function ok<T>(result: T): unknown {
  return { success: true, errors: [], messages: [], result };
}

/** A CF failure envelope carrying a CF error code + message. */
function fail(code: number, message: string): unknown {
  return { success: false, errors: [{ code, message }], messages: [], result: null };
}

describe('cf-http', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logSafeMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('CF_API_BASE is the hardcoded v4 HTTPS literal', () => {
    expect(CF_API_BASE).toBe('https://api.cloudflare.com/client/v4');
  });

  describe('shouldRetry', () => {
    it('never retries the terminal auth/scope/not-found statuses', () => {
      expect(shouldRetry(401)).toBe(false);
      expect(shouldRetry(403)).toBe(false);
      expect(shouldRetry(404)).toBe(false);
    });

    it('retries 429 and every 5xx', () => {
      expect(shouldRetry(429)).toBe(true);
      expect(shouldRetry(500)).toBe(true);
      expect(shouldRetry(503)).toBe(true);
      expect(shouldRetry(599)).toBe(true);
    });

    it('retries network error codes (ECONNRESET/ETIMEDOUT) irrespective of status', () => {
      expect(shouldRetry(0, 'ECONNRESET')).toBe(true);
      expect(shouldRetry(0, 'ETIMEDOUT')).toBe(true);
      expect(shouldRetry(0, 'EAI_AGAIN')).toBe(true);
      expect(shouldRetry(0, 'NOPE')).toBe(false);
    });
  });

  describe('callCf', () => {
    it('returns json.result on a 2xx success envelope and sends a Bearer header to the hardcoded base', async () => {
      fetchMock.mockResolvedValueOnce(mockRes(200, ok({ hello: 'world' })));

      const result = await callCf<{ hello: string }>('tok', { method: 'GET', path: '/zones' });

      expect(result).toEqual({ hello: 'world' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
    });

    it('throws a CfApiError carrying status + cfErrorCode + endpoint on a 401, WITHOUT retrying', async () => {
      fetchMock.mockResolvedValue(mockRes(401, fail(9109, 'Invalid API token')));

      const err = await callCf('tok', { method: 'GET', path: '/zones' }).catch((e) => e);

      expect(err).toBeInstanceOf(CfApiError);
      expect(err).toMatchObject({ status: 401, cfErrorCode: 9109, endpoint: 'GET /zones' });
      expect(fetchMock).toHaveBeenCalledTimes(1); // no-retry on 401
    });

    it('does not retry a 403 (scope-missing is terminal)', async () => {
      fetchMock.mockResolvedValue(mockRes(403, fail(9109, 'Actor lacks permission')));

      const err = await callCf('tok', { method: 'GET', path: '/accounts/a1/cfd_tunnel' }).catch((e) => e);

      expect(err).toBeInstanceOf(CfApiError);
      expect(err).toMatchObject({ status: 403 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a 404 (not-found is terminal)', async () => {
      fetchMock.mockResolvedValue(mockRes(404, fail(1000, 'not found')));

      const err = await callCf('tok', { method: 'GET', path: '/zones/z1' }).catch((e) => e);

      expect(err).toMatchObject({ status: 404 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a 9109 error code alone is surfaced as status+code and is NOT re-interpreted as a scope verdict', async () => {
      fetchMock.mockResolvedValue(mockRes(403, fail(9109, 'overloaded code')));

      const err = await callCf('tok', { method: 'GET', path: '/zones' }).catch((e) => e);

      expect(err).toMatchObject({ status: 403, cfErrorCode: 9109 });
      // callCf does not classify scopes — no verdict fields leak out of the transport.
      expect(err).not.toHaveProperty('verdict');
      expect(err).not.toHaveProperty('scope');
    });

    it('retries a 429 up to MAX_RETRIES then throws', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(mockRes(429, fail(10000, 'rate limited')));

      const promise = callCf('tok', { method: 'GET', path: '/zones' });
      const expectation = expect(promise).rejects.toBeInstanceOf(CfApiError);
      await vi.runAllTimersAsync();
      await expectation;

      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('retries a 5xx then succeeds when a later attempt returns 200', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(mockRes(500, fail(0, 'server error')))
        .mockResolvedValueOnce(mockRes(200, ok({ recovered: true })));

      const promise = callCf<{ recovered: boolean }>('tok', { method: 'GET', path: '/zones' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a thrown network error then throws a CfApiError with status:0', async () => {
      vi.useFakeTimers();
      fetchMock.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));

      const promise = callCf('tok', { method: 'GET', path: '/zones' });
      const expectation = expect(promise).rejects.toMatchObject({ status: 0 });
      await vi.runAllTimersAsync();
      await expectation;

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('never leaks the token into the thrown error or any logSafe call', async () => {
      const TOKEN = 'liv_k_super_secret_token_value_abcdef 1234567890';
      fetchMock.mockResolvedValue(mockRes(403, fail(9109, 'no perms')));

      const err = (await callCf(TOKEN, { method: 'GET', path: '/zones' }).catch((e) => e)) as CfApiError & Error;

      // The endpoint is path-only; the token is nowhere in the serialized error.
      expect(err.endpoint).toBe('GET /zones');
      const serialized = JSON.stringify(err) + String(err) + err.message + (err.stack ?? '');
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain('Bearer');

      // Nor in any log line.
      for (const call of logSafeMock.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      }
    });
  });
});
