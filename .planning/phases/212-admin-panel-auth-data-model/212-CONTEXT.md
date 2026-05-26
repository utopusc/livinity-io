# Phase 212: Admin panel auth + data model — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Single source of truth for who-is-admin + the queries that power the admin dashboard. Backend only.

**Effort:** 2 days.
**Requirements:** ADM-01..13 (13 REQs).
**Depends on:** Phase 211 (admin gate enforcement path).

### Tasks

1. **Supabase migration** — add `is_admin BOOLEAN DEFAULT FALSE` to `public.users`, ensure `created_at` + `last_seen_at`, backfill `hello@bruceoz.com` to `true`. Add RLS policies for `users`, `tunnel_connections`, `install_history`, `bandwidth_usage`.
2. **6 admin API routes** under `platform/web/app/api/admin/` — `metrics/summary`, `users`, `tunnels`, `apps`, `bandwidth`, `install-failures`. All gated by `is_admin=true` via Supabase Auth + new `middleware.ts`.
3. **Bandwidth rollup tables** — create `hourly_bandwidth` + `daily_bandwidth` rollup tables in Supabase; writer (cron or trigger) aggregates `bandwidth_usage` with <5min lag.
4. **Heartbeat persistence audit** — verify `tunnel_connections` rows when a Mini PC is online. Fix the relay → Supabase upsert if missing.

### Success criteria

1. `GET /api/admin/metrics/summary` returns real numbers (ADM-05).
2. All `/api/admin/*` return 403 to non-admin / 200 to admin (ADM-11).
3. `tunnel_connections` count >0 when ≥1 Mini PC online (ADM-13).
4. RLS verified: non-admin `SELECT * FROM users` returns only own row (ADM-03).
5. Rollup lag <5min (ADM-12).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Locked Constraints (from v41 PROJECT.md / STATE.md)
- **Supabase project:** `qlsalsyqjichtpjitldi` (production; livinity.io platform DB after v37 Vercel+Supabase cutover).
- **Admin seed user:** `hello@bruceoz.com` → `is_admin=true`.
- **Stack:** `platform/web/` is Next.js App Router on Vercel; Drizzle ORM no longer authoritative — Supabase migrations via `mcp__supabase__apply_migration`.
- **CARRY-V41-RELAY-DOWN:** Server5 PM2 `relay` is STOPPED — heartbeat audit may need relay restart first OR mock data path for now.
- **Sacred SHA:** `liv/packages/core/src/sdk-agent-runner.ts` MUST NOT be touched.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Key entry points to investigate:
- `platform/web/app/api/` — existing Next.js route handlers.
- `platform/web/lib/supabase*` — existing Supabase client setup.
- `platform/web/middleware.ts` — may or may not exist.
- Supabase tables already present: `apps`, `api_keys`, `users`, `tunnel_connections`, `install_history`, `bandwidth_usage` (per STATE.md).
- Reference docs: `.planning/research/2026-05-26-store-admin/` if exists.

</code_context>

<specifics>
## Specific Ideas

Defer to ROADMAP P212 success criteria + tasks list (see <domain> above). Planner should:
- Create migrations as `supabase/migrations/NNNN_*.sql` if that path exists, or use `mcp__supabase__apply_migration` directly.
- Add `lib/auth/is-admin.ts` (or equivalent) helper for the 6 routes to share.
- Use Supabase server-side client with service-role only inside the admin middleware path.

</specifics>

<deferred>
## Deferred Ideas

- **CARRY-V41-RELAY-DOWN** — Server5 relay restart is out-of-scope for P212; if heartbeat audit requires live data, planner should design it tolerant of zero rows and mark live-verify as P217 carry.
- **CARRY-P211-ADMIN-GATE** — P211 already shipped a defensive admin-gate path on installV37; P212 formalizes the migration so that gate has a real `is_admin` column to read from. The Supabase migration completing automatically unblocks P211's gate.
- **Real-time admin metrics** (websockets, push) — defer to a later phase if requested; P212 ships polling-friendly REST only.

</deferred>
