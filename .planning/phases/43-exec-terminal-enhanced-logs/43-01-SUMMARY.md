---
phase: 43-exec-terminal-enhanced-logs
plan: 01
subsystem: docker, ui
tags: [websocket, xterm.js, dockerode, exec, terminal, container]

# Dependency graph
requires:
  - phase: 38-server-management
    provides: ContainerDetailSheet with Info/Logs/Stats tabs
provides:
  - WebSocket-based Docker container exec endpoint at /ws/docker-exec
  - Console tab in ContainerDetailSheet with xterm.js interactive terminal
  - Shell selector (bash/sh/ash) and optional user field for exec sessions
affects: [server-management, docker, container-detail]

# Tech tracking
tech-stack:
  added: []
  patterns: [dockerode exec hijack mode for raw duplex stream, JSON resize messages over WebSocket]

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/docker-exec-socket.ts
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx

key-decisions:
  - "Used Dockerode exec API with hijack+stdin mode instead of pty.spawn('docker exec') for direct stream control"
  - "JSON resize messages parsed inline in ws.on('message') handler with fallback to terminal input"
  - "ConsoleTab queries inspectContainer internally (cached by React Query) rather than passing state as prop"

patterns-established:
  - "Docker exec WebSocket: createDockerExecHandler pattern with hijack mode bidirectional piping"
  - "Terminal resize: Client sends JSON {type:'resize',cols,rows}, backend calls exec.resize()"

requirements-completed: [EXEC-01, EXEC-02, EXEC-03]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 43 Plan 01: Docker Container Exec Terminal Summary

**WebSocket-based container exec with xterm.js Console tab supporting shell selection, resize, and bidirectional stream piping via Dockerode hijack mode**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T00:42:45Z
- **Completed:** 2026-03-23T00:47:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Backend WebSocket handler for Docker container exec using Dockerode with hijack mode for raw duplex streaming
- Frontend Console tab in ContainerDetailSheet with xterm.js terminal, shell selector (bash/sh/ash), optional user field
- Terminal resize handling via FitAddon + ResizeObserver with JSON resize messages sent to backend
- JWT authentication enforced via existing WebSocket upgrade handler (no additional auth code needed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend docker exec WebSocket handler + mount** - `b3805de` (feat)
2. **Task 2: Frontend Console tab in ContainerDetailSheet** - `c116d91` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/docker-exec-socket.ts` - WebSocket handler for Docker container exec with Dockerode, hijack mode, bidirectional piping, resize support
- `livos/packages/livinityd/source/modules/server/index.ts` - Added import and WebSocket mount for /ws/docker-exec endpoint
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` - Added ConsoleTab component with xterm.js, shell selector, connect/disconnect, resize observer

## Decisions Made
- Used Dockerode exec API with hijack mode directly rather than spawning docker CLI via node-pty (more efficient, no CLI overhead)
- JSON resize messages are parsed inline in the WebSocket message handler with try/catch fallback to treat non-JSON data as terminal input
- ConsoleTab queries inspectContainer via tRPC internally (leveraging React Query cache from Info tab) to determine container running state
- Shell validation is server-side (allowlist of bash/sh/ash) in addition to client-side select dropdown

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `ai/routes.ts` (ctx.livinityd possibly undefined) and `server/index.ts` (asyncHandler type mismatch) -- both unrelated to changes made in this plan. No new errors introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Console tab is fully functional, ready for production deployment
- Enhanced logs (plan 02) can proceed independently
- Backend handler ready at /ws/docker-exec, authenticated via JWT

## Self-Check: PASSED

- All 3 key files verified present on disk
- Both task commits (b3805de, c116d91) found in git log

---
*Phase: 43-exec-terminal-enhanced-logs*
*Completed: 2026-03-23*
