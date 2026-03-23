---
phase: 45-docker-compose-stacks
plan: 01
subsystem: api
tags: [docker-compose, execa, trpc, dockerode, stacks]

# Dependency graph
requires:
  - phase: 44-image-volume-network
    provides: Docker module structure, routes.ts pattern, httpOnlyPaths pattern
provides:
  - Stack types (StackInfo, StackContainer, StackControlOperation)
  - Stack domain functions (listStacks, deployStack, editStack, controlStack, removeStack, getStackCompose, getStackEnv)
  - Stack tRPC routes (7 routes, admin-only)
  - httpOnlyPaths for stack mutations
affects: [45-02-docker-compose-stacks]

# Tech tracking
tech-stack:
  added: []
  patterns: [execa docker compose CLI pattern, compose project label grouping]

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/stacks.ts
  modified:
    - livos/packages/livinityd/source/modules/docker/types.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Uses dockerode listContainers for stack discovery, execa docker compose CLI for mutations"
  - "Stack compose files stored at /opt/livos/data/stacks/{name}/docker-compose.yml"
  - "Stack status computed from container states: all running=running, all stopped=stopped, mixed=partial"

patterns-established:
  - "Stack domain: execa with cwd set to stack dir for relative path resolution"
  - "Error prefixes: [compose-error], [not-found], [validation-error] for stack operations"

requirements-completed: [STACK-01, STACK-02, STACK-03, STACK-04, STACK-05, STACK-06]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 45 Plan 01: Stack Backend Summary

**Docker Compose stack CRUD backend with 7 domain functions, tRPC routes, and httpOnlyPaths using execa CLI and dockerode container grouping**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T01:32:31Z
- **Completed:** 2026-03-23T01:34:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created stacks.ts with 7 domain functions for full stack lifecycle (list, deploy, edit, control, remove, get compose, get env)
- Added StackInfo, StackContainer, StackControlOperation types to types.ts
- Added 7 tRPC routes with Zod validation and error mapping to routes.ts
- Added 4 stack mutation paths to httpOnlyPaths in common.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Stack types and domain functions** - `ecaf95e` (feat)
2. **Task 2: tRPC routes and httpOnlyPaths for stacks** - `8a5e394` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/stacks.ts` - Stack domain functions (listStacks, deployStack, editStack, controlStack, removeStack, getStackCompose, getStackEnv)
- `livos/packages/livinityd/source/modules/docker/types.ts` - Added StackInfo, StackContainer, StackControlOperation types
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added 7 tRPC routes for stack management with Zod validation
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added 4 httpOnlyPaths for stack mutations

## Decisions Made
- Used dockerode `listContainers({all: true})` for stack discovery via `com.docker.compose.project` label, execa `docker compose` CLI for all mutations
- Stack compose files stored at `/opt/livos/data/stacks/{name}/docker-compose.yml` with optional `.env` alongside
- Stack status derived from container states: all containers running = 'running', all stopped/exited/created/dead = 'stopped', mixed = 'partial'
- execa calls use `{cwd: stackDir}` to ensure relative paths in compose files resolve correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend stack API complete, ready for frontend Stacks tab (Plan 02)
- All 7 routes available: listStacks (query), deployStack/editStack/controlStack/removeStack (mutations), getStackCompose/getStackEnv (queries)

## Self-Check: PASSED

All 5 files verified present. Both task commits (ecaf95e, 8a5e394) confirmed in git log.

---
*Phase: 45-docker-compose-stacks*
*Completed: 2026-03-23*
