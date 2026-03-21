---
phase: 17-backend-api-extensions
plan: 02
subsystem: api
tags: [drizzle, postgres, next.js, rest-api, install-history]

# Dependency graph
requires:
  - phase: 17-backend-api-extensions plan 01
    provides: apps schema, drizzle ORM setup, api-auth middleware, db pool
provides:
  - install_history table schema and SQL migration
  - POST /api/install-event endpoint for recording install/uninstall events
  - GET /api/user/apps endpoint returning installed apps grouped by instance
  - GET /api/user/profile endpoint returning user email and stats
affects: [18-store-frontend, 19-rate-limiting, 20-jwt-refresh-tokens]

# Tech tracking
tech-stack:
  added: []
  patterns: [raw-sql-for-complex-aggregations, drizzle-for-simple-crud, grouped-response-pattern]

key-files:
  created:
    - platform/web/src/db/migrations/0002_create_install_history.sql
    - platform/web/src/app/api/install-event/route.ts
    - platform/web/src/app/api/user/apps/route.ts
    - platform/web/src/app/api/user/profile/route.ts
  modified:
    - platform/web/src/db/schema.ts

key-decisions:
  - "Raw SQL via pool for complex aggregation queries (user/apps, user/profile) instead of Drizzle ORM -- cleaner for DISTINCT ON and CTE patterns"
  - "user_id column has no FK to users table since users is managed by raw SQL not Drizzle"
  - "parseInt on pg COUNT results since node-postgres returns bigint as string"

patterns-established:
  - "CTE with DISTINCT ON for latest-event-per-group queries"
  - "Grouped JSON response pattern (instances object keyed by instance_name)"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 17 Plan 02: Backend API Extensions Summary

**install_history table with three authenticated endpoints: POST install-event records events, GET user/apps returns installed apps by instance, GET user/profile returns user stats**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T03:36:11Z
- **Completed:** 2026-03-21T03:37:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- install_history table added to Drizzle schema with FK to apps table and SQL migration with CHECK constraint
- POST /api/install-event endpoint validates auth, body fields, and action enum before inserting records
- GET /api/user/apps uses CTE with DISTINCT ON to find latest event per app+instance, groups by instance
- GET /api/user/profile returns user email with aggregate instance_count and app_count
- Next.js build passes with all three new routes registered

## Task Commits

Each task was committed atomically:

1. **Task 1: Add install_history schema and migration** - `1b7fdec` (feat)
2. **Task 2: Create install-event, user/apps, and user/profile endpoints** - `0f94d5f` (feat)

## Files Created/Modified
- `platform/web/src/db/schema.ts` - Added installHistory table definition with Drizzle ORM
- `platform/web/src/db/migrations/0002_create_install_history.sql` - SQL migration with CHECK constraint and 3 indexes
- `platform/web/src/app/api/install-event/route.ts` - POST handler recording install/uninstall events
- `platform/web/src/app/api/user/apps/route.ts` - GET handler returning installed apps grouped by instance
- `platform/web/src/app/api/user/profile/route.ts` - GET handler returning user email and aggregate stats

## Decisions Made
- Used raw SQL via pool (not Drizzle ORM) for the complex aggregation queries in user/apps and user/profile -- DISTINCT ON and CTEs are cleaner in raw SQL
- No foreign key on user_id since the users table is managed by raw SQL, not Drizzle ORM
- parseInt on COUNT results from node-postgres since it returns bigint columns as strings

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three API endpoints compiled and ready for deployment
- install_history migration needs to be run on the production database before endpoints can be used
- Frontend store UI (Phase 18+) can now integrate with these endpoints for install tracking and user profiles

## Self-Check: PASSED

All 5 files verified present. Both task commits (1b7fdec, 0f94d5f) verified in git log.

---
*Phase: 17-backend-api-extensions*
*Completed: 2026-03-21*
