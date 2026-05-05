# Phase 86: v32 Marketplace — Summary

**Wave:** 2 (parallel with P81 chat UI, P82 tool panel, P83 per-tool views, P85-UI agent management)
**Status:** Complete. UI build passes (34.45s); livinityd typecheck has zero new errors in created files; backend wired into root router; httpOnlyPaths updated.

## Files Created

### Backend
- `livos/packages/livinityd/source/modules/server/trpc/marketplace-router.ts`
  — Three procedures (V32-MKT-01..06):
    - `marketplace.list` (publicProcedure query) — paginated/sortable/tag-filterable browse over `is_public = TRUE` agents; LEFT JOINs `users` for `creator_label` projection (falls back to "Liv Team" for system seeds where `user_id IS NULL`); returns `{rows, total, hasMore}`
    - `marketplace.tags` (publicProcedure query) — DISTINCT, sorted tag strings drawn from public agents (drives chip-strip filter)
    - `marketplace.cloneToLibrary` (privateProcedure mutation) — wraps `cloneAgentToLibrary(pool, sourceAgentId, currentUser.id)`; null-source → `TRPCError NOT_FOUND`; INCR of download_count handled inside the repo

### Frontend
- `livos/packages/ui/src/routes/marketplace/index.tsx`
  — `/marketplace` route component. Hero (h1 "Discover Agents" + subtitle), `MarketplaceFilters` toolbar, 4-col responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`), `MarketplaceCard` grid, "Load more" pagination (PAGE_SIZE=24), 4 page states (skeleton / error / empty / data), optimistic clone handler with toast feedback (Sign-in CTA on UNAUTHORIZED, Retry CTA on other errors).
- `livos/packages/ui/src/routes/marketplace/MarketplaceCard.tsx`
  — Single-agent tile. `rounded-2xl overflow-hidden`, `h-50` color-fill avatar zone using `agent.avatarColor`, backdrop-blur download badge top-right, tag chips (max 2 + "+N more"), white-bg lower section with name + creator + relative date + 2-line-clamp description + primary "Add to Library" button. Includes a dependency-free `formatRelativeDate` helper using `Intl.RelativeTimeFormat`.
- `livos/packages/ui/src/routes/marketplace/MarketplaceFilters.tsx`
  — Memoized toolbar. Search input with 300ms `useDebounce` (D-DEBOUNCED-SEARCH, trailing-edge), shadcn Select for sort (`newest` / `popular` / `most_downloaded`), tag chip strip with "All" sentinel + single-select toggle. Sort + tag changes are NOT debounced (single-click semantics).
- `livos/packages/ui/src/routes/marketplace/marketplace-api.ts`
  — Typed tRPC client hook wrappers: `useMarketplaceList`, `useMarketplaceTags`, `useCloneToLibrary`. Exports `MarketplaceAgent`, `MarketplaceSort` types and the `SORT_OPTIONS` array.

## Files Modified

- `livos/packages/livinityd/source/modules/server/trpc/index.ts`
  — Imported `marketplaceRouter`; registered under top-level namespace `marketplace` in the root `appRouter` literal (sibling to `agents`).
- `livos/packages/livinityd/source/modules/server/trpc/common.ts`
  — Added 3 procedure paths to `httpOnlyPaths`:
    - `marketplace.list` (publicProcedure — must work pre-auth where WS transport is unavailable)
    - `marketplace.tags` (same reasoning)
    - `marketplace.cloneToLibrary` (privateProcedure — WS-reconnect-survival cluster)
- `livos/packages/ui/src/router.tsx`
  — Added `Marketplace` lazy import; registered `/marketplace` route inside the `SheetLayout` children block (sibling to legacy `/agent-marketplace` which retains its registration during dev).

## Hard Constraints (verified honored)

- ZERO changes to `agents-repo.ts` (Wave 1 lock — consumed only via `database/index.ts` barrel re-export)
- ZERO changes to `agents-router.ts` (P85-UI lane — verified file unchanged; both routers coexist as siblings under the same `server/trpc/` directory)
- ZERO changes to `routes/agent-marketplace/` (legacy — both routes coexist; P90 cuts over)
- ZERO changes to `routes/agents/` (P85-UI lane)
- ZERO changes to `routes/ai-chat/v32/` (P81/P82/P83 lane)
- D-LIV-STYLED: All non-agent colors via Tailwind tokens; only the per-agent `avatarColor` is an inline hex (intentional — it's user data, not a design system color)
- D-DEBOUNCED-SEARCH: 300ms trailing-edge debounce via `useDebounce` from `react-use` (existing transitive dep)
- D-PUBLIC-BROWSE: `marketplace.list` + `marketplace.tags` use `publicProcedure` (no auth)
- D-PROCEDURE-HTTP: All three procedure paths added to `httpOnlyPaths`
- D-OPTIMISTIC-CLONE: "+ Add to Library" bumps local `downloadCount` immediately and rolls back on error; per-card `addingAgentId` keeps siblings interactive

## Verification

```
$ pnpm --filter ui build
✓ built in 34.45s              # exit 0

$ cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep marketplace
(no output)                    # zero errors in created files

$ git grep "marketplace\." livos/packages/livinityd/source/modules/server/trpc/common.ts
'marketplace.list',
'marketplace.tags',
'marketplace.cloneToLibrary',
```

The UI build emits exactly one new chunk for the marketplace route (lazy-imported); legacy `/agent-marketplace` remains untouched.

## Sidebar / Dock entry

NOT added in this phase per the orchestrator instruction ("If unclear, leave for P90 cutover. Note in SUMMARY"). The route works via direct URL (`/marketplace`) and is reachable via React Router. P85-UI sibling did not add a dock entry for `/agents` either; both will be wired together at P90 cutover for a holistic dock rewire.

## Coexistence with P85-UI (verified)

P85-UI's `agents-router.ts` registered the `agents` namespace immediately above my `marketplace` namespace in the root router; no conflict. Their `routes/agents/` directory is fully disjoint from my `routes/marketplace/` directory; no shared file, no shared component. The router.tsx file was modified by both phases — both edits land in the same file but at different lines (their `AgentsRoute` / `AgentEditorRoute` lazy imports + their route entries vs my `Marketplace` lazy import + my route entry under `SheetLayout`). Final build green proves no merge collision.

## Wave 2 Hand-off

P90 cutover will:
1. Add a 301 redirect from `/agent-marketplace` → `/marketplace` in livinityd `server/index.ts`
2. Delete `livos/packages/ui/src/routes/agent-marketplace/` directory and remove the `AgentMarketplace` lazy import + route registration in `router.tsx`
3. Add a sidebar/dock entry pairing `/agents` (P85-UI) + `/marketplace` (P86) together
4. Memory + STATE.md update

P91 UAT will:
1. Smoke-test the full marketplace flow (browse → search → sort → tag filter → Add to Library → see in /agents → toast Sign-in CTA when logged out)
2. Verify the 5 system seed agents (Liv Default, Researcher, Coder, Computer Operator, Data Analyst) all surface on first load with correct creator label "Liv Team"

## Commit

To be created in next step. Single commit per orchestrator protocol.
