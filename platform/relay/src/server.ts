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
import { isCustomDomainAuthorized, lookupCustomDomain, resolveCustomDomainApp } from './custom-domains.js';
import { findAdminTunnel, sendBrokerTunnelOffline } from './admin-tunnel.js';
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
  redis: Redis,
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

    // Check if it's a verified custom domain (Phase 08 - DOM-04, DOM-NF-02)
    // Only runs when parseSubdomain found no username, preserving existing
    // *.livinity.io routing (DOM-NF-04). Redis-cached for <1ms lookups (DOM-NF-01).
    try {
      const authorized = await isCustomDomainAuthorized(pool, redis, domain);
      if (authorized) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ allowed: true }));
        return;
      }
    } catch (err) {
      console.error('[relay] Ask endpoint custom domain check error:', err);
      // Fall through to 404 — deny cert on error (safe default)
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowed: false }));
    return;
  }

  // Allow infrastructure subdomains that aren't user accounts
  const INFRA_SUBDOMAINS = new Set(['relay', 'api', 'www', 'status', 'apps', 'changelog', 'mcp']);
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
        await handleAskRequest(req, res, pool, redis);
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

      if (req.url.startsWith('/internal/domain-sync') && isLocal && req.method === 'POST') {
        // Collect POST body
        const bodyChunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(bodyChunks).toString());
            const { userId, action, domain, appMapping, status } = body;
            if (!userId || !action || !domain) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'missing userId, action, or domain' }));
              return;
            }
            // Find the user's tunnel
            const tunnel = registry.getByUserId(userId);
            if (!tunnel || tunnel.ws.readyState !== 1) {
              // Tunnel offline -- domain will sync on reconnect via domain_list_sync
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ synced: false, reason: 'tunnel_offline' }));
              return;
            }
            // Send domain_sync through the tunnel
            const syncMsg = {
              type: 'domain_sync' as const,
              action,
              domain,
              ...(appMapping ? { appMapping } : {}),
              ...(status ? { status } : {}),
            };
            tunnel.ws.send(JSON.stringify(syncMsg));

            // Invalidate relay Redis cache for this domain
            const { invalidateDomainCache } = await import('./custom-domains.js');
            await invalidateDomainCache(redis, domain);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ synced: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'internal error' }));
          }
        });
        return;
      }

      if (!isLocal) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
    }

    const { username, appName } = parseSubdomain(req.headers.host);

    // Phase 60 Wave 2 — special-case api.livinity.io BEFORE the existing
    // username-based routing. Caddy reverse-proxies api.livinity.io to
    // localhost:4000; without this dispatch, parseSubdomain returns
    // {username:'api'} and registry.get('api') returns null → serveOfflinePage
    // (HTML — breaks SDK clients). See RESEARCH.md Pattern 3 + threat T-60-20.
    const hostnameLower = req.headers.host?.split(':')[0]?.toLowerCase();
    if (hostnameLower === 'api.livinity.io') {
      if (!pool) {
        sendBrokerTunnelOffline(res);
        return;
      }
      const adminTunnel = await findAdminTunnel(registry, pool);
      if (!adminTunnel || adminTunnel.ws.readyState !== 1 /* WebSocket.OPEN */) {
        sendBrokerTunnelOffline(res);
        return;
      }
      // Bandwidth quota — same path as existing per-user proxy below; charges
      // bandwidth to admin user (per-Bearer-key attribution defers to Phase 62 E1).
      const apiQuota = await checkQuota(redis, adminTunnel.userId);
      if (!apiQuota.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '86400' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'rate_limit_error', message: 'Bandwidth quota exceeded' },
        }));
        return;
      }
      // URL rewrite — inject /u/<adminUserId> prefix so Phase 59 Bearer middleware
      // (mounted at /u/:userId/v1 on Mini PC livinityd) catches the request.
      // Bearer middleware sets req.userId from the liv_sk_* token; the URL :userId
      // slot is owned by admin (the relay forwarded through admin's tunnel) and
      // resolveAndAuthorizeUserId validates it against PG. Bearer wins identity at
      // the broker handler. Defensive guard: preserve URLs already starting with /u/.
      if (req.url && !req.url.startsWith('/u/')) {
        req.url = '/u/' + adminTunnel.userId + req.url;
      }
      proxyHttpRequest(adminTunnel, req, res, null);
      return;
    }

    // Health endpoint (on bare domain or direct IP)
    if (!username && req.url === '/health') {
      handleHealthRequest(res, registry, deviceRegistry);
      return;
    }

    // Custom domain routing (DOM-04) — only when parseSubdomain found no
    // username, so all existing *.livinity.io routing is unchanged (DOM-NF-04).
    if (!username) {
      const hostname = req.headers.host?.split(':')[0]?.toLowerCase();
      if (hostname) {
        const customDomain = await lookupCustomDomain(pool, redis, hostname);
        if (customDomain) {
          const cdTunnel = registry.get(customDomain.username);
          if (!cdTunnel || cdTunnel.ws.readyState !== 1) {
            // Check if the tunnel is in reconnect mode — buffer the request
            if (cdTunnel && cdTunnel.isReconnecting()) {
              const buffered = cdTunnel.bufferRequest(req, res);
              if (buffered) return;
            }
            serveOfflinePage(res, customDomain.username);
            return;
          }

          // Check bandwidth quota (same as subdomain path)
          const cdQuota = await checkQuota(redis, cdTunnel.userId);
          if (!cdQuota.allowed) {
            const now = new Date();
            const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            const resetsAt = nextMonth.toISOString();
            res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '86400' });
            res.end(`Bandwidth quota exceeded. Your monthly limit resets on ${resetsAt.split('T')[0]}.`);
            const quotaMsg: TunnelQuotaExceeded = {
              type: 'quota_exceeded',
              usedBytes: cdQuota.usedBytes,
              limitBytes: cdQuota.limitBytes,
              resetsAt,
            };
            try { cdTunnel.ws.send(JSON.stringify(quotaMsg)); } catch {}
            return;
          }

          // Resolve target app from custom domain's app_mapping (DOM-06)
          const targetApp = resolveCustomDomainApp(hostname!, customDomain);
          proxyHttpRequest(cdTunnel, req, res, targetApp);
          return;
        }
      }
    }

    // No subdomain and not a custom domain — nothing to proxy
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
