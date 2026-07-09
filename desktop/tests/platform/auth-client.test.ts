import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

import { extractSessionCookie, PLATFORM_URL } from '../../src/main/platform/http-client';
import { login, getMe, getDashboard, chooseFree, mintKey, probeKey } from '../../src/main/platform/auth-client';

/** Builds a minimal Response-shaped mock: .json() + .ok/.status + headers.getSetCookie(). */
function mockResponse(status: number, body: unknown, setCookie: string[] = []): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { getSetCookie: () => setCookie },
  } as unknown as Response;
}

describe('http-client', () => {
  describe('extractSessionCookie', () => {
    it('extracts the liv_session value from a Set-Cookie header list', () => {
      expect(extractSessionCookie(['liv_session=SESS48; Path=/; HttpOnly'])).toBe('SESS48');
    });

    it('returns null when no liv_session cookie is present', () => {
      expect(extractSessionCookie(['other=value; Path=/'])).toBe(null);
    });
  });

  it('PLATFORM_URL is the hardcoded HTTPS livinity.io literal', () => {
    expect(PLATFORM_URL).toBe('https://livinity.io');
  });
});

describe('auth-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('login', () => {
    it('returns { ok:true, sessionValue, user } on 200 and sends POST/json/body', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          200,
          { success: true, user: { id: 'u1', username: null, email: 'a@b.co', emailVerified: true } },
          ['liv_session=SESS48; Path=/; HttpOnly']
        )
      );

      const result = await login('a@b.co', 'pw');

      expect(result).toEqual({
        ok: true,
        sessionValue: 'SESS48',
        user: { id: 'u1', username: null, email: 'a@b.co', emailVerified: true },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://livinity.io/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ email: 'a@b.co', password: 'pw' }),
        })
      );
    });

    it('returns { ok:false, status:401, error } on invalid credentials (does not throw)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { error: 'Invalid email or password' }));

      const result = await login('a@b.co', 'wrong');

      expect(result).toEqual({ ok: false, status: 401, error: 'Invalid email or password' });
    });

    it('returns { ok:false, status:400, error } on missing fields', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(400, { error: 'Email and password are required' }));

      const result = await login('', '');

      expect(result).toEqual({ ok: false, status: 400, error: 'Email and password are required' });
    });

    it('returns { ok:false, networkError:true } when fetch() rejects — NOT a status', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await login('a@b.co', 'pw');

      expect(result).toEqual({ ok: false, networkError: true });
    });
  });

  describe('getMe', () => {
    it('attaches Cookie: liv_session=<value> and returns { ok:true, user } on 200', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          user: {
            userId: 'u1',
            username: 'alice',
            email: 'a@b.co',
            emailVerified: true,
            is_admin: false,
            free_byod: true,
          },
        })
      );

      const result = await getMe('SESS48');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://livinity.io/api/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({ Cookie: 'liv_session=SESS48' }),
        })
      );
      expect(result).toEqual({
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
    });

    it('returns { ok:false, status:401 } when the session cookie is missing/invalid ({user:null} body)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { user: null }));

      const result = await getMe('bad-session');

      expect(result).toEqual({ ok: false, status: 401 });
    });
  });

  describe('getDashboard', () => {
    it('returns parsed billing/apiKey/server on 200', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          billing: { active: true, plan: 'active', status: 'active', legacyFree: false, reason: null },
          apiKey: { hasKey: true, prefix: 'liv_k_abc' },
          server: { online: true, url: 'https://alice.livinity.io', provisioned: true },
        })
      );

      const result = await getDashboard('SESS48');

      expect(result).toEqual({
        ok: true,
        billing: { active: true, plan: 'active', status: 'active', legacyFree: false, reason: null },
        apiKey: { hasKey: true, prefix: 'liv_k_abc' },
        server: { online: true, url: 'https://alice.livinity.io', provisioned: true },
      });
    });

    it('returns { ok:false, status:401 } on unauthorized', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { error: 'Unauthorized' }));

      const result = await getDashboard('bad-session');

      expect(result).toEqual({ ok: false, status: 401 });
    });

    it('returns { ok:false, networkError:true } when fetch() rejects', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await getDashboard('SESS48');

      expect(result).toEqual({ ok: false, networkError: true });
    });
  });

  describe('chooseFree', () => {
    it('returns { ok:true, free_byod:true } on 200 success', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { ok: true, free_byod: true }));

      const result = await chooseFree('SESS48');

      expect(result).toEqual({ ok: true, free_byod: true });
    });

    it('returns { ok:false, reason:"has_paid_plan" } on the 200 guard shape (never downgrades a payer)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { ok: false, reason: 'has_paid_plan', free_byod: false })
      );

      const result = await chooseFree('SESS48');

      expect(result).toEqual({ ok: false, reason: 'has_paid_plan' });
    });

    it('returns { ok:false, reason:"not_signed_in" } on 401', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { ok: false, error: 'Not signed in' }));

      const result = await chooseFree('bad-session');

      expect(result).toEqual({ ok: false, reason: 'not_signed_in' });
    });

    it('returns { ok:false, reason:"unavailable" } on 503', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(503, { ok: false, error: 'Free tier not available yet' })
      );

      const result = await chooseFree('SESS48');

      expect(result).toEqual({ ok: false, reason: 'unavailable' });
    });
  });

  describe('mintKey', () => {
    it('sends POST /api/dashboard with body { action } and returns { ok:true, apiKey, prefix } on 200', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { success: true, apiKey: 'liv_k_abcdefghij1234567890', prefix: 'liv_k_ab' })
      );

      const result = await mintKey('SESS48', 'generate-key');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://livinity.io/api/dashboard',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'generate-key' }),
        })
      );
      expect(result).toEqual({
        ok: true,
        apiKey: 'liv_k_abcdefghij1234567890',
        prefix: 'liv_k_ab',
      });
    });

    it('returns { ok:false, reason:"email_unverified" } on the 403 unverified-email message', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(403, { error: 'Please verify your email before generating an API key' })
      );

      const result = await mintKey('SESS48', 'generate-key');

      expect(result).toEqual({ ok: false, reason: 'email_unverified' });
    });

    it('returns { ok:false, reason:"subscription_required" } on the 403 subscription_required error code', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(403, { error: 'subscription_required', reason: 'inactive' })
      );

      const result = await mintKey('SESS48', 'regenerate-key');

      expect(result).toEqual({ ok: false, reason: 'subscription_required' });
    });

    it('returns { ok:false, reason:"unauthorized" } on 401', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { error: 'Unauthorized' }));

      const result = await mintKey('bad-session', 'generate-key');

      expect(result).toEqual({ ok: false, reason: 'unauthorized' });
    });

    it('rejects any action string outside the "generate-key"|"regenerate-key" literal union at runtime (defense in depth for the destructive mint call) without ever calling fetch', async () => {
      const result = await mintKey('SESS48', 'delete-key' as unknown as 'generate-key');

      expect(result).toEqual({ ok: false, reason: 'unauthorized' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('probeKey', () => {
    it('attaches header X-Api-Key: <key> and returns { ok:true, email } on 200 (WR-02: email surfaced for main-process-internal account-match use)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { username: 'alice', email: 'a@b.co' }));

      const result = await probeKey('liv_k_abc');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://livinity.io/api/me/profile',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'liv_k_abc' }),
        })
      );
      expect(result).toEqual({ ok: true, email: 'a@b.co' });
    });

    it('returns { ok:false, reason:"invalid" } on 401', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { error: 'Invalid API key' }));

      const result = await probeKey('liv_k_bad');

      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('returns { ok:false, reason:"inactive" } on 402 (valid key, no active entitlement — treated as rejection)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(402, { error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' })
      );

      const result = await probeKey('liv_k_valid_but_inactive');

      expect(result).toEqual({ ok: false, reason: 'inactive' });
    });

    it('returns { ok:false, reason:"not_found" } on 404', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404, { error: 'User not found' }));

      const result = await probeKey('liv_k_orphaned');

      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('returns { ok:false, reason:"network" } when fetch() rejects', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await probeKey('liv_k_abc');

      expect(result).toEqual({ ok: false, reason: 'network' });
    });
  });
});
