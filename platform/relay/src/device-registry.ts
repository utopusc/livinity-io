/**
 * Device Registry
 *
 * Manages active device agent connections. Each user can have multiple devices.
 * DeviceConnection handles its own lifecycle: heartbeat, reconnection, cleanup.
 */

import type WebSocket from 'ws';
import { config } from './config.js';

export interface DeviceConnectionOptions {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  tools: string[];
  ws: WebSocket;
  sessionId: string;
  tokenExpiresAt: number;  // Phase 14 SESS-02: epoch ms when the device JWT expires (exp * 1000)
}

export class DeviceConnection {
  public readonly userId: string;
  public readonly deviceId: string;
  public readonly deviceName: string;
  public readonly platform: string;
  public readonly tools: string[];
  public readonly sessionId: string;
  public readonly tokenExpiresAt: number;  // Phase 14 SESS-02: watchdog checks this against Date.now()
  public readonly connectedAt: number;
  public lastSeen: number;

  private _ws: WebSocket;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private alive = true;

  // Reconnection state
  private _reconnecting = false;
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: DeviceConnectionOptions) {
    this.userId = opts.userId;
    this.deviceId = opts.deviceId;
    this.deviceName = opts.deviceName;
    this.platform = opts.platform;
    this.tools = opts.tools;
    this._ws = opts.ws;
    this.sessionId = opts.sessionId;
    this.tokenExpiresAt = opts.tokenExpiresAt;
    this.connectedAt = Date.now();
    this.lastSeen = Date.now();

    this.startHeartbeat();
  }

  get ws(): WebSocket {
    return this._ws;
  }

  // -- Heartbeat --

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this._ws.on('pong', () => {
      this.alive = true;
      this.lastSeen = Date.now();
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

  // -- Reconnection --

  enterReconnectMode(): void {
    this._reconnecting = true;
    this.stopHeartbeat();
    this._reconnectTimeout = setTimeout(() => {
      this.destroy('reconnect timeout');
    }, config.RECONNECT_BUFFER_MS);
  }

  isReconnecting(): boolean {
    return this._reconnecting;
  }

  resumeSession(newWs: WebSocket): void {
    this._ws = newWs;
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    this._reconnecting = false;
    this.lastSeen = Date.now();
    this.startHeartbeat();
  }

  // -- Cleanup --

  destroy(reason?: string): void {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    this._reconnecting = false;
    this.stopHeartbeat();
    try {
      this._ws.removeAllListeners();
      this._ws.close(1000, reason ?? 'device disconnected');
    } catch {
      // Already closed
    }
  }
}

export class DeviceRegistry {
  // userId -> deviceId -> DeviceConnection
  private readonly devices = new Map<string, Map<string, DeviceConnection>>();

  register(userId: string, deviceId: string, connection: DeviceConnection): void {
    let userDevices = this.devices.get(userId);
    if (!userDevices) {
      userDevices = new Map();
      this.devices.set(userId, userDevices);
    }
    const existing = userDevices.get(deviceId);
    if (existing) {
      existing.destroy('replaced by new connection');
    }
    userDevices.set(deviceId, connection);
  }

  unregister(userId: string, deviceId: string): void {
    const userDevices = this.devices.get(userId);
    if (!userDevices) return;
    const connection = userDevices.get(deviceId);
    if (connection) {
      connection.destroy('unregistered');
      userDevices.delete(deviceId);
    }
    if (userDevices.size === 0) {
      this.devices.delete(userId);
    }
  }

  markDisconnected(userId: string, deviceId: string): void {
    const connection = this.getDevice(userId, deviceId);
    if (connection) {
      connection.enterReconnectMode();
    }
  }

  getDevice(userId: string, deviceId: string): DeviceConnection | undefined {
    return this.devices.get(userId)?.get(deviceId);
  }

  getUserDevices(userId: string): Map<string, DeviceConnection> | undefined {
    return this.devices.get(userId);
  }

  getBySessionId(sessionId: string): DeviceConnection | undefined {
    for (const userDevices of this.devices.values()) {
      for (const connection of userDevices.values()) {
        if (connection.sessionId === sessionId) {
          return connection;
        }
      }
    }
    return undefined;
  }

  get totalDevices(): number {
    let count = 0;
    for (const userDevices of this.devices.values()) {
      count += userDevices.size;
    }
    return count;
  }

  get totalUsers(): number {
    return this.devices.size;
  }

  /** Iterate all connections (used for shutdown broadcast) */
  *allConnections(): IterableIterator<DeviceConnection> {
    for (const userDevices of this.devices.values()) {
      yield* userDevices.values();
    }
  }
}
