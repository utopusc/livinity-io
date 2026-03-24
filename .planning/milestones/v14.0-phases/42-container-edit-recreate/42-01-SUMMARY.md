---
phase: 42-container-edit-recreate
plan: 01
subsystem: api
tags: [docker, trpc, zod, dockerode, container-management]

# Dependency graph
requires:
  - phase: 41-container-creation
    provides: createContainer domain function and tRPC mutation with Zod schema
provides:
  - recreateContainer domain function (stop, remove, create with new config)
  - renameContainer domain function (dockerode rename with validation)
  - tRPC mutations for both with full Zod validation and admin-only access
  - httpOnlyPaths entries for HTTP transport
affects: [42-container-edit-recreate]

# Tech tracking
tech-stack:
  added: []
  patterns: [recreate-pattern (stop+remove+create), error-tag-pattern ([protected-container], [not-found], [conflict])]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/docker/docker.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Recreate flow: stop (ignore errors) then force-remove then createContainer -- ensures clean slate"
  - "renameContainer validates Docker naming regex at both domain and tRPC layers"

patterns-established:
  - "Recreate pattern: stop+remove+create for container config updates"
  - "Error tag convention: [protected-container], [not-found], [conflict] for domain-to-route error mapping"

requirements-completed: [EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-07]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 42 Plan 01: Container Edit Backend Summary

**Backend mutations for container recreate (stop+remove+create) and rename via dockerode with admin-only tRPC endpoints**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T00:25:14Z
- **Completed:** 2026-03-23T00:26:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- recreateContainer domain function with protected container check, stop/remove/create flow, and 404 error handling
- renameContainer domain function with Docker naming regex validation, protected check, and 404/409 error handling
- Both tRPC mutations with full Zod schemas matching createContainer's existing schema pattern
- httpOnlyPaths entries for HTTP transport reliability

## Task Commits

Each task was committed atomically:

1. **Task 1: Add recreateContainer and renameContainer domain functions** - `c9132bf` (feat)
2. **Task 2: Add tRPC mutations and httpOnlyPaths for recreate and rename** - `9c8807c` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added recreateContainer and renameContainer exported async functions
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added tRPC mutations with Zod validation, error handling, admin-only access
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.recreateContainer and docker.renameContainer to httpOnlyPaths

## Decisions Made
- Recreate flow uses stop (with error suppression for already-stopped containers) followed by force-remove, then delegates to existing createContainer function for the new container creation
- Docker naming regex validation applied at both domain function level (renameContainer) and Zod schema level (tRPC mutation) for defense in depth

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend mutations ready for Phase 42 Plan 02 (frontend edit/duplicate/rename UI)
- inspectContainer (Phase 36) already exists for pre-filling the edit form
- recreateContainer accepts full ContainerCreateInput, compatible with the existing creation form

## Self-Check: PASSED

All files verified present. All commits verified in git history.

---
*Phase: 42-container-edit-recreate*
*Completed: 2026-03-23*
