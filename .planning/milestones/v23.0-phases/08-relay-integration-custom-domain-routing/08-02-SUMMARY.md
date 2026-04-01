---
phase: 08-relay-integration-custom-domain-routing
plan: 02
subsystem: infra
tags: [relay, websocket, http-proxy, custom-domains, tunnel-routing]

# Dependency graph
requires:
  - phase: 08-relay-integration-custom-domain-routing
    plan: 01
    provides: lookupCustomDomain Redis-cached domain lookup, custom_domains table, ask endpoint authorization
provides:
  - Custom domain HTTP request routing through domain owner's tunnel
  - Custom domain WebSocket upgrade routing through domain owner's tunnel
  - handleWsUpgrade targetAppOverride parameter for future app mapping
affects: [09 domain-to-app mapping, relay deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [custom-domain-fallback-routing, targetApp-override-pattern]

key-files:
  created: []
  modified:
    - platform/relay/src/server.ts
    - platform/relay/src/index.ts
    - platform/relay/src/ws-proxy.ts

key-decisions:
  - "Custom domain routing runs only when parseSubdomain returns no username -- preserves all existing *.livinity.io routing"
  - "Custom domain HTTP path replicates full tunnel lifecycle: reconnect buffering, bandwidth quota, offline page"
  - "targetApp=null for custom domains until Phase 09 adds domain-to-app mapping"
  - "handleWsUpgrade uses optional 5th parameter (targetAppOverride) to avoid breaking existing callers"

patterns-established:
  - "Custom domain fallback: parseSubdomain first, lookupCustomDomain second -- never changes existing routing"
  - "targetAppOverride pattern: undefined = use parseSubdomain, explicit null = no app targeting"

requirements-completed: [DOM-04, DOM-NF-04]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 08 Plan 02: Custom Domain Request Routing Summary

**Custom domain HTTP and WebSocket traffic routed through domain owner's tunnel with full bandwidth/reconnect/offline handling**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T11:27:04Z
- **Completed:** 2026-03-26T11:29:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- HTTP requests to custom domains routed through correct user's tunnel with bandwidth quota enforcement, reconnect buffering, and offline page
- WebSocket upgrades on custom domains routed through correct user's tunnel via async upgrade handler
- handleWsUpgrade extended with targetAppOverride parameter for future Phase 09 domain-to-app mapping
- All existing *.livinity.io HTTP and WebSocket routing completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Custom domain HTTP request routing** - `231f32a` (feat)
2. **Task 2: Custom domain WebSocket upgrade routing** - `10f7ed6` (feat)

## Files Created/Modified
- `platform/relay/src/server.ts` - Added custom domain HTTP routing in createRequestHandler with lookupCustomDomain fallback, bandwidth quota, reconnect buffering, offline page
- `platform/relay/src/index.ts` - Added custom domain WebSocket upgrade routing with lookupCustomDomain fallback, async upgrade handler
- `platform/relay/src/ws-proxy.ts` - Added optional targetAppOverride parameter to handleWsUpgrade

## Decisions Made
- Custom domain routing runs only when parseSubdomain returns no username -- this preserves all existing *.livinity.io routing without touching any existing code paths (DOM-NF-04)
- Custom domain HTTP path replicates the full tunnel lifecycle (reconnect buffering, bandwidth quota check, offline page) for consistent behavior with subdomain routing
- targetApp is null for custom domains until Phase 09 adds domain-to-app mapping
- handleWsUpgrade uses an optional 5th parameter (targetAppOverride) rather than modifying the function body -- existing callers pass no argument and get parseSubdomain behavior unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- End-to-end custom domain traffic flow complete: TLS provisioning (ask endpoint) + HTTP routing + WebSocket routing
- targetApp=null placeholder ready for Phase 09 domain-to-app mapping
- handleWsUpgrade targetAppOverride parameter ready for future app-level routing

## Self-Check: PASSED

All 3 modified files exist. Both task commits (231f32a, 10f7ed6) verified in git log. TypeScript compiles with zero errors.

---
*Phase: 08-relay-integration-custom-domain-routing*
*Completed: 2026-03-26*
