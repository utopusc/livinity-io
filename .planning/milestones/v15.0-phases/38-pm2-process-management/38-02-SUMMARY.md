---
phase: 38-pm2-process-management
plan: 02
subsystem: ui
tags: [react, trpc, pm2, tailwind, framer-motion]

# Dependency graph
requires:
  - phase: 38-pm2-process-management/01
    provides: PM2 tRPC backend (list, manage, logs, describe routes)
provides:
  - usePM2 React hook wrapping PM2 tRPC queries/mutations with 10s polling
  - PM2Tab component with process table, action buttons, expandable detail panel
  - PM2DetailPanel with process info grid and log viewer with lines slider
affects: [40-hardening-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [expandable-table-row-with-detail-panel, inline-log-viewer-with-range-slider]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-pm2.ts
  modified:
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "Inline expandable detail panel (not dialog/sheet) for PM2 process details -- matches compact server-control UX"
  - "Direct trpcReact calls in PM2DetailPanel for describe/logs (not via hook) since they need per-process name parameter"
  - "Fragment keying on process.name for expandable row pairs in table body"

patterns-established:
  - "Expandable table row: Fragment wrapping data row + conditional detail row with colSpan"
  - "Inline log viewer: pre element with auto-scroll via useRef + useEffect on data change"

requirements-completed: [PM2-01, PM2-02, PM2-03, PM2-04]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 38 Plan 02: PM2 Frontend Tab Summary

**PM2 management UI with process table (status badges, CPU/memory/uptime), start/stop/restart actions with protected process enforcement, expandable detail panel with log viewer and lines slider**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T22:05:24Z
- **Completed:** 2026-03-22T22:09:57Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Complete PM2 tab replacing placeholder with full process management UI
- usePM2 hook with 10s polling, manage mutation, and action result toast pattern
- Process table with name (chevron + lock icon), status badge, CPU%, memory, uptime, restarts columns
- Start/stop/restart action buttons with protected process enforcement (stop disabled for livos, nexus-core)
- Expandable inline detail panel showing PID, script, cwd, node version, exec mode
- Log viewer with monospace pre, auto-scroll, refresh button, and lines slider (50-500 range)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create usePM2 hook and PM2Tab component** - `eead983` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-pm2.ts` - React hook wrapping PM2 tRPC list query (10s polling) and manage mutation with action result state
- `livos/packages/ui/src/routes/server-control/index.tsx` - Added PM2StatusBadge, formatUptime, PM2DetailPanel, PM2Tab components; replaced PM2 PlaceholderTab

## Decisions Made
- Used inline expandable detail panel (not dialog/sheet) for PM2 process details to match the compact server-control dashboard UX
- Direct trpcReact calls in PM2DetailPanel for describe/logs queries since they require per-process name parameter (not via shared hook)
- Used Fragment with key on process.name for expandable row pairs in table body

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PM2 frontend complete, all 4 PM2 requirements (PM2-01 through PM2-04) satisfied
- Phase 38 (pm2-process-management) fully complete -- backend + frontend
- Ready for Phase 39 (enhanced-system-monitoring) or Phase 40 (hardening-polish)

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 38-pm2-process-management*
*Completed: 2026-03-22*
