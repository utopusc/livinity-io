/**
 * Tests for admin-tunnel.ts
 *
 * Phase 60 Wave 2 — covers findAdminTunnel resolution paths + sendBrokerTunnelOffline
 * response shape, plus integration tests for the api.livinity.io dispatch wiring in
 * server.ts (Task 2 — appended at the bottom of this file).
 *
 * Threat model: findAdminTunnel MUST query users.role = 'admin' (not username = 'admin')
 * to defeat tunnel-hijack spoofing — see RESEARCH.md §"Tunnel Hijack" + threat T-60-20.
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

  test('T7: query uses role = $1 with parameter "admin" — does NOT match by username string', async () => {
    const adminUserId = 'admin-uuid-123';
    const tunnel = fakeTunnel({ userId: adminUserId, username: 'admin', readyState: 1 });
    const registry = mockRegistry({
      getByUserId: (id: string) => (id === adminUserId ? tunnel : undefined),
    });
    const pool = mockPool(async () => ({ rows: [{ id: adminUserId, username: 'admin' }] }));

    await findAdminTunnel(registry, pool);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    // SQL must filter by role, NOT by username
    expect(sql).toMatch(/WHERE\s+role\s*=\s*\$1/i);
    expect(sql).not.toMatch(/WHERE\s+username/i);
    expect(params).toEqual(['admin']);
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
