---
phase: 47-platform-oauth-relay-device-infrastructure
plan: 02
subsystem: relay
tags: [websocket, jwt, device-registry, heartbeat, relay]

requires:
  - phase: 47-platform-oauth-relay-device-infrastructure
    provides: "Device JWT issuance from livinity.io (Plan 01)"
provides:
  - "DeviceRegistry class with nested Map<userId, Map<deviceId, DeviceConnection>>"
  - "/device/connect WebSocket endpoint on relay server"
  - "Device JWT verification (HS256) against DEVICE_JWT_SECRET"
  - "Device protocol message types (7 types + union types)"
  - "Device heartbeat (30s ping/pong) and reconnection buffering (30s grace)"
  - "Health endpoint includes device count"
affects: [48-desktop-agent, 49-remote-tool-proxy, relay-deployment]

tech-stack:
  added: []
  patterns: ["DeviceRegistry parallel to TunnelRegistry", "Device JWT auth parallel to tunnel API key auth"]

key-files:
  created:
    - platform/relay/src/device-protocol.ts
    - platform/relay/src/device-registry.ts
    - platform/relay/src/device-auth.ts
  modified:
    - platform/relay/src/config.ts
    - platform/relay/src/index.ts
    - platform/relay/src/health.ts
    - platform/relay/src/server.ts

key-decisions:
  - "DeviceRegistry uses nested Map<userId, Map<deviceId, DeviceConnection>> to support multiple devices per user"
  - "Device disconnect enters 30s reconnect mode (matching tunnel behavior) before full removal"
  - "Health endpoint extended with optional deviceRegistry parameter for backward compatibility"

patterns-established:
  - "Device connections follow same lifecycle pattern as tunnel connections: auth timeout, heartbeat, reconnect buffer, graceful shutdown"
  - "Device protocol types in separate file from tunnel protocol, using 'device_' prefixed type discriminators"

requirements-completed: [RELAY-01, RELAY-02]

duration: 3min
completed: 2026-03-24
---

# Phase 47 Plan 02: Device Registry + /device/connect Summary

**DeviceRegistry with nested userId->deviceId mapping, /device/connect WebSocket endpoint with HS256 JWT auth, 30s heartbeat, and reconnection buffering**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T05:25:05Z
- **Completed:** 2026-03-24T05:28:08Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- DeviceRegistry class managing multiple devices per user with register/unregister/getDevice/getUserDevices/getBySessionId/allConnections
- DeviceConnection class with heartbeat (30s ping/pong), reconnection buffering (30s grace period), and cleanup lifecycle
- 7 device protocol message types with full TypeScript union types
- /device/connect WebSocket endpoint with JWT verification, 5s auth timeout, device_connected confirmation
- Graceful shutdown broadcasts relay_shutdown to all device connections
- Health endpoint reports device count and device user count

## Task Commits

Each task was committed atomically:

1. **Task 1: Device protocol types + DeviceRegistry + JWT verification** - `10d1ded` (feat)
2. **Task 2: Wire /device/connect WebSocket endpoint into relay index.ts** - `e7b068c` (feat)

## Files Created/Modified
- `platform/relay/src/device-protocol.ts` - 7 device message types (DeviceAuth, DeviceToolResult, DevicePong, DeviceConnected, DeviceAuthError, DeviceToolCall, DevicePing) with union types
- `platform/relay/src/device-registry.ts` - DeviceConnection class and DeviceRegistry class with nested Map<userId, Map<deviceId, DeviceConnection>>
- `platform/relay/src/device-auth.ts` - HS256 JWT verification function using jsonwebtoken
- `platform/relay/src/config.ts` - Added DEVICE_JWT_SECRET config value
- `platform/relay/src/index.ts` - Added deviceWss, deviceRegistry, onDeviceConnect handler, /device/connect upgrade route, device shutdown
- `platform/relay/src/health.ts` - Added optional deviceRegistry param, devices/deviceUsers fields in response
- `platform/relay/src/server.ts` - Pass deviceRegistry to health handler

## Decisions Made
- DeviceRegistry uses nested Map<userId, Map<deviceId, DeviceConnection>> to support multiple devices per user (unlike TunnelRegistry which is one tunnel per user)
- Device disconnect enters reconnect mode with 30s grace period (matching tunnel behavior) before full removal
- Health endpoint signature extended with optional deviceRegistry parameter for backward compatibility
- Device protocol types use 'device_' prefix to avoid collision with tunnel protocol type discriminators

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended health endpoint and server.ts for device stats**
- **Found during:** Task 2
- **Issue:** Plan mentioned updating health endpoint but health.ts has a specific function signature that needed a new parameter and server.ts needed to pass it through
- **Fix:** Added optional DeviceRegistry parameter to handleHealthRequest, updated createRequestHandler to accept and pass deviceRegistry, added devices/deviceUsers fields to health JSON response
- **Files modified:** platform/relay/src/health.ts, platform/relay/src/server.ts
- **Verification:** TypeScript compiles with no errors
- **Committed in:** e7b068c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for health endpoint device stats. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Relay server now handles both tunnel connections (/tunnel/connect) and device connections (/device/connect)
- Ready for Phase 48 (Desktop Agent) to implement the client that connects to /device/connect
- Ready for Phase 49 (Remote Tool Proxy) to route tool calls between LivOS and device agents via the relay

## Self-Check: PASSED

- All 7 files verified present on disk
- Both commit hashes (10d1ded, e7b068c) verified in git log
- TypeScript compiles with zero errors

---
*Phase: 47-platform-oauth-relay-device-infrastructure*
*Completed: 2026-03-24*
