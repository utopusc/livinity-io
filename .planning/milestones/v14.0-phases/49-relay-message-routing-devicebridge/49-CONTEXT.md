# Phase 49: Relay Message Routing + DeviceBridge - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase wires the message routing between LivOS and remote devices. Delivers: relay-side tool_call/tool_result forwarding between LivOS tunnel and device connections, LivOS-side DeviceBridge module that registers/unregisters proxy tools in Nexus ToolRegistry, and device connect/disconnect event handling. After this phase, the AI agent loop can invoke device tools and receive results.

</domain>

<decisions>
## Implementation Decisions

### Relay Message Routing
- Add two new message types to the relay's tunnel protocol: `device_tool_call` (relay -> device) and `device_tool_result` (device -> relay -> LivOS)
- When LivOS sends a `device_tool_call` through its tunnel WS, relay looks up target device in DeviceRegistry, forwards to device agent WS
- When device sends `device_tool_result`, relay forwards back to the LivOS tunnel WS
- Messages include: requestId (nanoid), deviceId, toolName, params/result, timestamp
- Relay is a pass-through — does not parse or validate tool payloads, only routes by deviceId
- Add `device_connected` and `device_disconnected` event messages sent from relay to LivOS tunnel when devices connect/disconnect. Include deviceId, deviceName, platform, tools[] in connected event

### Agent-Side Tool Call Handling
- Agent's ConnectionManager receives `device_tool_call` messages
- Dispatches to ToolExecutor (existing from Phase 48 — currently stubs)
- Returns `device_tool_result` with requestId, success/error, and result payload
- Handle unknown tool names gracefully (return error result, don't crash)

### LivOS DeviceBridge Module
- New module: `livos/packages/livinityd/source/modules/devices/device-bridge.ts`
- Listens for device_connected/device_disconnected events on the tunnel WebSocket
- On device_connected: register proxy tools in Nexus ToolRegistry with `device_{deviceId}_` prefix
- On device_disconnected: unregister proxy tools from ToolRegistry
- Store connected device state in Redis (ephemeral — `livos:devices:{userId}:{deviceId}`)
- DeviceBridge.executeOnDevice(deviceId, toolName, params): sends tool_call through tunnel WS, returns promise that resolves on tool_result with matching requestId
- Use a pending requests Map<requestId, {resolve, reject, timeout}> pattern (same as TunnelConnection.pendingRequests)
- Request timeout: 30 seconds (matching relay request timeout)

### Proxy Tool Registration
- For each tool the device reports, register a proxy tool in ToolRegistry
- Tool name: `device_{sanitizedDeviceId}_{toolName}` (e.g., `device_desktop-pc_shell`)
- Tool description includes device name and platform: 'Execute a shell command on "Desktop PC" (Windows 11)'
- Tool parameters mirror the actual tool's parameters (passed from device's tool declarations)
- Tool execute function: calls DeviceBridge.executeOnDevice()

### Integration with Existing Tunnel
- The tunnel-client.ts in livinityd already handles message parsing from relay
- Add new message type handlers for device_connected, device_disconnected, device_tool_result
- DeviceBridge hooks into the existing TunnelClient's message event system

### Claude's Discretion
- Redis key TTL for device state
- Log level and format for device events
- Error message wording in proxy tools

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/relay/src/device-registry.ts` — DeviceRegistry with per-user device tracking (Phase 47)
- `platform/relay/src/device-protocol.ts` — Device message types (Phase 47)
- `platform/relay/src/tunnel-registry.ts` — TunnelConnection with pendingRequests pattern
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` — TunnelClient WS message handling
- `nexus/packages/core/src/tool-registry.ts` — ToolRegistry.register() / .unregister() API
- `agent/src/connection-manager.ts` — Agent's WS connection (Phase 48)
- `agent/src/tools.ts` — Tool stub executor (Phase 48)

### Established Patterns
- TunnelConnection.pendingRequests: Map<requestId, {resolve, reject}> with setTimeout for timeouts
- ToolRegistry: register({name, description, parameters, execute}) / unregister(name)
- Relay message routing: parse type, switch on type, forward to appropriate handler
- Redis ephemeral state: key with TTL for transient connection data

### Integration Points
- Relay index.ts: Add message handlers in onDeviceMessage for tool_result forwarding
- Relay index.ts: Send device_connected/device_disconnected through user's tunnel WS
- TunnelClient: Add handlers for new message types (device_connected, device_disconnected, device_tool_result)
- DeviceBridge: Hook into TunnelClient events, register with ToolRegistry
- livinityd index.ts: Initialize DeviceBridge, pass TunnelClient and ToolRegistry refs

</code_context>

<specifics>
## Specific Ideas

- The proxy tool registration should include the device's reported parameter schemas so the AI knows what arguments each tool accepts
- Request timeout should clean up the pending request and return a clear error to the AI
- Device state in Redis should include the tool list so the UI (Phase 52) can show device capabilities without hitting the relay

</specifics>

<deferred>
## Deferred Ideas

- Chunked/streaming responses for large outputs — v14.1
- Tool call queuing when device is temporarily disconnected — v14.1
- Multi-device fan-out (same tool call to multiple devices) — v15+

</deferred>
