# Phase 149 — /store UI Redesign + Supabase Migration — CONTEXT

**Milestone:** v37.0 Store Reimagining + Plugin Platform
**Status:** IN PROGRESS (opened 2026-05-18)
**Depends on:** Phase 148 ✅ (SPEC.md locked the data contract)
**Mode:** Auto-generated (discuss skipped — SPEC.md is the spec)

## Phase Boundary (what this phase delivers, narrowly)

1. **Apply migration `0013_phase_148_add_section_enum.sql` on Supabase** — adds `section_enum` type + `apps.section` column with `'app'` default + index.
2. **Backfill section values** for existing 27 rows. All current rows are Docker compose apps → `section = 'app'` already by default. Verify via SQL.
3. **Update Drizzle schema** `platform/web/src/db/schema.ts` — add `sectionEnum` + `section` column on `apps`.
4. **Update Drizzle env** `platform/web/src/lib/drizzle.ts` — remove the silent `127.0.0.1:5432/platform` fallback. Throw if `DATABASE_URL` missing.
5. **Update store types** `platform/web/src/app/store/types.ts` — add `Section` type, add `section` to `App` and `AppSummary`.
6. **Update `/api/apps` route** — accept `?section=` query param + return `section` in row.
7. **Redesign `/store` UI** — 5 section tabs (Apps / Web Apps / Native / AI / Plugin) in sidebar/topbar nav, per-section grid, empty state for sections with no entries, loading + error states. Use existing Livinity DS tokens (Phase 117/122-129).
8. **Localhost verification** — operator opens `http://localhost:3000/store?token=liv_k_rX_G7vqBrT8w_eovQdjf`, sees 5-section nav with 27 Docker apps under "Apps".

## Locked decisions (from SPEC.md §0–§1)

- Catalog DB = **Supabase** Postgres (NOT Server5 platform DB)
- Migration name = `0013_phase_148_add_section_enum.sql` (file under `platform/web/src/db/migrations/`)
- 5-section enum values: `'app' | 'webapp' | 'native' | 'ai' | 'plugin'`
- UI label "OSS" → "Apps"
- `category` column UNTOUCHED (sub-classifier; section is orthogonal)
- Drizzle fallback `127.0.0.1:5432/platform` made fail-loud — anti-regression against silent Server5 dependency

## Implementation Decisions (Claude's discretion per `workflow.skip_discuss=true` posture)

- Section enum: native Postgres `CREATE TYPE` (not text + CHECK constraint). SPEC §1.3.
- Default value: `'app'` so existing 27 rows backfill at ADD COLUMN time without a separate UPDATE.
- Section tab labels: "Apps" / "Web Apps" / "Native" / "AI" / "Plugins" — match SPEC §1.1 wording.
- Section tabs order: same as enum (Apps → WebApp → Native → AI → Plugin).
- Empty sections in v37: WebApp/Native/AI/Plugin all empty initially → show "Coming in Phase 15X" placeholder per section.
- UI nav layout: top-bar tabs (5 chips) replacing current single-row category list; existing `category` filter sidebar stays as a secondary filter within the active section.
- Mobile: section tabs scroll horizontally.

## Existing Code Insights

- `platform/web/src/app/store/page.tsx` — top-level entry, uses StoreProvider + StoreShell
- `platform/web/src/app/store/store-shell.tsx` — sidebar + topbar layout
- `platform/web/src/app/store/store-provider.tsx` — reads `?token=` from URL search params
- `platform/web/src/app/store/types.ts` — App interface, CATEGORIES enum (15 sub-cats), postMessage protocol
- `platform/web/src/app/api/apps/route.ts` — Drizzle SELECT, requires X-Api-Key
- `platform/web/src/lib/drizzle.ts` — pool with `DATABASE_URL` fallback to Server5 literal
- `platform/web/src/db/schema.ts` — apps table Drizzle schema (no `section` yet)
- Existing 27 rows all have `category` ∈ {automation, media, monitoring, development, ...} (15 sub-cats)

## Specific Tasks

- T-01: Apply Supabase migration 0013 via `mcp__supabase__apply_migration`
- T-02: Verify migration via `SELECT section, count(*) FROM apps GROUP BY 1` — expect `app | 27`
- T-03: Edit `platform/web/src/db/schema.ts` — add sectionEnum + section column
- T-04: Edit `platform/web/src/lib/drizzle.ts` — throw on missing DATABASE_URL (remove literal fallback)
- T-05: Edit `platform/web/src/app/store/types.ts` — add Section type, add section to App + AppSummary
- T-06: Edit `platform/web/src/app/api/apps/route.ts` — add ?section filter + return section column
- T-07: Edit `platform/web/src/app/store/store-shell.tsx` — add 5-tab section nav (top-bar chips)
- T-08: Edit `platform/web/src/app/store/store-provider.tsx` — add `selectedSection` state, default `'app'`, pass to API
- T-09: Add Section empty-state component for WebApp/Native/AI/Plugin (Phase 15X placeholder)
- T-10: Commit + push
- T-11: Operator localhost UAT (verify 5 tabs, Apps tab shows 27 apps, empty sections show placeholder)

## Deferred (out of Phase 149)

- Section-specific manifest shape rendering — Phase 150-154 each owns its section's detail page
- /store route refactor to per-section sub-routes — Phase 153/154 may need this; v37 starts with single page + state
- App detail page — current modal/sub-route stays as-is for Apps section
- App store search filtering per section — current search stays global for v37

See also: [[project-v37-draft]], [[148-SPEC]].
