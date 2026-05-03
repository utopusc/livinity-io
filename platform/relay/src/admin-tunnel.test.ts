/**
 * Tests for admin-tunnel.ts
 *
 * Phase 60 Wave 2 — covers findAdminTunnel resolution paths + sendBrokerTunnelOffline
 * response shape, plus integration tests for the api.livinity.io dispatch wiring in
 * server.ts (Task 2 — appended at the bottom of this file).
 *
 * v30 hot-patch (Phase 63 R1): platform.users has no `role` column, so single-tenant
 * design uses `username='utopusc'` sentinel (closed-signup defeats username spoofing).
 * Phase 64+ adds role column + migrates back to role='admin' query.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type http from 'node:http';
import { findAdminTunnel, sendBrokerTunnelOffline } from './admin-tunnel.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Build a mock pg.Pool with a single `query` vi.fn — cast as any for the helper sig. */
function mockPool(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: vi.fn(queryImpl) } as any;
}

/** Build a mock TunnelRegistry with `getByUserId` + `get` vi.fns — cast as any. */
function mockRegistry(opts: {
  getByUserId?: (userId: string) => unknown;
  get?: (username: string) => unknown;
} = {}) {
  return {
    getByUserId: vi.fn(opts.getByUserId ?? (() => undefined)),
    get: vi.fn(opts.get ?? (() => undefined)),
  } as any;
}

/** Build a fake TunnelConnection with controllable ws.readyState. */
function fakeTunnel(opts: { userId: string; username: string; readyState: number }) {
  return {
    userId: opts.userId,
    username: opts.username,
    sessionId: 'session-' + opts.userId,
    ws: { readyState: opts.readyState },
  } as any;
}

/** Capture http.ServerResponse side-effects into a plain object. */
function captureResponse() {
  const captured = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    writeHead: vi.fn((status: number, headers: Record<string, string>) => {
      captured.status = status;
      captured.headers = headers;
    }),
    end: vi.fn((body?: string) => {
      captured.body = body ?? '';
    }),
  } as any;
  return { res, captured };
}

// ---------------------------------------------------------------------------
// findAdminTunnel
// ---------------------------------------------------------------------------

describe('findAdminTunnel', () => {
  test('T1: admin found + tunnel registered + ws OPEN → returns tunnel', async () => {
    const adminUserId = 'admin-uuid-123';
    const tunnel = fakeTunnel({ userId: adminUserId, username: 'admin', readyState: 1 });
    const registry = mockRegistry({
      getByUserId: (id: string) => (id === adminUserId ? tunnel : undefined),
    });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));

    const result = await findAdminTunnel(registry, pool);

    expect(result).toBe(tunnel);
    expect(registry.getByUserId).toHaveBeenCalledWith(adminUserId);
  });

  test('T2: admin found + no tunnel registered for that userId → returns null', async () => {
    const adminUserId = 'admin-uuid-123';
    const registry = mockRegistry({ getByUserId: () => undefined });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));

    const result = await findAdminTunnel(registry, pool);

    expect(result).toBeNull();
  });

  test('T3: admin found + tunnel registered but ws CLOSED → returns the tunnel (caller checks readyState)', async () => {
    const adminUserId = 'admin-uuid-123';
    const tunnel = fakeTunnel({ userId: adminUserId, username: 'admin', readyState: 3 /* CLOSED */ });
    const registry = mockRegistry({
      getByUserId: (id: string) => (id === adminUserId ? tunnel : undefined),
    });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));

    const result = await findAdminTunnel(registry, pool);

    // findAdminTunnel returns the tunnel verbatim; caller is responsible for readyState check.
    expect(result).toBe(tunnel);
    expect(result?.ws.readyState).toBe(3);
  });

  test('T4: pool.query throws → returns null (no exception bubbles)', async () => {
    const registry = mockRegistry();
    const pool = mockPool(async () => {
      throw new Error('connection refused');
    });

    // Silence expected console.error noise during this test.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await findAdminTunnel(registry, pool);

    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('T5: pool === null → returns null', async () => {
    const registry = mockRegistry();
    const result = await findAdminTunnel(registry, null);
    expect(result).toBeNull();
  });

  test('T6: query returns NO admin row (empty rows array) → returns null', async () => {
    const registry = mockRegistry();
    const pool = mockPool(async () => ({ rows: [] }));

    const result = await findAdminTunnel(registry, pool);

    expect(result).toBeNull();
    // Registry must NOT be touched if no admin row exists.
    expect(registry.getByUserId).not.toHaveBeenCalled();
  });

  test('T7: query uses username = $1 with parameter "bruce" (Phase 63 R1.1 hot-patch — actual tunnel owner)', async () => {
    const adminUserId = 'admin-uuid-123';
    const tunnel = fakeTunnel({ userId: adminUserId, username: 'bruce', readyState: 1 });
    const registry = mockRegistry({
      getByUserId: (id: string) => (id === adminUserId ? tunnel : undefined),
    });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'bruce' }] }));

    await findAdminTunnel(registry, pool);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    // SQL must filter by username sentinel, NOT by non-existent role column
    expect(sql).toMatch(/WHERE\s+username\s*=\s*\$1/i);
    expect(sql).not.toMatch(/WHERE\s+role/i);
    expect(params).toEqual(['bruce']);
  });
});

// ---------------------------------------------------------------------------
// sendBrokerTunnelOffline
// ---------------------------------------------------------------------------

describe('sendBrokerTunnelOffline', () => {
  test('T8: writes 503 + Content-Type: application/json + Anthropic-spec body', () => {
    const { res, captured } = captureResponse();

    sendBrokerTunnelOffline(res as http.ServerResponse);

    expect(captured.status).toBe(503);
    expect(captured.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(captured.body);
    expect(parsed).toEqual({
      type: 'error',
      error: { type: 'api_error', message: 'broker tunnel offline' },
    });
  });
});

// ---------------------------------------------------------------------------
// server.ts api.livinity.io dispatch integration (Task 2)
// ---------------------------------------------------------------------------
//
// These tests exercise createRequestHandler directly with mocked dependencies.
// The dispatch logic for `Host: api.livinity.io` is asserted by:
//   T9  : admin online → forwards via proxyHttpRequest with /u/<adminUserId> URL rewrite
//   T10 : admin tunnel offline → 503 JSON (NOT serveOfflinePage HTML)
//   T11 : alice.livinity.io (non-api) → existing subdomain path unchanged

vi.mock('./request-proxy.js', () => ({
  proxyHttpRequest: vi.fn(),
  setRedis: vi.fn(),
  handleTunnelResponse: vi.fn(),
}));

vi.mock('./offline-page.js', () => ({
  serveOfflinePage: vi.fn(),
}));

// Avoid touching real custom-domain SQL paths in dispatch tests.
vi.mock('./custom-domains.js', () => ({
  isCustomDomainAuthorized: vi.fn(async () => false),
  lookupCustomDomain: vi.fn(async () => null),
  resolveCustomDomainApp: vi.fn(() => null),
  warmDomainCache: vi.fn(async () => {}),
  invalidateDomainCache: vi.fn(async () => {}),
}));

// Quota always allowed in dispatch tests (we exercise quota in separate cases via
// changing the mock implementation if/when needed).
vi.mock('./bandwidth.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, usedBytes: 0, limitBytes: 1 })),
  trackBandwidth: vi.fn(async () => {}),
  startBandwidthFlush: vi.fn(),
  stopBandwidthFlush: vi.fn(),
}));

vi.mock('./health.js', () => ({
  handleHealthRequest: vi.fn((res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }),
  shouldRejectNewConnections: vi.fn(() => false),
}));

// Now import after the mocks are set up.
const { createRequestHandler } = await import('./server.js');
const { proxyHttpRequest } = await import('./request-proxy.js');
const { serveOfflinePage } = await import('./offline-page.js');

/** Build a minimal fake http.IncomingMessage */
function fakeRequest(opts: { host: string; url: string; method?: string }) {
  const req: any = {
    headers: { host: opts.host },
    url: opts.url,
    method: opts.method ?? 'POST',
    socket: { remoteAddress: '203.0.113.10' },
    on: vi.fn(),
  };
  return req;
}

describe('server.ts api.livinity.io dispatch integration', () => {
  beforeEach(() => {
    vi.mocked(proxyHttpRequest).mockClear();
    vi.mocked(serveOfflinePage).mockClear();
  });

  test('T9: Host: api.livinity.io with admin online → forwards via proxyHttpRequest with /u/<adminUserId> URL rewrite', async () => {
    const adminUserId = 'admin-uuid-aaaa';
    const adminTunnel = fakeTunnel({ userId: adminUserId, username: 'admin', readyState: 1 });

    const registry = mockRegistry({
      getByUserId: (id: string) => (id === adminUserId ? adminTunnel : undefined),
    });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));
    const redis = {} as any;

    const handler = createRequestHandler(registry, redis, pool);
    const req = fakeRequest({ host: 'api.livinity.io', url: '/v1/messages' });
    const { res } = captureResponse();

    await handler(req, res);

    expect(proxyHttpRequest).toHaveBeenCalledTimes(1);
    const [forwardedTunnel, forwardedReq, forwardedRes, targetApp] =
      vi.mocked(proxyHttpRequest).mock.calls[0];
    expect(forwardedTunnel).toBe(adminTunnel);
    // URL rewrite — /v1/messages → /u/<adminUserId>/v1/messages
    expect((forwardedReq as any).url).toBe('/u/admin-uuid-aaaa/v1/messages');
    expect(forwardedRes).toBe(res);
    expect(targetApp).toBeNull();
  });

  test('T10: Host: api.livinity.io with admin tunnel offline → 503 JSON (NOT serveOfflinePage HTML)', async () => {
    const adminUserId = 'admin-uuid-bbbb';
    // No admin tunnel registered — getByUserId returns undefined.
    const registry = mockRegistry({ getByUserId: () => undefined });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));
    const redis = {} as any;

    const handler = createRequestHandler(registry, redis, pool);
    const req = fakeRequest({ host: 'api.livinity.io', url: '/v1/messages' });
    const { res, captured } = captureResponse();

    await handler(req, res);

    // 503 JSON Anthropic-spec body — NOT serveOfflinePage (HTML)
    expect(captured.status).toBe(503);
    expect(captured.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(captured.body);
    expect(parsed).toEqual({
      type: 'error',
      error: { type: 'api_error', message: 'broker tunnel offline' },
    });
    expect(serveOfflinePage).not.toHaveBeenCalled();
    expect(proxyHttpRequest).not.toHaveBeenCalled();
  });

  test('T11: Host: alice.livinity.io (non-api) → existing subdomain path unchanged (calls registry.get("alice"), NOT findAdminTunnel)', async () => {
    const aliceUserId = 'alice-uuid-cccc';
    const aliceTunnel = fakeTunnel({ userId: aliceUserId, username: 'alice', readyState: 1 });

    const registry = mockRegistry({
      get: (username: string) => (username === 'alice' ? aliceTunnel : undefined),
      getByUserId: () => undefined,
    });
    // pool.query SHOULD NOT be called for non-api hosts (the api dispatch is the
    // only DB query in the handler hot-path until custom-domain lookup, which we
    // mocked above).
    const pool = mockPool(async () => ({ rows: [] }));
    const redis = {} as any;

    const handler = createRequestHandler(registry, redis, pool);
    const req = fakeRequest({ host: 'alice.livinity.io', url: '/anything' });
    const { res } = captureResponse();

    await handler(req, res);

    // alice.livinity.io still routes through the existing per-user proxy path
    expect(registry.get).toHaveBeenCalledWith('alice');
    expect(proxyHttpRequest).toHaveBeenCalledTimes(1);
    const [forwardedTunnel, forwardedReq] = vi.mocked(proxyHttpRequest).mock.calls[0];
    expect(forwardedTunnel).toBe(aliceTunnel);
    // URL must NOT be rewritten with /u/<id> for non-api routes
    expect((forwardedReq as any).url).toBe('/anything');
    // findAdminTunnel must not have been triggered (no admin role query)
    expect(pool.query).not.toHaveBeenCalled();
  });
});
