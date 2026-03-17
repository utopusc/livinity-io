/**
 * Tunnel Registry
 *
 * Manages active tunnel connections. Each user has at most one tunnel.
 * TunnelConnection handles its own lifecycle: heartbeat, pending requests,
 * browser WebSocket sessions, and cleanup on disconnect.
 */

import type WebSocket from 'ws';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingRequest {
  res: import('node:http').ServerResponse;
  timeout: ReturnType<typeof setTimeout>;
}

export interface TunnelConnectionOptions {
  username: string;
  userId: string;
  ws: WebSocket;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// TunnelConnection
// ---------------------------------------------------------------------------

export class TunnelConnection {
  public readonly username: string;
  public readonly userId: string;
  public readonly ws: WebSocket;
  public readonly sessionId: string;
  public readonly connectedAt: number;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly activeBrowserSockets = new Map<string, WebSocket>();

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private alive = true;

  constructor(opts: TunnelConnectionOptions) {
    this.username = opts.username;
    this.userId = opts.userId;
    this.ws = opts.ws;
    this.sessionId = opts.sessionId;
    this.connectedAt = Date.now();

    this.startHeartbeat();
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    // Mark alive on pong
    this.ws.on('pong', () => {
      this.alive = true;
    });

    this.heartbeatInterval = setInterval(() => {
      if (!this.alive) {
        this.destroy('ping timeout');
        return;
      }
      this.alive = false;
      this.ws.ping();
    }, config.HEARTBEAT_INTERVAL_MS);
  }

  // -----------------------------------------------------------------------
  // Pending HTTP requests
  // -----------------------------------------------------------------------

  addPendingRequest(id: string, res: import('node:http').ServerResponse, timeout: ReturnType<typeof setTimeout>): void {
    this.pendingRequests.set(id, { res, timeout });
  }

  removePendingRequest(id: string): void {
    this.pendingRequests.delete(id);
  }

  getPendingRequest(id: string): PendingRequest | undefined {
    return this.pendingRequests.get(id);
  }

  get pendingCount(): number {
    return this.pendingRequests.size;
  }

  // -----------------------------------------------------------------------
  // Browser WebSocket sessions (used in Plan 04)
  // -----------------------------------------------------------------------

  addBrowserSocket(id: string, ws: WebSocket): void {
    this.activeBrowserSockets.set(id, ws);
  }

  removeBrowserSocket(id: string): void {
    this.activeBrowserSockets.delete(id);
  }

  getBrowserSocket(id: string): WebSocket | undefined {
    return this.activeBrowserSockets.get(id);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(reason?: string): void {
    // 1. Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // 2. Fail all pending HTTP requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      if (!pending.res.headersSent) {
        pending.res.writeHead(502, { 'Content-Type': 'text/plain' });
        pending.res.end('Tunnel disconnected');
      }
      this.pendingRequests.delete(id);
    }

    // 3. Close all browser WebSocket sessions
    for (const [id, browserWs] of this.activeBrowserSockets) {
      try {
        browserWs.close(1001, reason ?? 'tunnel disconnected');
      } catch {
        // Already closed — ignore
      }
      this.activeBrowserSockets.delete(id);
    }

    // 4. Close tunnel WebSocket
    try {
      this.ws.removeAllListeners();
      this.ws.close(1000, reason ?? 'tunnel destroyed');
    } catch {
      // Already closed — ignore
    }
  }
}

// ---------------------------------------------------------------------------
// TunnelRegistry
// ---------------------------------------------------------------------------

export class TunnelRegistry {
  private readonly tunnels = new Map<string, TunnelConnection>();

  /**
   * Register a tunnel for a username.
   * If an existing tunnel exists for this user, destroy it first.
   */
  register(username: string, connection: TunnelConnection): void {
    const existing = this.tunnels.get(username);
    if (existing) {
      existing.destroy('replaced by new connection');
    }
    this.tunnels.set(username, connection);
  }

  /**
   * Unregister and destroy a tunnel for a username.
   */
  unregister(username: string): void {
    const connection = this.tunnels.get(username);
    if (connection) {
      connection.destroy('unregistered');
      this.tunnels.delete(username);
    }
  }

  /**
   * Get a tunnel connection by username.
   */
  get(username: string): TunnelConnection | undefined {
    return this.tunnels.get(username);
  }

  /**
   * Check if a tunnel exists for a username.
   */
  has(username: string): boolean {
    return this.tunnels.has(username);
  }

  /**
   * Get the number of active tunnels.
   */
  get size(): number {
    return this.tunnels.size;
  }

  /**
   * Find a tunnel connection by session ID.
   * Iterates the registry (small Map, fine for v8.0).
   */
  getBySessionId(sessionId: string): TunnelConnection | undefined {
    for (const connection of this.tunnels.values()) {
      if (connection.sessionId === sessionId) {
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Iterate all connections (used for relay shutdown broadcast).
   */
  *[Symbol.iterator](): IterableIterator<[string, TunnelConnection]> {
    yield* this.tunnels.entries();
  }
}
