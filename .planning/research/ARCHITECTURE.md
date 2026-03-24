# Architecture: Remote PC Control Agent (v14.0)

**Domain:** Cross-platform remote PC control agent for AI-driven management
**Researched:** 2026-03-23
**Overall Confidence:** HIGH (architecture builds on proven existing patterns; relay/tunnel infrastructure already implemented)

---

## 1. System Overview

The Remote PC Control Agent extends the existing LivOS ecosystem with a new component that runs on the user's personal computers (Windows/Mac/Linux). The agent connects to the user's LivOS instance through the existing relay infrastructure, exposing local PC capabilities (shell, files, screenshots, clipboard, processes) as AI-callable tools in the Nexus tool registry.

**Key insight:** This is NOT a new communication system. The existing relay + tunnel infrastructure (Server5) already solves NAT traversal, auth, and bidirectional messaging. The agent is a second type of tunnel client -- one that runs on desktop PCs instead of LivOS servers.

```
                     User's PC                    Server5 (Relay)            User's LivOS
                  +------------------+          +------------------+       +------------------+
                  |  Remote Agent    |          |  Relay Server    |       |  livinityd       |
                  |  (Node.js/Rust)  |          |  (existing)      |       |  (existing)      |
                  |                  |          |                  |       |                  |
                  | [Shell Tool]     |---WSS--->| Tunnel Registry  |<--WSS-| Tunnel Client    |
                  | [Files Tool]     |          | (extended for    |       | (existing)       |
                  | [Screenshot]     |          |  device tunnels) |       |                  |
                  | [Clipboard]      |          |                  |       | [Nexus :3200]    |
                  | [Processes]      |          +------------------+       |   ToolRegistry   |
                  |                  |                                     |   AgentLoop      |
                  +------------------+                                     +------------------+
                                                                                   |
                                                                          [LivOS UI - Browser]
                                                                          "My Devices" panel
                                                                          AI Chat window
```

### Why This Topology

The agent connects to the **relay server** (not directly to LivOS). Reasons:

1. **NAT traversal is already solved.** Both the LivOS tunnel client and the remote agent sit behind NATs/firewalls. The relay is the only publicly reachable server. Trying to establish direct LivOS-to-PC connections would require STUN/TURN or WireGuard -- unnecessary complexity when a relay already exists.

2. **Auth is centralized.** The relay already validates API keys against the livinity.io database. Device tokens follow the same validation path.

3. **The relay is the rendezvous point.** When the AI on LivOS needs to execute a tool on a remote PC, the command flows: LivOS -> relay -> agent. The relay routes by device ID within a user's tunnel namespace.

---

## 2. Component Architecture

### 2.1 Remote Agent (NEW -- runs on user's PC)

**Purpose:** Lightweight daemon that exposes local PC capabilities to the user's LivOS AI via the relay tunnel.

**Technology Decision: Node.js binary via SEA (Single Executable Application)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Node.js SEA | Same language as LivOS/Nexus, reuse protocol types, fast iteration | 60-80MB binary, native addon complexity for screenshots | **Recommended for v14.0** |
| Rust binary | 5-10MB binary, native system access, cross-compile via `cross` | Different language, separate build toolchain, harder to iterate | Better for v15.0+ polish |
| Electron/Tauri | GUI, tray icon, familiar | 100MB+ for Electron, overkill for a background agent | Rejected |

**Rationale for Node.js SEA:** The agent shares protocol types with the relay (`protocol.ts`), the tool interface matches Nexus (`Tool`, `ToolResult`, `ToolParameter`), and the team already works in TypeScript. The 60-80MB binary size is acceptable for a desktop download. Cross-platform builds use Docker + GitHub Actions. Screenshot capture uses `node-screenshots` (zero-dep native addon for Win/Mac/Linux). In a future version, rewriting the agent in Rust for a smaller binary is straightforward since the protocol is JSON over WebSocket.

**Architecture:**

```
Remote Agent Process
|
+-- Connection Manager
|   |-- Connects to wss://relay.livinity.io/device/connect
|   |-- Authenticates with device token (issued during registration)
|   |-- Ping/pong heartbeat (30s)
|   |-- Auto-reconnect with exponential backoff (same as TunnelClient)
|
+-- Tool Executor
|   |-- Receives tool_call messages from relay
|   |-- Dispatches to registered local tools
|   |-- Returns tool_result messages
|   |-- Enforces permission policy (per-device allow/deny list)
|
+-- Local Tools
|   |-- shell: execute commands via child_process
|   |-- files: read/write/list/stat via fs
|   |-- screenshot: capture via node-screenshots
|   |-- clipboard: read/write via clipboardy
|   |-- processes: list via systeminformation or os-level commands
|   |-- system_info: CPU, RAM, disk, OS version
|
+-- Permission Manager
|   |-- Reads permission config from local file (~/.livinity/permissions.json)
|   |-- Can be updated remotely via control messages from LivOS
|   |-- Default: all tools enabled, dangerous commands blocked
|
+-- Audit Logger
    |-- Logs every tool execution to local file (~/.livinity/audit.log)
    |-- Sends audit events back to LivOS for the audit log UI
```

### 2.2 Relay Server Extensions (MODIFIED -- runs on Server5)

**Changes to the existing relay:**

The relay currently manages one tunnel per user (LivOS instance). For v14.0, it needs to manage **N device tunnels per user** in addition to the one LivOS tunnel.

**New endpoint:** `wss://relay.livinity.io/device/connect`

This is separate from `/tunnel/connect` (which is for LivOS instances) because:
- Different auth flow (device token vs API key)
- Different message types (tool_call/tool_result vs http_request/http_response)
- Different registry (DeviceRegistry vs TunnelRegistry)
- A user can have many devices but only one LivOS tunnel

**Relay extension architecture:**

```
Relay Server Process (:4000)  -- existing
|
+-- HTTP Server (existing)
|   +-- /tunnel/connect    -- existing LivOS tunnel
|   +-- /device/connect    -- NEW device agent tunnel
|
+-- TunnelRegistry (existing, unchanged)
|   |-- Map<username, TunnelConnection>
|
+-- DeviceRegistry (NEW)
|   |-- Map<username, Map<deviceId, DeviceConnection>>
|   |-- DeviceConnection holds: ws, deviceId, deviceName, platform, tools[], lastSeen
|
+-- Device Message Router (NEW)
    |-- Receives tool_call from LivOS tunnel (via special message type)
    |-- Looks up target device in DeviceRegistry
    |-- Forwards tool_call to device agent
    |-- Returns tool_result to LivOS tunnel
```

### 2.3 Nexus Tool Integration (MODIFIED -- runs on LivOS)

**The critical design question:** How do remote PC tools appear in the Nexus ToolRegistry?

**Decision: Dynamic proxy tools registered per connected device.**

When a device connects to the relay and the relay notifies LivOS (via the existing tunnel WebSocket), LivOS dynamically registers proxy tools in the Nexus ToolRegistry. When a device disconnects, the tools are unregistered.

```typescript
// When device "desktop-pc" connects with tools [shell, files, screenshot]:
toolRegistry.register({
  name: 'device_desktop-pc_shell',
  description: 'Execute a shell command on "Desktop PC" (Windows 11, connected)',
  parameters: [
    { name: 'command', type: 'string', description: 'Shell command to execute', required: true },
  ],
  execute: async (params) => {
    // Send tool_call through relay tunnel to device agent
    return await deviceBridge.executeOnDevice('desktop-pc', 'shell', params);
  },
});
```

**Why prefix with `device_{deviceId}_`:**
- Avoids name collisions with local Nexus tools (e.g., local `shell` vs remote `device_desktop-pc_shell`)
- The AI naturally selects the right device when the user says "show me files on my desktop PC"
- Multiple devices get distinct tool names: `device_desktop-pc_shell`, `device_macbook_shell`

**Alternative considered and rejected: MCP server per device.** Each device could expose its tools via MCP, and Nexus's MCP client manager would discover them. This adds unnecessary complexity -- MCP requires a persistent stdio or HTTP connection per device, whereas the relay already provides the transport. The proxy tool approach is simpler and uses the existing ToolRegistry.

### 2.4 LivOS UI -- "My Devices" (NEW -- runs in browser)

**Purpose:** Show connected devices, their status, capabilities, and permission controls.

**Location:** New tRPC router `devices` in livinityd, new UI panel accessible from the desktop.

```
My Devices Panel
|
+-- Device List
|   |-- Device name, OS, platform icon
|   |-- Connection status (online/offline/connecting)
|   |-- Last seen timestamp
|   |-- Available tools
|
+-- Device Detail (drawer/modal)
|   |-- Quick actions: "Open terminal", "Take screenshot", "Browse files"
|   |-- Permission toggles per tool
|   |-- Audit log (recent operations on this device)
|   |-- Rename, remove device
|
+-- Add Device
    |-- Shows device code or QR code
    |-- Instructions for installing agent on PC
```

---

## 3. Data Flow Diagrams

### 3.1 Full Command Flow: User -> AI -> Remote PC

```
User (Browser)          LivOS (livinityd)     Nexus (AI)           Relay           Remote Agent
     |                       |                     |                  |                  |
     | "Show me files on     |                     |                  |                  |
     |  my desktop PC"       |                     |                  |                  |
     |---------------------->|                     |                  |                  |
     |                       |                     |                  |                  |
     |              AI Chat tRPC mutation           |                  |                  |
     |              (existing ai.chat flow)         |                  |                  |
     |                       |--SSE stream--------->|                  |                  |
     |                       |                     |                  |                  |
     |                       |          AgentLoop selects tool:       |                  |
     |                       |          device_desktop-pc_files       |                  |
     |                       |          params: {operation:"list",    |                  |
     |                       |                   path:"~/Desktop"}   |                  |
     |                       |                     |                  |                  |
     |                       |          ToolRegistry.execute()        |                  |
     |                       |          -> DeviceBridge.executeOnDevice()               |
     |                       |                     |                  |                  |
     |                       |                     |   tool_call msg  |                  |
     |                       |                     |   (via tunnel WS)|                  |
     |                  [LivOS tunnel WS]----------|----------------->|                  |
     |                       |                     |                  |                  |
     |                       |                     |          Route to|                  |
     |                       |                     |          device  |   tool_call msg  |
     |                       |                     |                  |----------------->|
     |                       |                     |                  |                  |
     |                       |                     |                  |        Execute   |
     |                       |                     |                  |        fs.readdir|
     |                       |                     |                  |        locally   |
     |                       |                     |                  |                  |
     |                       |                     |                  |   tool_result    |
     |                       |                     |                  |<-----------------|
     |                       |                     |                  |                  |
     |                  [LivOS tunnel WS]<---------|------------------|                  |
     |                       |                     |                  |                  |
     |                       |          DeviceBridge resolves promise |                  |
     |                       |          ToolResult returned           |                  |
     |                       |                     |                  |                  |
     |                       |          AgentLoop continues:          |                  |
     |                       |          formats file listing          |                  |
     |                       |          for user                     |                  |
     |                       |                     |                  |                  |
     |                       |<--SSE final_answer---|                  |                  |
     |<----------------------|                     |                  |                  |
     | "Here are the files   |                     |                  |                  |
     |  on your Desktop..."  |                     |                  |                  |
```

### 3.2 Device Registration Flow (OAuth Device Authorization Grant)

```
User (Browser)       livinity.io          Relay          Remote Agent (new PC)
     |                    |                  |                  |
     |  1. User downloads agent binary                         |
     |  2. Runs: livinity-agent setup                          |
     |                    |                  |                  |
     |                    |                  |   POST /api/     |
     |                    |                  |   device/register|
     |                    |                  |                  |
     |                    |<------------------------------------|
     |                    |                  |                  |
     |              Generate device_code     |                  |
     |              + user_code              |                  |
     |              (RFC 8628)               |                  |
     |                    |                  |                  |
     |                    |------------------------------------>|
     |                    |  { device_code, user_code,          |
     |                    |    verification_uri,                |
     |                    |    interval: 5 }                    |
     |                    |                  |                  |
     |                    |                  |  Agent displays: |
     |                    |                  |  "Go to          |
     |                    |                  |   livinity.io/   |
     |                    |                  |   device         |
     |                    |                  |   Enter code:    |
     |                    |                  |   ABCD-1234"     |
     |                    |                  |                  |
     |  3. User opens livinity.io/device     |                  |
     |     enters code ABCD-1234             |                  |
     |-------------------->|                  |                  |
     |                    |                  |                  |
     |              Validates user_code      |                  |
     |              Links device to user     |                  |
     |              Stores in PostgreSQL:    |                  |
     |              devices table            |                  |
     |                    |                  |                  |
     |  "Device approved!" |                  |                  |
     |<--------------------|                  |                  |
     |                    |                  |                  |
     |                    |                  |   Agent polls:   |
     |                    |                  |   POST /api/     |
     |                    |                  |   device/token   |
     |                    |<------------------------------------|
     |                    |                  |                  |
     |              User approved ->         |                  |
     |              Issue device_token (JWT) |                  |
     |              { userId, deviceId,      |                  |
     |                deviceName, exp }      |                  |
     |                    |                  |                  |
     |                    |------------------------------------>|
     |                    |  { device_token,                    |
     |                    |    relay_url }                      |
     |                    |                  |                  |
     |                    |                  |  4. Agent stores |
     |                    |                  |  token in        |
     |                    |                  |  ~/.livinity/    |
     |                    |                  |  credentials.json|
     |                    |                  |                  |
     |                    |                  |  5. Connects to  |
     |                    |                  |  relay via WSS   |
     |                    |                  |<-----------------|
     |                    |                  |                  |
     |                    |          Relay validates            |
     |                    |          device_token JWT           |
     |                    |          Registers in               |
     |                    |          DeviceRegistry             |
     |                    |                  |                  |
     |                    |          Notifies LivOS             |
     |                    |          (via existing tunnel)      |
     |                    |          "device_connected" event   |
```

**Why OAuth Device Authorization Grant (RFC 8628):**
- The agent runs on a CLI/headless environment -- it may not have a browser
- The user approves on a device they already trust (their phone/laptop browser, already logged into livinity.io)
- Standard flow, well-understood security properties
- No need to paste API keys manually -- the code is short and human-friendly (e.g., "ABCD-1234")

### 3.3 Device-to-LivOS Notification (Connection Events)

```
Remote Agent              Relay                    LivOS Tunnel Client       Nexus
     |                      |                            |                    |
     | WSS connect +        |                            |                    |
     | device_token auth    |                            |                    |
     |--------------------->|                            |                    |
     |                      |                            |                    |
     |             Register in DeviceRegistry            |                    |
     |             Publish event on user's               |                    |
     |             LivOS tunnel WebSocket:               |                    |
     |                      |                            |                    |
     |                      | { type: "device_event",    |                    |
     |                      |   event: "connected",      |                    |
     |                      |   deviceId: "desktop-pc",  |                    |
     |                      |   deviceName: "Desktop",   |                    |
     |                      |   platform: "win32",       |                    |
     |                      |   tools: ["shell","files", |                    |
     |                      |           "screenshot",    |                    |
     |                      |           "clipboard",     |                    |
     |                      |           "processes"] }   |                    |
     |                      |--------------------------->|                    |
     |                      |                            |                    |
     |                      |                   LivOS receives event          |
     |                      |                   Updates Redis device state    |
     |                      |                   Registers proxy tools         |
     |                      |                            |                    |
     |                      |                            |--> toolRegistry    |
     |                      |                            |    .register(      |
     |                      |                            |    device_desktop- |
     |                      |                            |    pc_shell, ...)  |
     |                      |                            |                    |
     |                      |                   Emits tRPC event for UI       |
     |                      |                   (device list subscription)    |
```

---

## 4. Protocol Extension

### 4.1 New Message Types (Device Protocol)

The device protocol is distinct from the LivOS tunnel protocol but follows the same JSON+base64 envelope pattern.

**Device -> Relay:**

```typescript
/** Device authentication */
interface DeviceAuth {
  type: 'device_auth';
  deviceToken: string;       // JWT from livinity.io
  deviceId: string;          // Stable UUID stored locally
  deviceName: string;        // User-friendly name
  platform: 'win32' | 'darwin' | 'linux';
  agentVersion: string;
  tools: string[];           // List of tool names this device supports
}

/** Tool execution result */
interface DeviceToolResult {
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

/** Heartbeat pong */
interface DevicePong {
  type: 'device_pong';
  ts: number;
}
```

**Relay -> Device:**

```typescript
/** Tool execution request */
interface DeviceToolCall {
  type: 'device_tool_call';
  requestId: string;         // Unique ID for correlation
  tool: string;              // Tool name (e.g., "shell", "files")
  params: Record<string, unknown>;
  timeout: number;           // Max execution time in ms
}

/** Heartbeat ping */
interface DevicePing {
  type: 'device_ping';
  ts: number;
}

/** Permission update from LivOS */
interface DevicePermissionUpdate {
  type: 'device_permission_update';
  permissions: {
    allowedTools: string[];
    blockedCommands: string[];  // Shell command patterns to block
  };
}
```

**Relay -> LivOS (via existing tunnel WebSocket):**

```typescript
/** Device connection/disconnection event */
interface DeviceEvent {
  type: 'device_event';
  event: 'connected' | 'disconnected';
  deviceId: string;
  deviceName: string;
  platform: 'win32' | 'darwin' | 'linux';
  tools: string[];           // Available tools (empty on disconnect)
}

/** Tool result forwarded from device to LivOS */
interface DeviceToolResultForward {
  type: 'device_tool_result_forward';
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
```

**LivOS -> Relay (via existing tunnel WebSocket):**

```typescript
/** Tool call forwarded from LivOS to device via relay */
interface DeviceToolCallForward {
  type: 'device_tool_call_forward';
  requestId: string;
  deviceId: string;          // Target device
  tool: string;
  params: Record<string, unknown>;
  timeout: number;
}
```

### 4.2 Message Routing Through Relay

The relay acts as a message router between the LivOS tunnel and device tunnels:

```
LivOS sends:    { type: "device_tool_call_forward", deviceId: "desktop-pc", ... }
                         |
                    Relay receives on LivOS tunnel WebSocket
                    Extracts deviceId
                    Looks up DeviceRegistry[username]["desktop-pc"]
                    Transforms to: { type: "device_tool_call", ... }
                    Sends to device WebSocket
                         |
Device receives: { type: "device_tool_call", tool: "shell", params: {command: "ls"} }
Device executes locally
Device sends:    { type: "device_tool_result", requestId: "abc123", result: {...} }
                         |
                    Relay receives on device WebSocket
                    Transforms to: { type: "device_tool_result_forward", ... }
                    Sends to LivOS tunnel WebSocket
                         |
LivOS receives:  { type: "device_tool_result_forward", deviceId: "desktop-pc", ... }
                    DeviceBridge resolves the pending promise
                    ToolResult returned to AgentLoop
```

---

## 5. NAT Traversal Strategy

### Decision: WebSocket Relay (NOT WireGuard, NOT STUN/TURN)

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| WebSocket relay (existing) | Already built, firewall-friendly (port 443), works everywhere | Adds latency hop (~10-50ms), relay bandwidth cost | **Use this** |
| WireGuard tunnel | Low latency, UDP, E2E encrypted | Requires kernel module or userspace impl on all 3 platforms, NAT traversal still needs relay for symmetric NAT, complex setup | Overkill for v14.0 |
| STUN/TURN (WebRTC) | Direct P2P when possible | Still needs TURN relay for 10-30% of connections, WebRTC complexity, no benefit for tool execution latency | Wrong abstraction |
| Direct TCP/UDP | Lowest latency | NAT traversal is unsolved without relay/STUN, requires port forwarding | Non-starter |

**Rationale:** The existing relay on Server5 is already deployed and handles WebSocket tunnels for LivOS instances. Adding device connections to this relay requires minimal new infrastructure. The added latency (~10-50ms per hop) is irrelevant for tool execution (shell commands take 100ms-10s, file operations similar). The relay already handles TLS termination, auth validation, and bandwidth metering.

**Firewall compatibility:** WebSocket over TLS on port 443 passes through essentially every corporate firewall, home router, and hotel WiFi captive portal. This is the same reason the LivOS tunnel uses WebSocket.

---

## 6. Authentication and Security

### 6.1 Auth Flow Summary

```
1. User downloads agent binary
2. Runs `livinity-agent setup`
3. Agent requests device_code from livinity.io (POST /api/device/register)
4. Agent displays: "Go to livinity.io/device and enter code: ABCD-1234"
5. User visits livinity.io/device, enters code, approves
6. Agent polls livinity.io until approved, receives device_token (JWT)
7. Agent stores device_token in ~/.livinity/credentials.json
8. Agent connects to relay with device_token
9. Relay validates JWT, registers device in DeviceRegistry
10. Relay notifies LivOS via tunnel: "device connected"
```

### 6.2 Device Token Structure

```typescript
interface DeviceTokenPayload {
  sub: string;           // userId (from livinity.io)
  deviceId: string;      // Unique device ID (UUID, generated during registration)
  deviceName: string;    // User-provided name
  iat: number;           // Issued at
  exp: number;           // Expiry (long-lived: 1 year, refreshable)
  iss: 'livinity.io';
  aud: 'relay.livinity.io';
}
```

**Token lifecycle:**
- Issued by livinity.io during device approval
- Long-lived (1 year) because the agent runs unattended
- Refreshable via `POST /api/device/refresh-token` (before expiry)
- Revocable from livinity.io dashboard or LivOS "My Devices" UI
- On revocation, relay immediately disconnects the device WebSocket

### 6.3 Security Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Transport | TLS (WSS) via Caddy | Encryption in transit |
| Authentication | JWT device token, validated by relay | Only authorized devices connect |
| Authorization | Per-device permission policy | Restrict which tools/commands are available |
| Command filtering | Shell command blocklist | Block `rm -rf /`, `format`, `shutdown`, etc. |
| Audit | Every tool execution logged | Forensics, accountability |
| Revocation | livinity.io dashboard + LivOS UI | Instant device removal |

### 6.4 Why NOT End-to-End Encryption

E2EE between LivOS and the remote agent (with relay as blind forwarder) was considered. Decision: **TLS + JWT is sufficient for v14.0.**

Reasons:
- The relay is operated by the same entity (Livinity) that operates the platform. It is a trusted intermediary, not a third-party.
- E2EE would require key exchange between LivOS and each device, adding complexity to the protocol (key negotiation, rotation, recovery).
- The relay needs to inspect message types for routing (device_tool_call vs device_tool_result). E2EE would require encrypted routing headers or onion-style layering.
- Real-world threat model: the relay runs on Server5, which is fully controlled. The risk of relay compromise is lower than the risk of agent binary tampering or credential theft on the user's PC.
- TLS already provides encryption in transit between each hop (agent <-> relay, relay <-> LivOS).

---

## 7. Nexus Integration Architecture

### 7.1 DeviceBridge Module (NEW -- inside Nexus or livinityd)

**Location:** `livos/packages/livinityd/source/modules/devices/device-bridge.ts`

**Purpose:** Manages the mapping between remote device connections and Nexus tools. When a device connects/disconnects (notified via the tunnel WebSocket), the bridge registers/unregisters proxy tools in the Nexus ToolRegistry.

```typescript
export class DeviceBridge {
  private pendingCalls = new Map<string, {
    resolve: (result: ToolResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  constructor(
    private tunnelClient: TunnelClient,  // Existing tunnel to relay
    private toolRegistry: ToolRegistry,  // Nexus tool registry
    private redis: Redis,
  ) {}

  /** Called when relay notifies us of a device connection */
  handleDeviceConnected(event: DeviceEvent): void {
    // Store device state in Redis
    // Register proxy tools for each tool the device supports
    for (const toolName of event.tools) {
      this.registerProxyTool(event.deviceId, event.deviceName, toolName, event.platform);
    }
  }

  /** Called when relay notifies us of a device disconnection */
  handleDeviceDisconnected(event: DeviceEvent): void {
    // Remove device state from Redis
    // Unregister all proxy tools for this device
    // Reject any pending tool calls
  }

  /** Execute a tool on a remote device (called by proxy tool) */
  async executeOnDevice(
    deviceId: string,
    tool: string,
    params: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<ToolResult> {
    const requestId = nanoid();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(requestId);
        reject(new Error(`Device tool call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCalls.set(requestId, { resolve, reject, timeout });

      // Send through the existing tunnel WebSocket
      this.tunnelClient.sendDeviceToolCall({
        type: 'device_tool_call_forward',
        requestId,
        deviceId,
        tool,
        params,
        timeout: timeoutMs,
      });
    });
  }

  /** Called when relay forwards a tool result from a device */
  handleDeviceToolResult(msg: DeviceToolResultForward): void {
    const pending = this.pendingCalls.get(msg.requestId);
    if (!pending) return;  // Timed out or duplicate

    clearTimeout(pending.timeout);
    this.pendingCalls.delete(msg.requestId);
    pending.resolve(msg.result);
  }

  private registerProxyTool(
    deviceId: string,
    deviceName: string,
    toolName: string,
    platform: string,
  ): void {
    const fullName = `device_${deviceId}_${toolName}`;
    const toolDef = DEVICE_TOOL_DEFINITIONS[toolName];  // Predefined schemas
    if (!toolDef) return;

    this.toolRegistry.register({
      name: fullName,
      description: `${toolDef.description} on "${deviceName}" (${platform})`,
      parameters: toolDef.parameters,
      execute: (params) => this.executeOnDevice(deviceId, toolName, params),
    });
  }
}
```

### 7.2 How the AI Discovers Device Tools

The AI already sees all tools via `ToolRegistry.listForPrompt()`. When devices connect, their tools appear in the prompt:

```
Available tools:
- shell: Execute a shell command on the server
- files: File system operations
- device_desktop-pc_shell: Execute a shell command on "Desktop PC" (win32)
- device_desktop-pc_files: File system operations on "Desktop PC" (win32)
- device_desktop-pc_screenshot: Take a screenshot on "Desktop PC" (win32)
- device_macbook_shell: Execute a shell command on "MacBook Pro" (darwin)
...
```

The AI naturally routes to the correct device when the user says "show me what's on my desktop PC" or "take a screenshot of my MacBook".

### 7.3 Tool Definitions (Predefined Schema)

```typescript
const DEVICE_TOOL_DEFINITIONS: Record<string, Omit<Tool, 'name' | 'execute'>> = {
  shell: {
    description: 'Execute a shell command',
    parameters: [
      { name: 'command', type: 'string', description: 'Command to execute', required: true },
      { name: 'cwd', type: 'string', description: 'Working directory', required: false },
      { name: 'timeout', type: 'number', description: 'Timeout in ms (default: 30000)', required: false },
    ],
  },
  files: {
    description: 'File system operations: read, write, list, stat, delete, mkdir',
    parameters: [
      { name: 'operation', type: 'string', description: 'read|write|list|stat|delete|mkdir', required: true },
      { name: 'path', type: 'string', description: 'File or directory path', required: true },
      { name: 'content', type: 'string', description: 'Content for write operation', required: false },
    ],
  },
  screenshot: {
    description: 'Capture a screenshot of the screen',
    parameters: [
      { name: 'display', type: 'number', description: 'Display index (default: 0)', required: false },
      { name: 'quality', type: 'number', description: 'JPEG quality 1-100 (default: 70)', required: false },
    ],
  },
  clipboard: {
    description: 'Read or write the system clipboard',
    parameters: [
      { name: 'operation', type: 'string', description: 'read|write', required: true },
      { name: 'content', type: 'string', description: 'Content for write operation', required: false },
    ],
  },
  processes: {
    description: 'List running processes with CPU and memory usage',
    parameters: [
      { name: 'sort', type: 'string', description: 'Sort by: cpu|memory|name (default: cpu)', required: false },
      { name: 'limit', type: 'number', description: 'Max processes to return (default: 20)', required: false },
    ],
  },
  system_info: {
    description: 'Get system information: CPU, RAM, disk, OS version, network',
    parameters: [
      { name: 'topic', type: 'string', description: 'all|cpu|memory|disk|os|network', required: false },
    ],
  },
};
```

---

## 8. Multi-Device Management

### 8.1 Data Model

**livinity.io PostgreSQL (device registration):**

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,          -- 'win32', 'darwin', 'linux'
  agent_version TEXT,
  device_code TEXT,                -- Temporary, for OAuth device flow
  user_code TEXT,                  -- Temporary, for OAuth device flow
  approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  token_hash TEXT,                 -- Hash of issued device token
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**LivOS Redis (runtime device state):**

```
livos:devices:{deviceId}:status    -> "connected" | "disconnected"
livos:devices:{deviceId}:name      -> "Desktop PC"
livos:devices:{deviceId}:platform  -> "win32"
livos:devices:{deviceId}:tools     -> '["shell","files","screenshot","clipboard","processes"]'
livos:devices:{deviceId}:lastSeen  -> "2026-03-23T12:00:00Z"
livos:devices:list                 -> Set of deviceIds
```

### 8.2 Device Limits

| Tier | Max Devices | Rationale |
|------|-------------|-----------|
| Free | 2 | Enough for personal use (desktop + laptop) |
| Pro | 10 | Power users, small team |

Enforced at device registration time (livinity.io checks device count before issuing device_code).

### 8.3 Device Selection by AI

When multiple devices are connected, the AI selects the right one based on context:

- User says "check my desktop" -> AI uses `device_desktop-pc_*` tools (name matching)
- User says "take a screenshot of my Mac" -> AI uses `device_macbook_*` tools (platform + name matching)
- User says "run `git status`" (ambiguous) -> AI asks which device, or uses the last-used device

The tool descriptions include device name and platform, which gives the AI sufficient context for selection.

---

## 9. Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Remote Agent (Node.js binary) | Runs on user's PC, executes tools locally, connects to relay | Relay server (WSS) |
| Relay DeviceRegistry (extension) | Manages device connections per user, routes messages | Device agents (WSS), LivOS tunnels (WSS) |
| DeviceBridge (livinityd module) | Registers proxy tools, routes tool calls through tunnel | Nexus ToolRegistry, TunnelClient, Redis |
| Nexus ToolRegistry (existing) | Stores tool definitions, executes tools | AgentLoop, DeviceBridge |
| Nexus AgentLoop (existing) | AI selects and calls tools | ToolRegistry (includes device proxy tools) |
| LivOS UI - My Devices (new) | Shows connected devices, permissions, audit log | tRPC devices router |
| livinity.io /api/device/* (new) | Device registration, OAuth device flow, token issuance | PostgreSQL, devices table |

---

## 10. Patterns to Follow

### Pattern 1: Proxy Tool Pattern

**What:** Remote capabilities exposed as local tools via a bridge that serializes calls over the network.
**When:** Any time a remote system's capabilities need to appear in the AI's tool set.
**Why:** The AI does not need to know about networking, relay, or device connections. It just calls tools.

```typescript
// The AI sees this as a regular tool:
toolRegistry.register({
  name: 'device_desktop-pc_screenshot',
  description: 'Take a screenshot on "Desktop PC" (win32)',
  parameters: [...],
  execute: async (params) => {
    // Bridge handles all networking transparently
    return await deviceBridge.executeOnDevice('desktop-pc', 'screenshot', params);
  },
});
```

### Pattern 2: Event-Driven Device State

**What:** Device connect/disconnect events flow from relay -> tunnel -> LivOS, triggering tool registration/unregistration.
**When:** Any time device availability changes.
**Why:** The system is always consistent. If a device is offline, its tools are not in the registry, and the AI cannot attempt to use them.

### Pattern 3: Request-Response Over Tunnel with Timeout

**What:** Tool calls are sent through the relay with a unique requestId and a timeout. The bridge holds a promise that resolves when the result arrives or rejects on timeout.
**When:** Every remote tool execution.
**Why:** Matches the existing tunnel pattern (TunnelRequest/TunnelResponse with request ID correlation in the relay).

---

## 11. Anti-Patterns to Avoid

### Anti-Pattern 1: Direct LivOS-to-Agent Connection

**What:** Having the remote agent connect directly to the LivOS instance.
**Why bad:** Both are behind NATs. Would require STUN/TURN or WireGuard, adding enormous complexity. The relay already exists.
**Instead:** Route everything through the relay.

### Anti-Pattern 2: MCP Server Per Device

**What:** Exposing each device's tools as an MCP server, discovered by Nexus's MCP client manager.
**Why bad:** MCP expects persistent stdio or HTTP transport. Each device would need its own MCP connection through the relay, requiring a new transport abstraction. The protocol overhead (JSON-RPC, capability negotiation) adds no value here.
**Instead:** Use the proxy tool pattern with direct ToolRegistry integration.

### Anti-Pattern 3: Storing Device State in PostgreSQL on LivOS

**What:** Persisting device connection state (online/offline) in LivOS's PostgreSQL.
**Why bad:** Device state is ephemeral. A device can disconnect at any moment. Writing to PostgreSQL for every connect/disconnect is wasteful. Redis is the right store for ephemeral state.
**Instead:** Redis for runtime state, PostgreSQL only for persistent device metadata (name, permissions, audit log).

### Anti-Pattern 4: Long-Polling for Device Events

**What:** Polling the relay or LivOS for device connection state changes.
**Why bad:** The tunnel WebSocket is already a persistent bidirectional connection. Push device events through it.
**Instead:** Relay pushes `device_event` messages through the existing tunnel WebSocket.

### Anti-Pattern 5: Unrestricted Shell Access by Default

**What:** Allowing the AI to run any command on a remote PC without restrictions.
**Why bad:** A bug or prompt injection could cause `rm -rf ~` or `shutdown /s` on the user's personal computer. The consequences are more severe than on a server (user's personal data).
**Instead:** Default permission policy blocks dangerous commands. User explicitly opts in to elevated access per device.

---

## 12. Scalability Considerations

| Concern | At 1 device | At 10 devices per user | At 100 concurrent users |
|---------|-------------|------------------------|------------------------|
| Relay memory | ~50KB per WS connection | ~500KB per user | ~50MB total |
| Tool registry | +6 tools per device | +60 tools | N/A (per-user registries) |
| AI prompt size | +~200 tokens per device | +~2000 tokens | N/A (per-user) |
| Relay routing | O(1) Map lookup | O(1) Map lookup | O(1) Map lookup |
| Bandwidth | Negligible (tool calls are small) | Same | ~100KB/s aggregate |

**Key constraint at scale:** The AI prompt grows with each connected device (each device adds ~6 tool descriptions). At 10 devices per user, this adds ~2000 tokens to the system prompt. If this becomes problematic, implement tool grouping: instead of registering individual tools per device, register a single `device_control` meta-tool that takes `deviceId` and `tool` as parameters.

---

## 13. Suggested Build Order (Dependency-Aware)

| Phase | Components | Depends On | Rationale |
|-------|-----------|------------|-----------|
| 1 | Device protocol types + relay DeviceRegistry + /device/connect endpoint | Existing relay | Foundation: devices can connect to relay |
| 2 | livinity.io OAuth device flow (register/approve/token) + /device page UI | livinity.io platform | Auth: devices can get tokens |
| 3 | Remote agent binary: connection manager + auth + heartbeat (no tools yet) | Phase 1, 2 | Integration test: agent connects through relay |
| 4 | Relay message routing (forward tool_call between LivOS tunnel and device) | Phase 1 | Plumbing: relay can route messages |
| 5 | DeviceBridge in livinityd: proxy tool registration on device connect/disconnect | Phase 4 | AI integration: device tools appear in Nexus |
| 6 | Remote agent local tools: shell, files, system_info | Phase 3 | Core tools working end-to-end |
| 7 | Remote agent additional tools: screenshot, clipboard, processes | Phase 6 | Extended capabilities |
| 8 | LivOS UI: My Devices panel + device list + status | Phase 5 | User visibility |
| 9 | Permission system: per-device allow/deny, command blocklist | Phase 5, 6 | Security hardening |
| 10 | Audit logging: every tool execution recorded + UI | Phase 6, 8 | Compliance, accountability |
| 11 | Agent installer: one-line install script for Win/Mac/Linux | Phase 3 | Distribution |
| 12 | Polish: auto-update, tray icon (optional), error UX | Phase 11 | Production readiness |

**Critical path:** Phases 1 -> 2 -> 3 -> 4 -> 5 -> 6 (device connects, auth works, relay routes, tools execute).

---

## Sources

- [Cloudflare Browser-Based RDP Architecture](https://blog.cloudflare.com/browser-based-rdp/) -- WebSocket relay pattern for remote desktop
- [RFC 8628 - OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628) -- Standard for headless device auth
- [WorkOS - Device Authorization Grant: Solving OAuth for screens without keyboards](https://workos.com/blog/oauth-device-authorization-grant) -- Practical implementation guide
- [Tailscale - How NAT Traversal Works](https://tailscale.com/blog/how-nat-traversal-works) -- Comprehensive NAT traversal analysis
- [Tunnel Any Traffic Over WebSockets to Bypass Firewalls](https://www.blog.brightcoding.dev/2025/09/27/tunnel-any-traffic-over-websockets-to-bypass-firewalls-and-proxies/) -- WebSocket tunnel advantages
- [Anthropic - New Agent Capabilities API](https://www.anthropic.com/news/agent-capabilities-api) -- AI agent tool execution patterns
- [Claude Computer Use Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- AI PC control architecture reference
- [Node.js Single Executable Applications Documentation](https://nodejs.org/api/single-executable-applications.html) -- SEA for cross-platform binaries
- [Joyee Cheung - Improving SEA Building for Node.js](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/) -- Node.js SEA improvements 2026
- [node-screenshots - Zero-dependency native screenshots](https://github.com/nashaofu/node-screenshots) -- Cross-platform screenshot library
- [FleetDM - Open Device Management](https://fleetdm.com/) -- Multi-device fleet management patterns
- [Azure AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- Enterprise agent design patterns
- Existing codebase: `platform/relay/src/protocol.ts`, `platform/relay/src/tunnel-registry.ts`, `livos/packages/livinityd/source/modules/platform/tunnel-client.ts`, `nexus/packages/core/src/tool-registry.ts`, `nexus/packages/core/src/daemon.ts`
