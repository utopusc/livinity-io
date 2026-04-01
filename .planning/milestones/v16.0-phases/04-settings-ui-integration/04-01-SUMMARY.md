---
phase: 04-settings-ui-integration
plan: 01
subsystem: api
tags: [trpc, claude, anthropic, oauth, pkce, provider-management, proxy-routes]

# Dependency graph
requires:
  - phase: 03-auth-config/01
    provides: "Five Claude auth REST endpoints in Nexus API (set-api-key, status, start-login, submit-code, logout)"
  - phase: 03-auth-config/02
    provides: "Provider listing (GET /api/providers) and switching (PUT /api/provider/primary) REST endpoints"
provides:
  - "Seven tRPC routes in livinityd proxying Claude auth and provider management to Nexus API"
  - "httpOnlyPaths entries for five new mutation routes ensuring HTTP transport"
affects: [04-settings-ui-integration/02]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Claude auth tRPC routes mirror Kimi auth pattern: privateProcedure + fetch proxy to Nexus"]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Claude auth routes follow exact same fetch-proxy pattern as existing Kimi auth routes for consistency"
  - "Query routes (getClaudeStatus, getProviders) omitted from httpOnlyPaths since they work fine over WebSocket"

patterns-established:
  - "Claude auth tRPC routes: privateProcedure + getNexusApiUrl() + X-API-Key header + try/catch/TRPCError"
  - "Provider management routes follow same proxy pattern for listing and switching providers"

requirements-completed: [UI-01, UI-03]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 04 Plan 01: tRPC Routes for Claude Auth & Provider Management Summary

**Seven tRPC proxy routes for Claude authentication (API key, OAuth PKCE, status, logout) and provider listing/switching, with httpOnlyPaths registration for mutations**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T06:15:13Z
- **Completed:** 2026-03-25T06:17:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Five Claude auth tRPC routes proxy to Nexus API (getClaudeStatus, setClaudeApiKey, claudeStartLogin, claudeSubmitCode, claudeLogout)
- Two provider management tRPC routes proxy to Nexus API (getProviders, setPrimaryProvider)
- Five mutation routes registered in httpOnlyPaths for reliable HTTP transport

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Claude auth and provider management tRPC routes** - `54ade44` (feat)
2. **Task 2: Register new mutation routes in httpOnlyPaths** - `d13dea5` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Seven new tRPC routes following existing Kimi auth proxy pattern
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Five httpOnlyPaths entries for Claude/provider mutations

## Decisions Made
- Claude auth routes follow exact same fetch-proxy pattern as Kimi auth routes (getNexusApiUrl, X-API-Key header, try/catch/TRPCError) for consistency
- Query routes (getClaudeStatus, getProviders) omitted from httpOnlyPaths -- they work fine over WebSocket and don't need HTTP forcing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All tRPC routes ready for Settings UI consumption (Plan 02)
- UI can call ai.getClaudeStatus, ai.setClaudeApiKey, ai.claudeStartLogin, ai.claudeSubmitCode, ai.claudeLogout
- UI can call ai.getProviders and ai.setPrimaryProvider for provider toggle

---
*Phase: 04-settings-ui-integration*
*Completed: 2026-03-25*
