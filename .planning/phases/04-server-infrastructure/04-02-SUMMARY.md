---
phase: 04-server-infrastructure
plan: 02
subsystem: infra
tags: [caddy, x11vnc, nativeapp, websocket, stream_close_delay, systemd]

# Dependency graph
requires:
  - phase: 04-server-infrastructure/01
    provides: "install.sh creates livos-x11vnc systemd service"
provides:
  - "desktop-stream NativeApp config in NATIVE_APP_CONFIGS with lifecycle management"
  - "Caddy pc.{domain} subdomain block with JWT cookie gating and stream_close_delay"
  - "proxyPort separation: health-check port 5900 vs Caddy routing port 8080"
affects: [05-websocket-proxy, 06-browser-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns: ["NativeAppConfig subdomain/proxyPort pattern for separating health-check from proxy target", "streaming flag for Caddy stream_close_delay on WebSocket apps"]

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/apps/native-app.ts"
    - "livos/packages/livinityd/source/modules/apps/apps.ts"
    - "livos/packages/livinityd/source/modules/domain/caddy.ts"

key-decisions:
  - "proxyPort 8080 routes through livinityd not directly to x11vnc 5900 -- enables WebSocket proxy middleware in Phase 5"
  - "stream_close_delay 5m prevents Caddy reload from killing active desktop WebSocket connections"
  - "stream_timeout 24h caps max session length while allowing all-day desktop use"
  - "streaming flag is per-app boolean, not global -- non-streaming native apps unaffected"

patterns-established:
  - "NativeAppConfig subdomain/proxyPort: separate health-check port from Caddy routing port"
  - "Caddy streaming flag: opt-in stream_close_delay for WebSocket-heavy native apps"

requirements-completed: [INST-03, STRM-03]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 04 Plan 02: NativeApp Registration & Caddy Subdomain Summary

**x11vnc registered as desktop-stream NativeApp with pc.{domain} Caddy subdomain, JWT cookie gating, and stream_close_delay 5m for WebSocket resilience during reloads**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T04:57:44Z
- **Completed:** 2026-03-26T05:01:08Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Registered x11vnc as desktop-stream NativeApp with 30-minute idle timeout, health-check on port 5900, and Caddy proxy to port 8080
- Extended NativeAppConfig interface with subdomain and proxyPort fields, decoupling health-check from routing
- Added stream_close_delay 5m and stream_timeout 24h to Caddy blocks for streaming native apps, preventing WebSocket termination during Caddy reloads

## Task Commits

Each task was committed atomically:

1. **Task 1: Add desktop-stream NativeApp config with subdomain and proxyPort support** - `0292fe4` (feat)
2. **Task 2: Update apps.ts nativeAppSubdomains mapping to use subdomain and proxyPort** - `5851585` (feat)
3. **Task 3: Add stream_close_delay to Caddy nativeApp blocks for WebSocket resilience** - `a515715` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/native-app.ts` - Added subdomain/proxyPort to NativeAppConfig, desktop-stream entry in NATIVE_APP_CONFIGS
- `livos/packages/livinityd/source/modules/apps/apps.ts` - Updated nativeAppSubdomains to use app.subdomain, app.proxyPort, and streaming flag
- `livos/packages/livinityd/source/modules/domain/caddy.ts` - Added streaming parameter and conditional stream_close_delay/stream_timeout in nativeApp Caddy blocks

## Decisions Made
- proxyPort 8080 routes through livinityd (not directly to x11vnc 5900) so WebSocket proxy middleware in Phase 5 can intercept and handle desktop stream connections
- stream_close_delay 5m chosen per PITFALLS.md research -- gives clients 5 minutes to reconnect after Caddy reload without session loss
- stream_timeout 24h caps sessions but allows all-day desktop use without forced disconnection
- streaming flag is per-app (not global) so future non-streaming native apps are unaffected by the extra Caddy directives

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- desktop-stream NativeApp config is ready for Phase 5 (WebSocket Proxy & Auth) to build the /ws/desktop handler on port 8080
- Caddy pc.{domain} block already routes to 8080 with stream_close_delay, so WebSocket connections will survive reloads once Phase 5 proxy is in place
- JWT cookie gating ensures only authenticated users can access the desktop stream subdomain

## Self-Check: PASSED

- All 3 modified files exist on disk
- All 3 task commits verified in git log (0292fe4, 5851585, a515715)
- No stubs or placeholders found in modified files

---
*Phase: 04-server-infrastructure*
*Completed: 2026-03-26*
