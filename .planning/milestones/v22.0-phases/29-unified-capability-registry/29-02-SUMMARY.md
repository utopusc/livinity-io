---
phase: 29-unified-capability-registry
plan: 02
subsystem: api
tags: [registry, capability, rest, trpc, proxy, startup-wiring, express, livinityd]

# Dependency graph
requires:
  - phase: 29-unified-capability-registry plan 01
    provides: CapabilityRegistry class with list/search/get API and Redis persistence
provides:
  - REST endpoints: GET /api/capabilities, GET /api/capabilities/search, GET /api/capabilities/:id
  - tRPC proxy routes: listCapabilities, searchCapabilities, getCapability
  - CapabilityRegistry startup wiring in nexus-core index.ts
affects: [30-marketplace-mcp, 31-intent-router, 35-agents-panel-redesign]

# Tech tracking
tech-stack:
  added: []
  patterns: [express-wildcard-route-param, trpc-fetch-proxy, startup-dependency-wiring]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/api.ts
    - nexus/packages/core/src/index.ts
    - livos/packages/livinityd/source/modules/ai/routes.ts

key-decisions:
  - "Used /:id(*) wildcard Express route param because capability IDs contain colons (e.g. tool:shell)"
  - "tRPC routes are query procedures (read-only), using HTTP transport by default"
  - "encodeURIComponent on getCapability ID for safe URL encoding of colon-separated IDs"

patterns-established:
  - "Capability REST API at /api/capabilities/* — consistent with existing /api/tools/* pattern"
  - "tRPC-to-REST proxy for capabilities reuses getNexusApiUrl() + X-API-Key header pattern"

requirements-completed: [REG-01, REG-04]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 29 Plan 02: API Endpoints & Startup Wiring Summary

**REST + tRPC API for unified capability registry with startup wiring and wildcard ID routing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T04:09:29Z
- **Completed:** 2026-03-29T04:12:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added 3 REST endpoints in Nexus API: list, search, and get-by-ID for capabilities
- Wired CapabilityRegistry into nexus-core startup lifecycle (instantiated + started before API server)
- Added 3 tRPC proxy routes in livinityd enabling UI access to capability registry
- Used Express wildcard route param `/:id(*)` to handle colon-containing capability IDs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add REST endpoints in Nexus API and wire CapabilityRegistry into startup** - `d988683` (feat)
2. **Task 2: Add tRPC proxy routes in livinityd for UI access** - `89066e9` (feat)

## Files Created/Modified
- `nexus/packages/core/src/api.ts` - Added CapabilityRegistry import, ApiDeps field, and 3 REST endpoints (list, search, get-by-id)
- `nexus/packages/core/src/index.ts` - Added CapabilityRegistry import, instantiation, start(), and inclusion in createApiServer deps
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added 3 tRPC proxy routes (listCapabilities, searchCapabilities, getCapability)

## Decisions Made
- Used `/:id(*)` Express wildcard route parameter because capability IDs contain colons (e.g., `tool:shell`, `mcp:chrome-devtools`) which would otherwise match only the first segment
- tRPC routes are query procedures (read-only GET), so they automatically use HTTP transport -- no need to add to httpOnlyPaths
- Used `encodeURIComponent` on the getCapability ID to safely encode colon-separated IDs in the URL path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 29 (Unified Capability Registry) is complete -- both registry core (Plan 01) and API layer (Plan 02) are done
- Downstream phases can now query capabilities: Phase 30 (Marketplace MCP), Phase 31 (Intent Router), Phase 35 (Agents Panel Redesign)
- CRITICAL: nexus-core runs compiled JS -- must run `npm run build --workspace=packages/core` before deployment
- UI can access capabilities via tRPC: `trpc.listCapabilities.useQuery()`, `trpc.searchCapabilities.useQuery({q: "docker"})`, etc.

## Self-Check: PASSED

- FOUND: nexus/packages/core/src/api.ts
- FOUND: nexus/packages/core/src/index.ts
- FOUND: livos/packages/livinityd/source/modules/ai/routes.ts
- FOUND: .planning/phases/29-unified-capability-registry/29-02-SUMMARY.md
- FOUND: commit d988683
- FOUND: commit 89066e9

---
*Phase: 29-unified-capability-registry*
*Completed: 2026-03-29*
