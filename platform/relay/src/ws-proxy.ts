/**
 * WebSocket Proxy
 *
 * Handles WebSocket upgrade requests from browsers by forwarding them
 * through the tunnel to the client's local server. Frames are relayed
 * bidirectionally using base64 encoding over the tunnel protocol.
 *
 * Flow:
 *   Browser upgrade -> handleWsUpgrade -> tunnel ws_upgrade -> client
 *   Client ws_ready  -> handleWsReady  -> complete browser upgrade
 *   Browser frame    -> tunnel ws_frame -> client -> local WS
 *   Local WS frame   -> tunnel ws_frame -> handleWsFrame -> browser
 */

import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { parseSubdomain } from './subdomain-parser.js';
import type { TunnelConnection } from './tunnel-registry.js';
import type {
  TunnelWsUpgrade,
  TunnelWsReady,
  TunnelWsFrame,
  TunnelWsClose,
  TunnelWsError,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingWsUpgrade {
  req: http.IncomingMessage;
  socket: Duplex;
  head: Buffer;
  timeout: ReturnType<typeof setTimeout>;
  tunnel: TunnelConnection;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Pending WebSocket upgrades waiting for ws_ready from tunnel client */
const pendingUpgrades = new Map<string, PendingWsUpgrade>();

/** Shared WebSocketServer instance (noServer mode) for all browser upgrades */
const browserWss = new WebSocketServer({
  noServer: true,
  // Disable per-message compression to reduce latency for streaming frames
  perMessageDeflate: false,
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle a WebSocket upgrade request from a browser.
 *
 * Sends a ws_upgrade message through the tunnel and waits for ws_ready.
 */
export function handleWsUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  tunnel: TunnelConnection,
  targetAppOverride?: string | null,
): void {
  const wsId = nanoid();

  // Use override if provided, otherwise parse from subdomain.
  // Custom domain callers pass explicit null (no app targeting until Phase 09).
  const appName = targetAppOverride !== undefined
    ? targetAppOverride
    : parseSubdomain(req.headers.host).appName;

  const upgradeMsg: TunnelWsUpgrade = {
    type: 'ws_upgrade',
    id: wsId,
    path: req.url ?? '/',
    headers: req.headers as Record<string, string | string[]>,
    ...(appName ? { targetApp: appName } : {}),
  };

  // Set timeout for the upgrade handshake
  const timeout = setTimeout(() => {
    pendingUpgrades.delete(wsId);
    socket.destroy();
  }, config.WS_UPGRADE_TIMEOUT_MS);

  // Store pending upgrade
  pendingUpgrades.set(wsId, { req, socket, head, timeout, tunnel });

  // Send through tunnel
  try {
    tunnel.ws.send(JSON.stringify(upgradeMsg));
  } catch {
    // Send failed -- clean up
    clearTimeout(timeout);
    pendingUpgrades.delete(wsId);
    socket.destroy();
  }
}

/**
 * Handle ws_ready from tunnel client -- complete the browser WebSocket upgrade.
 */
export function handleWsReady(
  msg: TunnelWsReady,
  tunnel: TunnelConnection,
): void {
  const pending = pendingUpgrades.get(msg.id);
  if (!pending) return; // Timed out

  clearTimeout(pending.timeout);
  pendingUpgrades.delete(msg.id);

  // Complete the browser-side upgrade using the shared WebSocketServer
  browserWss.handleUpgrade(pending.req, pending.socket, pending.head, (browserWs) => {
    // Store browser socket on the tunnel connection
    tunnel.addBrowserSocket(msg.id, browserWs);

    // Browser -> tunnel: relay frames
    browserWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const frame: TunnelWsFrame = {
        type: 'ws_frame',
        id: msg.id,
        data: Buffer.from(data as Buffer).toString('base64'),
        binary: isBinary,
      };
      try {
        tunnel.ws.send(JSON.stringify(frame));
      } catch {
        // Tunnel send failed -- close browser socket
        browserWs.close(1001, 'tunnel disconnected');
      }
    });

    // Browser closed -> notify tunnel client
    browserWs.on('close', (code: number, reason: Buffer) => {
      const closeMsg: TunnelWsClose = {
        type: 'ws_close',
        id: msg.id,
        code,
        reason: reason.toString(),
      };
      try {
        tunnel.ws.send(JSON.stringify(closeMsg));
      } catch {
        // Tunnel already closed -- ignore
      }
      tunnel.removeBrowserSocket(msg.id);
    });

    // Browser error -> notify tunnel client
    browserWs.on('error', () => {
      const closeMsg: TunnelWsClose = {
        type: 'ws_close',
        id: msg.id,
        code: 1011,
        reason: 'browser error',
      };
      try {
        tunnel.ws.send(JSON.stringify(closeMsg));
      } catch {
        // Tunnel already closed -- ignore
      }
      tunnel.removeBrowserSocket(msg.id);
    });
  });
}

/**
 * Handle ws_frame from tunnel client -- forward to browser WebSocket.
 */
export function handleWsFrame(
  msg: TunnelWsFrame,
  tunnel: TunnelConnection,
): void {
  const browserWs = tunnel.getBrowserSocket(msg.id);
  if (!browserWs || browserWs.readyState !== WebSocket.OPEN) return;

  const decoded = Buffer.from(msg.data, 'base64');
  browserWs.send(decoded, { binary: msg.binary });
}

/**
 * Handle ws_close from tunnel client -- close browser WebSocket.
 */
export function handleWsClose(
  msg: TunnelWsClose,
  tunnel: TunnelConnection,
): void {
  const browserWs = tunnel.getBrowserSocket(msg.id);
  if (browserWs) {
    // Sanitize close code: ws library rejects reserved codes (1004-1006, 1015)
    // and codes outside the valid range (must be 1000 or 3000-4999).
    let code = msg.code ?? 1000;
    if (code !== 1000 && code !== 1001 && (code < 3000 || code > 4999)) {
      code = 1000;
    }
    browserWs.close(code, msg.reason ?? '');
  }
  tunnel.removeBrowserSocket(msg.id);
}

/**
 * Handle ws_error from tunnel client -- error for pending upgrade or active socket.
 */
export function handleWsError(
  msg: TunnelWsError,
  tunnel: TunnelConnection,
): void {
  // Check pending upgrades first
  const pending = pendingUpgrades.get(msg.id);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.socket.destroy();
    pendingUpgrades.delete(msg.id);
    return;
  }

  // Check active browser sockets
  const browserWs = tunnel.getBrowserSocket(msg.id);
  if (browserWs) {
    browserWs.close(1011, msg.error);
    tunnel.removeBrowserSocket(msg.id);
  }
}
