---
phase: 02-system-tray-icon
plan: 01
subsystem: agent
tags: [systray2, tray-icon, png, cross-platform, node-zlib]

# Dependency graph
requires:
  - phase: 01-web-setup-wizard
    provides: setup-server.ts with startSetupServer() for Open Setup menu action
provides:
  - System tray module (agent/src/tray.ts) with startTray(), updateTrayStatus(), killTray()
  - ConnectionManager onStatusChange callback for real-time status propagation
  - Programmatic PNG icon generation (green/yellow/red circles)
affects: [03-auto-start-boot, 04-native-installers]

# Tech tracking
tech-stack:
  added: [systray2]
  patterns: [programmatic-png-generation, status-change-callback, graceful-tray-fallback]

key-files:
  created: [agent/src/tray.ts]
  modified: [agent/src/connection-manager.ts, agent/src/cli.ts, agent/package.json, agent/esbuild.config.mjs]

key-decisions:
  - "Programmatic PNG generation via node:zlib deflateSync instead of external icon files -- avoids SEA/bundling issues"
  - "CJS/ESM interop cast for systray2 default export -- systray2 is CJS, agent is ESM"
  - "Tray init wrapped in try/catch -- agent continues on headless servers without tray"
  - "Separator items constructed inline rather than SysTray.separator static -- avoids CJS interop issues"

patterns-established:
  - "onStatusChange callback pattern: optional callback in options for loose coupling"
  - "Non-fatal tray initialization: try/catch around display-dependent features"

requirements-completed: [TRAY-01, TRAY-02, TRAY-03]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 2 Plan 1: System Tray Icon Summary

**Cross-platform system tray icon with programmatic PNG icons (green/yellow/red), status-change callback in ConnectionManager, and context menu with Disconnect/Setup/Quit actions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T08:52:14Z
- **Completed:** 2026-03-24T08:56:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created tray module with 3 programmatically-generated 16x16 PNG circle icons (green=connected, yellow=connecting, red=disconnected/error)
- Added onStatusChange callback to ConnectionManager firing at all 6 status transition points
- Wired tray into CLI startCommand with graceful fallback for headless environments
- Context menu: Status (disabled label), Open Setup, Disconnect, Quit -- all functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tray module with embedded icons and systray2 integration** - `c447c96` (feat)
2. **Task 2: Wire tray into ConnectionManager and CLI startCommand** - `7c51bce` (feat)

## Files Created/Modified
- `agent/src/tray.ts` - System tray module with startTray(), updateTrayStatus(), killTray(), programmatic PNG icon generation
- `agent/src/connection-manager.ts` - Added onStatusChange optional callback, called at all 6 status transitions
- `agent/src/cli.ts` - Imports tray, initializes before connect, wires callbacks, adds killTray to shutdown
- `agent/package.json` - Added systray2 dependency
- `agent/esbuild.config.mjs` - Externalized systray2 from bundle (native Go binary)

## Decisions Made
- Used programmatic PNG generation (node:zlib deflateSync) instead of base64 string constants or external files -- ensures icons work in SEA binary mode without filesystem access
- Handled CJS/ESM interop for systray2 with explicit type casting -- systray2 ships as CJS, the agent project is ESM
- Used inline separator objects instead of SysTray.separator static property -- avoids CJS interop resolution issues with the static
- Tray initialization is non-fatal (try/catch) so agent works on headless Linux servers, SSH sessions, and CI

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed systray2 CJS/ESM interop type errors**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** systray2 is a CJS module; default import in ESM context caused "Cannot use namespace as type", "no construct signatures", and "separator does not exist" errors
- **Fix:** Cast default import through unknown to explicit constructor type; imported MenuItem/Menu/ClickEvent/Conf types explicitly; replaced SysTray.separator with inline separator objects
- **Files modified:** agent/src/tray.ts
- **Verification:** npx tsc --noEmit passes cleanly
- **Committed in:** 7c51bce (Task 2 commit)

**2. [Rule 1 - Bug] Fixed update-menu action using wrong property name**
- **Found during:** Task 2 (type checking against systray2 type defs)
- **Issue:** Plan specified `item: currentMenu` for update-menu action, but systray2 UpdateMenuAction type uses `menu` property
- **Fix:** Changed to `menu: currentMenu` matching the systray2 type definition
- **Files modified:** agent/src/tray.ts
- **Verification:** npx tsc --noEmit passes; matches UpdateMenuAction interface in systray2/index.d.ts
- **Committed in:** 7c51bce (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for TypeScript compilation and correct runtime behavior. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tray module is ready for auto-start phases (startTray called from CLI, killTray on shutdown)
- Native installers can bundle the agent binary with systray2 Go binary (externalized in esbuild)
- Headless fallback ensures server deployments are unaffected

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 02-system-tray-icon*
*Completed: 2026-03-24*
