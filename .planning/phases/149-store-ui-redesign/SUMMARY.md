# Phase 149 — /store UI Redesign + Supabase Migration — 🟡 CODE-COMPLETE 2026-05-18

**Milestone:** v37.0 Store Reimagining + Plugin Platform
**Status:** CODE-COMPLETE — awaiting operator localhost UAT
**Effort:** ~0.5 day inline (no agent dispatch needed) + ~0.5 day DS port refresh (P149.1)
**Commits:** 2 atomic (initial P149 + DS port P149.1 refresh)
**Sacred SHA footer:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## P149.1 refresh — Claude Design full port (2026-05-18, this session)

Operator delivered `Livinity.io (2).zip` from claude.ai/design with a complete 14-screen design that ports the **Livinity Design System** onto the v37 store surface. Adopted Option A (single atomic refresh) — replaces all of P149's bare-bones UI with DS-native components.

**What changed in P149.1:**

- **`store.css`** copied verbatim from Claude Design bundle into `platform/web/src/app/store/store.css` — single source of DS truth (1043 lines: tokens, topbar, section nav, sidebar, app card, featured hero, install button states, microbadges, placeholder, app detail, mobile breakpoints).
- **`layout.tsx`** loads Geist + Geist Mono + Instrument Serif via `next/font/google` and bridges `--font-*` vars onto `--sans/--mono/--serif` (consumed by store.css).
- **`lib/app-visual.ts`** (new) — deterministic gradient + monogram derivation per app slug. Hand-picked 12-app override list matches Claude Design fixtures (n8n rose, jellyfin violet, etc.); 23-color palette FNV-1a-hashed for everything else. No schema migration needed.
- **`components/icon.tsx`** (new) — 25-icon stroke-SVG bank (search/arrows/check/download/open/trash/shield/spark/alert/globe/tower/monitor/puzzle/cube/chat/filter/refresh/chevron-r/chevron-d/x/star/lock/sparkle/external) with TypeScript IconName union.
- **`components/app-icon.tsx`** (new) — colorful monogram tile, 135° brand gradient, inner specular highlight, iOS-style radius (size×0.27). Color-keep per operator memory `feedback_v36_monochrome_dock_rejected`.
- **`components/topbar.tsx`** (refresh) — brand mark + "Store" crumb + ⌘K search + dynamic user avatar from `instanceName`.
- **`components/section-tabs.tsx`** (refresh) — bottom-border tab nav (not pill chips), icon + label + dynamic count (from `apps.section` distribution) OR "Soon" dashed badge for empty sections.
- **`components/sidebar.tsx`** (refresh) — Categories group + dividing line + Status group (Installed/Featured counts derived from postMessage bridge `getAppStatus` + `apps.featured`). Section-scoped — counts reflect the active section.
- **`components/app-card.tsx`** (refresh) — `<AppIcon>` + `card-name` with verified/featured/installed microbadges + 2-line clamp tagline + monospace meta row (category · installing % when active).
- **`components/featured-hero.tsx`** (refresh) — full-width black surface with editorial italic-serif title ("Editor's pick"), Install on LivOS + Learn more CTAs, app monogram on warm-peach radial-gradient panel.
- **`components/section-placeholder.tsx`** (new, replaces `empty-section.tsx`) — dashed-border card + pulse-animated badge dot + glyph + italic-serif title + sample chip list (10 placeholder samples per section).
- **`components/category-section.tsx`** (refresh) — DS `cat-head` + `cat-title` + `cat-link` "See all N" pattern + DS `grid` (4-col).
- **`store-shell.tsx`** (refresh) — `.ab` wrapper → Topbar → SectionTabs → `.page` grid `{Sidebar | main}`. Matches DS structure 1-to-1.
- **`page.tsx`** (refresh) — page-head `ph` block with eyebrow + italic-serif title + sub + meta; routes by state: loading → error → empty section → search → category filter → discover (with FeaturedHero).
- **`empty-section.tsx`** DELETED (functionality moved to `section-placeholder.tsx`).

**Tokens introduced (via store.css `:root`):**
`--bg`, `--bg-2`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--fg`, `--fg-dim`, `--fg-mute`, `--fg-faint`, `--green`, `--green-bright`, `--amber`, `--red`, `--sans`, `--mono`, `--serif`, `--r-xs/sm/md/lg/xl/2xl/full`, `--shadow-card/window/pop`, `--ease-out`.

**Smoke verified:** `tsc --noEmit` clean. `curl http://localhost:3001/store` → HTTP 200 in 30ms (30KB body). next/font Google Fonts CDN call shows in network tab.

## P149.1 → P149 ROADMAP entry update

Phase 149 ROADMAP description should reflect: "5-section nav + DS-native UI port + Supabase migration." The original v37-DRAFT.md scope of "Phase 117 design tokens → current DS" is now fully delivered.

## What shipped

### Data layer

- **Supabase migration `phase_148_add_section_enum`** applied via `mcp__supabase__apply_migration`:
  - `CREATE TYPE section_enum AS ENUM ('app', 'webapp', 'native', 'ai', 'plugin')`
  - `ALTER TABLE apps ADD COLUMN section section_enum NOT NULL DEFAULT 'app'`
  - `CREATE INDEX apps_section_idx ON apps (section)`
- **Backfill verified:** `SELECT section, count(*) FROM apps GROUP BY section` → `app | 27` (all existing rows automatically defaulted)
- **Drizzle schema** (`platform/web/src/db/schema.ts`): added `sectionEnum` + `section` column on apps table
- **Drizzle env** (`platform/web/src/lib/drizzle.ts`): removed silent `127.0.0.1:5432/platform` fallback — throws if `DATABASE_URL` missing. Anti-regression against silent Server5 dependency.

### API

- **`/api/apps` route** (`platform/web/src/app/api/apps/route.ts`):
  - Accepts `?section=` query param with enum validation (400 on invalid)
  - Returns `section` column in row response
  - Backward-compatible: no `?section=` returns all rows

### UI

- **Types** (`platform/web/src/app/store/types.ts`): added `Section` type, `SECTIONS` array (label+tagline per section), `section` field on `App`+`AppSummary`, `selectedSection`/`setSelectedSection` on context
- **StoreProvider** (`store-provider.tsx`): `selectedSection` state default `'app'`
- **SectionTabs** (`components/section-tabs.tsx` NEW): 5-chip nav, sticky below topbar, active = black-on-white inverted, horizontally scrollable on mobile. Clears `selectedCategory` on section switch to reset sidebar filter.
- **EmptySection** (`components/empty-section.tsx` NEW): per-section placeholder with phase reference badge (e.g., "Coming in Phase 150"), title, body copy. Renders for WebApp/Native/AI/Plugin sections in v37 P149.
- **StoreShell** (`store-shell.tsx`): mounts `<SectionTabs />` between Topbar and main content
- **Page** (`page.tsx`): filters by `selectedSection` first (memo'd `sectionApps`), then by category + search. Renders `<EmptySection>` for non-app empty sections.

## Locked behaviors

- All 27 existing apps now categorized as `section='app'` — Apps tab is the only populated section in v37 P149
- WebApp/Native/AI/Plugin tabs render branded "Coming in Phase 15X" placeholder
- Search + sidebar category filter work WITHIN the active section
- Section switch resets sidebar category filter (`setSelectedCategory(null)`)
- `?section=invalid` API call returns HTTP 400 with allowed values list

## TypeScript verification

- `npx tsc --noEmit` after `.next` wipe: zero new errors. Pre-existing `.next/types/validator.ts` stale gen for reverted `/v1/*` broker routes is ignored (auto-regenerated on next dev run).

## Files added / modified

**Added (3):**
- `.planning/phases/149-store-ui-redesign/CONTEXT.md`
- `.planning/phases/149-store-ui-redesign/PLAN.md`
- `.planning/phases/149-store-ui-redesign/SUMMARY.md` (this file)
- `platform/web/src/app/store/components/section-tabs.tsx`
- `platform/web/src/app/store/components/empty-section.tsx`

**Modified (6):**
- `platform/web/src/db/schema.ts` — sectionEnum + section column
- `platform/web/src/lib/drizzle.ts` — fail-loud env, no Server5 fallback
- `platform/web/src/app/store/types.ts` — Section type + SECTIONS + context fields
- `platform/web/src/app/api/apps/route.ts` — section filter + response field
- `platform/web/src/app/store/store-provider.tsx` — selectedSection state
- `platform/web/src/app/store/store-shell.tsx` — mount SectionTabs
- `platform/web/src/app/store/page.tsx` — section-aware filter + EmptySection branch

## Anti-regression check

```sh
$ grep -rE '45\.137\.194\.102|server5|platform-relay' platform/web/src/
(no matches expected)
```

If this returns hits, the Server5 fallback constraint was violated.

## Operator UAT checklist

1. Refresh `http://localhost:3000/store?token=liv_k_rX_G7vqBrT8w_eovQdjf` (dev server PID 12884 — Next.js will auto-rebuild after `.next` wipe + my changes)
2. Verify 5 tabs visible at top: **Apps** / **Web Apps** / **Native** / **AI** / **Plugins**
3. **Apps** tab (default): existing 27 apps render as before
4. Click **Web Apps** → placeholder "Coming in Phase 151" with "Web Apps" title + body copy
5. Click **Native** → placeholder "Coming in Phase 150"
6. Click **AI** → placeholder "Coming in Phase 152"
7. Click **Plugins** → placeholder "Coming in Phase 153"
8. Click back **Apps** → 27 apps return; search + sidebar category filters still work
9. Section switch should also reset any active sidebar category selection

## Verification (acceptance vs CONTEXT.md / PLAN.md)

- [x] 0013 migration applied on Supabase (T-01, T-02)
- [x] Drizzle schema updated (T-03)
- [x] Drizzle env fail-loud (T-04)
- [x] Store types extended (T-05)
- [x] /api/apps section filter + return (T-06)
- [x] StoreProvider selectedSection state (T-07)
- [x] SectionTabs component (T-08)
- [x] EmptySection component (T-09)
- [x] StoreShell mounts SectionTabs (T-10)
- [x] Page section filtering + empty-state branch (T-11)
- [ ] Operator localhost UAT (the 9-step list above)
- [ ] Operator approval → advance to Phase 150

## What this unblocks

Phase 150 (Native Linux apps) — has the section nav rendered, just needs to seed `apps` rows with `section='native'` and ship the native install handler. The empty-state placeholder will disappear automatically when rows exist.

## Carryover / deferred

- App detail page customization per section → owned by each section's phase
- /store route refactor to per-section sub-routes (`/store/native`, `/store/ai`) → v38 candidate; v37 stays single-page with state
- Section-aware search ranking (boost in-section apps) → v38 polish

See also: [[148-SPEC]], [[project-v37-draft]].
