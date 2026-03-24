---
phase: 05-computer-use
plan: 01
subsystem: agent
tags: [robotjs, mouse, keyboard, automation, native-addon, desktop-control]

# Dependency graph
requires:
  - phase: 50-agent-core-tools-shell-files
    provides: "Agent tool dispatcher pattern (TOOL_NAMES + executeTool switch)"
  - phase: 51-agent-extended-tools-processes-screenshot-system-info
    provides: "Lazy native addon loading pattern (screenshot.ts)"
provides:
  - "6 mouse automation tools: click, double-click, right-click, move, drag, scroll"
  - "2 keyboard automation tools: type text, press keys/combos"
  - "Key alias normalization for combo parsing (ctrl->control, cmd->command, etc.)"
  - "@jitsi/robotjs installed as native desktop automation dependency"
affects: [06-screen-info, 07-computer-use-loop, 08-live-screen-monitoring, 09-security-consent]

# Tech tracking
tech-stack:
  added: ["@jitsi/robotjs@0.6.21"]
  patterns: ["Lazy require() for CJS native addons", "try/finally safety for stateful OS operations"]

key-files:
  created:
    - agent/src/tools/mouse.ts
    - agent/src/tools/keyboard.ts
  modified:
    - agent/src/tools.ts
    - agent/package.json

key-decisions:
  - "Used @jitsi/robotjs over @nut-tree/nut-js: free MIT license, prebuilt N-API binaries, same native addon pattern as node-screenshots"
  - "Synchronous require() for robotjs (CJS via node-gyp-build), not async import() like node-screenshots (ESM)"
  - "Instant moveMouse() over moveMouseSmooth() for AI-driven coordinate targeting"

patterns-established:
  - "Lazy CJS require() for native addons that use node-gyp-build"
  - "try/finally for OS state operations (mouse button hold/release)"
  - "Key alias normalization map for user-friendly key combo strings"

requirements-completed: [MOUSE-01, MOUSE-02, MOUSE-03, MOUSE-04, MOUSE-05, MOUSE-06, KEY-01, KEY-02]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 5 Plan 1: Mouse & Keyboard Tools Summary

**8 desktop automation tools (6 mouse + 2 keyboard) using @jitsi/robotjs with lazy loading, combo key parsing, and drag safety**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T16:36:11Z
- **Completed:** 2026-03-24T16:38:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed @jitsi/robotjs@0.6.21 with prebuilt N-API binaries for all target platforms
- Implemented 6 mouse tools (click, double-click, right-click, move, drag, scroll) with coordinate validation and error handling
- Implemented 2 keyboard tools (type text, press keys/combos) with key alias normalization and combo string parsing
- Registered all 8 tools in the agent dispatcher (TOOL_NAMES: 9 -> 17), auto-propagated to relay via connection-manager
- TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install robotjs and create mouse + keyboard tool implementations** - `285fa60` (feat)
2. **Task 2: Register all 8 tools in the agent dispatcher** - `7b58fad` (feat)

## Files Created/Modified
- `agent/src/tools/mouse.ts` - 6 mouse automation functions with lazy robotjs loading and parameter validation
- `agent/src/tools/keyboard.ts` - 2 keyboard automation functions with KEY_ALIASES normalization and combo parsing
- `agent/src/tools.ts` - Extended TOOL_NAMES (9 -> 17), added imports and 8 switch-case dispatches
- `agent/package.json` - Added @jitsi/robotjs@^0.6.21 dependency

## Decisions Made
- Used @jitsi/robotjs over @nut-tree/nut-js: free (MIT), prebuilt binaries included, same node-gyp-build pattern as existing node-screenshots
- Used synchronous require() for robotjs lazy loading (it's a CJS native addon via node-gyp-build, not ESM)
- Used moveMouse() (instant) over moveMouseSmooth() -- AI-driven automation doesn't need human-like mouse movement
- Duplicated lazy-load boilerplate in both mouse.ts and keyboard.ts rather than sharing -- keeps files independent and follows the existing screenshot.ts pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 8 mouse/keyboard tools ready for integration with computer use loop (Phase 7)
- DeviceBridge schema registration needed in Phase 5 Plan 2 (server-side) for tools to be accessible via AI
- SEA build pipeline update needed in Phase 5 Plan 2 for robotjs native addon bundling
- On headless systems without display server, tools gracefully return error (agent remains functional for non-mouse/keyboard tools)

## Self-Check: PASSED

All 4 files verified present on disk. Both task commits (285fa60, 7b58fad) verified in git log.

---
*Phase: 05-computer-use*
*Completed: 2026-03-24*
