# Phase 213: Admin panel UI — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Operator opens `livinity.io/admin`, sees the whole system at a glance, drills into detail views.

**Effort:** 4 days (target: ship leaner in 1 session given autonomous-mode context budget).
**Requirements:** UI-01..10 (10 REQs).
**Depends on:** Phase 212 ✅ (admin API surface live).

**Pages required:**
- `/admin` — KPI dashboard (6 cards + 2 charts)
- `/admin/users` — paginated list (from `/api/admin/users`)
- `/admin/users/[id]` — drill-down detail
- `/admin/tunnels` — recent tunnel connections (from `/api/admin/tunnels`)
- `/admin/apps` — already exists (kept)
- `/admin/store` — placeholder (P214 ships real)
- `/admin/walkthrough` — placeholder (P215 ships real)

**Success criteria (ROADMAP §3187-3190):**
1. All 6 pages render real data from Supabase (UI-01..06).
2. Non-admin redirected to `/dashboard` (UI-08).
3. Mobile-responsive at 1024×768 + 1920×1080 (UI-09).

**Constraint D-V41-STATIC-HTML-KEEP:** `next.config.ts` `beforeFiles` rewrites for `/dashboard`, `/login`, etc. MUST stay. `/admin` is free (no `/admin.html` exists). Lock the rewrite list — do NOT add `/admin.html`.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (with rationale)

1. **Tech-stack reality check vs ROADMAP wording.**
   ROADMAP says "shadcn/ui + recharts + Supabase server components". Codebase reality (verified via Explore 2026-05-26): **neither shadcn nor recharts is installed.** Existing admin uses custom CSS tokens in `admin.css` + `store.css`, no Radix, no Tailwind config file (just `@theme inline` in globals.css). Adding both deps mid-milestone risks visual drift + bundle bloat + breaks existing `/admin/apps/*` pages.
   **Decision:** Build P213 pages using the EXISTING `admin.css` token system, native HTML tables, and CSS-only bar charts for the 2 dashboard charts. shadcn + recharts adoption can be a future polish phase if the user wants (filed as **CARRY-P213-DESIGN-SYSTEM-POLISH**). This satisfies UI-01..09 functional criteria; visual fidelity to "Linear-style" remains a stretch goal.

2. **Auth bridge.**
   P212 shipped `requireAdmin()` that ONLY accepts session-cookie auth. Existing admin shell uses sessionStorage `x-api-key` (`liv_k_*` bcrypt-checked in `api_keys` table). Bridge: extend `requireAdmin()` to ALSO accept x-api-key when present, looking up the user via api_keys → users.is_admin. ~15 LOC delta in `lib/auth-admin.ts`. Keeps the existing operator workflow intact.

3. **Server vs client components.**
   ROADMAP says "Supabase server components". Existing admin pages are 100% client. Sticking with client-side fetch via `admin-api.ts` extension for consistency. Server components are a refactor opportunity (CARRY-P213-RSC-REFACTOR), not P213 scope.

4. **Charts.**
   2 dashboard charts called for. Implementation: pure CSS bar charts using `<div>` widths proportional to data. Adequate for "at a glance" KPI dashboard. recharts adoption tracked as CARRY-P213-DESIGN-SYSTEM-POLISH.

5. **Non-admin redirect target.**
   ROADMAP says "redirected to `/dashboard`". Middleware shipped in P212 currently redirects `/admin/*` no-cookie to `/login?next=...`. Need to update: if cookie EXISTS but user is NOT admin (checked at route handler level), redirect to `/dashboard`. Implement in `admin-gate.tsx` (client side) by checking `/api/auth/me` + `is_admin` flag (new field needed in /api/auth/me response).

</decisions>

<code_context>
## Existing Code Insights

- `platform/web/src/app/admin/admin-shell.tsx` — sidebar nav primitive (240px wide, 1 nav item today: "Apps"). EXTEND with: Dashboard, Users, Tunnels, Store (placeholder), Walkthrough (placeholder). KEEP existing "Apps" link.
- `platform/web/src/app/admin/admin-gate.tsx` — sessionStorage `livinity_admin_token` gate. EXTEND to ALSO accept session-cookie path (call `/api/auth/me`; if `is_admin=true`, mark gate open without requiring api-key paste).
- `platform/web/src/app/admin/lib/admin-api.ts` — fetch helpers using `X-Api-Key`. ADD: `getMetricsSummary()`, `listUsers(limit, offset)`, `listTunnels()`, `getBandwidth(period)`, `listInstallFailures()`, `getAppsSummary()`. All POINT TO the new `/api/admin/*` routes shipped in P212.
- `platform/web/src/app/admin/admin.css` — design tokens already defined: --fg, --fg-mute, --fg-faint, --bg, --bg-2, --line, --green, --red, --amber, --r, --shadow-card. Reuse these. New pages get added to the same stylesheet (~+200 lines expected).
- `/api/auth/me` — currently returns `{user: {userId, username, email, emailVerified}}`. EXTEND to include `is_admin`. ~5 LOC change.

</code_context>

<specifics>
## Specific Ideas

- 6 KPI cards on `/admin`: Users Total, Users 24h Active, Tunnels Online, Installs Total, Installs Failed 24h, Bandwidth Total (formatted: e.g. "1.2 GB").
- 2 charts on `/admin`:
  - "Installs by app" (top 10 from `/api/admin/apps/summary`).
  - "Bandwidth by user" (top 10 from `/api/admin/bandwidth`).
  - Both rendered as horizontal CSS bars (width = % of max).
- Users table: id (truncated), username, email, is_admin badge, created_at, last_seen_at. Sort: newest first. Pagination 50/page.
- Tunnels table: username, status (badge), connected_at, client_version, client_ip.
- Mobile responsive: sidebar collapses to top bar at <768px (CSS media query in admin.css).

</specifics>

<deferred>
## Deferred Ideas

- **CARRY-P213-DESIGN-SYSTEM-POLISH** — install shadcn/ui + recharts, refactor admin shell to match "Linear-style opacity-tier typography" precisely. ~1 day of polish work. Tracked for post-v41.
- **CARRY-P213-RSC-REFACTOR** — migrate admin pages from "use client" to React Server Components for first-paint speed. ~half-day work. Tracked for post-v41.
- **CARRY-P213-USERS-DRILLDOWN** — `/admin/users/[id]` detail page implementation. P213 ships a minimal placeholder; full drill-down (per-user bandwidth chart, install history list, tunnel session log) can be P217+ if operator finds it useful during UAT.
- **CARRY-P213-STORE-PAGE** — `/admin/store` real implementation lives in P214.
- **CARRY-P213-WALKTHROUGH-PAGE** — `/admin/walkthrough` real implementation lives in P215.

</deferred>
