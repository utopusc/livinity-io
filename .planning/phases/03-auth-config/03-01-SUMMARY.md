---
phase: 03-auth-config
plan: 01
subsystem: api
tags: [claude, anthropic, oauth, pkce, api-key, redis, express, provider-config, zod]

# Dependency graph
requires:
  - phase: 01-restore
    provides: ClaudeProvider class with auth methods (startLogin, submitLoginCode, logout, getCliStatus)
  - phase: 02-feature-parity
    provides: Claude registered in ProviderManager, accessible via getProvider('claude')
provides:
  - Five Claude auth API routes (set-api-key, status, start-login, submit-code, logout)
  - ProviderSelectionSchema with primaryProvider field in config schema
  - Redis keys for Claude auth state (nexus:config:anthropic_api_key, nexus:config:claude_auth_method)
affects: [04-settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [Claude auth routes follow Kimi auth pattern in api.ts, ProviderSelectionSchema follows existing Zod config pattern]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/api.ts
    - nexus/packages/core/src/config/schema.ts

key-decisions:
  - "Claude API key validated against Anthropic /v1/models endpoint before storing"
  - "primaryProvider defaults to 'kimi' for backward compatibility"
  - "ProviderSelectionSchema is .strict().optional() so existing configs without it still validate"

patterns-established:
  - "Claude auth routes mirror Kimi auth pattern: provider lookup via brain.getProviderManager().getProvider('claude')"
  - "Auth method stored in Redis (nexus:config:claude_auth_method) to track api-key vs sdk-subscription"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, PROV-04]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 03 Plan 01: Claude Auth & Config Summary

**Five Claude auth API routes (API key + OAuth PKCE) and provider selection config with primaryProvider field defaulting to kimi**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T05:51:00Z
- **Completed:** 2026-03-25T05:53:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- POST /api/claude/set-api-key validates against Anthropic API and stores key in Redis
- GET /api/claude/status returns Claude auth state with method detection (api-key or sdk-subscription)
- OAuth PKCE flow via POST /api/claude/start-login and /submit-code delegates to ClaudeProvider
- POST /api/claude/logout clears both provider credentials and Redis auth state
- Config schema extended with ProviderSelectionSchema (primaryProvider: 'claude' | 'kimi', default 'kimi')

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Claude auth API routes to api.ts** - `593f51a` (feat)
2. **Task 2: Add provider section to config schema with primary_provider** - `960564d` (feat)

## Files Created/Modified
- `nexus/packages/core/src/api.ts` - Five Claude auth routes following Kimi auth pattern
- `nexus/packages/core/src/config/schema.ts` - ProviderSelectionSchema + provider field in NexusConfigSchema + default

## Decisions Made
- Claude API key validated against Anthropic /v1/models endpoint (ensures key is real before storing)
- primaryProvider defaults to 'kimi' for backward compatibility with existing deployments
- ProviderSelectionSchema uses .strict().optional() to match existing config section pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Claude auth API ready for Settings UI consumption (Phase 04)
- Provider selection config ready for Settings toggle (Phase 04)
- All five routes follow established Kimi auth pattern, consistent for UI integration

## Self-Check: PASSED

- All 2 modified files exist on disk
- Both task commits (593f51a, 960564d) found in git history
- SUMMARY.md created at expected path

---
*Phase: 03-auth-config*
*Completed: 2026-03-25*
