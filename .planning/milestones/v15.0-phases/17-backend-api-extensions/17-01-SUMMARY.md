---
phase: 17-backend-api-extensions
plan: 01
subsystem: api
tags: [drizzle-orm, next.js, api-routes, postgresql, app-catalog]

# Dependency graph
requires:
  - phase: 15-desktop-widgets
    provides: "v9.0 App Store API codebase (backup/post-v9.0 branch)"
provides:
  - "Drizzle ORM schema with apps table definition"
  - "Drizzle client configured with pg pool"
  - "X-Api-Key auth middleware (validateApiKey, unauthorizedResponse)"
  - "5 app catalog REST endpoints (list, categories, detail, icon, compose)"
  - "SQL migrations for apps table creation and seed data"
affects: [17-02, 18-store-ui, 21-history-profile]

# Tech tracking
tech-stack:
  added: [drizzle-orm, drizzle-kit, motion, react-use-measure, clsx, tailwind-merge]
  patterns: [drizzle-orm-with-pg-pool, x-api-key-auth-middleware, next-app-router-api-routes]

key-files:
  created:
    - platform/web/src/db/schema.ts
    - platform/web/src/lib/drizzle.ts
    - platform/web/src/lib/api-auth.ts
    - platform/web/drizzle.config.ts
    - platform/web/src/db/migrations/0000_create_apps_table.sql
    - platform/web/src/db/migrations/0001_seed_apps.sql
    - platform/web/src/app/api/apps/route.ts
    - platform/web/src/app/api/apps/categories/route.ts
    - platform/web/src/app/api/apps/[id]/route.ts
    - platform/web/src/app/api/apps/[id]/icon/route.ts
    - platform/web/src/app/api/apps/[id]/compose/route.ts
  modified:
    - platform/web/package.json
    - platform/web/package-lock.json

key-decisions:
  - "Restored all 11 v9.0 API files verbatim from backup/post-v9.0 branch -- no modifications needed"
  - "Installed motion, react-use-measure, clsx, tailwind-merge as pre-existing component deps to unblock build"

patterns-established:
  - "Drizzle ORM: drizzle(pool, { schema }) pattern with shared pg pool from db.ts"
  - "API auth: X-Api-Key header validated via bcrypt comparison against api_keys table"
  - "Route handlers: validateApiKey guard at top, then Drizzle query, then NextResponse.json"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 17 Plan 01: Restore v9.0 API Codebase Summary

**Drizzle ORM schema, X-Api-Key auth middleware, and 5 app catalog REST endpoints restored from backup/post-v9.0 branch with build passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T03:30:42Z
- **Completed:** 2026-03-21T03:33:56Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Restored all 11 v9.0 API files from backup/post-v9.0 branch (schema, migrations, auth, routes, config)
- Installed drizzle-orm and drizzle-kit as project dependencies
- Next.js build passes with all 5 app catalog route handlers compiled

## Task Commits

Each task was committed atomically:

1. **Task 1: Restore v9.0 API files from backup branch** - `bf0f1f3` (feat)
2. **Task 2: Install Drizzle dependencies and verify build** - `3e8b41f` (chore)

## Files Created/Modified
- `platform/web/src/db/schema.ts` - Drizzle apps table definition (uuid, name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified, timestamps)
- `platform/web/src/lib/drizzle.ts` - Drizzle client wrapping shared pg pool with schema
- `platform/web/src/lib/api-auth.ts` - X-Api-Key validation middleware with bcrypt comparison
- `platform/web/drizzle.config.ts` - Drizzle migration configuration
- `platform/web/src/db/migrations/0000_create_apps_table.sql` - SQL to create apps table
- `platform/web/src/db/migrations/0001_seed_apps.sql` - SQL to seed apps catalog data
- `platform/web/src/app/api/apps/route.ts` - GET /api/apps (list all apps)
- `platform/web/src/app/api/apps/categories/route.ts` - GET /api/apps/categories (distinct categories)
- `platform/web/src/app/api/apps/[id]/route.ts` - GET /api/apps/[id] (single app by UUID)
- `platform/web/src/app/api/apps/[id]/icon/route.ts` - GET /api/apps/[id]/icon (redirect to icon URL)
- `platform/web/src/app/api/apps/[id]/compose/route.ts` - GET /api/apps/[id]/compose (docker-compose YAML)
- `platform/web/package.json` - Added drizzle-orm, drizzle-kit, motion, react-use-measure, clsx, tailwind-merge

## Decisions Made
- Restored all 11 files verbatim from backup branch without modifications -- they are tested v9.0 code
- Installed additional pre-existing component dependencies (motion, react-use-measure, clsx, tailwind-merge) that were missing from package.json but required by untracked UI component files already in the working tree

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing motion/react dependency**
- **Found during:** Task 2 (Build verification)
- **Issue:** Pre-existing `platform/web/src/components/motion-primitives/*.tsx` files import from `motion/react` but the package was not in package.json
- **Fix:** Ran `npm install motion`
- **Files modified:** platform/web/package.json, platform/web/package-lock.json
- **Verification:** Build progresses past motion import
- **Committed in:** 3e8b41f (Task 2 commit)

**2. [Rule 3 - Blocking] Installed missing react-use-measure dependency**
- **Found during:** Task 2 (Build verification)
- **Issue:** `infinite-slider.tsx` imports `react-use-measure` but the package was not installed
- **Fix:** Ran `npm install react-use-measure`
- **Files modified:** platform/web/package.json, platform/web/package-lock.json
- **Verification:** Build progresses past react-use-measure import
- **Committed in:** 3e8b41f (Task 2 commit)

**3. [Rule 3 - Blocking] Installed missing clsx and tailwind-merge dependencies**
- **Found during:** Task 2 (Build verification)
- **Issue:** `@/lib/utils.ts` imports `clsx` and `tailwind-merge` but they were not installed
- **Fix:** Ran `npm install clsx tailwind-merge`
- **Files modified:** platform/web/package.json, platform/web/package-lock.json
- **Verification:** Build completes successfully
- **Committed in:** 3e8b41f (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All auto-fixes resolved pre-existing missing dependencies unrelated to this plan's scope. Required to achieve a passing build. No scope creep.

## Issues Encountered
None beyond the pre-existing dependency gaps noted above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all restored code is complete v9.0 production code with no placeholders.

## Next Phase Readiness
- Drizzle schema and client ready for Plan 02 to add install_history table
- Auth middleware ready for reuse in new endpoints
- All 5 app catalog endpoints compiled and ready for Server5 deployment
- Plan 02 can proceed to add POST /api/install-event, GET /api/user/apps, GET /api/user/profile

## Self-Check: PASSED

- All 11 restored files: FOUND
- SUMMARY.md: FOUND
- Commit bf0f1f3 (Task 1): FOUND
- Commit 3e8b41f (Task 2): FOUND

---
*Phase: 17-backend-api-extensions*
*Completed: 2026-03-21*
