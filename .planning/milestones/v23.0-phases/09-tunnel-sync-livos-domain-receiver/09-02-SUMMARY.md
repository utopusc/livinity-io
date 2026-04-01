---
phase: 09-tunnel-sync-livos-domain-receiver
plan: 02
subsystem: routing, proxy, relay
tags: [custom-domains, app-mapping, redis, express, websocket, proxy]

# Dependency graph
requires:
  - phase: 09-tunnel-sync-livos-domain-receiver
    plan: 01
    provides: "Domain sync protocol, Redis per-domain keys, app_mapping column"
  - phase: 08-relay-integration-custom-domain-routing
    provides: "Custom domain TLS, HTTP/WS routing with null targetApp placeholder"
provides:
  - "End-to-end custom domain -> specific Docker app routing on both relay and LivOS"
  - "resolveCustomDomainApp helper resolving hostname to app slug from appMapping"
  - "LivOS routeCustomDomain method routing HTTP requests to correct container port"
  - "Custom domain WebSocket upgrades routed to correct container on LivOS"
affects: [10-livos-domain-ui-caddy-proxy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Custom domain app resolution: bare domain -> root mapping, subdomain prefix -> prefix mapping", "Public-facing custom domain traffic bypasses LivOS auth"]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts
    - platform/relay/src/custom-domains.ts
    - platform/relay/src/server.ts
    - platform/relay/src/index.ts

key-decisions:
  - "Custom domain traffic is public-facing (no LivOS auth required) -- different from subdomain routing which requires session"
  - "appGatewayProxyCache moved to class property for shared access between subdomain and custom domain routing"
  - "resolveCustomDomainApp returns null when no mapping exists for a prefix, allowing graceful fallback"

patterns-established:
  - "Custom domain app resolution: hostname -> parent domain lookup -> appMapping[prefix] -> app slug -> container port"
  - "Public custom domain routing pattern: no auth check, direct proxy to mapped container"

requirements-completed: [DOM-06]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 09 Plan 02: Custom Domain App Routing Summary

**End-to-end custom domain to Docker app routing: relay resolves targetApp from app_mapping, LivOS routes HTTP and WebSocket traffic to correct container port**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T11:48:06Z
- **Completed:** 2026-03-26T11:51:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- LivOS app gateway routes custom domain HTTP requests to correct Docker container based on Redis-cached app_mapping
- Relay resolves targetApp from custom domain app_mapping for both HTTP and WebSocket paths (replacing Phase 08 null placeholder)
- Subdomain prefix routing works: blog.mysite.com -> appMapping["blog"] -> ghost port
- Custom domain WebSocket upgrades also route through correct container on both relay and LivOS sides

## Task Commits

Each task was committed atomically:

1. **Task 1: LivOS app gateway custom domain routing (HTTP + WebSocket)** - `f03ae32` (feat)
2. **Task 2: Relay resolves targetApp from custom domain app_mapping** - `8d68b69` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/server/index.ts` - Added routeCustomDomain method for HTTP, custom domain WebSocket proxy block, moved appGatewayProxyCache to class property
- `platform/relay/src/custom-domains.ts` - Added appMapping to CustomDomainInfo, updated queryDomainInfo and warmDomainCache with app_mapping column, added resolveCustomDomainApp helper
- `platform/relay/src/server.ts` - Replaced null targetApp with resolveCustomDomainApp call in HTTP routing
- `platform/relay/src/index.ts` - Replaced null targetApp with resolveCustomDomainApp call in WebSocket routing

## Decisions Made
- Custom domain traffic is public-facing (no LivOS auth required) -- apps served via custom domains (blogs, tools) must be accessible without a LivOS login
- Moved appGatewayProxyCache to class property so both subdomain and custom domain routing share the same proxy cache
- resolveCustomDomainApp returns null for unmapped prefixes, allowing the tunnel to fall through to LivOS default behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all routing fully implemented with Redis lookup, app resolution, and proxy creation.

## Next Phase Readiness
- Custom domain end-to-end routing complete (relay -> tunnel -> LivOS -> Docker container)
- Ready for Phase 10: LivOS domain UI + Caddy proxy configuration
- app_mapping can be configured via livinity.io dashboard once UI is built

## Self-Check: PASSED

All 4 files verified present. Both task commits (f03ae32, 8d68b69) verified in git log.

---
*Phase: 09-tunnel-sync-livos-domain-receiver*
*Completed: 2026-03-26*
