---
phase: 09-security-permissions
plan: 02
subsystem: security
tags: [websocket, protocol, consent, timeout, trpc, react, computer-use]

# Dependency graph
requires:
  - phase: 08-live-monitoring-ui
    provides: "Computer use panel, chatStatus polling, SSE stream handling"
  - phase: 09-security-permissions plan 01
    provides: "Agent-side emergency stop trigger, audit enrichment, escape hotkey interception"
provides:
  - "Emergency stop protocol chain: agent -> relay -> tunnel-client -> device-bridge -> AI abort"
  - "User consent gate before AI takes mouse/keyboard control"
  - "grantConsent/denyConsent tRPC mutations"
  - "60s inactivity auto-timeout in nexus agent computer use loop"
  - "Frontend consent dialog modal with Allow/Deny buttons"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consent gate via polling loop in AI chat flow (200ms poll, 60s max)"
    - "Emergency stop callback chain through DeviceBridge options"
    - "Soft timeout injection pattern (message appended, AI takes one more turn)"

key-files:
  created: []
  modified:
    - "platform/relay/src/device-protocol.ts"
    - "platform/relay/src/protocol.ts"
    - "platform/relay/src/index.ts"
    - "livos/packages/livinityd/source/modules/platform/tunnel-client.ts"
    - "livos/packages/livinityd/source/modules/devices/device-bridge.ts"
    - "livos/packages/livinityd/source/index.ts"
    - "livos/packages/livinityd/source/modules/ai/index.ts"
    - "livos/packages/livinityd/source/modules/ai/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "nexus/packages/core/src/agent.ts"
    - "livos/packages/ui/src/routes/ai-chat/index.tsx"

key-decisions:
  - "Consent gate uses polling loop (200ms interval) rather than event-based to reuse existing chatStatus mechanism"
  - "Auto-timeout is soft (injects system message) rather than hard (abort), matching existing step limit pattern"
  - "Emergency stop callback wired through DeviceBridgeOptions for clean dependency injection"

patterns-established:
  - "Consent gate: computerUseConsent field in chatStatus, polling wait loop, frontend modal"
  - "Emergency stop chain: typed protocol messages through relay -> tunnel-client -> device-bridge -> callback"

requirements-completed: [SEC-01, SEC-02, SEC-04]

# Metrics
duration: 8min
completed: 2026-03-24
---

# Phase 09 Plan 02: Security Permissions Summary

**Emergency stop protocol chain through relay, user consent gate with modal dialog, and 60s inactivity auto-timeout for computer use sessions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-24T18:19:51Z
- **Completed:** 2026-03-24T18:28:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Emergency stop message flows end-to-end: agent -> relay -> tunnel-client -> device-bridge -> AI module abort
- Consent gate blocks first mouse/keyboard tool call until user clicks Allow in frontend modal
- 60s inactivity auto-timeout injects system message telling AI to stop and provide final answer
- Apple-style consent dialog with device icon, Allow/Deny buttons using existing design tokens

## Task Commits

Each task was committed atomically:

1. **Task 1: Emergency stop protocol wiring + consent backend + auto-timeout** - `8892056` (feat)
2. **Task 2: Frontend consent dialog** - `1d329cf` (feat)

## Files Created/Modified
- `platform/relay/src/device-protocol.ts` - Added DeviceEmergencyStop type and union member
- `platform/relay/src/protocol.ts` - Added TunnelDeviceEmergencyStop type, union member, and MessageTypeMap entry
- `platform/relay/src/index.ts` - Forward device_emergency_stop to LivOS tunnel
- `livos/.../tunnel-client.ts` - Added TunnelDeviceEmergencyStop type, handleMessage case
- `livos/.../device-bridge.ts` - Added onEmergencyStop handler and callback option
- `livos/.../index.ts` - Wired onEmergencyStop callback to ai.abortDeviceSessions
- `livos/.../ai/index.ts` - Added computerUseConsent field, consent gate loop, abortDeviceSessions method
- `livos/.../ai/routes.ts` - Added grantConsent and denyConsent tRPC mutations
- `livos/.../server/trpc/common.ts` - Added grantConsent/denyConsent to httpOnlyPaths
- `nexus/.../agent.ts` - Added lastComputerUseTime tracking and 60s inactivity timeout
- `livos/.../ui/.../ai-chat/index.tsx` - Consent dialog modal with Allow/Deny buttons

## Decisions Made
- Consent gate uses polling loop (200ms interval, 60s max) rather than event-based to reuse existing chatStatus mechanism
- Auto-timeout is soft (injects system message) rather than hard (abort), matching existing step limit pattern from Phase 07
- Emergency stop callback wired through DeviceBridgeOptions constructor param for clean dependency injection
- Screenshots alone do not reset the inactivity timer (only mouse/keyboard tools do)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all features are fully wired end-to-end.

## Next Phase Readiness
- All v15.0 security permissions complete (SEC-01 consent, SEC-02 emergency stop, SEC-04 auto-timeout)
- Phase 09 is the final phase of v15.0 milestone
- Ready for milestone completion verification

## Self-Check: PASSED

- All 11 modified files exist on disk
- Commit 8892056 (Task 1) found in git log
- Commit 1d329cf (Task 2) found in git log

---
*Phase: 09-security-permissions*
*Completed: 2026-03-24*
