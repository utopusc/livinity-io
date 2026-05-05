# Phase 86: v32 Agent Marketplace — Context

**Gathered:** 2026-05-05
**Status:** Ready for execution (single-shot, no PLAN/SUMMARY split — orchestrator directive)
**Wave:** 2 (parallel with P81 chat UI, P82 tool panel, P83 per-tool views, P85-UI agent management)
**Mode:** Autonomous

<domain>
## Phase Boundary

Phase 86 ships the v32 public marketplace surface: a `/marketplace` route + tRPC backend that lets every user (logged-in OR logged-out) browse the agents that have been published to the public catalog (`is_public = TRUE`), filter/sort them, and — when authenticated — clone one into their own library with a single click.

This is the user-facing complement to P85: P85-schema (Wave 1, shipped) created the `agents` table + 5 seed system agents (`is_public = TRUE, user_id = NULL`); P85-UI (Wave 2 sibling) builds the personal `/agents` library; P86 builds the discovery surface that funnels public agents INTO that library via `cloneAgentToLibrary`.

**In scope (4 deliverables):**

1. **Backend: `marketplace-router.ts`** (NEW file) — separate router from P85-UI's `agents-router.ts` (file-disjoint to avoid Wave 2 collision). Three procedures:
   - `marketplace.list` (publicProcedure query) — returns `{rows, total}` of agents WHERE `is_public = TRUE`, with optional `search`, `sort` ('newest'|'popular'|'most_downloaded'), `tag`, `limit`, `offset`. LEFT JOIN `users` to surface a creator label ("Liv Team" when `user_id IS NULL`, else `users.display_name`).
   - `marketplace.tags` (publicProcedure query) — returns DISTINCT, deduplicated, sorted tag strings drawn from rows with `is_public = TRUE` (drives the chip-strip filter).
   - `marketplace.cloneToLibrary` (privateProcedure mutation) — calls `cloneAgentToLibrary(sourceAgentId, ctx.currentUser.id)` from `agents-repo.ts`. The repo already INCRs `download_count` atomically inside the same call.

2. **Backend: registration** — `marketplaceRouter` mounted in `server/trpc/index.ts` root router under namespace `marketplace`. The three procedure paths added to `httpOnlyPaths` in `server/trpc/common.ts` (D-PROCEDURE-HTTP).

3. **Frontend: `routes/marketplace/`** (NEW directory) — four files:
   - `index.tsx` — `/marketplace` route component. Hero (h1 + subtitle), `MarketplaceFilters` toolbar (search + sort select + tag chip strip), 4-col responsive grid of `MarketplaceCard`s, "Load more" pagination button, three page states (loading skeleton / error / empty / data).
   - `MarketplaceCard.tsx` — single agent tile. `rounded-2xl overflow-hidden` Card, `h-50` color-fill avatar zone (using `avatarColor` as `backgroundColor` style + emoji centered large), backdrop-blur download_count badge top-right, tag badges (max 2 + "+N more"), white-bg lower section with name + creator + relative-date + 2-line-clamp description, primary "Add to Library" button that triggers optimistic clone (D-OPTIMISTIC-CLONE).
   - `MarketplaceFilters.tsx` — extracted memoized toolbar (search input + sort select + tag chip strip). Filter changes are debounced 300ms (D-DEBOUNCED-SEARCH) before propagating to the parent's filter state.
   - `marketplace-api.ts` — typed tRPC client hook wrappers: `useMarketplaceList`, `useMarketplaceTags`, `useCloneToLibrary` (centralized so the route + card consume the same shape).

4. **Frontend: routing** — `/marketplace` registered as a lazy route in `router.tsx` (sibling to `/agent-marketplace` legacy entry — both coexist during dev; P90 will retire the legacy route). Sidebar/dock entry deferred to P85-UI sibling (paired with `/agents` in their lane); will be added at P90 cutover if not by then.

**Out of scope (explicit guards):**
- ZERO changes to `agents-repo.ts` (Wave 1 locked — consume only)
- ZERO changes to `agents-router.ts` (P85-UI's lane)
- ZERO changes to `routes/agent-marketplace/` (legacy, P90 redirects)
- ZERO changes to `routes/agents/` (P85-UI's lane)
- ZERO changes to `routes/ai-chat/v32/` (P81/P82/P83 lane)
- NO new database columns (the existing `agents` schema already carries every field marketplace needs: `is_public`, `marketplace_published_at`, `download_count`, `tags`, `avatar`, `avatar_color`, `description`, `name`, `user_id`)
- NO `/agent-marketplace` → `/marketplace` redirect — that lands at P90
- NO sidebar/dock entry in this phase — the entry is paired with P85-UI's `/agents` chip and is added together at the cutover
- NO published-agent rate-limiting / abuse moderation surface — public seeds are vetted at seed-time; user-published agents enforcement deferred to a future trust-and-safety phase

</domain>

<decisions>
## Implementation Decisions

### Backend (D-MK-01..D-MK-08)

- **D-MK-01 — File placement:** `marketplace-router.ts` lives at `livos/packages/livinityd/source/modules/server/trpc/marketplace-router.ts`. This is a NEW directory location for tRPC router files (the existing convention has routers under `modules/<domain>/routes.ts`, e.g. `apps/routes.ts`). The orchestrator pinned the path explicitly to avoid collision with P85-UI's `agents-router.ts` (also new at the same `server/trpc/` location). The mounting follows the existing root-router import style — top-level namespace `marketplace`.

- **D-MK-02 — publicProcedure for browse:** `marketplace.list` and `marketplace.tags` use `publicProcedure` (no auth required). Rationale: D-PUBLIC-BROWSE invariant — the marketplace is a discovery surface and should be visible on the login screen / pre-auth landing if the UI ever surfaces it there. Also matches Suna's marketplace which is public-readable. The `cloneToLibrary` mutation uses `privateProcedure` (auth required) because the clone target is the caller's own library.

- **D-MK-03 — Sort algorithm:** v32 simplicity — three sort modes:
  - `'newest'` → `ORDER BY marketplace_published_at DESC NULLS LAST, created_at DESC` (mirrors `listPublicAgents` ORDER BY in repo)
  - `'most_downloaded'` → `ORDER BY download_count DESC, marketplace_published_at DESC NULLS LAST`
  - `'popular'` → `ORDER BY download_count DESC, marketplace_published_at DESC NULLS LAST` (CONTEXT-spec'd hybrid `download_count * 0.7 + recency * 0.3` is "v32 simplicity" — first ship is `download_count` only; recency_score is left as a TODO for v33 when telemetry data justifies tuning)
  - default → `'newest'`
  Sort column is whitelist-validated to defeat SQL injection (mirrors the `VALID_SORT_COLUMNS` set in `agents-repo.listAgents`).

- **D-MK-04 — Tag filter:** `marketplace.list` accepts an optional single `tag` string. When present, adds `WHERE $N = ANY(tags)` (PG array containment via the existing `tags TEXT[]` column). Combines with `is_public = TRUE` and the optional `search` ILIKE filter. Multi-tag filter (AND/OR) is BACKLOG — the chip strip in v32 is single-select.

- **D-MK-05 — Tags discovery query:** `marketplace.tags` uses `SELECT DISTINCT unnest(tags) AS tag FROM agents WHERE is_public = TRUE ORDER BY tag` and returns `string[]`. Lightweight enough that we do NOT cache server-side (react-query handles client cache).

- **D-MK-06 — Creator label:** LEFT JOIN `users` to surface `display_name` for user-published agents. The select projects an additional `creator_label` field computed as `COALESCE(users.display_name, 'Liv Team')` so the UI never has to do its own NULL-safe substitution. The `creator_label` is the ONLY additional projection beyond what the existing `Agent` type already carries — no new schema work, no new repo function, just a wider SELECT inside the router.

- **D-MK-07 — cloneToLibrary delegates to repo:** The mutation is a 5-line wrapper around `cloneAgentToLibrary(pool, sourceAgentId, ctx.currentUser.id)`. The repo already returns `null` when source is not public (covers the "stranger trying to clone a private agent" edge case) and INCRs `download_count` atomically. We translate `null` → `TRPCError NOT_FOUND` and pass the cloned `Agent` row through on success.

- **D-MK-08 — Pagination contract:** `marketplace.list` returns `{rows: Agent[] & {creatorLabel: string}, total: number, hasMore: boolean}`. UI uses `hasMore` (computed server-side as `offset + rows.length < total`) to decide whether to render the "Load more" button. limit clamped to `[1, 50]`, default 24 (matches the "limit=24 per page" in orchestrator instructions).

### Frontend (D-MK-10..D-MK-19)

- **D-MK-10 — Route registration:** `/marketplace` is added to `router.tsx` as a `React.lazy` import inside the existing `SheetLayout` children block (sibling to `agent-marketplace` and `app-store` — they share the layout convention). NO changes to the legacy `/agent-marketplace` route (D-COEXIST). The new `MarketplacePage` component lives at `routes/marketplace/index.tsx` and is the default export.

- **D-MK-11 — Grid breakpoints:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6` per orchestrator spec. Differs from the legacy `agent-marketplace` (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`) — the v32 grid starts at 1 col on mobile (single-column scroll on phones is the modern Suna pattern; legacy was 2-up which hurts thumb-readability).

- **D-MK-12 — MarketplaceCard layout (Suna parity):**
  - Outer: `<Card className="rounded-2xl overflow-hidden p-0 flex flex-col h-full">` (override default Card padding; the color zone goes edge-to-edge)
  - Color zone: `<div className="h-50 flex items-center justify-center relative" style={{backgroundColor: agent.avatarColor || '#6366f1'}}>` containing emoji `text-5xl` centered + absolutely-positioned download badge (top-right) using `bg-white/20 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1` + tag chips strip below the badge (top-right, vertically stacked when multiple)
  - Lower section: `<div className="bg-surface-base p-4 flex flex-col flex-1">` with name (font-semibold text-h3), creator + date (caption text-secondary), description (text-body line-clamp-2), and primary button at the bottom (`mt-auto`).
  - Group hover: `hover:shadow-elevation-md transition-all duration-200` on the outer Card.
  - The "h-50" class refers to the existing Tailwind 200px height (verified via grep on legacy `agent-marketplace` — confirmed Suna parity).

- **D-MK-13 — Date helper (dependency-free):** Use `Intl.RelativeTimeFormat` for "2 days ago" / "3 weeks ago" — built into all evergreen browsers, zero new deps. Wrapped in a small local helper `formatRelativeDate(d)` inside `MarketplaceCard.tsx` (NOT extracted to `utils/` — only one consumer in this phase). Falls back to `'Recently'` when `marketplace_published_at` is null (system seeds may have NOW() but defensive).

- **D-MK-14 — Optimistic "Add to Library":** D-OPTIMISTIC-CLONE — on click, immediately invoke a transient local UI state on the card (`isAdding=true`, button text "Adding..." with spinner), trigger the mutation. On success: toast "Added to your library — open /agents" with a Sonner toast `action` button that navigates to `/agents`; rollback the local UI state. On error: toast `error.message` with "Retry" action button that re-invokes the mutation. Optimistic update of the source row's `download_count` happens via react-query cache-mutation in `useCloneToLibrary` (`utils.marketplace.list.setData(...)` increments the matching row's count immediately). Rollback on error.

- **D-MK-15 — Debounced search (D-DEBOUNCED-SEARCH):** Use `useDebounce` from `react-use` (already a transitive dep — verified at `routes/ai-chat/components/liv-conversation-search.tsx`). 300ms trailing-edge debounce on the search input value before it flows into the tRPC query input. Sort + tag changes are NOT debounced (single-click semantics — the user expects instant filter response).

- **D-MK-16 — Tag chip selection model:** Single-select with "All" sentinel. State is `selectedTag: string | null`. Click "All" → null. Click a tag → string. Click an active tag → null (toggle off). The chip strip drives `marketplace.list({tag: selectedTag ?? undefined})`.

- **D-MK-17 — Pagination via "Load more":** `useState<number>` for `offset`, starts at 0. Each page is `limit=24`. `useMarketplaceList({...filters, limit: 24, offset})` — the hook returns ALL pages accumulated client-side via a manual concat-on-success pattern (NOT `useInfiniteQuery` — keeping it simple per "Load more" spec; infinite query is BACKLOG if UX wants scroll-trigger pagination). Search/sort/tag changes RESET offset to 0 + clear accumulated rows (driven by a `useEffect` watching the filter triple).

- **D-MK-18 — D-LIV-STYLED tokens:** All colors via `liv-*` CSS custom properties + Tailwind tokens (`text-text-primary`, `bg-surface-base`, `border-border-subtle`, etc.). No raw hex except the per-agent `avatarColor` style (which IS the agent's brand color and stored as hex in the DB — not a design system violation, it's user-data). Buttons use existing `variant="liv-primary"` (P66-03 cyan accent) per the pattern established in `agent-marketplace/agent-card.tsx`.

- **D-MK-19 — Sidebar/dock deferral:** Per orchestrator instruction, the sidebar entry "should appear together" with P85-UI's `/agents` entry — and we don't know if P85-UI is adding it or deferring to P90. To avoid a Wave-2 file collision on `dock.tsx` / `sidebar.tsx`, we DO NOT add the entry in this phase. Documented in SUMMARY: P90 cutover is the catch-all. The route works via direct URL (`/marketplace`) until the entry is wired.

### Cross-cutting (D-MK-20..D-MK-22)

- **D-MK-20 — D-LIV-STYLED enforcement:** The card uses Liv-flavored Tailwind tokens (text-text-primary, bg-surface-base, etc.) consistently. The lower section bg is `bg-surface-base` (matches P66 light theme cards), NOT `bg-white` (which would break dark theme). The color zone background IS the per-agent hex (intentional brand-fill), not a token.

- **D-MK-21 — Test gate:** No new test files in this phase (file-disjoint with Wave 1 + Wave 2 siblings; existing test discipline is to ship tests with each repo function — repo functions are already tested in 85-schema). Future phase (P91 UAT) will add visual smoke + E2E for the marketplace flow. The PR-time gate is `pnpm --filter ui build` exits 0 + `npx tsc --noEmit` zero new errors in this phase's files.

- **D-MK-22 — No NEW deps:** All imports are existing — `react-use` (debounce), `sonner` (toast), `@tabler/icons-react` (icons), `@trpc/react-query` (hooks). NO new package added to package.json.

</decisions>

<dependencies>
## Dependencies & Coexistence

**Wave 1 (locked, consume only):**
- `livos/packages/livinityd/source/modules/database/agents-repo.ts` — `cloneAgentToLibrary`, `Agent`, `ConfiguredMcp`, `AgentpressTools`, `ModelTier` types. Imported via the `database/index.ts` barrel re-export.
- 5 seed agents inserted at boot via `seeds/agents.ts` — all `is_public = TRUE`, `user_id = NULL`. The `marketplace.list` browse query will surface them on first load.

**Wave 2 siblings (file-disjoint):**
- P85-UI `agents-router.ts` — separate file under same `server/trpc/` directory. Each registers its own namespace in root router (`agents` vs `marketplace`). No mutual import.
- P85-UI `routes/agents/` — separate directory. No mutual import.
- P81/P82/P83 v32 chat tree — `routes/ai-chat/v32/`. No mutual import.

**Future phases (coordinated, not depended-on):**
- P90 cutover — adds `/agent-marketplace` → `/marketplace` 301 redirect; retires legacy directory; wires sidebar/dock entry.
- P91 UAT — adds marketplace flow smoke tests (browse → Add → see in /agents).

</dependencies>

<verification>
## Verification Gates

1. **`pnpm --filter ui build` exits 0** — TypeScript + Vite build passes with the new route + components.
2. **`cd livos/packages/livinityd && npx tsc --noEmit` zero new errors in created files** — `marketplace-router.ts` typechecks against the existing tRPC + repo type surface.
3. **Visual smoke (manual / dev only — not gating):** open `http://localhost:3001/marketplace` (logged out works), see at least 5 cards (the system seeds), click search → see debounce, click "Add to Library" while logged out → see auth-required behavior (toast prompts login), log in and clone → see toast.
4. **D-PROCEDURE-HTTP audit:** `git grep "marketplace\." livos/packages/livinityd/source/modules/server/trpc/common.ts` — should return 3 lines (one per procedure).

</verification>

<commit-protocol>
## Commit Protocol

ONE commit at end:

```
feat(86): v32 marketplace — public browse + tag filters + Add-to-Library

Backend:
- trpc/marketplace-router.ts: list (public, sortable, tag-filterable), tags (distinct public tags), cloneToLibrary (protected, INCR download_count)
- common.ts: marketplace.* paths added to httpOnlyPaths
- root router: marketplace-router registered

Frontend:
- routes/marketplace/index.tsx: 4-col responsive grid + search (300ms debounce) + sort (newest/popular/most_downloaded) + tag chip strip + "Load more" pagination
- MarketplaceCard: rounded-2xl + h-50 color zone + backdrop-blur download badge + tag badges + creator/date metadata + optimistic "+ Add to Library"
- MarketplaceFilters: extracted memoized toolbar
- marketplace-api.ts: tRPC hooks wrapper
- router.tsx: /marketplace lazy route added (legacy /agent-marketplace coexists; P90 cuts over)

Phase: 86-marketplace
Wave: 2 (paralel with P81, P82, P83, P85-UI)
Depends on: Wave 1 P85-schema (cloneAgentToLibrary + 5 seed agents with is_public=true)
```

DO NOT push.

</commit-protocol>
