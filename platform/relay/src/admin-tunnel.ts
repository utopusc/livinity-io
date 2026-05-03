/**
 * Admin Tunnel Resolution
 *
 * Phase 60 Wave 2 — used to route `api.livinity.io` traffic. The relay's
 * `parseSubdomain('api.livinity.io')` returns `{username: 'api'}` which is
 * NOT a real user; without this helper the relay would fall through to
 * `serveOfflinePage` (HTML — breaks SDK clients). Instead, we resolve the
 * admin user's currently-registered tunnel and forward through it.
 *
 * Threat-model (RESEARCH.md §"Tunnel Hijack" — STRIDE Spoofing T-60-20):
 *   Resolution queries by `role = 'admin'` (NOT by username = 'admin').
 *   Even if a malicious actor registered a username 'admin', they would
 *   not have role='admin' in the users table — only the actual admin user
 *   does. Querying by role defeats username-spoofing.
 *
 * Single-tenant v30 design: admin tunnel is the broker gateway. If admin
 * tunnel is offline, ALL `api.livinity.io` traffic 503s. v30+ revisits with
 * a dedicated `role='broker'` tunnel role for fail-over (RESEARCH.md A4).
 */

import type http from 'node:http';
import type pg from 'pg';
import type { TunnelRegistry, TunnelConnection } from './tunnel-registry.js';

/**
 * Resolve the admin user's currently-registered tunnel.
 *
 * Returns the TunnelConnection if an admin user exists AND has a tunnel
 * entry in the registry, else null. The caller is responsible for checking
 * `result.ws.readyState === 1` before forwarding.
 *
 * Errors (DB failure / pool absent / no admin row) → null. The caller is
 * expected to respond with `sendBrokerTunnelOffline` in those cases.
 */
export async function findAdminTunnel(
  registry: TunnelRegistry,
  pool: pg.Pool | null,
): Promise<TunnelConnection | null> {
  if (!pool) return null;

  let adminUserId: string;
  try {
    const result = await pool.query<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE role = $1 LIMIT 1',
      ['admin'],
    );
    if (result.rows.length === 0) return null;
    adminUserId = result.rows[0].id;
  } catch (err) {
    console.error('[relay] findAdminTunnel DB error:', err);
    return null;
  }

  const tunnel = registry.getByUserId(adminUserId);
  return tunnel ?? null;
}

/**
 * Write a 503 JSON Anthropic-spec body for `api.livinity.io` when the admin
 * tunnel is offline (or admin resolution failed). Use this INSTEAD OF
 * `serveOfflinePage`, which returns HTML and breaks SDK clients expecting
 * JSON error envelopes.
 *
 * Body shape matches Anthropic Messages API error envelope:
 *   { type: 'error', error: { type: 'api_error', message: '...' } }
 */
export function sendBrokerTunnelOffline(res: http.ServerResponse): void {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    type: 'error',
    error: { type: 'api_error', message: 'broker tunnel offline' },
  }));
}
