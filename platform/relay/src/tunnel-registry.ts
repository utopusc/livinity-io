/**
 * Tunnel Registry
 *
 * Manages active tunnel connections. Each user has at most one tunnel.
 * TunnelConnection handles its own lifecycle: heartbeat, pending requests,
 * browser WebSocket sessions, reconnection buffering, and cleanup.
 */

import type http from 'node:http';
import type WebSocket from 'ws';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingRequest {
  res: http.ServerResponse;
  timeout: ReturnType<typeof setTimeout>;
}

export interface BufferedRequest {
  req: http.IncomingMessage;
  res: http.ServerResponse;
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
  public readonly sessionId: string;
  public readonly connectedAt: number;

  /** The tunnel WebSocket -- replaced on reconnection */
  private _ws: WebSocket;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly activeBrowserSockets = new Map<string, WebSocket>();

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private alive = true;

  // Reconnection buffering state
  private _reconnecting = false;
  private _requestBuffer: BufferedRequest[] = [];
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: TunnelConnectionOptions) {
    this.username = opts.username;
    this.userId = opts.userId;
    this._ws = opts.ws;
    this.sessionId = opts.sessionId;
    this.connectedAt = Date.now();

    this.startHeartbeat();
  }

  /** Public accessor for the tunnel WebSocket */
  get ws(): WebSocket {
    return this._ws;
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Mark alive on pong
    this._ws.on('pong', () => {
      this.alive = true;
    });

    this.alive = true;
    this.heartbeatInterval = setInterval(() => {
      if (!this.alive) {
        this.destroy('ping timeout');
        return;
      }
      this.alive = false;
      this._ws.ping();
    }, config.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // -----------------------------------------------------------------------
  // Pending HTTP requests
  // -----------------------------------------------------------------------

  addPendingRequest(id: string, res: http.ServerResponse, timeout: ReturnType<typeof setTimeout>): void {
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
  // Browser WebSocket sessions
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
  // Reconnection buffering
  // -----------------------------------------------------------------------

  /**
   * Enter reconnect mode. The tunnel WebSocket is already closed, but the
   * session stays alive for up to RECONNECT_BUFFER_MS to allow the client
   * to reconnect with the same sessionId.
   */
  enterReconnectMode(): void {
    this._reconnecting = true;
    this.stopHeartbeat();

    this._reconnectTimeout = setTimeout(() => {
      this.destroy('reconnect timeout');
    }, config.RECONNECT_BUFFER_MS);
  }

  /** Whether this connection is in reconnect mode (waiting for client). */
  isReconnecting(): boolean {
    return this._reconnecting;
  }

  /**
   * Buffer an HTTP request during reconnection.
   * Returns true if buffered, false if buffer is full.
   */
  bufferRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    if (this._requestBuffer.length >= config.RECONNECT_BUFFER_MAX_REQUESTS) {
      return false;
    }
    this._requestBuffer.push({ req, res });
    return true;
  }

  /**
   * Resume an existing session with a new WebSocket.
   *
   * The flushFn callback is used to re-proxy buffered HTTP requests through
   * the newly reconnected tunnel. This avoids circular imports between
   * tunnel-registry.ts and request-proxy.ts.
   */
  resumeSession(
    newWs: WebSocket,
    flushFn: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): void {
    // Replace the WebSocket
    this._ws = newWs;

    // Clear reconnect timeout
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }

    // Exit reconnect mode
    this._reconnecting = false;

    // Restart heartbeat on the new WebSocket
    this.startHeartbeat();

    // Flush buffered requests
    const buffered = this._requestBuffer.splice(0);
    for (const { req, res } of buffered) {
      if (!res.headersSent) {
        flushFn(req, res);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(reason?: string): void {
    // 1. Clear reconnect timeout
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    this._reconnecting = false;

    // 2. Clear heartbeat
    this.stopHeartbeat();

    // 3. Fail all pending HTTP requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      if (!pending.res.headersSent) {
        pending.res.writeHead(502, { 'Content-Type': 'text/plain' });
        pending.res.end('Tunnel disconnected');
      }
      this.pendingRequests.delete(id);
    }

    // 4. Fail all buffered requests
    for (const { res } of this._requestBuffer) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Tunnel disconnected');
      }
    }
    this._requestBuffer = [];

    // 5. Close all browser WebSocket sessions
    for (const [id, browserWs] of this.activeBrowserSockets) {
      try {
        browserWs.close(1001, reason ?? 'tunnel disconnected');
      } catch {
        // Already closed -- ignore
      }
      this.activeBrowserSockets.delete(id);
    }

    // 6. Close tunnel WebSocket
    try {
      this._ws.removeAllListeners();
      this._ws.close(1000, reason ?? 'tunnel destroyed');
    } catch {
      // Already closed -- ignore
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
   * Mark a tunnel as disconnected, entering reconnect mode.
   * The tunnel stays in the registry for RECONNECT_BUFFER_MS so the
   * client can resume the session.
   */
  markDisconnected(username: string): void {
    const connection = this.tunnels.get(username);
    if (connection) {
      connection.enterReconnectMode();
    }
  }

  /**
   * Unregister and fully destroy a tunnel for a username.
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
