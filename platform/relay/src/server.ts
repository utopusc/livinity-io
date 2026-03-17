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
import { parseSubdomain } from './subdomain-parser.js';
import { handleHealthRequest } from './health.js';
import { proxyHttpRequest } from './request-proxy.js';
import { serveOfflinePage } from './offline-page.js';
import { checkQuota } from './bandwidth.js';
import type { TunnelRegistry } from './tunnel-registry.js';
import type { TunnelQuotaExceeded } from './protocol.js';

/**
 * Create the HTTP request handler.
 *
 * Returns a function suitable for http.createServer() or server.on('request').
 */
export function createRequestHandler(
  registry: TunnelRegistry,
  redis: Redis,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return async (req, res) => {
    const { username, appName } = parseSubdomain(req.headers.host);

    // Health endpoint (on bare domain or direct IP)
    if (!username && req.url === '/health') {
      handleHealthRequest(res, registry);
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
