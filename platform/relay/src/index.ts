/**
 * Relay Server Entry Point
 *
 * Creates HTTP server, WebSocket server, connects to Redis and PostgreSQL,
 * applies schema, and starts listening for tunnel connections and HTTP requests.
 *
 * Usage: node --import tsx src/index.ts
 */

import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import pg from 'pg';
import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';

import { config } from './config.js';
import { createRequestHandler } from './server.js';
import { TunnelConnection, TunnelRegistry } from './tunnel-registry.js';
import { verifyApiKey } from './auth.js';
import { handleTunnelResponse, proxyHttpRequest, setRedis } from './request-proxy.js';
import { startBandwidthFlush, stopBandwidthFlush } from './bandwidth.js';
import { parseSubdomain } from './subdomain-parser.js';
import {
  handleWsUpgrade,
  handleWsReady,
  handleWsFrame,
  handleWsClose,
  handleWsError,
} from './ws-proxy.js';
import type {
  TunnelAuth,
  TunnelConnected,
  TunnelAuthError,
  TunnelRelayShutdown,
  TunnelWsReady,
  TunnelWsFrame,
  TunnelWsClose,
  TunnelWsError as TunnelWsErrorMsg,
  ClientToRelayMessage,
  BidirectionalMessage,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Database & Redis
// ---------------------------------------------------------------------------

const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const redis = new Redis(config.REDIS_URL);

// Apply schema idempotently
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

await pool.query(schema);
console.log('[relay] Schema applied');

// Provide Redis to request-proxy for bandwidth tracking
setRedis(redis);

// Start bandwidth flush to PostgreSQL
const bandwidthInterval = startBandwidthFlush(redis, pool);

// ---------------------------------------------------------------------------
// Registry & HTTP server
// ---------------------------------------------------------------------------

const registry = new TunnelRegistry();
const handleRequest = createRequestHandler(registry, redis);
const server = http.createServer(handleRequest);

// ---------------------------------------------------------------------------
// WebSocket server (noServer mode)
// ---------------------------------------------------------------------------

const tunnelWss = new WebSocketServer({
  noServer: true,
  maxPayload: config.MAX_PAYLOAD_BYTES,
});

/**
 * Handle a newly connected tunnel WebSocket.
 *
 * The client must send an auth message within AUTH_TIMEOUT_MS.
 * After successful auth, messages are routed by type.
 */
function onTunnelConnect(ws: WebSocket): void {
  let authenticated = false;
  let tunnel: TunnelConnection | null = null;
  let tunnelUsername: string | null = null;

  // Auth timeout — close if no auth message received
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, config.AUTH_TIMEOUT_MS);

  ws.on('message', async (data) => {
    let msg: TunnelAuth | ClientToRelayMessage | BidirectionalMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.close(4002, 'Invalid JSON');
      return;
    }

    // --- First message must be auth ---
    if (!authenticated) {
      if (msg.type !== 'auth') {
        ws.close(4002, 'Expected auth message');
        return;
      }

      clearTimeout(authTimer);

      const authMsg = msg as TunnelAuth;
      const result = await verifyApiKey(authMsg.apiKey, pool, redis);

      if (!result) {
        const errorMsg: TunnelAuthError = {
          type: 'auth_error',
          error: 'Invalid API key',
        };
        ws.send(JSON.stringify(errorMsg));
        ws.close(4002, 'Invalid API key');
        return;
      }

      // Auth succeeded
      authenticated = true;
      tunnelUsername = result.username;

      // Check for session reconnection
      if (authMsg.sessionId) {
        const existing = registry.getBySessionId(authMsg.sessionId);
        if (existing && existing.isReconnecting() && existing.username === result.username) {
          // Resume existing session
          tunnel = existing;
          existing.resumeSession(ws, (req, res) => proxyHttpRequest(existing, req, res, null));

          const connectedMsg: TunnelConnected = {
            type: 'connected',
            sessionId: authMsg.sessionId,
            assignedUrl: `https://${result.username}.${config.RELAY_HOST}`,
          };
          ws.send(JSON.stringify(connectedMsg));

          console.log(`[relay] Tunnel reconnected: ${result.username} (session=${authMsg.sessionId})`);
          return;
        }
      }

      // New session
      const sessionId = nanoid();

      tunnel = new TunnelConnection({
        username: result.username,
        userId: result.userId,
        ws,
        sessionId,
      });

      registry.register(result.username, tunnel);

      const connectedMsg: TunnelConnected = {
        type: 'connected',
        sessionId,
        assignedUrl: `https://${result.username}.${config.RELAY_HOST}`,
      };
      ws.send(JSON.stringify(connectedMsg));

      console.log(`[relay] Tunnel connected: ${result.username} (session=${sessionId})`);
      return;
    }

    // --- Authenticated message routing ---
    if (!tunnel) return;

    switch (msg.type) {
      case 'http_response':
        handleTunnelResponse(tunnel, msg);
        break;

      // WebSocket proxy messages
      case 'ws_ready':
        handleWsReady(msg as TunnelWsReady, tunnel);
        break;
      case 'ws_frame':
        handleWsFrame(msg as TunnelWsFrame, tunnel);
        break;
      case 'ws_close':
        handleWsClose(msg as TunnelWsClose, tunnel);
        break;
      case 'ws_error':
        handleWsError(msg as TunnelWsErrorMsg, tunnel);
        break;

      case 'pong':
        // Application-level pong — heartbeat uses WebSocket-level ping/pong
        break;

      default:
        // Unknown message type — ignore
        break;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (tunnelUsername) {
      console.log(`[relay] Tunnel disconnected: ${tunnelUsername} (entering reconnect mode)`);
      registry.markDisconnected(tunnelUsername);
    }
  });

  ws.on('error', (err) => {
    clearTimeout(authTimer);
    if (tunnelUsername) {
      console.error(`[relay] Tunnel error (${tunnelUsername}):`, err.message);
      registry.markDisconnected(tunnelUsername);
    }
  });
}

// ---------------------------------------------------------------------------
// Upgrade handling
// ---------------------------------------------------------------------------

server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? '';

  if (url.startsWith('/tunnel/connect')) {
    tunnelWss.handleUpgrade(req, socket, head, (ws) => {
      onTunnelConnect(ws);
    });
    return;
  }

  // User subdomain WebSocket proxying
  const { username } = parseSubdomain(req.headers.host);
  if (username) {
    const tunnel = registry.get(username);
    if (tunnel && tunnel.ws.readyState === 1 /* WebSocket.OPEN */) {
      handleWsUpgrade(req, socket, head, tunnel);
      return;
    }
  }

  // No tunnel or not connected -- reject upgrade
  socket.destroy();
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

server.listen(config.RELAY_PORT, () => {
  console.log(`[relay] Relay server listening on port ${config.RELAY_PORT}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  console.log(`[relay] ${signal} received, shutting down...`);

  // Broadcast relay_shutdown to all connected tunnels
  const shutdownMsg: TunnelRelayShutdown = { type: 'relay_shutdown' };
  const shutdownPayload = JSON.stringify(shutdownMsg);

  for (const [username, connection] of registry) {
    try {
      connection.ws.send(shutdownPayload);
    } catch {
      // Already closed — ignore
    }
    console.log(`[relay] Notified ${username} of shutdown`);
  }

  stopBandwidthFlush(bandwidthInterval);

  server.close(() => {
    pool.end().then(() => {
      redis.disconnect();
      console.log('[relay] Shutdown complete');
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('[relay] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
