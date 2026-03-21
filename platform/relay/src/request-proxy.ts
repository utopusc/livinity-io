/**
 * HTTP Request Proxy
 *
 * Serializes incoming HTTP requests into JSON tunnel messages and sends
 * them through the tunnel WebSocket. When the tunnel client responds,
 * the response is written back to the original HTTP response.
 */

import type http from 'node:http';
import { nanoid } from 'nanoid';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { trackBandwidth } from './bandwidth.js';
import type { TunnelConnection } from './tunnel-registry.js';
import type { TunnelRequest, TunnelResponse } from './protocol.js';

/** Module-level Redis reference, set once at startup */
let _redis: Redis | null = null;

/** Called from index.ts to provide the Redis connection for bandwidth tracking */
export function setRedis(redis: Redis): void {
  _redis = redis;
}

/**
 * Proxy an HTTP request through a tunnel connection.
 *
 * 1. Generate request ID
 * 2. Collect request body
 * 3. Serialize as TunnelRequest envelope
 * 4. Set up timeout (504 Gateway Timeout)
 * 5. Register as pending request on the tunnel
 * 6. Send through WebSocket
 */
// Paths commonly probed by automated scanners — drop silently with 404
const SCANNER_PATHS = new Set([
  '/.env', '/.git/config', '/.DS_Store', '/.vscode/sftp.json',
  '/wp-login.php', '/wp-admin', '/xmlrpc.php',
  '/swagger-ui.html', '/swagger.json', '/swagger/v1/swagger.json',
  '/v2/api-docs', '/v2/_catalog', '/actuator/env', '/actuator/health',
  '/server-status', '/server-info', '/telescope/requests',
  '/info.php', '/phpinfo.php', '/config.json',
  '/debug/default/view', '/console/', '/login.action',
  '/trace.axd', '/.well-known/security.txt',
]);

const SCANNER_PATTERNS = [
  /^\/ecp\//,
  /^\/s\/[0-9a-f]+\/_\//,
  /rest_route=\/wp\//,
  /^\/webjars\/swagger/,
  /META-INF\/maven/,
];

function isScannerProbe(path: string): boolean {
  const cleanPath = path.split('?')[0];
  if (SCANNER_PATHS.has(cleanPath)) return true;
  return SCANNER_PATTERNS.some(p => p.test(path));
}

export function proxyHttpRequest(
  tunnel: TunnelConnection,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetApp: string | null,
): void {
  // Drop known scanner probes silently
  if (!targetApp && isScannerProbe(req.url ?? '/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const requestId = nanoid();
  const bodyChunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => {
    bodyChunks.push(chunk);
  });

  req.on('error', () => {
    // Client disconnected before we could proxy — clean up
    const pending = tunnel.getPendingRequest(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      tunnel.removePendingRequest(requestId);
    }
  });

  req.on('end', () => {
    const body = bodyChunks.length > 0
      ? Buffer.concat(bodyChunks).toString('base64')
      : null;

    const message: TunnelRequest = {
      type: 'http_request',
      id: requestId,
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers as Record<string, string | string[]>,
      body,
      ...(targetApp ? { targetApp } : {}),
    };

    // Set up request timeout
    const timeout = setTimeout(() => {
      tunnel.removePendingRequest(requestId);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      }
    }, config.REQUEST_TIMEOUT_MS);

    // Register pending request
    tunnel.addPendingRequest(requestId, res, timeout);

    // Track outbound bandwidth (fire-and-forget)
    const payload = JSON.stringify(message);
    if (_redis) {
      trackBandwidth(_redis, tunnel.userId, 'out', Buffer.byteLength(payload)).catch(() => {});
    }

    // Send through tunnel
    try {
      tunnel.ws.send(payload);
    } catch {
      // WebSocket send failed — clean up immediately
      clearTimeout(timeout);
      tunnel.removePendingRequest(requestId);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Tunnel send failed');
      }
    }
  });
}

/**
 * Handle a tunnel client's HTTP response.
 *
 * 1. Find the pending request by ID
 * 2. Clear timeout
 * 3. Decode base64 body
 * 4. Write HTTP response back to the browser
 */
export function handleTunnelResponse(
  tunnel: TunnelConnection,
  msg: TunnelResponse,
): void {
  const pending = tunnel.getPendingRequest(msg.id);
  if (!pending) {
    // Request already timed out or was cancelled — discard
    return;
  }

  clearTimeout(pending.timeout);
  tunnel.removePendingRequest(msg.id);

  const { res } = pending;

  if (res.headersSent) return;

  // Track inbound bandwidth (fire-and-forget)
  if (_redis) {
    const rawSize = Buffer.byteLength(JSON.stringify(msg));
    trackBandwidth(_redis, tunnel.userId, 'in', rawSize).catch(() => {});
  }

  // Decode body from base64
  const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);

  // Write response headers and body
  // writeHead handles multi-value headers (e.g., Set-Cookie arrays) natively
  res.writeHead(msg.status, msg.headers as http.OutgoingHttpHeaders);
  res.end(bodyBuffer);
}
