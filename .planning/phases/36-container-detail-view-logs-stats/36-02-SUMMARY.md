---
phase: 36-container-detail-view-logs-stats
plan: 02
subsystem: ui
tags: [react, trpc, docker, sheet, tabs, container-detail, logs, stats]

# Dependency graph
requires:
  - phase: 36-container-detail-view-logs-stats/01
    provides: inspectContainer, containerLogs, containerStats tRPC queries and types
  - phase: 35-docker-backend-container-list-actions-ui/02
    provides: server-control page with container table, useContainers hook
provides:
  - ContainerDetailSheet component with Info/Logs/Stats tabs
  - useContainerDetail hook wrapping inspect/logs/stats queries with polling
  - Clickable container rows opening detail Sheet
affects: [docker-exec, container-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [sheet-detail-panel, per-tab-query-hook, auto-scroll-log-viewer, stopPropagation-action-isolation]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-container-detail.ts
    - livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx
  modified:
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "Each tab renders its own useContainerDetail call for independent lifecycle and query parameters"
  - "Native HTML range input for tail slider instead of a shadcn Slider component (not installed)"
  - "Stats use custom colored divs instead of Progress component to support conditional coloring (green/amber/red)"
  - "stopPropagation via span wrappers around ActionButton (less invasive than changing ActionButton interface)"

patterns-established:
  - "Sheet detail panel: right-side Sheet with tabbed content for drill-down views"
  - "Auto-scroll log viewer: useRef + onScroll detection + Jump to bottom button pattern"
  - "Conditional query enabling: pass null containerName to disable all queries when Sheet is closed"

requirements-completed: [DOCK-03, DOCK-04, DOCK-05, UI-03]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 36 Plan 02: Container Detail Sheet UI Summary

**Right-side Sheet with Info/Logs/Stats tabs for container drill-down -- tabbed detail view with live polling, auto-scroll log viewer, and CPU/memory progress bars**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T21:25:59Z
- **Completed:** 2026-03-22T21:29:26Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ContainerDetailSheet component with three tabbed views (Info, Logs, Stats) opening from container row click
- useContainerDetail hook wrapping inspectContainer (one-shot), containerLogs (2s poll), containerStats (3s poll) tRPC queries
- Info tab: general info grid, ports table, volumes/mounts table, env vars in monospace, networks list
- Logs tab: monospace pre with auto-scroll, tail slider 100-1000, refresh button, "Jump to bottom" indicator
- Stats tab: CPU% and memory% with colored progress bars (green/amber/red thresholds), network I/O cards, PID count
- Action buttons isolated from row click via stopPropagation wrappers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useContainerDetail hook and ContainerDetailSheet component** - `adccdd0` (feat)
2. **Task 2: Integrate ContainerDetailSheet into server-control page** - `dff3db1` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-container-detail.ts` - Hook wrapping three tRPC Docker queries with conditional enabling and polling
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` - Full ContainerDetailSheet with Info, Logs, Stats sub-components
- `livos/packages/ui/src/routes/server-control/index.tsx` - Added row click handler, selectedContainer state, ContainerDetailSheet mount, stopPropagation on action buttons

## Decisions Made
- Each tab (InfoTab, LogsTab, StatsTab) calls useContainerDetail independently, allowing the Logs tab to pass its own tail parameter while Info and Stats use defaults
- Used native HTML range input for the tail slider since no shadcn Slider component exists in the project
- Stats tab uses custom colored divs (green <50%, amber 50-80%, red >80%) instead of the Progress component to support threshold-based coloring
- Action buttons wrapped in span elements with stopPropagation rather than modifying ActionButton's onClick type signature

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data flows are wired to live tRPC queries.

## Next Phase Readiness
- Phase 36 complete: backend queries (Plan 01) + frontend UI (Plan 02) both done
- Container detail drill-down fully functional for inspect, logs, and stats
- Ready for Phase 37+ (Docker images, volumes, networks, PM2, monitoring)

## Self-Check: PASSED

All 4 files verified present. Both task commits (adccdd0, dff3db1) verified in git log.

---
*Phase: 36-container-detail-view-logs-stats*
*Completed: 2026-03-22*
