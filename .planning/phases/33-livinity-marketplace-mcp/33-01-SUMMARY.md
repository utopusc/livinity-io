---
phase: 33-livinity-marketplace-mcp
plan: 01
subsystem: api
tags: [marketplace, capability-registry, tool-registry, github-api, redis-cache]

# Dependency graph
requires:
  - phase: 29-unified-capability-registry
    provides: CapabilityRegistry with in-memory cache and Redis persistence
  - phase: 32-auto-provisioning-engine
    provides: CapabilityRegistry integrated into agent session flow
provides:
  - MarketplaceMcp class with 5 livinity_* tools (search, install, uninstall, recommend, list)
  - Public registerCapability() and unregisterCapability() methods on CapabilityRegistry
  - GitHub-backed marketplace index fetching with Redis caching
  - Marketplace capability install with schema validation and conflict detection
  - Tag-overlap-based capability recommendation engine
affects: [35-agents-panel-redesign, 36-learning-loop]

# Tech tracking
tech-stack:
  added: []
  patterns: [github-raw-fetch-with-redis-cache, marketplace-install-validate-register-pattern]

key-files:
  created:
    - nexus/packages/core/src/marketplace-mcp.ts
  modified:
    - nexus/packages/core/src/capability-registry.ts
    - nexus/packages/core/src/index.ts
    - nexus/packages/core/src/lib.ts
    - nexus/packages/core/src/api.ts

key-decisions:
  - "GitHub raw URL fetch with Redis 1-hour TTL cache for marketplace index (same pattern as SkillRegistryClient)"
  - "404 on marketplace index.json returns empty array (not an error) since marketplace may not be populated yet"
  - "Tag overlap scoring for recommendations with alphabetical tiebreaker"

patterns-established:
  - "Marketplace install flow: fetch index > validate manifest > check conflicts > register in CapabilityRegistry > store metadata in Redis"
  - "registerCapability/unregisterCapability as public CapabilityRegistry mutation API for marketplace and external consumers"

requirements-completed: [MKT-01, MKT-02, MKT-03, MKT-04]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 33 Plan 01: Livinity Marketplace MCP Summary

**5 livinity_* tools (search/install/uninstall/recommend/list) backed by GitHub index with Redis cache, manifest validation, conflict detection, and tag-overlap recommendations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T05:28:45Z
- **Completed:** 2026-03-29T05:32:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created MarketplaceMcp class with all 5 marketplace tools registered in ToolRegistry at startup
- Added public registerCapability() and unregisterCapability() to CapabilityRegistry for external mutation
- Install flow validates manifest schema, detects conflicts with installed capabilities, and registers immediately
- Recommendations scored by tag overlap with installed capabilities, with popular defaults when no tags exist
- Wired into Nexus startup, exported from lib.ts, nexus-core builds successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MarketplaceMcp class and add registerCapability to CapabilityRegistry** - `7bd843f` (feat)
2. **Task 2: Wire MarketplaceMcp into Nexus startup and export from lib.ts** - `62461f5` (feat)

## Files Created/Modified
- `nexus/packages/core/src/marketplace-mcp.ts` - MarketplaceMcp class with 5 livinity_* tools, GitHub index fetching, Redis caching
- `nexus/packages/core/src/capability-registry.ts` - Added registerCapability() and unregisterCapability() public methods
- `nexus/packages/core/src/index.ts` - Import, instantiate, and register MarketplaceMcp at startup
- `nexus/packages/core/src/lib.ts` - Export MarketplaceMcp for external consumers
- `nexus/packages/core/src/api.ts` - Fixed pre-existing bug with capabilityRegistry destructuring and wildcard route param

## Decisions Made
- GitHub raw URL fetch with Redis 1-hour TTL cache for marketplace index (same pattern as SkillRegistryClient)
- 404 on marketplace index.json returns empty array (not an error) since marketplace may not be populated yet
- Tag overlap scoring for recommendations with alphabetical tiebreaker when scores are equal

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing api.ts build errors**
- **Found during:** Task 2 (Build step)
- **Issue:** `api.ts` had `deps.capabilityRegistry` references but `capabilityRegistry` was not destructured from `ApiDeps` in the function signature. Also `req.params.id` didn't match the `/:id(*)` wildcard route pattern.
- **Fix:** Added `capabilityRegistry` to destructured params, replaced `deps.capabilityRegistry` with `capabilityRegistry`, fixed wildcard param access with `(req.params as any)['id(*)']`
- **Files modified:** nexus/packages/core/src/api.ts
- **Verification:** `npm run build --workspace=packages/core` succeeds (zero errors)
- **Committed in:** `62461f5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing bug prevented build. Fix was necessary and minimal. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Marketplace tools are available to AI agent in all sessions
- GitHub repository utopusc/livinity-skills needs a `marketplace/index.json` file to populate the marketplace catalog
- CapabilityRegistry now has public mutation API for any future consumer (not just marketplace)
- Ready for Phase 35 (Agents Panel Redesign) which will add UI for marketplace management

---
## Self-Check: PASSED

All files verified present, all commits verified in git log, build output confirmed.

---
*Phase: 33-livinity-marketplace-mcp*
*Completed: 2026-03-29*
