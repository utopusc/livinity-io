---
phase: 35-docker-backend-container-list-actions-ui
plan: 01
subsystem: api
tags: [docker, dockerode, trpc, typescript, rbac, container-management]

# Dependency graph
requires: []
provides:
  - "Docker management tRPC API (docker.listContainers, docker.manageContainer)"
  - "Protected container registry (PROTECTED_CONTAINER_PATTERNS)"
  - "Dockerode singleton module with typed wrapper functions"
  - "ContainerInfo, PortMapping, ContainerOperation TypeScript types"
affects: [35-02, 36, 37]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Dockerode singleton (reused, not per-call)", "Protected container server-side enforcement", "confirmName validation for destructive operations"]

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/types.ts
    - livos/packages/livinityd/source/modules/docker/docker.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Dockerode singleton pattern instead of per-call instantiation (ai/routes.ts pattern)"
  - "adminProcedure for both list and manage operations (not privateProcedure)"
  - "confirmName backend validation for remove operation (SEC-03)"
  - "10 protected container patterns including system infra and app-environment"

patterns-established:
  - "Docker module pattern: types.ts (types + constants) -> docker.ts (domain functions) -> routes.ts (thin tRPC routes)"
  - "Protected container enforcement: server-side check in domain layer, FORBIDDEN TRPCError in route layer"

requirements-completed: [DOCK-01, DOCK-02, DOCK-06, SEC-01, SEC-02]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 35 Plan 01: Docker Backend Module Summary

**Dockerode singleton with typed container list/manage API, 10-pattern protected container registry, and admin-only tRPC router with confirmName removal validation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T20:59:32Z
- **Completed:** 2026-03-22T21:02:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created Docker module (types.ts, docker.ts, routes.ts) with clean separation of concerns
- Dockerode singleton with typed listContainers (ports, created, isProtected) and manageContainer (start/stop/restart/remove)
- Server-side protected container enforcement prevents stop/remove on 10 system container patterns
- Admin-only tRPC router registered in appRouter with docker.manageContainer in httpOnlyPaths

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Docker types and Dockerode singleton module** - `d87f6c5` (feat)
2. **Task 2: Create tRPC docker router and register in appRouter + httpOnlyPaths** - `c7175eb` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - ContainerInfo, PortMapping, ContainerOperation types and PROTECTED_CONTAINER_PATTERNS registry
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Dockerode singleton with isProtectedContainer, listContainers, manageContainer exports
- `livos/packages/livinityd/source/modules/docker/routes.ts` - tRPC docker router with adminProcedure, confirmName validation, FORBIDDEN error mapping
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` - Added docker import and registration in appRouter
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.manageContainer to httpOnlyPaths

## Decisions Made
- Used Dockerode singleton pattern (reused across all calls) instead of per-call instantiation from ai/routes.ts
- Both listContainers and manageContainer use adminProcedure (admin-only), not privateProcedure like the existing ai.listDockerContainers
- confirmName backend validation for remove operation prevents accidental container deletion
- 10 protected container patterns cover all system infrastructure containers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Docker backend API is complete and ready for frontend consumption in Plan 02
- AppRouter type now includes docker sub-router, so frontend TypeScript will auto-discover the new endpoints
- Existing ai.listDockerContainers and ai.manageDockerContainer in ai/routes.ts still exist (can be deprecated in a future cleanup)

## Self-Check: PASSED

All 6 files verified present. Both task commits (d87f6c5, c7175eb) verified in git log.

---
*Phase: 35-docker-backend-container-list-actions-ui*
*Completed: 2026-03-22*
