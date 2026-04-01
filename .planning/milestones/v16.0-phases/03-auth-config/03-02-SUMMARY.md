---
phase: 03-auth-config
plan: 02
subsystem: api
tags: [provider-manager, redis, fallback, api-routes, config-driven]

# Dependency graph
requires:
  - phase: 03-auth-config/01
    provides: "ProviderSelectionSchema in config schema, Claude auth endpoints"
  - phase: 01-restore
    provides: "ClaudeProvider registered in ProviderManager"
provides:
  - "Config-driven fallback order initialization from Redis primary_provider"
  - "GET /api/providers endpoint listing providers with availability"
  - "PUT /api/provider/primary endpoint for switching primary provider"
  - "getFallbackOrder() getter on ProviderManager"
affects: [04-settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fire-and-forget async init pattern for ProviderManager", "dual Redis key strategy (individual key + config blob)"]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/providers/manager.ts
    - nexus/packages/core/src/brain.ts
    - nexus/packages/core/src/api.ts

key-decisions:
  - "Dual Redis read strategy: individual key nexus:config:primary_provider tried first, then NexusConfig JSON blob fallback"
  - "Fire-and-forget init(): Brain constructor calls init() without awaiting, default order works until async load completes"
  - "PUT /api/provider/primary writes to both individual Redis key and NexusConfig blob for consistency"

patterns-established:
  - "Dual Redis config pattern: individual key for fast access, JSON blob for config manager consistency"
  - "Fire-and-forget async init for config loading in constructors"

requirements-completed: [PROV-03, PROV-04]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 03 Plan 02: Provider Config & API Summary

**Config-driven ProviderManager fallback order from Redis with provider listing and switching API routes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T05:55:38Z
- **Completed:** 2026-03-25T05:58:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ProviderManager reads primary_provider from Redis on init and sets fallback order accordingly
- GET /api/providers returns all providers with availability status, primary provider, and fallback order
- PUT /api/provider/primary switches primary provider, persists to Redis, and immediately updates running ProviderManager

## Task Commits

Each task was committed atomically:

1. **Task 1: Add config-driven fallback order initialization to ProviderManager** - `6eb1797` (feat)
2. **Task 2: Add provider listing and primary switching API routes** - `a457b41` (feat)

## Files Created/Modified
- `nexus/packages/core/src/providers/manager.ts` - Added private redis field, async init() method, getFallbackOrder() getter
- `nexus/packages/core/src/brain.ts` - Added logger import, fire-and-forget init() call in constructor
- `nexus/packages/core/src/api.ts` - Added GET /api/providers and PUT /api/provider/primary routes

## Decisions Made
- Dual Redis read strategy: individual key `nexus:config:primary_provider` tried first for fast access, then falls back to parsing `nexus:config` JSON blob
- Fire-and-forget init: Brain constructor calls `init()` without awaiting since the default order (kimi, claude) works until async load completes
- PUT endpoint writes to both individual Redis key and NexusConfig blob for consistency between direct Redis reads and ConfigManager

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Provider infrastructure complete: config schema (Plan 01), auth endpoints (Plan 01), config-driven fallback (Plan 02), provider API (Plan 02)
- Phase 04 (Settings UI) can now build the provider toggle using GET /api/providers and PUT /api/provider/primary

## Self-Check: PASSED

- All 4 files verified present
- Both task commits found in git history (6eb1797, a457b41)

---
*Phase: 03-auth-config*
*Completed: 2026-03-25*
