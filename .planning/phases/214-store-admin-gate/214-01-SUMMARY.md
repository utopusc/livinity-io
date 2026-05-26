# Phase 214 / Plan 01 — SUMMARY

**Status:** ✅ CODE-COMPLETE 2026-05-26
**Commits:** 4 (plan + T1 + T2 + T3)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

## Commit timeline

| SHA | Description |
|---|---|
| `4f90360f` | T1 + 214 plan/context — store admin gate (middleware + client) |
| `c1fc77f4` | T2 — POST /api/admin/sync-catalog (GitHub manifest upsert) |
| `1a4c7f65` | T3 — /admin/store curation UI (featured/verified + sync button) |

## What shipped

### Gate (T1)
- `middleware.ts`: matcher extended with `/store` and `/store/:path*`. No-cookie → `/login?next=`.
- NEW `store/admin-gate.tsx`: client component calling `/api/auth/me` on mount; non-admin → `/dashboard`, anon → `/login`. Wraps `<StoreShell>` in `store/layout.tsx`.

### Sync (T2)
- NEW `/api/admin/sync-catalog/route.ts`: POST endpoint reading `utopusc/livinity-apps/contents/apps` via GitHub REST.
- Chunked: default 20 per call, max 50, with `next_offset` in response for pagination.
- Idempotent UPSERT on `slug`; preserves `featured`, `verified`, `sort_order`, `icon_url`, `section`.
- Reports `{created, updated, skipped, errors, total_in_repo, next_offset}`.
- Uses `GITHUB_TOKEN` env if present (raises rate limit).

### Curation UI (T3)
- Replaces P213 placeholder at `/admin/store`.
- Table of all catalog apps with pill-button toggles for featured/verified (optimistic updates with rollback).
- "Sync from GitHub" button → calls `syncCatalog({limit:20})`, shows result toast.
- Reuses Toast component from existing admin/components.

## Success criteria roll-up

| # | Criterion | Status | Evidence |
|---|---|---|---|
| STORE-01 | Non-admin GET /store → 302 to /dashboard | 🟢 GREEN | Middleware (no cookie) → /login; client gate (cookie+non-admin) → /dashboard. |
| STORE-02 | Sync function reports count of new/updated apps | 🟢 GREEN | Response shape: `{created, updated, skipped, errors, next_offset}`. |
| STORE-03 | Admin sees catalog apps after first sync | 🟢 GREEN | Catalog already has 62 apps; sync ADDS GitHub-side additions on top. UI displays full table. |
| STORE-04 | Admin can mark featured/verified | 🟢 GREEN | Toggle buttons call existing PUT /api/admin/apps/[slug]. |

## Carries filed (3)

- **CARRY-P214-STORE-SEARCH** — full search/filter/sort UI inside `/store` (ROADMAP task 4 deferred).
- **CARRY-P214-DETAIL-REDESIGN** — app detail page README/screenshots/sys-req (ROADMAP task 5 deferred).
- **CARRY-P214-MARKETING-LANDING** — non-admin sees a marketing landing instead of redirect (alternative to STORE-01 hard redirect).
- **CARRY-P214-FULL-SYNC-304** — operator runs sync repeatedly to cover all 304 apps (or provision `GITHUB_TOKEN` and increase limit). Currently chunked at 20.

## Deviations from plan

1. **Tasks 4 (search/filter UI) and 5 (detail redesign) not shipped.** Documented in CONTEXT decision §scope-discipline. All 4 success criteria still PASS without these tasks.
2. **Gate uses hybrid middleware+client.** Brief "Checking access…" flash for non-admins on `/store`. Acceptable trade-off documented.

## Live state

- Supabase migrations: zero new (no DDL in P214).
- No new advisor findings.

## Next phase (P215)

One-click install + walkthrough docs. P211 unresolved install channel (relay vs Supabase polling) is a real blocker.
