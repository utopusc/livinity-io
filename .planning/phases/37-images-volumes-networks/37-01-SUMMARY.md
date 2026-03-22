---
phase: 37-images-volumes-networks
plan: 01
subsystem: api
tags: [docker, dockerode, trpc, images, volumes, networks, zod]

# Dependency graph
requires:
  - phase: 35-container-management
    provides: Docker module with Dockerode singleton, adminProcedure pattern, error tag pattern
  - phase: 36-container-detail
    provides: "[not-found] error tag pattern, container inspect/logs/stats domain functions"
provides:
  - 7 new tRPC routes for image/volume/network management (listImages, removeImage, pruneImages, listVolumes, removeVolume, listNetworks, inspectNetwork)
  - 5 new TypeScript interfaces (ImageInfo, VolumeInfo, NetworkInfo, NetworkContainer, NetworkDetail)
  - httpOnlyPaths entries for image/volume mutations
affects: [37-02-PLAN, frontend-images-tab, frontend-volumes-tab, frontend-networks-tab]

# Tech tracking
tech-stack:
  added: []
  patterns: ["[in-use] error tag mapped to CONFLICT tRPC code", "confirmName validation on volume remove (SEC-03 pattern)"]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/docker/types.ts
    - livos/packages/livinityd/source/modules/docker/docker.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Used (vol as any).CreatedAt for volume CreatedAt -- Dockerode @types/dockerode lacks CreatedAt on VolumeInspectInfo despite Docker API returning it"
  - "[in-use] error tag with CONFLICT tRPC code for image/volume in-use errors (extends existing [not-found] pattern)"

patterns-established:
  - "[in-use] error tag: domain throws tagged error, route maps to TRPCError CONFLICT"
  - "confirmName backend validation reused from container remove for volume remove (SEC-03)"

requirements-completed: [IMG-01, IMG-02, IMG-03, VOL-01, VOL-02, VOL-03, VOL-04]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 37 Plan 01: Images/Volumes/Networks Backend Summary

**7 tRPC routes for Docker image, volume, and network management using Dockerode with error tagging and adminProcedure protection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T21:37:53Z
- **Completed:** 2026-03-22T21:41:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 5 new TypeScript interfaces exported from docker types module (ImageInfo, VolumeInfo, NetworkInfo, NetworkContainer, NetworkDetail)
- 7 domain functions added to docker.ts with proper error tagging ([not-found], [in-use])
- 7 tRPC routes in the docker router with adminProcedure, Zod validation, and error mapping to proper tRPC codes
- 3 mutation httpOnlyPaths entries ensuring reliable HTTP transport for destructive operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add image/volume/network types and domain functions** - `4c37af7` (feat)
2. **Task 2: Add tRPC routes and httpOnlyPaths** - `191352a` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - Added ImageInfo, VolumeInfo, NetworkInfo, NetworkContainer, NetworkDetail interfaces
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added listImages, removeImage, pruneImages, listVolumes, removeVolume, listNetworks, inspectNetwork domain functions
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added 7 new tRPC routes with adminProcedure, Zod validation, error mapping
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.removeImage, docker.pruneImages, docker.removeVolume to httpOnlyPaths

## Decisions Made
- Used `(vol as any).CreatedAt` cast for volume CreatedAt property -- @types/dockerode v3.3.47 does not include CreatedAt on VolumeInspectInfo, but the Docker API returns it. Inline `any` cast is minimal and scoped.
- Introduced `[in-use]` error tag (new, alongside existing `[not-found]`) mapped to tRPC `CONFLICT` code for image/volume in-use scenarios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cast CreatedAt through any for Dockerode type gap**
- **Found during:** Task 1 (domain functions)
- **Issue:** `VolumeInspectInfo` in @types/dockerode does not include `CreatedAt` property, causing TS2339 error
- **Fix:** Used `(vol as any).CreatedAt` inline cast -- minimal scope, Docker API does return this field
- **Files modified:** livos/packages/livinityd/source/modules/docker/docker.ts
- **Verification:** TypeScript compiles with zero docker-related errors
- **Committed in:** 4c37af7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- single inline type cast to work around incomplete type definitions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 backend routes ready for frontend consumption in plan 37-02
- Frontend can call docker.listImages, docker.removeImage, docker.pruneImages, docker.listVolumes, docker.removeVolume, docker.listNetworks, docker.inspectNetwork via tRPC client
- Mutation routes use HTTP transport via httpOnlyPaths for reliability

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 37-images-volumes-networks*
*Completed: 2026-03-22*
