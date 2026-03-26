---
phase: 05-websocket-proxy-auth
plan: 01
subsystem: infra
tags: [websocket, vnc, tcp-bridge, jwt, origin-validation, x11vnc, native-app]

# Dependency graph
requires:
  - phase: 04-server-infrastructure
    provides: x11vnc systemd service, NativeApp lifecycle, Caddy subdomain routing, GUI detection
provides:
  - /ws/desktop WebSocket-to-TCP bridge endpoint in server/index.ts
  - JWT auth + Origin validation on WebSocket upgrade
  - NativeApp auto-start on first connection
  - Bidirectional binary relay (WS frames <-> TCP VNC data)
  - Three-layer idle prevention (connection, data activity, periodic heartbeat)
affects: [06-browser-viewer-integration]

# Tech tracking
tech-stack:
  added: [node:net createConnection]
  patterns: [ws-to-tcp-bridge, throttled-idle-reset, periodic-heartbeat-interval]

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/ws-desktop.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts

key-decisions:
  - "Named variable desktopToken to avoid shadowing voice proxy's token variable in same upgrade handler scope"
  - "Three-layer idle prevention: initial reset, throttled data-activity reset (60s), periodic heartbeat (5min)"
  - "Origin validation allows all subdomains of configured domain (wildcard match via endsWith)"

patterns-established:
  - "WS-to-TCP bridge pattern: createConnection for raw TCP upstream, handleUpgrade for browser WS, bidirectional Buffer relay"
  - "Throttled idle timer reset: Date.now() comparison with 60s threshold on high-frequency data events"

requirements-completed: [STRM-01, STRM-02, INTG-02]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 5 Plan 1: WebSocket Proxy & Auth Summary

**/ws/desktop WebSocket-to-TCP bridge with JWT auth, Origin validation, NativeApp auto-start, and three-layer idle prevention**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T05:13:14Z
- **Completed:** 2026-03-26T05:17:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- /ws/desktop endpoint bridges browser WebSocket to x11vnc TCP socket on localhost:5900
- JWT auth rejects unauthenticated connections (401), Origin mismatch rejected (403)
- NativeApp auto-start ensures x11vnc is running before TCP connect, with 503 fallback
- VNC session persists when browser disconnects (only TCP socket destroyed, not x11vnc service)
- Three-layer idle prevention keeps x11vnc alive during active streaming sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add /ws/desktop WebSocket-to-TCP bridge with JWT auth and Origin validation**
   - `0ec1512` (test: TDD RED -- 14 failing tests)
   - `9191e87` (feat: TDD GREEN -- implementation passes all 14 tests)
2. **Task 2: Add periodic idle timer reset during active desktop streaming** - `740a4ff` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/server/index.ts` - Added `import { createConnection } from 'node:net'` and 110-line /ws/desktop handler in upgrade handler
- `livos/packages/livinityd/source/modules/server/ws-desktop.test.ts` - 14 vitest tests covering auth, Origin, TCP bridge, binary relay, session persistence, auto-start, idle timer

## Decisions Made
- Named variable `desktopToken` instead of `token` to avoid shadowing the voice proxy's `token` variable in the same upgrade handler scope
- Three-layer idle prevention approach: initial reset on connection, throttled reset on VNC data activity (max once per 60s), periodic heartbeat interval (every 5 minutes) -- covers both active and static screen scenarios
- Origin validation allows all subdomains of the configured domain via `endsWith('.' + domain)` -- non-browser clients (no Origin header) are allowed through

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all code is fully functional.

## Next Phase Readiness
- /ws/desktop endpoint is ready for browser-side noVNC integration in Phase 6
- Token can be passed via `?token=` query param or `LIVINITY_SESSION` cookie
- Binary data flows bidirectionally -- noVNC client can connect directly
- x11vnc auto-starts on first connection and stays alive during active streaming

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 05-websocket-proxy-auth*
*Completed: 2026-03-26*
