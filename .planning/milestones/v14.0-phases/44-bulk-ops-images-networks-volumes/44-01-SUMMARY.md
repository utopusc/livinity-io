---
phase: 44-bulk-ops-images-networks-volumes
plan: 01
subsystem: docker, ui
tags: [docker, containers, bulk-operations, kill, pause, unpause, checkbox, tRPC]

# Dependency graph
requires:
  - phase: 42-container-config-editing
    provides: "Container management backend (manageContainer, routes, types)"
provides:
  - "Extended ContainerOperation type with kill/pause/unpause"
  - "bulkManageContainers backend function and tRPC mutation"
  - "Checkbox multi-select in container table"
  - "Floating bulk action bar for container operations"
  - "Per-container Kill, Pause, and Resume action buttons"
affects: [44-02, 44-03, container-management]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Promise.allSettled for parallel bulk operations", "Checkbox multi-select with floating action bar"]

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/docker/types.ts"
    - "livos/packages/livinityd/source/modules/docker/docker.ts"
    - "livos/packages/livinityd/source/modules/docker/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "livos/packages/ui/src/hooks/use-containers.ts"
    - "livos/packages/ui/src/routes/server-control/index.tsx"

key-decisions:
  - "Protected containers block pause alongside stop/remove (must stay running)"
  - "Kill allowed on protected containers (emergency stop, same as restart)"
  - "Bulk remove uses force:true with single Confirm button (no per-container name typing)"
  - "pastTense lookup map replaces inline string concatenation for operation messages"

patterns-established:
  - "Promise.allSettled for parallel bulk Docker operations with per-container error reporting"
  - "Checkbox column + floating action bar pattern for multi-select bulk operations"

requirements-completed: [ACT-01, ACT-02, ACT-03]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 44 Plan 01: Container Kill/Pause/Resume + Bulk Operations Summary

**Kill/pause/resume per-container actions and checkbox multi-select bulk operations bar for container table**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T01:04:08Z
- **Completed:** 2026-03-23T01:08:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended backend ContainerOperation to support kill (SIGKILL), pause, and unpause with protected container enforcement
- Added bulkManageContainers function using Promise.allSettled for parallel execution with per-container result reporting
- Added checkbox column with select-all/indeterminate state to container table
- Added floating bulk action bar (Start/Stop/Restart/Kill/Remove) with animated enter/exit
- Added per-container Kill, Pause, and Resume buttons with proper state-based visibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend -- extend container operations and add bulk mutation** - `df73ab7` (feat)
2. **Task 2: Frontend -- checkbox multi-select, bulk action bar, kill/pause/resume buttons** - `48ecff2` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - Extended ContainerOperation with kill/pause/unpause
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added kill/pause/unpause handling + bulkManageContainers
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added bulkManageContainers tRPC mutation, extended operation enum
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.bulkManageContainers to httpOnlyPaths
- `livos/packages/ui/src/hooks/use-containers.ts` - Added bulkManage mutation and extended operation types
- `livos/packages/ui/src/routes/server-control/index.tsx` - Checkbox column, bulk bar, kill/pause/resume buttons

## Decisions Made
- Protected containers cannot be paused (added to block list alongside stop/remove) since they must stay running
- Kill is allowed on protected containers as an emergency stop (same reasoning as restart)
- Bulk remove uses force:true with a single Confirm button rather than per-container name typing
- Used pastTense lookup map for consistent operation success messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Container operations fully extended with 7 operations (start/stop/restart/remove/kill/pause/unpause)
- Bulk operations infrastructure ready for reuse in other tabs (images, volumes, networks)
- Ready for 44-02 (images/volumes/networks) and 44-03 plans

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (df73ab7, 48ecff2) verified in git log.

---
*Phase: 44-bulk-ops-images-networks-volumes*
*Completed: 2026-03-23*
