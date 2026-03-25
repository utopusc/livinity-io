---
phase: 38-pm2-process-management
plan: 01
subsystem: api
tags: [pm2, execa, trpc, process-management]

# Dependency graph
requires:
  - phase: 35-docker-container-management
    provides: Docker module pattern (types.ts, domain.ts, routes.ts), adminProcedure, httpOnlyPaths
provides:
  - PM2 type definitions (PM2ProcessInfo, PM2ProcessDetail, PM2Operation, PROTECTED_PM2_PROCESSES)
  - PM2 domain functions (listProcesses, manageProcess, getProcessLogs, describeProcess)
  - PM2 tRPC router registered in appRouter with adminProcedure on all routes
  - pm2.manage in httpOnlyPaths for HTTP-only transport
affects: [38-02 PM2 UI, server-management-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [execa $ tagged template for PM2 CLI, pm2 jlist JSON parsing, protected-process error tag]

key-files:
  created:
    - livos/packages/livinityd/source/modules/pm2/types.ts
    - livos/packages/livinityd/source/modules/pm2/pm2.ts
    - livos/packages/livinityd/source/modules/pm2/routes.ts
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Exact match for protected process names (not substring match like Docker containers)"
  - "pm2 jlist with reject:false for graceful empty-state handling"

patterns-established:
  - "PM2 module mirrors Docker module pattern: types.ts + domain.ts + routes.ts"
  - "[protected-process] error tag -> FORBIDDEN (parallels [protected-container])"

requirements-completed: [PM2-01, PM2-02, PM2-03, PM2-04]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 38 Plan 01: PM2 Backend Module Summary

**PM2 process management backend with execa-based domain functions (list/manage/logs/describe) and tRPC router following Docker module pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T22:00:30Z
- **Completed:** 2026-03-22T22:03:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PM2 types with protected process enforcement (livos, nexus-core cannot be stopped)
- Four domain functions using execa $ tagged template: listProcesses, manageProcess, getProcessLogs, describeProcess
- tRPC router with adminProcedure on all four routes, registered in appRouter
- pm2.manage added to httpOnlyPaths for relay tunnel reliability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PM2 types and domain functions** - `07676a7` (feat)
2. **Task 2: Create PM2 tRPC routes and register in appRouter** - `fa622d1` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/pm2/types.ts` - PROTECTED_PM2_PROCESSES, PM2ProcessInfo, PM2ProcessDetail, PM2Operation
- `livos/packages/livinityd/source/modules/pm2/pm2.ts` - Domain functions using execa $ tagged template for pm2 CLI
- `livos/packages/livinityd/source/modules/pm2/routes.ts` - tRPC router with list, manage, logs, describe routes
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` - pm2 router registered in appRouter
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - pm2.manage added to httpOnlyPaths

## Decisions Made
- Exact match for protected process names (not substring like Docker) -- PM2 process names are explicit, not container-like patterns
- pm2 jlist with reject:false for graceful handling when PM2 has no processes running

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PM2 backend endpoints ready for UI consumption in Plan 02
- All four PM2 routes (list, manage, logs, describe) available on tRPC appRouter
- No blockers

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 38-pm2-process-management*
*Completed: 2026-03-22*
