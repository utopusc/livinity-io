/**
 * Device Protocol Message Types
 *
 * Duplicated from platform/relay/src/device-protocol.ts for SEA bundling simplicity.
 * These types MUST be kept in sync with the relay server definitions.
 */

// ---- Device -> Relay ----

/** Device authentication (first message after WebSocket connect) */
export interface DeviceAuth {
  type: 'device_auth';
  deviceToken: string;       // JWT from livinity.io /api/device/token
  deviceId: string;          // Stable UUID stored locally on agent
  deviceName: string;        // User-friendly name
  platform: 'win32' | 'darwin' | 'linux';
  agentVersion: string;
  tools: string[];           // List of tool names this device supports
}

/** Tool execution result from device */
export interface DeviceToolResult {
  type: 'device_tool_result';
  requestId: string;         // Matching the tool_call request ID
  result: {
    success: boolean;
    output: string;
    error?: string;
    data?: unknown;
    images?: Array<{ base64: string; mimeType: string }>;
  };
}

/** Heartbeat pong from device */
export interface DevicePong {
  type: 'device_pong';
  ts: number;
}

/** Audit event for tool execution tracking */
export interface DeviceAuditEvent {
  type: 'device_audit_event';
  timestamp: string;
  toolName: string;
  params: Record<string, unknown>;
  success: boolean;
  duration: number;
  error?: string;
  // Computer use enrichment (SEC-03)
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
}

/** Emergency stop signal from device (SEC-02) */
export interface DeviceEmergencyStop {
  type: 'device_emergency_stop';
  timestamp: string;
  reason: 'escape_hotkey';
}

// ---- Relay -> Device ----

/** Device connection confirmed */
export interface DeviceConnected {
  type: 'device_connected';
  sessionId: string;
}

/** Device auth failed */
export interface DeviceAuthError {
  type: 'device_auth_error';
  error: string;
}

/** Tool execution request sent to device */
export interface DeviceToolCall {
  type: 'device_tool_call';
  requestId: string;
  tool: string;
  params: Record<string, unknown>;
  timeout: number;           // Max execution time in ms
}

/** Heartbeat ping from relay */
export interface DevicePing {
  type: 'device_ping';
  ts: number;
}

// ---- Union types ----

/** Messages from device agent to relay */
export type DeviceToRelayMessage =
  | DeviceAuth
  | DeviceToolResult
  | DevicePong
  | DeviceAuditEvent
  | DeviceEmergencyStop;

/** Messages from relay to device agent */
export type RelayToDeviceMessage =
  | DeviceConnected
  | DeviceAuthError
  | DeviceToolCall
  | DevicePing;

/** Any device protocol message */
export type DeviceMessage =
  | DeviceToRelayMessage
  | RelayToDeviceMessage;
