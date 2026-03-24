---
phase: 49-relay-message-routing-devicebridge
plan: 02
subsystem: devices
tags: [websocket, proxy-tools, device-bridge, tool-registry, nexus-api]

# Dependency graph
requires:
  - phase: 49-relay-message-routing-devicebridge
    provides: "Tunnel protocol message types for device events and tool routing, relay bidirectional message forwarding"
  - phase: 47-platform-oauth-relay-device-infrastructure
    provides: "DeviceRegistry, TunnelRegistry, device-protocol types"
provides:
  - "DeviceBridge module managing device proxy tool lifecycle in Nexus ToolRegistry"
  - "Nexus API endpoints for external tool registration (POST /api/tools/register, DELETE /api/tools/:name)"
  - "TunnelClient handlers for device_connected, device_disconnected, device_tool_result messages"
  - "Internal callback endpoint /internal/device-tool-execute for Nexus proxy tool execution"
  - "Device proxy tool naming convention: device_{deviceId}_{toolName}"
affects: [50-agent-tool-executor, 51-ui-devices-panel, device-permissions]

# Tech tracking
tech-stack:
  added: []
  patterns: ["proxy tool registration via HTTP API with callback URL", "request/response correlation with pending Map + timeout", "device event delegation from TunnelClient to DeviceBridge"]

key-files:
  created:
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts
  modified:
    - nexus/packages/core/src/api.ts
    - livos/packages/livinityd/source/modules/platform/tunnel-client.ts
    - livos/packages/livinityd/source/index.ts
    - livos/packages/livinityd/source/modules/server/index.ts

key-decisions:
  - "Used crypto.randomUUID() instead of nanoid since nanoid is not a direct dependency in livinityd"
  - "PendingRequest tracks deviceId to scope cleanup on disconnect to only that device's requests"
  - "DeviceBridge stores connected device state in Redis with 25h TTL for UI queries"
  - "Proxy tool registration uses HTTP callback pattern: Nexus POSTs to livinityd's /internal/device-tool-execute"

patterns-established:
  - "External tool registration: POST /api/tools/register with callbackUrl, tool execute function is a fetch to callback"
  - "DeviceBridge event delegation: TunnelClient._deviceBridge.onDeviceConnected/onDeviceDisconnected/onToolResult"
  - "Device proxy tool naming: device_{deviceId}_{toolName} for namespace isolation"

requirements-completed: [TOOLS-01, TOOLS-02, TOOLS-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 49 Plan 02: DeviceBridge + Proxy Tool Registration Summary

**DeviceBridge module with dynamic proxy tool lifecycle: registers device tools in Nexus on connect, unregisters on disconnect, routes tool execution through tunnel WS**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T06:07:46Z
- **Completed:** 2026-03-24T06:11:14Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Created DeviceBridge module handling device connect/disconnect events with proxy tool lifecycle management
- Added Nexus API endpoints for external tool registration (POST /api/tools/register) and unregistration (DELETE /api/tools/:name)
- Wired TunnelClient to delegate device_connected, device_disconnected, device_tool_result messages to DeviceBridge
- Added /internal/device-tool-execute callback endpoint in livinityd HTTP server for Nexus proxy tool execution
- Integrated DeviceBridge into livinityd startup after TunnelClient initialization

## Task Commits

Each task was committed atomically:

1. **Task 1: Nexus API endpoints + DeviceBridge module + tunnel-client handlers** - `af6c77e` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` - DeviceBridge class: onDeviceConnected registers proxy tools, onDeviceDisconnected unregisters, executeOnDevice sends tool_call through tunnel, onToolResult resolves pending promises
- `nexus/packages/core/src/api.ts` - POST /api/tools/register (creates tool with callback execute), DELETE /api/tools/:name (unregisters tool)
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` - Added device message types, setDeviceBridge setter, sendDeviceMessage public method, 3 new case handlers in handleMessage switch
- `livos/packages/livinityd/source/index.ts` - Import DeviceBridge, add deviceBridge property, initialize after TunnelClient with Redis and sendTunnelMessage wiring
- `livos/packages/livinityd/source/modules/server/index.ts` - /internal/device-tool-execute POST route for Nexus callback

## Decisions Made
- Used crypto.randomUUID() instead of nanoid: nanoid is not a direct dependency in livinityd, and crypto.randomUUID() is a built-in Node.js API
- Added deviceId tracking to PendingRequest interface: enables scoped cleanup on disconnect (only reject requests for the disconnected device, not all pending requests)
- Placed /internal/device-tool-execute route before tRPC handlers to ensure it's matched before any catch-all middleware

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DeviceBridge fully wired: device tools dynamically appear/disappear in Nexus ToolRegistry
- Ready for agent-side tool execution (Phase 50): agent ConnectionManager dispatching to ToolExecutor on device_tool_call messages
- Ready for UI devices panel (Phase 51+): Redis stores connected device state for UI queries
- Tool execution flow complete: Nexus callback -> livinityd /internal/device-tool-execute -> DeviceBridge.executeOnDevice -> tunnel WS -> relay -> device agent -> result flows back

## Self-Check: PASSED

All 5 modified/created files exist. Task commit (af6c77e) verified in git log.

---
*Phase: 49-relay-message-routing-devicebridge*
*Completed: 2026-03-24*
