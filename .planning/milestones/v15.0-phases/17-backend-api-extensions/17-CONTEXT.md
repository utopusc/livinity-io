# Phase 17: Backend API Extensions - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore the apps.livinity.io REST API from backup/post-v9.0 branch (Drizzle schema, app endpoints, auth middleware, seed data) and add 3 new endpoints for install events, user apps, and profile. All on Server5's Next.js app (platform/web).

</domain>

<decisions>
## Implementation Decisions

### Restore from backup
- Cherry-pick these files from backup/post-v9.0:
  - `platform/web/src/db/schema.ts` (Drizzle apps table)
  - `platform/web/src/lib/drizzle.ts` (Drizzle client)
  - `platform/web/drizzle.config.ts` (Drizzle config)
  - `platform/web/src/db/migrations/0000_create_apps_table.sql`
  - `platform/web/src/db/migrations/0001_seed_apps.sql`
  - `platform/web/src/lib/api-auth.ts` (X-Api-Key middleware)
  - `platform/web/src/app/api/apps/route.ts` (GET /api/apps)
  - `platform/web/src/app/api/apps/categories/route.ts`
  - `platform/web/src/app/api/apps/[id]/route.ts`
  - `platform/web/src/app/api/apps/[id]/icon/route.ts`
  - `platform/web/src/app/api/apps/[id]/compose/route.ts`
- These are already tested and deployed on Server5

### New endpoints
- POST /api/install-event — records install/uninstall with user_id, app_id, action, instance_name
- GET /api/user/apps — returns user's installed apps grouped by instance
- GET /api/user/profile — returns username, instance count, app count
- All authenticated via X-Api-Key header (reuse api-auth.ts)

### New database table
- `install_history` table: id (uuid), user_id (uuid), app_id (uuid), action (text), instance_name (text), created_at (timestamptz)
- Migration: `0002_create_install_history.sql`

### Claude's Discretion
- Drizzle schema for install_history table
- Response format for new endpoints
- Error handling patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- backup/post-v9.0 branch has all v9.0 API code (tested, working)
- `platform/web/src/lib/db.ts` — raw pg Pool (existing)
- `platform/web/src/lib/auth.ts` — session auth (existing)
- `platform/web/package.json` — already has drizzle-orm, drizzle-kit deps

### Established Patterns
- Next.js 16 App Router with route handlers
- X-Api-Key auth via validateApiKey() middleware
- Drizzle ORM for apps table, raw pg for auth tables
- All API routes check auth first, then query

### Integration Points
- New routes at `platform/web/src/app/api/install-event/route.ts`
- New routes at `platform/web/src/app/api/user/apps/route.ts` and `user/profile/route.ts`
- install_history table joins with apps and users tables

</code_context>

<specifics>
## Specific Ideas

- Drizzle deps already in package.json from v9.0 install on Server5
- Server5 already has the apps table + seed data in PostgreSQL (deployed earlier today)
- Only need to add install_history table and 3 new route files

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
