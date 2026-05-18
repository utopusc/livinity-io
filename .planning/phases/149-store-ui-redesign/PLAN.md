# Phase 149 — /store UI Redesign + Supabase Migration — PLAN

**Wave structure:** single wave, 11 atomic tasks.
**Estimated effort:** 0.5–1 day inline (no agent dispatch — small diff).

## Tasks

| # | Task | File(s) | Status |
|---|---|---|---|
| T-01 | Apply Supabase migration 0013 (`section_enum` + `apps.section`) | `mcp__supabase__apply_migration` | ✅ Applied |
| T-02 | Verify backfill: `SELECT section, count(*) FROM apps` → `app | 27` | `mcp__supabase__execute_sql` | ✅ Verified |
| T-03 | Drizzle schema: add `sectionEnum` + `section` column on `apps` | `platform/web/src/db/schema.ts` | ✅ |
| T-04 | Drizzle env: throw on missing `DATABASE_URL` (remove Server5 fallback) | `platform/web/src/lib/drizzle.ts` | ✅ |
| T-05 | Store types: add `Section` + `SECTIONS` + `section` field on App/AppSummary | `platform/web/src/app/store/types.ts` | ✅ |
| T-06 | `/api/apps` route: accept `?section=` filter + return `section` column | `platform/web/src/app/api/apps/route.ts` | ✅ |
| T-07 | StoreProvider: `selectedSection` state default `'app'` | `platform/web/src/app/store/store-provider.tsx` | ✅ |
| T-08 | SectionTabs component (5-chip nav, sticky below topbar) | `platform/web/src/app/store/components/section-tabs.tsx` (new) | ✅ |
| T-09 | EmptySection component (per-section placeholder with phase reference) | `platform/web/src/app/store/components/empty-section.tsx` (new) | ✅ |
| T-10 | StoreShell: mount SectionTabs | `platform/web/src/app/store/store-shell.tsx` | ✅ |
| T-11 | Page: filter by `selectedSection` first; render EmptySection for non-app empty sections | `platform/web/src/app/store/page.tsx` | ✅ |

## Tasks deferred to next phases

- Per-section detail page customization → Phase 150 (native), 151 (webapp), 152 (ai), 153 (plugin)
- Native/WebApp/AI/Plugin seed rows → owned by each phase's executing PR
- Sidebar category filter reset on section change → already wired (SectionTabs clears `selectedCategory`)
- Mobile-responsive section nav → SectionTabs already horizontally-scrollable

## Acceptance

- [x] tsc passes on `platform/web` (zero new errors; pre-existing `.next/types` stale gen ignored)
- [x] Supabase `apps` table has `section` column with `app | 27` rows
- [x] `/api/apps?section=webapp` returns `[]`, `/api/apps?section=app` returns 27 rows
- [x] `/api/apps?section=invalid` returns HTTP 400
- [ ] Operator localhost UAT: 5 tabs visible, Apps tab shows 27 apps, other 4 tabs show EmptySection placeholder with phase reference
- [ ] Operator approval to advance to Phase 150
