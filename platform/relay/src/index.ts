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
import { shouldRejectNewConnections } from './health.js';
import { warmDomainCache, lookupCustomDomain, resolveCustomDomainApp } from './custom-domains.js';
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
  TunnelDeviceConnected,
  TunnelDeviceDisconnected,
  TunnelDeviceToolCall,
  TunnelDeviceToolResult,
  TunnelDeviceAuditEvent,
  TunnelDeviceEmergencyStop,
  ClientToRelayMessage,
  BidirectionalMessage,
} from './protocol.js';
import { DeviceConnection, DeviceRegistry } from './device-registry.js';
import { verifyDeviceToken } from './device-auth.js';
import type {
  DeviceAuth,
  DeviceAuditEvent,
  DeviceEmergencyStop,
  DeviceConnected,
  DeviceAuthError,
  DeviceToolCall,
  DeviceToRelayMessage,
} from './device-protocol.js';

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

// Pre-populate Redis cache with all verified/active custom domains
await warmDomainCache(pool, redis);
console.log('[relay] Custom domain cache warmed');

// Provide Redis to request-proxy for bandwidth tracking
setRedis(redis);

// Start bandwidth flush to PostgreSQL
const bandwidthInterval = startBandwidthFlush(redis, pool);

// ---------------------------------------------------------------------------
// Registry & HTTP server
// ---------------------------------------------------------------------------

const registry = new TunnelRegistry();
const deviceRegistry = new DeviceRegistry();
const handleRequest = createRequestHandler(registry, redis, pool, deviceRegistry);
const server = http.createServer(handleRequest);

// ---------------------------------------------------------------------------
// WebSocket server (noServer mode)
// ---------------------------------------------------------------------------

const tunnelWss = new WebSocketServer({
  noServer: true,
  maxPayload: config.MAX_PAYLOAD_BYTES,
});

const deviceWss = new WebSocketServer({
  noServer: true,
  maxPayload: config.MAX_PAYLOAD_BYTES,
});

/**
 * Send full list of verified/active custom domains to a tunnel client on connect.
 * Ensures LivOS always has the latest domain state, even after reconnect.
 */
async function sendDomainListSync(ws: WebSocket, userId: string): Promise<void> {
  try {
    const result = await pool.query<{
      domain: string;
      status: string;
      app_mapping: Record<string, string> | null;
    }>(
      `SELECT domain, status, app_mapping FROM custom_domains
       WHERE user_id = $1 AND status IN ('dns_verified', 'active')`,
      [userId]
    );
    const domains = result.rows.map(r => ({
      domain: r.domain,
      appMapping: r.app_mapping || {},
      status: r.status,
    }));
    if (domains.length > 0) {
      ws.send(JSON.stringify({ type: 'domain_list_sync', domains }));
      console.log(`[relay] Sent domain_list_sync: ${domains.length} domain(s) for user ${userId}`);
    }
  } catch (err) {
    console.error('[relay] Failed to send domain_list_sync:', err);
  }
}

/**
 * Handle a newly connected tunnel WebSocket.
 *
 * The client must send an auth message within AUTH_TIMEOUT_MS.
 * After successful auth, messages are routed by type.
 */
function onTunnelConnect(ws: WebSocket): void {
  // Memory pressure check — reject new connections at 80% system memory
  if (shouldRejectNewConnections()) {
    console.warn('[relay] Rejecting new tunnel connection: memory pressure too high');
    ws.close(4004, 'Server under memory pressure');
    return;
  }

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
          sendDomainListSync(ws, result.userId);

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
      sendDomainListSync(ws, result.userId);

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

      case 'device_tool_call': {
        const toolCallMsg = msg as TunnelDeviceToolCall;
        const targetDevice = deviceRegistry.getDevice(tunnel.userId, toolCallMsg.deviceId);
        if (!targetDevice || targetDevice.ws.readyState !== 1) {
          // Device not connected -- send error result back
          const errorResult: TunnelDeviceToolResult = {
            type: 'device_tool_result',
            requestId: toolCallMsg.requestId,
            deviceId: toolCallMsg.deviceId,
            result: { success: false, output: '', error: `Device '${toolCallMsg.deviceId}' is not connected` },
          };
          ws.send(JSON.stringify(errorResult));
          break;
        }
        // Forward tool call to device (strip deviceId, add timeout default)
        const deviceMsg: DeviceToolCall = {
          type: 'device_tool_call',
          requestId: toolCallMsg.requestId,
          tool: toolCallMsg.tool,
          params: toolCallMsg.params,
          timeout: toolCallMsg.timeout ?? 30000,
        };
        targetDevice.ws.send(JSON.stringify(deviceMsg));
        console.log(`[relay] Forwarded tool_call to device=${toolCallMsg.deviceId} tool=${toolCallMsg.tool} request=${toolCallMsg.requestId}`);
        break;
      }

      case 'pong':
        // Application-level pong — heartbeat uses WebSocket-level ping/pong
        break;

      case 'domain_sync_ack':
        // Log acknowledgment; no further action needed
        console.log(`[relay] Domain sync ack from ${tunnelUsername}: ${(msg as any).domain} success=${(msg as any).success}`);
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
// Device WebSocket handler
// ---------------------------------------------------------------------------

/**
 * Handle a newly connected device WebSocket.
 *
 * The device must send a device_auth message within AUTH_TIMEOUT_MS.
 * After successful auth, the device is registered in the DeviceRegistry.
 */
function onDeviceConnect(ws: WebSocket): void {
  if (shouldRejectNewConnections()) {
    console.warn('[relay] Rejecting new device connection: memory pressure too high');
    ws.close(4004, 'Server under memory pressure');
    return;
  }

  let authenticated = false;
  let device: DeviceConnection | null = null;
  let deviceUserId: string | null = null;
  let deviceDeviceId: string | null = null;

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, config.AUTH_TIMEOUT_MS);

  ws.on('message', (data) => {
    let msg: DeviceToRelayMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.close(4002, 'Invalid JSON');
      return;
    }

    // --- First message must be device_auth ---
    if (!authenticated) {
      if (msg.type !== 'device_auth') {
        ws.close(4002, 'Expected device_auth message');
        return;
      }

      clearTimeout(authTimer);

      const authMsg = msg as DeviceAuth;
      const tokenPayload = verifyDeviceToken(authMsg.deviceToken);

      if (!tokenPayload) {
        const errorMsg: DeviceAuthError = {
          type: 'device_auth_error',
          error: 'Invalid or expired device token',
        };
        ws.send(JSON.stringify(errorMsg));
        ws.close(4002, 'Invalid device token');
        return;
      }

      // Verify deviceId in token matches the one sent in the auth message
      if (tokenPayload.deviceId !== authMsg.deviceId) {
        const errorMsg: DeviceAuthError = {
          type: 'device_auth_error',
          error: 'Device ID mismatch',
        };
        ws.send(JSON.stringify(errorMsg));
        ws.close(4002, 'Device ID mismatch');
        return;
      }

      authenticated = true;
      deviceUserId = tokenPayload.userId;
      deviceDeviceId = tokenPayload.deviceId;

      const sessionId = nanoid();

      device = new DeviceConnection({
        userId: tokenPayload.userId,
        deviceId: tokenPayload.deviceId,
        deviceName: authMsg.deviceName,
        platform: authMsg.platform,
        tools: authMsg.tools,
        ws,
        sessionId,
      });

      deviceRegistry.register(tokenPayload.userId, tokenPayload.deviceId, device);

      const connectedMsg: DeviceConnected = {
        type: 'device_connected',
        sessionId,
      };
      ws.send(JSON.stringify(connectedMsg));

      console.log(`[relay] Device connected: ${authMsg.deviceName} (${authMsg.platform}) user=${tokenPayload.userId} device=${tokenPayload.deviceId}`);

      // Notify LivOS tunnel that a device connected
      const userTunnel = registry.getByUserId(tokenPayload.userId);
      if (userTunnel && userTunnel.ws.readyState === 1) {
        const event: TunnelDeviceConnected = {
          type: 'device_connected',
          userId: tokenPayload.userId,  // Phase 11 OWN-03: forward owner to LivOS for per-user filtering
          deviceId: tokenPayload.deviceId,
          deviceName: authMsg.deviceName,
          platform: authMsg.platform,
          tools: authMsg.tools,
        };
        userTunnel.ws.send(JSON.stringify(event));
        console.log(`[relay] Notified LivOS tunnel of device connect: ${authMsg.deviceName}`);
      }

      return;
    }

    // --- Authenticated message routing ---
    if (!device) return;

    switch (msg.type) {
      case 'device_tool_result': {
        // Forward tool result to the user's LivOS tunnel
        const userTunnel = registry.getByUserId(device.userId);
        if (userTunnel && userTunnel.ws.readyState === 1) {
          const tunnelResult: TunnelDeviceToolResult = {
            type: 'device_tool_result',
            requestId: msg.requestId,
            deviceId: device.deviceId,
            result: msg.result,
          };
          userTunnel.ws.send(JSON.stringify(tunnelResult));
          console.log(`[relay] Forwarded tool_result from device=${device.deviceId} request=${msg.requestId}`);
        } else {
          console.warn(`[relay] No tunnel for user=${device.userId} to deliver tool_result request=${msg.requestId}`);
        }
        break;
      }

      case 'device_audit_event': {
        // Forward audit event to the user's LivOS tunnel
        const userTunnel = registry.getByUserId(device.userId);
        if (userTunnel && userTunnel.ws.readyState === 1) {
          const auditMsg = msg as DeviceAuditEvent;
          const tunnelAudit: TunnelDeviceAuditEvent = {
            type: 'device_audit_event',
            deviceId: device.deviceId,
            timestamp: auditMsg.timestamp,
            toolName: auditMsg.toolName,
            params: auditMsg.params,
            success: auditMsg.success,
            duration: auditMsg.duration,
            error: auditMsg.error,
          };
          userTunnel.ws.send(JSON.stringify(tunnelAudit));
        }
        break;
      }

      case 'device_emergency_stop': {
        // Forward emergency stop to the user's LivOS tunnel
        const userTunnel = registry.getByUserId(device.userId);
        if (userTunnel && userTunnel.ws.readyState === 1) {
          const emergencyMsg: TunnelDeviceEmergencyStop = {
            type: 'device_emergency_stop',
            deviceId: device.deviceId,
            timestamp: (msg as DeviceEmergencyStop).timestamp,
            reason: (msg as DeviceEmergencyStop).reason,
          };
          userTunnel.ws.send(JSON.stringify(emergencyMsg));
          console.log(`[relay] Forwarded emergency_stop from device=${device.deviceId}`);
        }
        break;
      }

      case 'device_pong':
        // Application-level pong — heartbeat uses WebSocket-level ping/pong
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (deviceUserId && deviceDeviceId) {
      // Notify LivOS tunnel that a device disconnected
      const userTunnel = registry.getByUserId(deviceUserId);
      if (userTunnel && userTunnel.ws.readyState === 1) {
        const event: TunnelDeviceDisconnected = {
          type: 'device_disconnected',
          deviceId: deviceDeviceId,
        };
        userTunnel.ws.send(JSON.stringify(event));
        console.log(`[relay] Notified LivOS tunnel of device disconnect: ${deviceDeviceId}`);
      }

      console.log(`[relay] Device disconnected: device=${deviceDeviceId} user=${deviceUserId}`);
      deviceRegistry.markDisconnected(deviceUserId, deviceDeviceId);
    }
  });

  ws.on('error', (err) => {
    clearTimeout(authTimer);
    if (deviceUserId && deviceDeviceId) {
      console.error(`[relay] Device error (${deviceDeviceId}):`, err.message);
      deviceRegistry.markDisconnected(deviceUserId, deviceDeviceId);
    }
  });
}

// ---------------------------------------------------------------------------
// Upgrade handling
// ---------------------------------------------------------------------------

server.on('upgrade', async (req, socket, head) => {
  const url = req.url ?? '';

  if (url.startsWith('/tunnel/connect')) {
    tunnelWss.handleUpgrade(req, socket, head, (ws) => {
      onTunnelConnect(ws);
    });
    return;
  }

  if (url.startsWith('/device/connect')) {
    deviceWss.handleUpgrade(req, socket, head, (ws) => {
      onDeviceConnect(ws);
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

  // Custom domain WebSocket proxying (DOM-04) — only when parseSubdomain
  // found no username, so existing *.livinity.io WS routing is unchanged.
  if (!username) {
    const hostname = req.headers.host?.split(':')[0]?.toLowerCase();
    if (hostname) {
      const customDomain = await lookupCustomDomain(pool, redis, hostname);
      if (customDomain) {
        const tunnel = registry.get(customDomain.username);
        if (tunnel && tunnel.ws.readyState === 1) {
          const targetApp = resolveCustomDomainApp(hostname!, customDomain);
          handleWsUpgrade(req, socket, head, tunnel, targetApp);
          return;
        }
      }
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

  // Disconnect all device agents
  for (const connection of deviceRegistry.allConnections()) {
    try {
      connection.ws.send(JSON.stringify({ type: 'relay_shutdown' }));
    } catch {
      // Already closed
    }
    connection.destroy('relay shutdown');
  }
  console.log(`[relay] Disconnected ${deviceRegistry.totalDevices} device(s)`);

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
