---
phase: 05-computer-use
plan: 02
subsystem: agent
tags: [robotjs, sea-build, esbuild, native-addon, node-gyp-build, device-bridge, proxy-tools]

# Dependency graph
requires:
  - phase: 05-computer-use
    plan: 01
    provides: "8 mouse/keyboard tool implementations + @jitsi/robotjs installed"
  - phase: 50-agent-core-tools-shell-files
    provides: "Agent SEA build pipeline (esbuild.config.mjs, build-sea.mjs)"
  - phase: 49-relay-message-routing-devicebridge
    provides: "DeviceBridge DEVICE_TOOL_SCHEMAS pattern for proxy tool registration"
provides:
  - "SEA build pipeline marks @jitsi/robotjs as external and copies native prebuilds to dist/"
  - "node-gyp-build copied to dist/node_modules/ for runtime native addon resolution"
  - "DeviceBridge registers 17 proxy tools (9 existing + 8 new mouse/keyboard) when device connects"
  - "AI can invoke mouse/keyboard tools through Nexus proxy routing end-to-end"
affects: [06-screen-info, 07-computer-use-loop, 09-security-consent]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SEA external + copy pattern for node-gyp-build native addons (robotjs follows node-screenshots precedent)"]

key-files:
  created: []
  modified:
    - agent/esbuild.config.mjs
    - agent/build-sea.mjs
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts

key-decisions:
  - "Followed exact same SEA external pattern as node-screenshots: onResolve external + copy index.js/package.json/prebuilds"
  - "Added node-gyp-build as separate copy step (pure-JS module required by robotjs at runtime)"

patterns-established:
  - "node-gyp-build addons in SEA: mark external in esbuild, copy module + prebuilds + node-gyp-build to dist/node_modules/"

requirements-completed: [MOUSE-01, MOUSE-02, MOUSE-03, MOUSE-04, MOUSE-05, MOUSE-06, KEY-01, KEY-02]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 5 Plan 2: SEA Build Pipeline + DeviceBridge Schema Registration Summary

**robotjs native addon wired into SEA build (external + prebuilds copy) and all 17 tool schemas registered in DeviceBridge for Nexus proxy routing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T16:40:42Z
- **Completed:** 2026-03-24T16:42:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Updated esbuild config to mark @jitsi/robotjs as external (same pattern as node-screenshots)
- Updated SEA build script to copy robotjs index.js, package.json, prebuilds/, and node-gyp-build/ to dist/node_modules/
- Added 8 mouse/keyboard tool schemas to DeviceBridge DEVICE_TOOL_SCHEMAS (17 total: 9 existing + 8 new)
- Verified esbuild bundle succeeds with robotjs marked external
- Verified all 17 DeviceBridge schema keys match agent TOOL_NAMES exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Update SEA build pipeline to include robotjs native addon** - `a1994ef` (feat)
2. **Task 2: Add 8 tool schemas to DeviceBridge for Nexus proxy registration** - `6acaeff` (feat)

## Files Created/Modified
- `agent/esbuild.config.mjs` - Added @jitsi/robotjs onResolve external rule alongside existing node-screenshots rule
- `agent/build-sea.mjs` - Added copy steps for @jitsi/robotjs (index.js, package.json, prebuilds/) and node-gyp-build/ to dist/node_modules/
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` - Added 8 tool schemas: mouse_click, mouse_double_click, mouse_right_click, mouse_move, mouse_drag, mouse_scroll, keyboard_type, keyboard_press

## Decisions Made
- Followed exact same SEA external pattern as node-screenshots (no new patterns introduced)
- Added node-gyp-build as a separate copy step since it is a runtime dependency for robotjs to locate .node prebuilds
- keyboard_press schema uses single "key" parameter with combo syntax ("ctrl+c") matching agent-side parser, rather than separate key/modifier params

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- End-to-end pipeline complete: agent tools (Plan 1) + SEA build + DeviceBridge schemas (Plan 2)
- When device connects, DeviceBridge registers all 17 proxy tools in Nexus
- AI can invoke mouse/keyboard tools through existing proxy tool routing
- Ready for Phase 6 (screen info), Phase 7 (computer use loop), Phase 8 (live screen monitoring)
- On headless systems without display, agent gracefully excludes mouse/keyboard tools from advertised list

## Self-Check: PASSED

All 3 modified files verified present on disk. Both task commits (a1994ef, 6acaeff) verified in git log.

---
*Phase: 05-computer-use*
*Completed: 2026-03-24*
