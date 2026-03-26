---
phase: 07-platform-domain-crud-dns-verification
plan: 01
subsystem: api, database
tags: [drizzle, postgresql, dns, next.js, api-routes, custom-domains]

# Dependency graph
requires: []
provides:
  - custom_domains Drizzle schema and SQL migration
  - CRUD API endpoints at /api/domains
  - DNS verification module (A record + TXT record via system resolver and Cloudflare DoH)
  - Domain verification endpoint at /api/domains/[id]/verify
affects: [07-02, 08-platform-domain-sync, 09-livos-caddy-integration]

# Tech tracking
tech-stack:
  added: [node:dns/promises, node:crypto]
  patterns: [Cloudflare DoH cross-validation, domain verification token flow]

key-files:
  created:
    - platform/web/src/db/migrations/0005_create_custom_domains.sql
    - platform/web/src/lib/dns-verify.ts
    - platform/web/src/app/api/domains/route.ts
    - platform/web/src/app/api/domains/[id]/route.ts
    - platform/web/src/app/api/domains/[id]/verify/route.ts
  modified:
    - platform/web/src/db/schema.ts

key-decisions:
  - "Used node:dns/promises + Cloudflare DoH dual-check for A record verification (handles propagation delays)"
  - "TXT verification at _livinity-verification.{domain} with liv_verify={token} format"
  - "Free tier limit of 3 domains enforced at API level"
  - "Domain status transitions: pending_dns -> dns_verified on both A+TXT pass, dns_failed after 48h timeout"
  - "Blocked livinity.io/livinity.app domains from being registered"

patterns-established:
  - "Domain CRUD pattern: session auth via getUser helper, Drizzle ORM queries, JSON responses"
  - "DNS verification pattern: system resolver + Cloudflare DoH cross-check for propagation tolerance"
  - "Domain status lifecycle: pending_dns -> dns_verified -> active (or dns_failed/dns_changed/error)"

requirements-completed: [DOM-01, DOM-02]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 07 Plan 01: Platform Domain CRUD + DNS Verification Summary

**Custom domain CRUD API with Drizzle schema, dual-resolver DNS verification (system + Cloudflare DoH), and 3-domain free tier limit**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T11:02:53Z
- **Completed:** 2026-03-26T11:05:26Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- custom_domains table defined in both Drizzle ORM schema and raw SQL migration with 3 indexes
- DNS verification module checking A records (system resolver + Cloudflare DoH) and TXT records at _livinity-verification.{domain}
- Full CRUD API: list domains, create with validation + 3-domain limit, get detail, delete, trigger verification
- Verification endpoint updates domain status based on DNS check results with 48h timeout handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema + migration for custom_domains** - `4eaedc5` (feat)
2. **Task 2: DNS verification module + CRUD API routes** - `a5a6efb` (feat)

## Files Created/Modified
- `platform/web/src/db/schema.ts` - Added customDomains Drizzle table with 12 columns (id, user_id, domain, verification_token, status, dns_a_verified, dns_txt_verified, error_message, last_dns_check, verified_at, created_at, updated_at)
- `platform/web/src/db/migrations/0005_create_custom_domains.sql` - SQL migration with CREATE TABLE + 3 indexes (user_id, domain, status)
- `platform/web/src/lib/dns-verify.ts` - DNS verification: checkARecord (system), checkARecordDoH (Cloudflare), checkTxtRecord, verifyDomainDns (orchestrator), generateVerificationToken
- `platform/web/src/app/api/domains/route.ts` - GET (list user domains) + POST (create with validation, uniqueness check, 3-domain limit)
- `platform/web/src/app/api/domains/[id]/route.ts` - GET (domain detail) + DELETE (remove with ownership check)
- `platform/web/src/app/api/domains/[id]/verify/route.ts` - POST trigger DNS verification, update status (pending_dns/dns_verified/dns_failed/dns_changed)

## Decisions Made
- Used node:dns/promises + Cloudflare DoH dual-check for A record verification to handle DNS propagation delays where one resolver might have the update and the other doesn't yet
- TXT verification at `_livinity-verification.{domain}` with `liv_verify={token}` format -- industry convention for subdomain-based domain verification
- Blocked livinity.io and livinity.app domains from being registered as custom domains (security)
- Domain validation includes format check (labels, dots, length) and protocol prefix rejection
- 48-hour DNS timeout: domains go to dns_failed status if not verified within 48 hours of creation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added livinity.io/livinity.app domain blocking**
- **Found during:** Task 2 (POST /api/domains)
- **Issue:** Plan did not specify blocking platform's own domains from being registered
- **Fix:** Added check rejecting domains ending in .livinity.io or .livinity.app
- **Files modified:** platform/web/src/app/api/domains/route.ts
- **Verification:** Domain validation rejects livinity.io and livinity.app subdomains
- **Committed in:** a5a6efb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Security-essential validation. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all API endpoints are fully wired with Drizzle ORM queries and DNS verification logic.

## User Setup Required
None - no external service configuration required. SQL migration must be run on the platform database (Server5) at deployment time.

## Next Phase Readiness
- All CRUD endpoints ready for the dashboard UI (Plan 07-02) to consume
- DNS verification module ready for background polling (future phase)
- Schema supports full domain lifecycle from pending_dns through active

## Self-Check: PASSED

All 6 created/modified files verified present. Both task commits (4eaedc5, a5a6efb) verified in git log.

---
*Phase: 07-platform-domain-crud-dns-verification*
*Completed: 2026-03-26*
