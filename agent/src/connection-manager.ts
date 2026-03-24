import WebSocket from 'ws';
import {
  AGENT_VERSION,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
  RECONNECT_MAX_JITTER,
} from './config.js';
import type {
  DeviceAuth,
  DeviceAuditEvent,
  DeviceToolCall,
  DeviceToolResult,
  DeviceToRelayMessage,
  RelayToDeviceMessage,
} from './types.js';
import { appendAuditLog, truncateParams } from './audit.js';
import { TOOL_NAMES, executeTool } from './tools.js';
import { writeState, removePid, type CredentialsData } from './state.js';
import { isTokenExpired } from './auth.js';

// ---------------------------------------------------------------------------
// Reconnection manager with exponential backoff + jitter
// (Replicated from livos TunnelClient pattern)
// ---------------------------------------------------------------------------

class ReconnectionManager {
  private attempt = 0;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxJitter: number;

  constructor() {
    this.baseDelay = RECONNECT_BASE_DELAY;   // 1000
    this.maxDelay = RECONNECT_MAX_DELAY;     // 60_000
    this.maxJitter = RECONNECT_MAX_JITTER;   // 1000
  }

  getNextDelay(): number {
    const exponentialDelay = Math.min(this.baseDelay * 2 ** this.attempt, this.maxDelay);
    const jitter = Math.random() * Math.min(this.maxJitter, exponentialDelay);
    this.attempt++;
    return exponentialDelay + jitter;
  }

  reset(): void {
    this.attempt = 0;
  }

  get consecutiveFailures(): number {
    return this.attempt;
  }
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

export interface ConnectionManagerOptions {
  credentials: CredentialsData;
}

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnection = new ReconnectionManager();
  private status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' = 'idle';
  private destroyed = false;

  private credentials: CredentialsData;

  constructor(options: ConnectionManagerOptions) {
    this.credentials = options.credentials;
  }

  // ---- Lifecycle ----

  connect(): void {
    if (this.destroyed) return;

    // Check token expiry before attempting connection
    if (isTokenExpired(this.credentials.deviceToken)) {
      console.log('[agent] Device token has expired. Cannot reconnect. Run `livinity-agent setup` to re-authenticate.');
      this.status = 'error';
      writeState({
        status: 'token_expired',
        connectedAt: undefined,
        relayUrl: this.credentials.relayUrl,
        deviceName: this.credentials.deviceName,
      });
      return;
    }

    this.status = 'connecting';
    const wsUrl = `${this.credentials.relayUrl}/device/connect`;
    console.log(`[agent] Connecting to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[agent] WebSocket creation failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      const authMsg: DeviceAuth = {
        type: 'device_auth',
        deviceToken: this.credentials.deviceToken,
        deviceId: this.credentials.deviceId,
        deviceName: this.credentials.deviceName,
        platform: process.platform as 'win32' | 'darwin' | 'linux',
        agentVersion: AGENT_VERSION,
        tools: [...TOOL_NAMES],
      };
      this.ws!.send(JSON.stringify(authMsg));
      console.log('[agent] Auth message sent');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as RelayToDeviceMessage;
        this.handleMessage(msg);
      } catch (err) {
        console.error('[agent] Failed to parse message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log(`[agent] Connection closed (was ${this.status})`);
      if (this.status === 'connected' || this.status === 'connecting') {
        this.status = 'disconnected';
        writeState({
          status: 'disconnected',
          relayUrl: this.credentials.relayUrl,
          deviceName: this.credentials.deviceName,
        });
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[agent] WebSocket error:', err.message);
      // The close handler fires next and triggers reconnect
    });
  }

  disconnect(): void {
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.status = 'disconnected';
    this.sessionId = null;

    writeState({
      status: 'disconnected',
      relayUrl: this.credentials.relayUrl,
      deviceName: this.credentials.deviceName,
    });
    removePid();

    console.log('[agent] Disconnected');
  }

  getStatus(): { status: string; sessionId: string | null } {
    return { status: this.status, sessionId: this.sessionId };
  }

  // ---- Message routing ----

  private handleMessage(msg: RelayToDeviceMessage): void {
    switch (msg.type) {
      case 'device_connected':
        this.sessionId = msg.sessionId;
        this.status = 'connected';
        this.reconnection.reset();
        writeState({
          status: 'connected',
          connectedAt: new Date().toISOString(),
          relayUrl: this.credentials.relayUrl,
          deviceName: this.credentials.deviceName,
        });
        console.log(`[agent] Connected to relay (session: ${msg.sessionId})`);
        break;

      case 'device_auth_error':
        this.status = 'error';
        console.error(`[agent] Authentication error: ${msg.error}`);
        // Do NOT reconnect on auth errors — token is invalid
        if (this.ws) {
          this.ws.close();
        }
        break;

      case 'device_ping':
        this.sendMessage({ type: 'device_pong', ts: msg.ts });
        break;

      case 'device_tool_call':
        this.handleToolCall(msg);
        break;
    }
  }

  private async handleToolCall(msg: DeviceToolCall): Promise<void> {
    let result: DeviceToolResult['result'];

    const startTime = Date.now();
    try {
      result = await executeTool(msg.tool, msg.params);
    } catch (err: unknown) {
      result = { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
    const duration = Date.now() - startTime;

    const response: DeviceToolResult = {
      type: 'device_tool_result',
      requestId: msg.requestId,
      result,
    };
    this.sendMessage(response);

    // Audit: local file log (fire-and-forget)
    const truncatedParams = truncateParams(msg.params);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      toolName: msg.tool,
      params: truncatedParams,
      success: result.success !== false,
      duration,
      error: result.error,
    });

    // Audit: send event to relay for forwarding to LivOS
    const auditEvent: DeviceAuditEvent = {
      type: 'device_audit_event',
      timestamp: new Date().toISOString(),
      toolName: msg.tool,
      params: truncatedParams,
      success: result.success !== false,
      duration,
      error: result.error,
    };
    this.sendMessage(auditEvent);
  }

  // ---- Reconnection ----

  private scheduleReconnect(): void {
    // Do not reconnect if auth failed or manager is destroyed
    if (this.status === 'error' || this.destroyed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.reconnection.getNextDelay();
    console.log(`[agent] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnection.consecutiveFailures})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ---- Helpers ----

  private sendMessage(msg: DeviceToRelayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
