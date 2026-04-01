---
phase: 08-relay-integration-custom-domain-routing
plan: 01
subsystem: infra
tags: [caddy, redis, postgresql, custom-domains, on-demand-tls, relay]

# Dependency graph
requires:
  - phase: 07-platform-domain-crud-dns-verification
    provides: custom_domains table schema (Drizzle), DNS verification logic
provides:
  - custom_domains table in relay schema.sql (idempotent)
  - Redis-cached domain authorization module (custom-domains.ts)
  - Extended ask endpoint supporting custom domains after subdomain fallback
  - Caddyfile catch-all https:// block for custom domain TLS provisioning
affects: [08-02 custom domain request routing, relay deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [redis-cached-domain-auth, parent-domain-fallback, negative-cache]

key-files:
  created:
    - platform/relay/src/custom-domains.ts
  modified:
    - platform/relay/src/schema.sql
    - platform/relay/src/server.ts
    - platform/relay/src/index.ts
    - platform/relay/Caddyfile

key-decisions:
  - "Custom domain check runs only as fallback when parseSubdomain finds no username (preserves existing routing)"
  - "Negative cache with 30s TTL prevents repeated DB queries for unknown domains"
  - "Parent domain fallback allows subdomains of verified custom domains to get certificates"

patterns-established:
  - "Redis domain cache: relay:custom-domain:{hostname} for full info, relay:custom-domain-auth:{domain} for boolean auth"
  - "Cache warming on startup: warmDomainCache pre-populates all verified/active domains"
  - "Caddyfile ordering: explicit *.livinity.io blocks first, https:// catch-all last"

requirements-completed: [DOM-04, DOM-NF-01, DOM-NF-02, DOM-NF-04]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 08 Plan 01: Custom Domain Authorization Summary

**Redis-cached custom domain authorization in relay ask endpoint with Caddyfile catch-all for Let's Encrypt TLS provisioning**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T11:22:20Z
- **Completed:** 2026-03-26T11:25:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- custom_domains table added to relay schema.sql (idempotent, matches Phase 07 Drizzle schema)
- Redis-cached domain lookup module with 60s positive / 30s negative TTL and parent domain fallback
- Ask endpoint extended: verified custom domains get 200 (TLS allowed), unverified get 404 (denied)
- Caddyfile catch-all https:// block with X-Custom-Domain header for Plan 02 routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Custom domains DB schema + Redis cache module** - `1c19a2b` (feat)
2. **Task 2: Extend ask endpoint + update Caddyfile** - `edc5238` (feat)

## Files Created/Modified
- `platform/relay/src/schema.sql` - Added custom_domains table with 3 indexes
- `platform/relay/src/custom-domains.ts` - Redis-cached domain lookup: lookupCustomDomain, isCustomDomainAuthorized, warmDomainCache, invalidateDomainCache
- `platform/relay/src/server.ts` - Extended handleAskRequest with custom domain authorization fallback
- `platform/relay/src/index.ts` - Import and call warmDomainCache on startup
- `platform/relay/Caddyfile` - Added https:// catch-all block with on_demand TLS and X-Custom-Domain header

## Decisions Made
- Custom domain check runs only as fallback when parseSubdomain finds no username -- this preserves all existing *.livinity.io routing without any code path changes
- Negative cache (30s TTL) prevents repeated DB queries for unknown domains hitting the ask endpoint
- Parent domain fallback: blog.mysite.com checks both itself and mysite.com, so subdomains of verified custom domains inherit TLS authorization
- Error handling in ask endpoint defaults to 404 (deny cert) on any DB/cache error -- safe default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ask endpoint ready to authorize verified custom domains for Caddy TLS provisioning
- X-Custom-Domain header available for Plan 02 to implement custom domain request routing
- warmDomainCache ensures Redis is populated on relay restart
- invalidateDomainCache available for future domain status change events

## Self-Check: PASSED

All 5 files exist. Both task commits (1c19a2b, edc5238) verified in git log.

---
*Phase: 08-relay-integration-custom-domain-routing*
*Completed: 2026-03-26*
