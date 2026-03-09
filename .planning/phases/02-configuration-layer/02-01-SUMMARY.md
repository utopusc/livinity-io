---
phase: 02-configuration-layer
plan: 01
subsystem: api
tags: [kimi, express, trpc, redis, api-key, auth]

# Dependency graph
requires:
  - phase: 01-kimi-provider
    provides: KimiProvider with OpenAI-compatible API at api.kimi.com/coding/v1
provides:
  - Express routes /api/kimi/status, /api/kimi/login, /api/kimi/logout for Kimi API key management
  - tRPC procedures getKimiStatus, kimiLogin, kimiLogout proxying to Nexus Express routes
  - tRPC getConfig/setConfig/validateKey updated for Kimi-only config
affects: [02-configuration-layer plan 02 (Settings UI), 03-agent-runner, 04-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kimi auth via API key stored in Redis (nexus:config:kimi_api_key)"
    - "tRPC procedures proxy to Nexus Express routes with LIV_API_KEY header"
    - "Key validation via GET api.kimi.com/coding/v1/models with Bearer token"

key-files:
  created: []
  modified:
    - nexus/packages/core/src/api.ts
    - livos/packages/livinityd/source/modules/ai/routes.ts

key-decisions:
  - "Kimi auth is API key only (no OAuth flow like Claude CLI had)"
  - "Redis publish on key change for live config reload (livos:config:updated channel)"
  - "Validate key via /models endpoint (lightweight, no token cost)"
  - "ClaudeProvider import kept in api.ts (still used by agent stream SDK detection)"

patterns-established:
  - "Kimi API key storage: nexus:config:kimi_api_key in Redis"
  - "Config change notification: redis.publish('livos:config:updated', 'kimi_api_key')"

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 2 Plan 1: Kimi Auth Routes Summary

**Express /api/kimi/* routes for API key CRUD and tRPC proxy procedures replacing all Claude/Gemini auth in both nexus and livinityd**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T08:44:40Z
- **Completed:** 2026-03-09T08:47:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Express routes /api/kimi/status, /api/kimi/login, /api/kimi/logout handle Kimi API key management through Redis
- tRPC getConfig/setConfig return Kimi-only fields (removed anthropicApiKey, geminiApiKey, primaryProvider)
- tRPC validateKey validates against Kimi API (api.kimi.com/coding/v1/models)
- tRPC getKimiStatus, kimiLogin, kimiLogout proxy to Nexus Express routes
- All 5 Claude auth procedures removed (getClaudeCliStatus, startClaudeLogin, submitClaudeLoginCode, claudeLogout, setClaudeAuthMethod)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Claude CLI Express routes with Kimi auth routes** - `17cc192` (feat)
2. **Task 2: Update tRPC AI routes for Kimi config and auth proxying** - `d0aba0f` (feat)

## Files Created/Modified
- `nexus/packages/core/src/api.ts` - Replaced 4 Claude CLI routes with 3 Kimi auth routes (status, login, logout)
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Updated getConfig/setConfig/validateKey for Kimi; replaced 5 Claude auth tRPC procedures with 3 Kimi equivalents

## Decisions Made
- Kept ClaudeProvider import in api.ts since it is still referenced at line 1613 for SDK subscription mode detection in agent stream
- Kimi validation uses GET /models endpoint (zero token cost) rather than a chat completion call
- Redis publish on key save/delete enables live config reload without server restart

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in livinityd (toolRegistry property, subagent typing, apps.ts Buffer types) unrelated to changes made. These existed before this plan and do not affect the modified code.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All API routes ready for Plan 02 (Settings UI) to wire against
- Express routes testable via curl once server is running
- tRPC procedures ready for React Query hooks in the UI

---
*Phase: 02-configuration-layer*
*Completed: 2026-03-09*
