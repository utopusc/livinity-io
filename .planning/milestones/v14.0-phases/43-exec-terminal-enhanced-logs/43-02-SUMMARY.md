---
phase: 43-exec-terminal-enhanced-logs
plan: 02
subsystem: ui, docker
tags: [logs, search, highlight, download, timestamps, line-wrap, container]

# Dependency graph
requires:
  - phase: 43-exec-terminal-enhanced-logs
    plan: 01
    provides: ContainerDetailSheet with LogsTab, ConsoleTab, Info, Stats tabs
  - phase: 38-server-management
    provides: containerLogs tRPC query with timestamps param
provides:
  - Enhanced LogsTab with search/highlight, log download, timestamps toggle, line wrap toggle
affects: [server-management, docker, container-detail, logs]

# Tech tracking
tech-stack:
  added: []
  patterns: [useMemo search highlighting with mark elements, Blob URL download for log export]

key-files:
  created: []
  modified:
    - livos/packages/ui/src/hooks/use-container-detail.ts
    - livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx

key-decisions:
  - "Search highlighting uses useMemo with mark elements and data-match-index for scrollIntoView navigation"
  - "Download uses Blob URL with timestamped filename pattern (container-logs-YYYY-MM-DD-HH-MM-SS.log)"
  - "Timestamps toggle re-fetches from backend rather than client-side stripping for data accuracy"

patterns-established:
  - "Log search: Case-insensitive indexOf loop for match indices, mark elements with active ring highlight"
  - "Log download: Blob URL + programmatic anchor click pattern for client-side file export"

requirements-completed: [LOGS-01, LOGS-02, LOGS-03, LOGS-04]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 43 Plan 02: Enhanced Logs Summary

**LogsTab with search/highlight navigation, .log file download, timestamps toggle via backend re-fetch, and CSS line wrap toggle**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T00:49:35Z
- **Completed:** 2026-03-23T00:53:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- useContainerDetail hook accepts configurable timestamps option (non-breaking, defaults to true)
- Search input with case-insensitive match highlighting using amber mark elements, prev/next navigation with wrap-around, active match ring indicator
- Download button exports current log content as timestamped .log file via Blob URL
- Timestamps checkbox toggles timestamps on/off by re-fetching from backend with updated parameter
- Line wrap checkbox toggles CSS whitespace between pre-wrap and pre for horizontal scrolling

## Task Commits

Each task was committed atomically:

1. **Task 1: Update use-container-detail hook to accept timestamps option** - `baa9961` (feat)
2. **Task 2: Enhance LogsTab with search, download, timestamps toggle, and line wrap toggle** - `e96e36d` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-container-detail.ts` - Added optional timestamps param to hook options, passed to containerLogs tRPC query
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` - Enhanced LogsTab with search/highlight, download, timestamps toggle, line wrap toggle; added 6 new icon imports

## Decisions Made
- Search highlighting implemented via useMemo with indexOf loop and React mark elements rather than regex for simplicity and performance
- Active match uses ring-1 ring-amber-400 CSS to visually distinguish from other matches (bg-amber-500/30 vs bg-amber-500/60)
- Download filename includes ISO timestamp with colons replaced by dashes for filesystem compatibility
- Timestamps toggle triggers backend re-fetch (passing timestamps param to Docker API) rather than client-side parsing for data accuracy
- Two-row control bar layout: search + toggles on row 1, tail slider + refresh + download on row 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `ai/routes.ts` (ctx.livinityd possibly undefined) -- unrelated to changes. No new errors introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- LogsTab fully enhanced with all four features (search, download, timestamps, wrap)
- Phase 43 (exec-terminal-enhanced-logs) is now complete -- both plans finished
- All container detail features (Info, Logs, Stats, Console) at Portainer parity

## Self-Check: PASSED

- All 2 key files verified present on disk
- Both task commits (baa9961, e96e36d) found in git log

---
*Phase: 43-exec-terminal-enhanced-logs*
*Completed: 2026-03-23*
