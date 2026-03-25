---
phase: 01-web-setup-wizard
plan: 02
subsystem: agent
tags: [oauth, device-flow, express, react, esbuild, cli]

# Dependency graph
requires:
  - phase: 01-web-setup-wizard/01
    provides: "React SPA with 4 screens, Express server with API stubs"
provides:
  - Real OAuth device flow wired into setup server (register + poll + token)
  - SPA polls every 2s, shows user code, auto-closes on success
  - POST /api/retry endpoint for flow reset
  - waitForSetup() promise for CLI integration
  - CLI setup defaults to web mode with --cli flag for terminal-only
  - CLI start auto-opens web setup when no credentials found
  - esbuild copies setup-ui/dist/ into dist/setup-ui/ alongside agent.js
affects: [phase-2 (system tray), phase-3 (installers)]

# Tech tracking
tech-stack:
  added: []
  patterns: [non-blocking-oauth-flow, module-level-state-for-polling, waitForSetup-promise-pattern]

key-files:
  created: []
  modified:
    - agent/src/setup-server.ts
    - agent/setup-ui/src/App.tsx
    - agent/src/cli.ts
    - agent/src/index.ts
    - agent/esbuild.config.mjs

key-decisions:
  - "Implemented OAuth flow directly in setup-server.ts (not calling deviceFlowSetup) for non-blocking async operation"
  - "waitForSetup() returns a promise resolved by the async OAuth flow, bridging server and CLI"
  - "SPA polls at 2s intervals (reduced from Plan 01's 3s) for faster UX response"
  - "esbuild config copies setup-ui/dist/ to dist/setup-ui/ for built mode, server resolves multiple candidate paths"

patterns-established:
  - "Non-blocking OAuth: kick off async flow without await, SPA polls module-level state"
  - "CLI web-first pattern: default to browser setup, --cli flag for terminal fallback"
  - "Build pipeline: setup-ui builds first, agent build copies its dist alongside bundle"

requirements-completed: [SETUP-03, SETUP-04, SETUP-05]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 1 Plan 02: OAuth Device Flow Integration Summary

**OAuth device flow wired into Express setup server with SPA polling, auto-close on success, CLI web-first routing, and esbuild pipeline copying setup-ui alongside agent bundle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T08:38:57Z
- **Completed:** 2026-03-24T08:42:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced API stubs in setup-server.ts with real OAuth device flow (register, poll, store credentials)
- SPA now polls every 2s, displays user code with verification URL, and auto-closes window after 5s on success
- CLI setup command defaults to web mode; --cli flag preserved for terminal-only flow
- CLI start command auto-opens web setup wizard when no credentials found, then continues to relay connection
- Build pipeline copies setup-ui/dist/ to dist/setup-ui/ so built agent serves the SPA correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire OAuth device flow into setup server and SPA** - `1ac8936` (feat)
2. **Task 2: Integrate setup server with CLI and update build pipeline** - `50e4eab` (feat)

## Files Created/Modified

- `agent/src/setup-server.ts` - Real OAuth flow (register + poll + token), waitForSetup() promise, POST /api/retry
- `agent/setup-ui/src/App.tsx` - SPA wired to real endpoints, 2s polling, auto-close on success, retry via /api/retry
- `agent/src/cli.ts` - setupCommand accepts { cli?: boolean }, startCommand auto-opens web setup
- `agent/src/index.ts` - Routes --cli and --web flags, updated help text
- `agent/esbuild.config.mjs` - Copies setup-ui/dist/ to dist/setup-ui/ after esbuild

## Decisions Made

- Implemented OAuth device flow directly in setup-server.ts rather than calling deviceFlowSetup() from auth.ts. This avoids the blocking loop pattern and allows the server to update module-level state that the SPA polls.
- The waitForSetup() function returns a promise that is resolved by the async OAuth flow when credentials are stored. This cleanly bridges the Express server with CLI callers (setupCommand and startCommand).
- SPA polling interval reduced to 2 seconds (from Plan 01's 3 seconds) for snappier UX response during the approval wait.
- Build pipeline: setup-ui must be built before agent build. esbuild config uses cpSync to copy the pre-built SPA into dist/setup-ui/ adjacent to agent.js.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all endpoints are fully wired to real OAuth flow.

## Next Phase Readiness

- Web setup wizard is complete end-to-end: install -> first run -> browser opens -> connect -> approve -> agent runs
- Phase 2 (System Tray) can build on top of this -- the tray icon can show "Setup required" status and launch the web setup
- Phase 3 (Installers) needs to bundle dist/agent.js + dist/setup-ui/ into the platform packages

## Self-Check: PASSED

All 5 modified files verified on disk. Both task commits (1ac8936, 50e4eab) found in git log.

---
*Phase: 01-web-setup-wizard*
*Completed: 2026-03-24*
