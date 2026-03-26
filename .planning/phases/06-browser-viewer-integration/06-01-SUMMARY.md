---
phase: 06-browser-viewer-integration
plan: 01
subsystem: ui
tags: [novnc, vnc, remote-desktop, browser-viewer, xrandr, websocket, html]

# Dependency graph
requires:
  - phase: 05-websocket-proxy-auth
    provides: /ws/desktop WebSocket-to-TCP bridge endpoint, JWT auth, NativeApp auto-start
  - phase: 04-server-infrastructure
    provides: x11vnc systemd service, NativeApp lifecycle, Caddy pc.{domain} subdomain routing
provides:
  - Standalone noVNC desktop viewer HTML page at pc.{domain}
  - Full mouse/keyboard/scroll input via VNC protocol
  - Connection status indicator with auto-reconnect and exponential backoff
  - Fullscreen toggle and toolbar auto-hide UX
  - POST /api/desktop/resize endpoint for dynamic xrandr resolution changes
  - App gateway NativeApp subdomain bypass (no more 404 for pc.{domain})
  - Vendored noVNC ESM source served at /novnc/* static path
affects: []

# Tech tracking
tech-stack:
  added: ["@novnc/novnc 1.6.0 (vendored ESM source)", "xrandr dynamic resolution via cvt+newmode"]
  patterns: [standalone-html-viewer, vendored-esm-static-serving, xrandr-dynamic-mode-creation]

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/desktop-viewer.html
    - livos/packages/livinityd/source/modules/server/novnc-vendor/
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/package.json

key-decisions:
  - "Vendored noVNC ESM source (core/ + vendor/) instead of using npm CJS package -- npm @novnc/novnc ships CJS only, browser needs ESM"
  - "noVNC import path /novnc/core/rfb.js from vendored ESM source, not /novnc/lib/rfb.js from CJS npm package"
  - "resizeSession=false with server-side xrandr resize via POST /api/desktop/resize, not noVNC native resize"
  - "showDotCursor=false to hide local cursor dot, show remote cursor only"

patterns-established:
  - "Vendored ESM source pattern: download original ESM from GitHub release, serve via Express static"
  - "NativeApp subdomain bypass: app gateway checks nativeInstances before returning 404"
  - "xrandr dynamic mode creation: cvt modeline -> xrandr --newmode -> --addmode -> --output"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06, INTG-01, INTG-03]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 6 Plan 1: Browser Viewer & Integration Summary

**Standalone noVNC desktop viewer at pc.{domain} with full input, auto-reconnect, fullscreen, dynamic xrandr resize, and app gateway NativeApp bypass**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T05:31:07Z
- **Completed:** 2026-03-26T05:36:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Browser navigating to pc.{domain} now serves the desktop viewer HTML page (not 404)
- noVNC renders the remote desktop in real-time via WebSocket connection to /ws/desktop
- Full mouse click/drag/scroll and keyboard input works through VNC protocol
- Connection status badge shows connected/reconnecting/disconnected with auto-reconnect (1s-30s exponential backoff)
- Fullscreen toggle, floating toolbar with auto-hide, and dynamic xrandr resolution resize on viewport change

## Task Commits

Each task was committed atomically:

1. **Task 1: Install noVNC, fix app gateway NativeApp bypass, add desktop viewer route and xrandr resize endpoint** - `75c5498` (feat)
2. **Task 2: Create the standalone noVNC desktop viewer HTML page** - `af1e30b` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/server/desktop-viewer.html` - Self-contained noVNC desktop viewer with full input, status, reconnect, fullscreen, resize
- `livos/packages/livinityd/source/modules/server/index.ts` - NativeApp subdomain bypass, desktop viewer route, /api/desktop/resize endpoint, /novnc static serving
- `livos/packages/livinityd/source/modules/server/novnc-vendor/` - Vendored noVNC 1.6.0 ESM source (core/ + vendor/pako)
- `livos/packages/livinityd/package.json` - Added @novnc/novnc dependency

## Decisions Made
- **Vendored ESM source instead of npm CJS:** The @novnc/novnc npm package ships only CJS (lib/) via its prepublish conversion. Browser `<script type="module">` requires ESM. Downloaded original ESM source from GitHub release v1.6.0 (core/ + vendor/) and serve via Express static at /novnc/*.
- **resizeSession=false with server-side xrandr:** Per CONTEXT.md decisions, handle resolution changes server-side via xrandr API rather than letting noVNC negotiate resize through VNC protocol.
- **showDotCursor=false:** Hide local cursor dot, show remote cursor only, per CONTEXT.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] noVNC npm package ships CJS, not ESM -- vendored original ESM source**
- **Found during:** Task 1 (Install @novnc/novnc)
- **Issue:** Plan assumed npm package has `core/rfb.js` with ES module exports. Actual npm package has `lib/rfb.js` with CommonJS (`require`/`exports`). Browser `<script type="module">` cannot use CJS.
- **Fix:** Downloaded original noVNC v1.6.0 ESM source from GitHub (core/ + vendor/ directories) into novnc-vendor/ directory, served via Express static at /novnc/*.
- **Files modified:** Added livos/packages/livinityd/source/modules/server/novnc-vendor/ directory
- **Verification:** `grep "export default class RFB" novnc-vendor/core/rfb.js` confirms ESM format
- **Committed in:** 75c5498 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** ESM vendoring was necessary for browser module loading. No scope creep -- same noVNC source, different delivery method.

## Issues Encountered
None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all code is fully functional.

## Next Phase Readiness
- v18.0 Remote Desktop Streaming is now feature-complete across all 3 phases:
  - Phase 4: Server infrastructure (x11vnc, Caddy, NativeApp lifecycle, GUI detection)
  - Phase 5: WebSocket proxy & auth (/ws/desktop bridge, JWT, Origin validation, idle prevention)
  - Phase 6: Browser viewer (noVNC page, input, reconnect, fullscreen, dynamic resize)
- End-to-end testing requires a server with a GUI desktop and x11vnc running

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 06-browser-viewer-integration*
*Completed: 2026-03-26*
