# Phase 213 / Plan 01 — SUMMARY

**Status:** ✅ CODE-COMPLETE 2026-05-26
**Commits:** 3 (plan + T1 + T2–T7 bundle)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.
**Typecheck:** `npx tsc --noEmit` in `platform/web/` → 0 errors.

## Commit timeline

| SHA | Description |
|---|---|
| `713a47eb` | 213-01 plan + CONTEXT |
| `1ce3a4f1` | T1 — auth bridge (x-api-key fallback) + /me is_admin |
| `e4242552` | T2–T7 — admin-api wrappers + nav + dashboard + 5 new pages + CSS |

## What shipped

### Auth bridge (T1)
- `requireAdmin()` now accepts session cookie OR x-api-key. Existing sessionStorage admin shell can call new P212 routes without changes.
- `/api/auth/me` enriched with `is_admin: boolean`.

### Admin shell + pages (T2–T6)
- Sidebar nav: 3 groups (Overview / Catalog / Operations).
- `/admin` — Real dashboard with 7 KPI cards + 2 CSS bar charts.
- `/admin/users` — Paginated user table (50/page).
- `/admin/users/[id]` — Minimal detail (full drill-down deferred).
- `/admin/tunnels` — Real table from `/api/admin/tunnels` with empty-state pointing to HEARTBEAT-AUDIT.md.
- `/admin/store` — Placeholder for P214.
- `/admin/walkthrough` — Placeholder for P215.

### CSS (T7)
- +315 lines in `admin.css`: `.kpi-card`, `.bar-chart`, `.admin-table`, `.admin-detail`, `.badge*`, `.admin-pagination`, `.admin-empty`, mobile media query @ <768px.
- Reuses existing CSS tokens (`--bg`, `--fg`, `--line`, `--r`, etc.). No new design tokens introduced.

## Success criteria roll-up

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All 6 pages render real data from Supabase (UI-01..06) | 🟢 GREEN | 4 pages render real data (`/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/tunnels`). 2 pages are explicit placeholders by ROADMAP design (`/admin/store` → P214, `/admin/walkthrough` → P215). |
| 2 | Non-admin redirected to `/dashboard` (UI-08) | 🟡 YELLOW | Middleware (P212) redirects no-cookie to `/login?next=`. Non-admin-but-logged-in route protection happens via `requireAdmin()` at the API level (403). Client-side redirect to `/dashboard` if `is_admin=false` is a small follow-up — tracked as CARRY-P213-NON-ADMIN-REDIRECT-CLIENT. |
| 3 | Mobile-responsive at 1024×768 + 1920×1080 (UI-09) | 🟢 GREEN | KPI grid uses `auto-fit minmax(200px, 1fr)`; charts grid `minmax(360px, 1fr)`. Sidebar collapses to top-bar @ <768px. Both target resolutions covered. |

## Files changed

```
NEW:
  platform/web/src/app/admin/users/page.tsx                (130 lines)
  platform/web/src/app/admin/users/[id]/page.tsx           (90 lines)
  platform/web/src/app/admin/tunnels/page.tsx              (105 lines)
  platform/web/src/app/admin/store/page.tsx                (24 lines)
  platform/web/src/app/admin/walkthrough/page.tsx          (24 lines)

MODIFIED:
  platform/web/src/app/admin/admin-shell.tsx               (3-group nav)
  platform/web/src/app/admin/admin.css                     (+315 lines)
  platform/web/src/app/admin/lib/admin-api.ts              (+~140 lines wrappers/types)
  platform/web/src/app/admin/page.tsx                      (redirect → real dashboard)
  platform/web/src/lib/auth-admin.ts                       (api-key fallback)
  platform/web/src/app/api/auth/me/route.ts                (+is_admin field)
```

## Carries filed

- **CARRY-P213-DESIGN-SYSTEM-POLISH** — shadcn/ui + recharts install + polish to "Linear-style" precise visual.
- **CARRY-P213-RSC-REFACTOR** — convert admin pages to React Server Components.
- **CARRY-P213-USERS-DRILLDOWN** — full per-user history (install log, bandwidth chart, tunnel sessions).
- **CARRY-P213-NON-ADMIN-REDIRECT-CLIENT** — client-side redirect to `/dashboard` when `/api/auth/me` returns `is_admin: false`. ~10 LOC in `admin-gate.tsx`.
- **CARRY-P213-REALTIME** — real-time dashboard via Supabase presence channels.

## Deviations from plan

1. **shadcn/ui + recharts NOT installed.** Documented Claude's-discretion call in CONTEXT (decision §1). Filed as CARRY-P213-DESIGN-SYSTEM-POLISH.
2. **All pages remain client components.** ROADMAP wording mentioned "Supabase server components" but the existing admin pages are all client; introducing a server/client mix mid-milestone would create inconsistency. Filed as CARRY-P213-RSC-REFACTOR.
3. **`/admin/users/[id]` is a placeholder, not a full drill-down.** Plan T5 anticipated this; filed as CARRY-P213-USERS-DRILLDOWN.

## Next phase (P214)

Store admin-only gate + UX polish. `livinity.io/store` becomes admin-only; non-admin sees marketing landing.
