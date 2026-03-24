/**
 * HTTP Request Handler
 *
 * Routes incoming HTTP requests based on the Host header:
 *   - No subdomain + /health  -> health endpoint
 *   - Has subdomain           -> proxy through tunnel
 *   - Otherwise               -> 404
 */

import type http from 'node:http';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { parseSubdomain } from './subdomain-parser.js';
import { handleHealthRequest } from './health.js';
import { proxyHttpRequest } from './request-proxy.js';
import { serveOfflinePage } from './offline-page.js';
import { checkQuota } from './bandwidth.js';
import type { TunnelRegistry } from './tunnel-registry.js';
import type { DeviceRegistry } from './device-registry.js';
import type { TunnelQuotaExceeded } from './protocol.js';

/**
 * Create the HTTP request handler.
 *
 * Returns a function suitable for http.createServer() or server.on('request').
 */
/**
 * Handle Caddy's on-demand TLS ask request.
 * Returns 200 if the subdomain belongs to a registered user, 404 otherwise.
 */
async function handleAskRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pool: pg.Pool,
): Promise<void> {
  // Only allow from localhost
  const remote = req.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: false, error: 'forbidden' }));
    return;
  }

  const url = new URL(req.url ?? '', 'http://localhost');
  const domain = url.searchParams.get('domain');
  if (!domain) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: false, error: 'missing domain param' }));
    return;
  }

  const { username } = parseSubdomain(domain);
  if (!username) {
    // Bare domain or unparseable — allow cert for livinity.io itself
    if (domain === 'livinity.io' || domain === 'www.livinity.io' || domain === 'relay.livinity.io') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: true }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: false }));
    return;
  }

  // Allow infrastructure subdomains that aren't user accounts
  const INFRA_SUBDOMAINS = new Set(['relay', 'api', 'www', 'status', 'apps', 'changelog']);
  if (INFRA_SUBDOMAINS.has(username)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: true }));
    return;
  }

  try {
    const result = await pool.query('SELECT 1 FROM users WHERE username = $1 LIMIT 1', [username]);
    if (result.rows.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: false }));
    }
  } catch (err) {
    console.error('[relay] Ask endpoint DB error:', err);
    // On DB error, deny cert issuance (safe default)
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: false, error: 'internal error' }));
  }
}

export function createRequestHandler(
  registry: TunnelRegistry,
  redis: Redis,
  pool: pg.Pool,
  deviceRegistry?: DeviceRegistry,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return async (req, res) => {
    // Internal endpoints (localhost only)
    if (req.url?.startsWith('/internal/')) {
      const remote = req.socket.remoteAddress;
      const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';

      if (req.url.startsWith('/internal/ask')) {
        await handleAskRequest(req, res, pool);
        return;
      }

      if (req.url.startsWith('/internal/user-status') && isLocal) {
        const url = new URL(req.url, 'http://localhost');
        const qUsername = url.searchParams.get('username');
        if (!qUsername) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing username' }));
          return;
        }
        const tunnel = registry.get(qUsername);
        const online = !!tunnel && tunnel.ws.readyState === 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ username: qUsername, online, sessionId: tunnel?.sessionId ?? null }));
        return;
      }

      if (req.url.startsWith('/internal/user-bandwidth') && isLocal) {
        const url = new URL(req.url, 'http://localhost');
        const userId = url.searchParams.get('userId');
        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing userId' }));
          return;
        }
        const quota = await checkQuota(redis, userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(quota));
        return;
      }

      if (!isLocal) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
    }

    const { username, appName } = parseSubdomain(req.headers.host);

    // Health endpoint (on bare domain or direct IP)
    if (!username && req.url === '/health') {
      handleHealthRequest(res, registry, deviceRegistry);
      return;
    }

    // No subdomain — nothing to proxy
    if (!username) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Look up tunnel for this user
    const tunnel = registry.get(username);

    if (!tunnel || tunnel.ws.readyState !== 1 /* WebSocket.OPEN */) {
      // Check if the tunnel is in reconnect mode -- buffer the request
      if (tunnel && tunnel.isReconnecting()) {
        const buffered = tunnel.bufferRequest(req, res);
        if (buffered) return;
        // Buffer full -- fall through to offline page
      }

      serveOfflinePage(res, username);
      return;
    }

    // Check bandwidth quota before proxying
    const quota = await checkQuota(redis, tunnel.userId);
    if (!quota.allowed) {
      // Calculate first day of next month for Retry-After hint
      const now = new Date();
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const resetsAt = nextMonth.toISOString();

      res.writeHead(429, {
        'Content-Type': 'text/plain',
        'Retry-After': '86400',
      });
      res.end(`Bandwidth quota exceeded. Your monthly limit resets on ${resetsAt.split('T')[0]}.`);

      // Notify the tunnel client
      const quotaMsg: TunnelQuotaExceeded = {
        type: 'quota_exceeded',
        usedBytes: quota.usedBytes,
        limitBytes: quota.limitBytes,
        resetsAt,
      };
      try {
        tunnel.ws.send(JSON.stringify(quotaMsg));
      } catch {
        // Ignore send failures
      }
      return;
    }

    // Proxy the request through the tunnel
    proxyHttpRequest(tunnel, req, res, appName);
  };
}
