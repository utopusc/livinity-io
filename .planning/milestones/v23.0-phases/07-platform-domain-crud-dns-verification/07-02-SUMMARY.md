---
phase: 07-platform-domain-crud-dns-verification
plan: 02
subsystem: ui, polling
tags: [react, next.js, tailwind, dns-polling, custom-domains, dashboard]

# Dependency graph
requires:
  - phase: 07-01
    provides: CRUD API endpoints, DNS verification module, customDomains Drizzle schema
provides:
  - Custom Domains UI section on livinity.io dashboard (add/verify/delete/DNS instructions)
  - Background DNS verification polling service with tiered intervals
affects: [08-platform-domain-sync, 09-livos-caddy-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [tiered DNS polling (30s fast / 5min slow), expandable domain card with DNS instructions]

key-files:
  created:
    - platform/web/src/lib/dns-polling.ts
  modified:
    - platform/web/src/app/dashboard/page.tsx

key-decisions:
  - "Domain list fetched alongside dashboard data on 10s polling interval"
  - "DNS instructions use expandable card UI with copy buttons for A record IP and TXT token"
  - "Domain count displayed as n/3 showing free tier limit"
  - "Polling timer runs at 30s base interval, individual domains throttled by age"

patterns-established:
  - "Expandable domain card pattern: click chevron to show/hide DNS setup instructions"
  - "Status badge color convention: emerald=active/verified, yellow=pending, red=error/failed, orange=changed"

requirements-completed: [DOM-01, DOM-02]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 07 Plan 02: Domains Dashboard UI + DNS Polling Summary

**Custom Domains dashboard section with add/verify/delete UI, expandable DNS instructions (A record + TXT), colored status badges, and background polling service with 30s/5min tiered intervals**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T11:08:01Z
- **Completed:** 2026-03-26T11:10:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Full "Custom Domains" section added to dashboard with add-domain form, domain list, and expandable DNS instructions
- Status badges with color-coded pills: emerald for active/verified, yellow for pending, red for failed/error, orange for DNS changed
- Background DNS polling service with tiered intervals (30s for first hour, 5min after) and 48-hour timeout
- Re-verification of active domains every 12 hours catches DNS configuration changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard Domains UI section** - `bc78541` (feat)
2. **Task 2: Background DNS verification polling service** - `48ccc2e` (feat)

## Files Created/Modified
- `platform/web/src/app/dashboard/page.tsx` - Added DomainRecord interface, domain state variables, fetchDomains/handleAddDomain/handleVerifyDomain/handleDeleteDomain handlers, Custom Domains card section with add form, domain list, expandable DNS instructions, status badges, copy buttons
- `platform/web/src/lib/dns-polling.ts` - Background DNS polling: pollPendingDomains with tiered interval throttling, 48h timeout, 12h re-verification of active domains, startDnsPolling/stopDnsPolling lifecycle exports

## Decisions Made
- Domain list is fetched alongside dashboard data using the same 10-second polling interval -- keeps domain status current without a separate timer on the client
- DNS instructions use an expandable card pattern (chevron toggle) to keep the domain list compact when users have multiple domains
- Domain count badge shows "n/3" to make the free tier limit visible without a separate UI element
- API response field names use snake_case (matching Drizzle schema column names) rather than camelCase in the UI interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted API response shape for domain list**
- **Found during:** Task 1 (fetchDomains implementation)
- **Issue:** Plan specified API returns `DomainRecord[]` directly, but actual GET /api/domains returns `{ domains: DomainRecord[] }` (wrapped in object)
- **Fix:** Updated fetchDomains to extract `d.domains` from response instead of using `d` directly
- **Files modified:** platform/web/src/app/dashboard/page.tsx
- **Committed in:** bc78541 (Task 1 commit)

**2. [Rule 1 - Bug] Used snake_case field names matching actual Drizzle schema**
- **Found during:** Task 1 (DomainRecord interface)
- **Issue:** Plan used camelCase field names (verificationToken, dnsAVerified) but actual API returns snake_case from Drizzle (verification_token, dns_a_verified)
- **Fix:** DomainRecord interface uses snake_case field names matching actual database/API response
- **Files modified:** platform/web/src/app/dashboard/page.tsx
- **Committed in:** bc78541 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct API integration. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all UI elements are wired to real API endpoints, all polling logic queries the actual database.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard UI complete and ready for user testing
- DNS polling service exports startDnsPolling/stopDnsPolling for process lifecycle integration (will be called from server startup in a later phase)
- Domain CRUD + verification + UI forms a complete user-facing feature for custom domain management on the platform side

## Self-Check: PASSED

All 2 created/modified files verified present. Both task commits (bc78541, 48ccc2e) verified in git log.

---
*Phase: 07-platform-domain-crud-dns-verification*
*Completed: 2026-03-26*
