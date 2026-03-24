---
phase: 41-container-creation
plan: 01
subsystem: api
tags: [docker, dockerode, trpc, zod, container-creation]

# Dependency graph
requires:
  - phase: 38-server-management
    provides: "Docker module with listContainers, manageContainer, inspectContainer"
provides:
  - "ContainerCreateInput type covering all Docker container creation fields"
  - "createContainer domain function using dockerode with image pull and auto-start"
  - "docker.createContainer tRPC mutation with full Zod validation (admin-only)"
  - "HTTP-only transport for createContainer mutation"
affects: [41-02-PLAN, container-creation-ui, container-duplicate]

# Tech tracking
tech-stack:
  added: []
  patterns: ["dockerode ContainerCreateOptions builder pattern", "image pull before create with followProgress"]

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/docker/types.ts"
    - "livos/packages/livinityd/source/modules/docker/docker.ts"
    - "livos/packages/livinityd/source/modules/docker/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"

key-decisions:
  - "Image pull defaults to true (pullImage !== false) for safer UX"
  - "Auto-start defaults to true (autoStart !== false) to match Portainer behavior"
  - "Bind mounts use HostConfig.Binds format, named volumes and tmpfs use HostConfig.Mounts"

patterns-established:
  - "Container creation input uses array-of-objects for env/labels/ports/volumes (easier for form binding than key-value objects)"

requirements-completed: [CREATE-01, CREATE-02, CREATE-03, CREATE-04, CREATE-05, CREATE-06, CREATE-07, CREATE-08]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 41 Plan 01: Container Creation Backend Summary

**tRPC mutation for Docker container creation with full config support: ports, volumes, env, restart policy, resources, health check, and network via dockerode**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T00:05:33Z
- **Completed:** 2026-03-23T00:08:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ContainerCreateInput type covering all 8 CREATE requirements (general, ports, volumes, env, restart policy, resources, health check, network)
- createContainer domain function that pulls images, builds dockerode options, creates containers, and optionally auto-starts them
- Admin-only tRPC mutation with comprehensive Zod validation schema
- HTTP-only transport configured to avoid WebSocket reliability issues

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ContainerCreateInput type and createContainer domain function** - `99b2c73` (feat)
2. **Task 2: Add createContainer tRPC mutation and httpOnlyPaths entry** - `eb09bdf` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - Added ContainerCreateInput interface with all config fields
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added createContainer function with image pull, dockerode options builder, and auto-start
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added createContainer tRPC mutation with full Zod schema
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.createContainer to httpOnlyPaths

## Decisions Made
- Image pull defaults to true for safer UX (users expect the image to be available)
- Auto-start defaults to true to match Portainer behavior (create and run)
- Bind mounts use HostConfig.Binds string format; named volumes and tmpfs use HostConfig.Mounts object format (dockerode distinction)
- Container name regex validates `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` matching Docker naming rules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend API complete for container creation
- Ready for 41-02 (frontend container creation form UI)
- tRPC mutation fully typed and validated, frontend can import types directly

## Self-Check: PASSED

All files exist. All commits verified (99b2c73, eb09bdf).

---
*Phase: 41-container-creation*
*Completed: 2026-03-23*
