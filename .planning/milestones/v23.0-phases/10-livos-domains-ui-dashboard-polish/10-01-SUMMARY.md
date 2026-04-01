---
phase: 10-livos-domains-ui-dashboard-polish
plan: 01
subsystem: ui
tags: [trpc, react, domains, postgresql, redis, tailwind, shadcn]

# Dependency graph
requires:
  - phase: 09-tunnel-sync-livos-domain-receiver
    provides: custom_domains table, Redis domain cache keys, tunnel client domain sync
provides:
  - tRPC routes for domain CRUD (listCustomDomains, updateAppMapping, removeCustomDomain)
  - DomainsTab component in Servers app with status badges, app mapping dropdown, remove action
  - httpOnlyPaths for domain management routes
affects: [10-02, caddy-domain-config, dashboard-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-card-ui-pattern, dual-storage-mutation-pattern]

key-files:
  created:
    - livos/packages/ui/src/routes/server-control/domains-tab.tsx
  modified:
    - livos/packages/livinityd/source/modules/platform/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "Used sendDeviceMessage (public) instead of private sendMessage for tunnel notifications"
  - "Button variant 'secondary' with red border styling (no 'outline' variant in this project's shadcn config)"
  - "Domain polling at 10s interval matching existing dashboard polling pattern"

patterns-established:
  - "Dual-storage mutation: update Redis + PG + rebuild cache + notify tunnel for domain operations"
  - "Domain status badge mapping: active/dns_verified=green, pending_dns=yellow, dns_failed/error=red, dns_changed=orange"

requirements-completed: [DOM-05]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 10 Plan 01: Domains Tab Summary

**Domains tab in Servers app with tRPC CRUD routes, colored status badges, Docker app mapping dropdown, and domain removal via tunnel sync**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T12:20:11Z
- **Completed:** 2026-03-26T12:24:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Three tRPC routes (listCustomDomains, updateAppMapping, removeCustomDomain) with dual PG+Redis storage and tunnel notification
- DomainsTab React component with domain cards, colored status badges, app mapping dropdown from running containers, and AlertDialog remove confirmation
- Domains tab wired as last tab in Servers app alongside existing Docker management tabs
- New mutation paths added to httpOnlyPaths for HTTP routing reliability

## Task Commits

Each task was committed atomically:

1. **Task 1: Add custom domain tRPC routes to platform router** - `9c46893` (feat)
2. **Task 2: Create DomainsTab component and wire into Servers app** - `1641ee2` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/platform/routes.ts` - Added listCustomDomains query, updateAppMapping mutation, removeCustomDomain mutation
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added 3 domain management paths to httpOnlyPaths
- `livos/packages/ui/src/routes/server-control/domains-tab.tsx` - New DomainsTab component (237 lines) with domain list, status badges, app mapping, remove
- `livos/packages/ui/src/routes/server-control/index.tsx` - Import DomainsTab, add TabsTrigger and TabsContent

## Decisions Made
- Used `sendDeviceMessage()` (public method) on tunnel client for platform notifications rather than making `sendMessage` public
- Changed Button variant from `outline` to `secondary` with red border classes since project's shadcn Button does not have an `outline` variant
- Polling domains every 10s matching existing dashboard polling pattern from CONTEXT.md

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Button variant not available in project**
- **Found during:** Task 2 (DomainsTab component)
- **Issue:** `variant='outline'` is not a valid variant in this project's shadcn Button component (only destructive, default, primary, secondary, ghost)
- **Fix:** Changed to `variant='secondary'` with explicit red border/text classes via className
- **Files modified:** livos/packages/ui/src/routes/server-control/domains-tab.tsx
- **Verification:** TypeScript compiles clean for domains-tab.tsx
- **Committed in:** 1641ee2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor styling adjustment. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Domains tab is functional, ready for Phase 10 Plan 02 dashboard polish
- Domain-to-app mapping works end-to-end with tunnel sync notification
- Custom domain Caddy auto-config (future plan) can build on updateAppMapping's tunnel notification

## Self-Check: PASSED

All 4 files verified present. Both commit hashes (9c46893, 1641ee2) verified in git log.

---
*Phase: 10-livos-domains-ui-dashboard-polish*
*Completed: 2026-03-26*
