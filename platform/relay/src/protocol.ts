/**
 * Tunnel Protocol Message Types
 *
 * Defines all 18 message types used between the relay server and tunnel clients.
 * JSON+base64 envelope protocol — request/response bodies are base64-encoded.
 *
 * Message flow:
 *   Browser → Caddy → Relay → [tunnel WebSocket] → Tunnel Client → LivOS
 *   LivOS → Tunnel Client → [tunnel WebSocket] → Relay → Caddy → Browser
 */

// ---------------------------------------------------------------------------
// Relay → Client messages (7 types)
// ---------------------------------------------------------------------------

/** HTTP request forwarded from relay to tunnel client */
export interface TunnelRequest {
  type: 'http_request';
  /** Unique request ID for correlating responses */
  id: string;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  /** Base64-encoded request body, or null if no body */
  body: string | null;
  /** Target app name extracted from subdomain (e.g., "code-server") */
  targetApp?: string;
}

/** WebSocket upgrade request forwarded through tunnel */
export interface TunnelWsUpgrade {
  type: 'ws_upgrade';
  /** Unique WebSocket session ID */
  id: string;
  path: string;
  headers: Record<string, string | string[]>;
  /** Target app name extracted from subdomain */
  targetApp?: string;
}

/** Relay heartbeat ping — client must respond with pong */
export interface TunnelPing {
  type: 'ping';
  /** Timestamp (ms since epoch) when ping was sent */
  ts: number;
}

/** Relay is shutting down gracefully — client should reconnect */
export interface TunnelRelayShutdown {
  type: 'relay_shutdown';
}

/** Authentication succeeded, tunnel is established */
export interface TunnelConnected {
  type: 'connected';
  /** Session ID for reconnection */
  sessionId: string;
  /** Public URL assigned to this tunnel (e.g., "https://username.livinity.io") */
  assignedUrl: string;
}

/** Authentication failed */
export interface TunnelAuthError {
  type: 'auth_error';
  /** Human-readable error message */
  error: string;
}

/** Bandwidth quota exceeded — tunnel will be throttled or disconnected */
export interface TunnelQuotaExceeded {
  type: 'quota_exceeded';
  /** Bytes used in current period */
  usedBytes: number;
  /** Byte limit for current period */
  limitBytes: number;
  /** ISO 8601 timestamp when quota resets */
  resetsAt: string;
}

/** Sent to LivOS when a device agent connects to the relay */
export interface TunnelDeviceConnected {
  type: 'device_connected';
  deviceId: string;
  deviceName: string;
  platform: string;
  /** Tool names the device supports */
  tools: string[];
}

/** Sent to LivOS when a device agent disconnects from the relay */
export interface TunnelDeviceDisconnected {
  type: 'device_disconnected';
  deviceId: string;
}

/** Device tool result forwarded from relay to LivOS */
export interface TunnelDeviceToolResult {
  type: 'device_tool_result';
  requestId: string;
  deviceId: string;
  result: {
    success: boolean;
    output: string;
    error?: string;
    data?: unknown;
    images?: Array<{ base64: string; mimeType: string }>;
  };
}

/** Device audit event forwarded from relay to LivOS */
export interface TunnelDeviceAuditEvent {
  type: 'device_audit_event';
  deviceId: string;
  timestamp: string;
  toolName: string;
  params: Record<string, unknown>;
  success: boolean;
  duration: number;
  error?: string;
}

/** Device emergency stop forwarded from relay to LivOS */
export interface TunnelDeviceEmergencyStop {
  type: 'device_emergency_stop';
  deviceId: string;
  timestamp: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Client → Relay messages (5 types)
// ---------------------------------------------------------------------------

/** Initial authentication message from tunnel client */
export interface TunnelAuth {
  type: 'auth';
  /** API key for authentication */
  apiKey: string;
  /** Previous session ID for reconnection (optional) */
  sessionId?: string;
}

/** HTTP response from tunnel client back to relay */
export interface TunnelResponse {
  type: 'http_response';
  /** Request ID this responds to */
  id: string;
  /** HTTP status code */
  status: number;
  headers: Record<string, string | string[]>;
  /** Base64-encoded response body */
  body: string;
}

/** WebSocket upgrade succeeded — relay can complete browser upgrade */
export interface TunnelWsReady {
  type: 'ws_ready';
  /** WebSocket session ID this responds to */
  id: string;
}

/** WebSocket upgrade failed on the client side */
export interface TunnelWsError {
  type: 'ws_error';
  /** WebSocket session ID this responds to */
  id: string;
  /** Error description */
  error: string;
}

/** Heartbeat pong response */
export interface TunnelPong {
  type: 'pong';
  /** Echoed timestamp from the ping */
  ts: number;
}

/** LivOS sends this to invoke a tool on a remote device */
export interface TunnelDeviceToolCall {
  type: 'device_tool_call';
  requestId: string;
  deviceId: string;
  tool: string;
  params: Record<string, unknown>;
  /** Max execution time in ms, defaults to 30000 */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Bidirectional messages (2 types)
// ---------------------------------------------------------------------------

/** WebSocket frame relayed through the tunnel */
export interface TunnelWsFrame {
  type: 'ws_frame';
  /** WebSocket session ID */
  id: string;
  /** Base64-encoded frame data */
  data: string;
  /** Whether the frame is binary (true) or text (false) */
  binary: boolean;
}

/** WebSocket close notification */
export interface TunnelWsClose {
  type: 'ws_close';
  /** WebSocket session ID */
  id: string;
  /** WebSocket close code (optional) */
  code?: number;
  /** WebSocket close reason (optional) */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** All messages sent from the relay to the tunnel client */
export type RelayToClientMessage =
  | TunnelRequest
  | TunnelWsUpgrade
  | TunnelPing
  | TunnelRelayShutdown
  | TunnelConnected
  | TunnelAuthError
  | TunnelQuotaExceeded
  | TunnelDeviceConnected
  | TunnelDeviceDisconnected
  | TunnelDeviceToolResult
  | TunnelDeviceAuditEvent
  | TunnelDeviceEmergencyStop;

/** All messages sent from the tunnel client to the relay */
export type ClientToRelayMessage =
  | TunnelAuth
  | TunnelResponse
  | TunnelWsReady
  | TunnelWsError
  | TunnelPong
  | TunnelDeviceToolCall;

/** Messages that can flow in either direction */
export type BidirectionalMessage =
  | TunnelWsFrame
  | TunnelWsClose;

/** Any tunnel protocol message */
export type TunnelMessage =
  | RelayToClientMessage
  | ClientToRelayMessage
  | BidirectionalMessage;

// ---------------------------------------------------------------------------
// Discriminated union helpers
// ---------------------------------------------------------------------------

/** All possible message type discriminators */
export type MessageType = TunnelMessage['type'];

/** Map from message type string to its interface */
export type MessageTypeMap = {
  'http_request': TunnelRequest;
  'ws_upgrade': TunnelWsUpgrade;
  'ping': TunnelPing;
  'relay_shutdown': TunnelRelayShutdown;
  'connected': TunnelConnected;
  'auth_error': TunnelAuthError;
  'quota_exceeded': TunnelQuotaExceeded;
  'auth': TunnelAuth;
  'http_response': TunnelResponse;
  'ws_ready': TunnelWsReady;
  'ws_error': TunnelWsError;
  'pong': TunnelPong;
  'ws_frame': TunnelWsFrame;
  'ws_close': TunnelWsClose;
  'device_connected': TunnelDeviceConnected;
  'device_disconnected': TunnelDeviceDisconnected;
  'device_tool_call': TunnelDeviceToolCall;
  'device_tool_result': TunnelDeviceToolResult;
  'device_audit_event': TunnelDeviceAuditEvent;
  'device_emergency_stop': TunnelDeviceEmergencyStop;
};
