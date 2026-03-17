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
import type { TunnelRegistry } from './tunnel-registry.js';

/**
 * Create the HTTP request handler.
 *
 * Returns a function suitable for http.createServer() or server.on('request').
 */
export function createRequestHandler(
  registry: TunnelRegistry,
  _redis: Redis,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
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

    // Proxy the request through the tunnel
    proxyHttpRequest(tunnel, req, res, appName);
  };
}
