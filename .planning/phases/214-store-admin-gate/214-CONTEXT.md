# Phase 214: Store redesign — admin-only gate + UX polish — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

`livinity.io/store` becomes admin-only. Non-admin sees marketing landing. Admin sees full catalog + install management.

**Effort:** 3 days.
**Requirements:** STORE-01..06 (6 REQs).
**Depends on:** Phase 212 ✅, Phase 213 ✅.

### Tasks
1. `/store/**` middleware → non-admin redirected to `/dashboard`.
2. `POST /api/admin/sync-catalog` Vercel function pulls manifests from `utopusc/livinity-apps` repo and upserts into Supabase `public.apps`.
3. Featured/verified curation UI via `/admin/store`.
4. Search + filter (category, search, "newly added" sort).
5. App detail page redesign — README rendered, screenshots, install button, system requirements.

### Success criteria
1. Non-admin GET `/store` → 302 to `/dashboard` (STORE-01).
2. Admin sees catalog apps after first sync (STORE-03).
3. Admin can mark featured / verified (STORE-04).
4. Sync function reports count of new/updated apps (STORE-02).

</domain>

<decisions>
## Implementation Decisions

### Scope discipline (Claude's discretion)

P214 ROADMAP lists 5 tasks but the success criteria only mandate 4 of them (1, 2, 3, sync-count). Task 4 (search/filter) and Task 5 (detail page redesign) are UX polish without binding criteria. **Decision:** ship tasks 1–3 + sync function fully; defer tasks 4 and 5 to carries (CARRY-P214-STORE-SEARCH, CARRY-P214-DETAIL-REDESIGN). This keeps context budget for P215–P217.

### Gate enforcement strategy

Middleware runs on Edge runtime — no pg.Pool. To check `is_admin`, options:
- (a) Edge `fetch('/api/auth/me')` against own origin — works but adds latency (~50–100ms per `/store/*` request) + creates a request loop sensitivity.
- (b) Page-level client-side guard — flashes content briefly before redirect.
- (c) Hybrid: middleware does cookie-presence check + soft redirect; client-side guard finalizes (`is_admin=false` → router.push('/dashboard')).

**Decision:** Option (c). Middleware redirects no-cookie users to `/login?next=/store`; logged-in users hit the store page, and a tiny client-side guard in `store/layout.tsx` calls `/api/auth/me` once and redirects to `/dashboard` if `is_admin=false`. Trade-off: brief flash before the client redirect; acceptable for admin-only tooling.

### sync-catalog scope

The `utopusc/livinity-apps` repo has 304 manifests but the live Supabase already has 62 apps (manual curation has happened). The sync function must:
- Be idempotent (safe to re-run).
- Report counts (new / updated / skipped / error).
- Handle the GitHub API rate limit (60 req/hr for unauthenticated; use `GITHUB_TOKEN` env if present).
- NOT clobber operator-curated fields (`featured`, `verified`, `sort_order`) — only upsert manifest-derived fields (slug, name, version, manifest body, etc.).
- Stop gracefully on partial failure with a clear error report.

We will use the GitHub REST API (`contents/` endpoint) — listing the `apps/` directory + fetching each manifest. To stay under rate limit on a no-token call, we will support a query param `?limit=N` (default 20) and chunked sync. Operator can re-run with offset.

</decisions>

<code_context>
## Existing Code Insights

- `platform/web/src/app/store/` — full client-side store SPA (page.tsx, store-provider.tsx, store-shell.tsx, components/, hooks/, types.ts). Reads from `/api/apps` (public endpoint).
- `platform/web/src/app/api/apps/route.ts` — public catalog endpoint (no auth).
- `platform/web/src/app/api/admin/apps/route.ts` — admin CRUD (POST/GET, x-api-key path).
- `platform/web/src/middleware.ts` — already gates `/admin/*` (P212). Needs extension for `/store/*`.
- `platform/web/src/app/admin/store/page.tsx` — placeholder shipped in P213. Replace with real curation UI.
- Supabase `apps` table columns: `slug, name, tagline, description, category, version, docker_compose (text), manifest (jsonb), icon_url, featured, verified, sort_order, section, created_at, updated_at, id`.

</code_context>

<specifics>
## Specific Ideas

- The middleware allowlist for `/store/*` should NOT block the public marketing landing (currently `/index.html` via next.config rewrite). Only `/store` and `/store/**` should gate.
- `sync-catalog` upsert keys on `slug` (UNIQUE). Manifest JSON shape varies; minimum required: `slug`, `name`. Optional: `category`, `version`, `tagline`, `description`, `docker_compose`.
- `/admin/store` UI: simple table of all apps with featured/verified toggle buttons + "Sync from GitHub" button at top.

</specifics>

<deferred>
## Deferred Ideas

- **CARRY-P214-STORE-SEARCH** — full search/filter/sort UI inside `/store` (ROADMAP task 4).
- **CARRY-P214-DETAIL-REDESIGN** — README rendering, screenshots, system requirements section (ROADMAP task 5).
- **CARRY-P214-MARKETING-LANDING** — non-admin `/store` could show a marketing landing instead of a hard redirect; current shipping behavior is redirect-only per success criterion STORE-01.

</deferred>
