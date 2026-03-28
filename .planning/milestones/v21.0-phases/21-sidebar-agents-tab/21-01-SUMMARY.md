---
phase: 21-sidebar-agents-tab
plan: 01
subsystem: api
tags: [tRPC, REST, subagent, nexus, proxy, redis]

# Dependency graph
requires: []
provides:
  - "GET /api/subagents/:id/history REST endpoint returning SubagentMessage[]"
  - "Enhanced list() with description and tier fields for richer agent cards"
  - "getSubagent tRPC query proxying full SubagentConfig by ID"
  - "getSubagentHistory tRPC query proxying conversation history by ID"
affects: [21-02-sidebar-agents-tab]

# Tech tracking
tech-stack:
  added: []
  patterns: ["tRPC-to-REST proxy with encodeURIComponent for URL safety"]

key-files:
  created: []
  modified:
    - "nexus/packages/core/src/subagent-manager.ts"
    - "nexus/packages/core/src/api.ts"
    - "livos/packages/livinityd/source/modules/ai/routes.ts"

key-decisions:
  - "History endpoint returns empty array on error (graceful degradation, same as listSubagents)"
  - "getSubagent throws TRPCError NOT_FOUND on missing agent (same pattern as deleteSubagent)"

patterns-established:
  - "tRPC proxy query pattern: privateProcedure.input(z.object({id})).query() with encodeURIComponent"

requirements-completed: [AGNT-02, AGNT-03]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 21 Plan 01: Backend API for Agents Panel Summary

**Nexus REST history endpoint, enhanced list() with description/tier, and two tRPC proxy queries (getSubagent, getSubagentHistory) for the Agents panel frontend**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T09:49:31Z
- **Completed:** 2026-03-28T09:52:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Enhanced subagent list() to return description and tier fields for richer agent list cards
- Added GET /api/subagents/:id/history REST endpoint in Nexus with optional limit query parameter
- Added getSubagent and getSubagentHistory tRPC proxy queries in livinityd for frontend consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Add history REST endpoint and enhance list() in Nexus** - `e18b5ff` (feat)
2. **Task 2: Add getSubagent and getSubagentHistory tRPC proxy queries** - `893ee17` (feat)

## Files Created/Modified
- `nexus/packages/core/src/subagent-manager.ts` - Enhanced list() to include description and tier in returned objects
- `nexus/packages/core/src/api.ts` - Added GET /api/subagents/:id/history endpoint with limit query param
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added getSubagent and getSubagentHistory tRPC queries

## Decisions Made
- History endpoint returns empty array on error (graceful degradation), matching existing listSubagents pattern
- getSubagent throws TRPCError NOT_FOUND on missing agent, matching existing deleteSubagent pattern
- Both new tRPC queries use encodeURIComponent on agent ID for URL safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript strict-mode errors in routes.ts (`ctx.livinityd possibly undefined`) across all routes - not caused by changes, out of scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All backend endpoints ready for Plan 21-02 (Agents panel frontend)
- Frontend can call `trpc.ai.listSubagents.useQuery()` for agent list with description/tier
- Frontend can call `trpc.ai.getSubagent.useQuery({id})` for full agent config
- Frontend can call `trpc.ai.getSubagentHistory.useQuery({id})` for conversation history

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits verified (e18b5ff, 893ee17)
- SUMMARY.md created successfully

---
*Phase: 21-sidebar-agents-tab*
*Completed: 2026-03-28*
