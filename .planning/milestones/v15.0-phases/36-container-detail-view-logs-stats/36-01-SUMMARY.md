---
phase: 36-container-detail-view-logs-stats
plan: 01
subsystem: api
tags: [docker, dockerode, trpc, typescript, container-inspect, container-logs, container-stats]

# Dependency graph
requires:
  - phase: 35-docker-backend-container-list-actions-ui
    provides: "Dockerode singleton, ContainerInfo types, docker router with adminProcedure pattern"
provides:
  - "inspectContainer tRPC query returning full ContainerDetail (ports, volumes, env vars, networks, mounts, restart policy, health status)"
  - "containerLogs tRPC query returning ANSI-stripped log string with configurable tail"
  - "containerStats tRPC query returning computed CPU%, memory usage/limit/%, network rx/tx, PIDs"
  - "ContainerDetail, ContainerStats, VolumeMount, MountInfo TypeScript interfaces"
affects: [36-02-container-detail-sheet-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Docker multiplexed stream header stripping for clean log output"
    - "CPU percentage calculation from raw Docker stats (cpuDelta/systemDelta * numCpus)"
    - "Memory usage with cache subtraction for accurate reporting"
    - "Network stats aggregation across all container interfaces"
    - "[not-found] error tag pattern for domain-to-TRPCError mapping"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/docker/types.ts"
    - "livos/packages/livinityd/source/modules/docker/docker.ts"
    - "livos/packages/livinityd/source/modules/docker/routes.ts"

key-decisions:
  - "Docker stream header stripping via manual 8-byte frame parsing for clean log output"
  - "Memory usage subtracts cache (stats.memory_stats.stats.cache) for accurate reporting"
  - "Network stats summed across all interfaces, not just eth0"
  - "Both volumes and mounts exposed separately (VolumeMount for simplified view, MountInfo for full detail)"

patterns-established:
  - "[not-found] error tag: domain functions throw Error with [not-found] prefix, routes map to TRPCError NOT_FOUND"
  - "strip-ansi applied to Docker logs for clean terminal output"

requirements-completed: [DOCK-03, DOCK-04, DOCK-05]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 36 Plan 01: Container Detail Backend Summary

**Three tRPC queries (inspectContainer, containerLogs, containerStats) providing full container inspection data, ANSI-stripped logs, and computed CPU/memory/network stats via Dockerode**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T21:20:48Z
- **Completed:** 2026-03-22T21:23:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added ContainerDetail, ContainerStats, VolumeMount, and MountInfo TypeScript interfaces
- Implemented inspectContainer domain function mapping raw Docker inspect to structured ContainerDetail type with ports, volumes, env vars, networks, mounts, restart policy, health status
- Implemented getContainerLogs with Docker multiplexed stream header stripping and ANSI code removal
- Implemented getContainerStats with proper CPU percentage calculation, cache-adjusted memory usage, and multi-interface network aggregation
- Added three tRPC adminProcedure queries with Zod validation and [not-found] to TRPCError mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ContainerDetail and ContainerStats types, implement three domain functions** - `a73b6f6` (feat)
2. **Task 2: Add three tRPC queries to docker router** - `bbe07eb` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - Added ContainerDetail, ContainerStats, VolumeMount, MountInfo interfaces
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added inspectContainer, getContainerLogs, getContainerStats domain functions with Docker stream header stripping
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added three new adminProcedure tRPC queries with Zod validation and error mapping

## Decisions Made
- Docker stream header stripping via manual 8-byte frame parsing rather than relying on toString() which would include binary header bytes as garbage characters
- Memory usage calculation subtracts cache (stats.memory_stats.stats.cache) for more accurate active memory reporting
- Network stats summed across all interfaces in stats.networks (not just eth0) for containers with multiple network attachments
- Exposed both volumes (simplified VolumeMount with readOnly boolean) and mounts (MountInfo with rw/ro mode string) for different UI consumption needs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three backend queries are ready for frontend consumption in Phase 36 Plan 02
- Frontend TypeScript will auto-discover inspectContainer, containerLogs, containerStats via AppRouter type inference
- No httpOnlyPaths changes needed (all three are queries, not mutations)

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits verified (a73b6f6, bbe07eb)
- SUMMARY.md created successfully

---
*Phase: 36-container-detail-view-logs-stats*
*Completed: 2026-03-22*
