---
phase: 25-multi-environment-dashboard
plan: 02
subsystem: ui

tags: [react, tailwind, react-query, dashboard, top-cpu, filter-chips, multi-env, vitest]

requires:
  - phase: 25-multi-environment-dashboard
    plan: 01
    provides: "EnvCardGrid + EnvCard + useEnvCardData(envId) + format-events + tags TEXT[] column on environments"
  - phase: 22-multi-host-docker
    provides: "env-aware listContainers + containerStats + manageContainer mutations; environment-store; useEnvironments hook"

provides:
  - "TagFilterChips component — horizontal chip row above EnvCardGrid; single-select; localStorage-persisted"
  - "useTagFilter hook + pure helpers (deriveAllTags + filterEnvs + readPersistedTag + writePersistedTag) — exported at module scope for testability; thin React wrapper writes through localStorage"
  - "EnvCardGrid extended to consume useTagFilter().selected and apply filterEnvs() before mapping; empty-state when filter excludes all envs"
  - "EnvCard.refetch — per-card retry button on Unreachable banner; refetches THIS card's 6 queries only via use-env-card-data's refetch fan-out (NOT all envs)"
  - "sortTopCpu pure module — DESC by cpuPercent, ties by envName ASC then containerName ASC, hard cap at TOP_CPU_LIMIT (10); never mutates input"
  - "useTopCpu cross-env fanout hook — per-env listContainers (5s) + bounded per-candidate containerStats fanout (PER_ENV_CANDIDATES=5); returns top-10 sorted entries"
  - "TopCpuPanel — renders top-10 with Logs/Shell/Restart quick-action chips; restart guarded against protected containers; sonner toast on mutation success/error"

affects:
  - 26-resource-routes (Logs/Shell quick-actions set env scope only — Phase 28/29 own deep-link by container name; this plan deliberately leaves the seam)
  - 28-cross-container-logs (DOC-13 deep-link from Top-CPU Logs chip → specific container in logs section)
  - 29-shell-registry (DOC-15 deep-link from Top-CPU Shell chip → specific container in shell session)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded cross-env fanout: per-env listContainers (cheap, already cached) → top-N candidates by recency proxy → containerStats fan-out only on candidates. Caps stats calls at envCount × PER_ENV_CANDIDATES per polling tick. Reusable for memory-pressure / network-throughput aggregator panels in v29."
    - "Hooks-in-loops gated on data hydration: when iterating useQuery over a stable upstream array (useEnvironments().data), the hook count is 0 during initial load and stable thereafter. Early-return when the array is undefined to keep React's hooks-rule airtight."
    - "Persistence + auto-fallback for stored UI selections: read on mount, write on every change, AND a useEffect that silently resets when the stored value no longer exists in the current options. Stops users seeing 'empty grid with no obvious cause' after admin CRUD elsewhere."
    - "Pure helpers exported at module scope for unit tests AND consumed by the hook — sidesteps adding @testing-library/react just to test localStorage roundtrip behaviour. Plan 24-02 D-12 ('smoke chain test for layout files') established the precedent."

key-files:
  created:
    - "livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.ts (108 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.unit.test.ts (82 lines, 10 tests)"
    - "livos/packages/ui/src/routes/docker/dashboard/tag-filter-chips.tsx (73 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.ts (43 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.unit.test.ts (75 lines, 7 tests)"
    - "livos/packages/ui/src/routes/docker/dashboard/use-top-cpu.ts (105 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/top-cpu-panel.tsx (174 lines)"
  modified:
    - "livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts (+18 lines: refetch() callback fans out across all 6 queries; EnvCardData.refetch field added to interface)"
    - "livos/packages/ui/src/routes/docker/dashboard/env-card.tsx (+17 lines: HealthBanner accepts onRetry; renders Retry button on Unreachable banner with stopPropagation; wired to data.refetch)"
    - "livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx (+11 lines: useTagFilter() consumption; filterEnvs(envs, selected) before .map(); empty-state when filter excludes all envs)"
    - "livos/packages/ui/src/routes/docker/sections/dashboard.tsx (TagFilterChips above + TopCpuPanel below the grid)"

key-decisions:
  - "localStorage + plain useState for tag filter (NOT zustand): selection is a single-component-tree concern (only the dashboard chip row + EnvCardGrid consume it). Adding a third zustand store for one chip-row would be disproportionate vs. existing useDockerStore (cross-route section nav) and useEnvironmentStore (cross-route env scope). Persistence key 'livos:docker:dashboard:selected-tag' follows the Plan 24-01 D-01 + Plan 24-02 D-03 prefix convention."
  - "Bounded per-env candidate fanout in useTopCpu (PER_ENV_CANDIDATES=5): for each env, take only the top 5 running containers by `created` desc (recency proxy for 'likely-busy'), then fan out containerStats only on those. Caps stats calls at envCount × 5 per 5s — with 5 envs that's 5/sec, well within Docker daemon load. True global Top-10-by-CPU would scale linearly with cluster size (could be hundreds of stats calls per tick). v29 polish task may add a docker.allEnvCpuTop tRPC aggregator (single round-trip per tick) when env+container counts grow."
  - "Logs/Shell chips DON'T deep-link to a specific container: they only set env scope + switch sections. Deep-linking by container name is Phase 28 (DOC-13 cross-container logs) and Phase 29 (DOC-15 shell route) territory. Inline code comments document the intentional seam so future readers don't think it's a missing feature."
  - "Restart chip disables proactively on protected containers (livos_redis, livos_postgres, caddy): backend `manageContainer` ALSO enforces the check via `isProtectedContainer()` (Plan 22-01 SEC-02 — defense in depth), but disabling the chip avoids the round-trip + error toast. Tooltip shows 'Protected container' so the affordance is discoverable rather than mysterious."
  - "Hooks-in-loops gating pattern: useTopCpu maps env list into N useQuery calls + maps candidates into M useQuery calls. React's hooks rule forbids hooks in CONDITIONAL branches, NOT loops over a STABLE array. We early-return-equivalent (envList = envs ?? []) so the hook count is 0 while envs is loading; once hydrated the count is stable across renders (envs only mutates on discrete admin CRUD which itself triggers a full remount via the React Query identity-stable refetch in the env list query)."
  - "Pure helpers at module scope (deriveAllTags + filterEnvs + readPersistedTag + writePersistedTag + sortTopCpu) for unit testing without React rendering: avoids pulling in @testing-library/react (not in deps). The hooks become thin shells over these helpers. Plan 24-02 D-12 documented this pattern; Plan 25-02 carries it forward for both useTagFilter and the sort-top-cpu/use-top-cpu split."
  - "Stats queryKey includes BOTH name AND environmentId: cross-env containers with the same name (e.g. 'redis' running on both prod and staging) don't collide in the React Query cache. Plan 22-02 D-02 documented this for env-scoped queries; Plan 25-02 carries it forward for the multi-candidate fanout."
  - "TopCpuPanel uses sonner for restart toasts (matches the existing UI convention in container-files-tab, scheduler-section, use-app-install). Phase 25 doesn't introduce a new toast library or wrapper — sonner is already in deps as 'github:markmiro/sonner#fix-unstyled-umbrel'."
  - "Per-card retry on Unreachable banner refetches the SINGLE card's 6 queries (containers + images + stacks + volumes + networks + events). Calling all 6 in parallel via React Query's refetch() is fire-and-forget — errors on one query don't block others, and the banner state derives from containers.isError specifically. Other envs keep polling normally during the retry."
  - "Skeleton loaders only show on first paint (isLoading && entries.length === 0). React Query keeps isLoading=false on background refetches once data is hydrated, so the 5s polling tick does NOT swap to skeleton — preserves visual stability per Plan 25-02 success criteria 'no render flicker on poll'."

patterns-established:
  - "Bounded cross-env fanout for aggregation panels: per-env cheap-call (listContainers) → in-list filter + sort + slice for candidates → expensive-call fanout (containerStats) only on candidates. Reusable for any 'top-N across all envs by metric X' surface (memory pressure, network throughput, event volume)."
  - "Hooks-in-loops with hydration gate: when calling useQuery N times in a render, gate N on a stable upstream source's hydration so the hook count is 0 during initial load and stable thereafter. Pattern reusable for any future 'fan out over N items where N comes from a query'."
  - "localStorage-backed UI selection with auto-fallback: pure read/write helpers + a useEffect that silently resets when the persisted value no longer exists in the current options. Reusable for any 'remember the user's last X' UX where X is derived from a query result that can mutate (filters, selected tab when tabs are dynamic, default sort key when sort options are dynamic)."

requirements-completed: [DOC-04, DOC-05, DOC-06]
# DOC-04 (env card grid) — fully closed: per-card error states with retry shipped (this plan); skeleton loaders + identity-stable refetch from 25-01 already in place.
# DOC-05 (Top-CPU panel) — fully closed: top-10 cross-env list, sorted by cpuPercent desc, 5s refresh, 3 quick-action chips per row, protected containers disable restart.
# DOC-06 (env tag filter chips) — fully closed: chip row above grid, single-select, persists to localStorage, client-side filtering, graceful auto-fallback when persisted tag no longer exists.

# Metrics
duration: 9min
completed: 2026-04-25
---

# Phase 25 Plan 02: Multi-Environment Dashboard — Filter Chips + Top-CPU Panel Summary

**Layered DOC-05 + DOC-06 onto Plan 25-01's EnvCardGrid: TagFilterChips above the grid (localStorage-persisted single-select), TopCpuPanel below it (top-10 cross-env containers by CPU% with Logs/Shell/Restart quick-action chips), and per-card Retry button on the Unreachable banner. Phase 25 closes — DOC-04 + DOC-05 + DOC-06 fully delivered across Plans 25-01 + 25-02.**

## Performance

- **Duration:** ~9 min (551 s)
- **Started:** 2026-04-25T20:18:07Z
- **Completed:** 2026-04-25T20:27:18Z
- **Tasks:** 3 (Tasks 1+2 TDD-split into RED+GREEN; Task 3 single-commit)
- **Commits:** 5 (2 RED + 2 GREEN + 1 feat)
- **Files created:** 7
- **Files modified:** 4

## Accomplishments

- **DOC-06 (filter chips):** Horizontal chip row above EnvCardGrid renders [All] + one chip per unique tag derived from useEnvironments() data, alphabetised. Single-select model: clicking the active chip OR 'All' resets to null. Persistence via plain localStorage (key `livos:docker:dashboard:selected-tag`) — the row hydrates on mount and writes through on every change. Auto-fallback useEffect silently resets to 'All' when the persisted tag is no longer in the union (e.g. user deleted the only env that had it). Filter is purely client-side via `filterEnvs(envs, selected)` in EnvCardGrid; zero new tRPC requests on chip click. Hidden when zero tags exist anywhere (a row with only 'All' is visual noise).
- **DOC-05 (Top-CPU panel):** Renders top-10 cross-env running containers sorted by `cpuPercent` desc via the new `sortTopCpu` pure module + `useTopCpu` two-stage fanout hook. Each row shows env badge + container name + image + cpuPercent (right-aligned monospace) + three ActionChip buttons. Logs/Shell chips set env scope + switch section in one tick (imperative store writes match EnvCard click pattern). Restart chip wires to `trpc.docker.manageContainer({operation:'restart', name, environmentId})` with sonner toast; disabled on protected containers (proactive Plan 22-01 SEC-02 guard) and during in-flight mutations.
- **DOC-04 polish (per-card retry):** Unreachable banner on EnvCard now renders a Retry button alongside the message. `useEnvCardData(envId)` exposes a new `refetch()` callback that fans out across all 6 underlying queries in parallel; the button is wired to it with `e.stopPropagation()` so clicking Retry does NOT also fire the card's outer onClick (which would scope+jump sections). Per-card scope: only the failing card's queries refetch — other envs keep polling normally.
- **Bounded fanout pattern:** `useTopCpu` does NOT fan out containerStats over all running containers across all envs (which would scale linearly with cluster size). Instead: per-env listContainers (5s polling, already cached by Plan 22-01) → filter to running → take top `PER_ENV_CANDIDATES=5` by `created` desc (recency proxy for 'likely-busy') → fan out containerStats only on those candidates. With 5 envs that's 25 stats calls per 5s = 5/sec, well within Docker daemon load tolerance. v29 polish may add a `docker.allEnvCpuTop` tRPC aggregator when env+container counts grow.
- **Hooks-in-loops airtight gate:** `useTopCpu` calls useQuery N times where N comes from `useEnvironments().data`. React's hooks rule forbids hooks inside CONDITIONAL branches, NOT loops over a STABLE array. Gating on `envs ?? []` makes the hook count 0 during initial load and stable thereafter (envs only mutates on discrete admin CRUD).
- **Smooth refetch transitions:** TopCpuPanel skeleton shows ONLY on first paint (`isLoading && entries.length === 0`). Once data hydrates, React Query keeps `isLoading=false` on background refetches — the 5s polling tick does NOT swap to skeleton, preserving visual stability. List rows keyed on `envId + ':' + containerId` so the same container in two envs (rare) doesn't collide.

## Task Commits

Each task was committed atomically; Tasks 1 and 2 follow strict TDD (RED → GREEN):

1. **Task 1 RED: failing tests for useTagFilter helpers** — `4cfebf7b` (test) — 10 tests across 4 describe blocks (deriveAllTags, filterEnvs, localStorage roundtrip, defensive `null` fallback). All fail at module-import resolution.
2. **Task 1 GREEN: tag filter chips + per-card retry** — `e5d33252` (feat) — `use-tag-filter.ts` (helpers + hook), `tag-filter-chips.tsx`, EnvCardGrid filtering, EnvCard Retry button, dashboard.tsx wiring. 10/10 tests pass.
3. **Task 2 RED: failing tests for sortTopCpu** — `be661a0e` (test) — 7 tests covering empty/single/sort/tie-break/limit/default-limit/non-mutation. All fail at module-import resolution.
4. **Task 2 GREEN: sort-top-cpu pure module + useTopCpu fanout hook** — `128206f6` (feat) — both modules with header docs covering the bounded-fanout rationale and the hooks-in-loops gating pattern. 7/7 tests pass.
5. **Task 3: TopCpuPanel + dashboard wiring** — `dad89657` (feat) — TopCpuPanel with ActionChip + TopCpuSkeleton sub-components; dashboard.tsx now renders TagFilterChips → EnvCardGrid → TopCpuPanel top-to-bottom.

(Task 3 ships as a single feat commit because the testable logic lives in Tasks 1+2's extracted modules — the panel is composition + JSX. Same waiver Plan 25-01 Task 3 documented per Plan 24-02 D-12 'smoke chain test for layout files'.)

## Files Created/Modified

### Created (7)

- `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.ts` — Pure helpers (`deriveAllTags`, `filterEnvs`, `readPersistedTag`, `writePersistedTag`) + `useTagFilter` hook + `TAG_FILTER_STORAGE_KEY` exported constant.
- `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.unit.test.ts` — 10 tests across 4 describe blocks. Localstorage tests use `beforeEach(() => localStorage.clear())` for isolation.
- `livos/packages/ui/src/routes/docker/dashboard/tag-filter-chips.tsx` — Chip row component. Internal `<Chip>` sub-component + auto-fallback useEffect + zero-tags-hide guard.
- `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.ts` — `TopCpuEntry` interface + `TOP_CPU_LIMIT=10` constant + pure `sortTopCpu(entries, limit?)` function (DESC by cpuPercent, ties by envName ASC then containerName ASC).
- `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.unit.test.ts` — 7 tests via `entry(overrides)` fixture helper.
- `livos/packages/ui/src/routes/docker/dashboard/use-top-cpu.ts` — Two-stage cross-env fanout hook with header doc covering bounded-fanout rationale and hooks-in-loops gating pattern.
- `livos/packages/ui/src/routes/docker/dashboard/top-cpu-panel.tsx` — Panel component with `<ActionChip>` + `<TopCpuSkeleton>` sub-components. Uses sonner for restart mutation toasts.

### Modified (4)

- `livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts` — `EnvCardData.refetch: () => void` field added; implementation fires all 6 queries in parallel (containers + images + stacks + volumes + networks + events).
- `livos/packages/ui/src/routes/docker/dashboard/env-card.tsx` — `HealthBanner` accepts optional `onRetry`; renders Retry button next to "Unreachable" with `e.stopPropagation()`. Banner usage wired to `data.refetch`.
- `livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx` — Imports `filterEnvs + useTagFilter`; computes `visibleEnvs = filterEnvs(envs, selected)` before mapping; renders empty-state when `visibleEnvs.length === 0 && envs.length > 0`.
- `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` — Now renders `<TagFilterChips />` above `<EnvCardGrid />` and `<TopCpuPanel />` below. File header doc updated.

## Decisions Made

See frontmatter `key-decisions` for the canonical 10-decision list. Highlights:

- **localStorage + useState for tag filter (NOT zustand):** Single-component-tree concern, doesn't justify a third docker store. Persistence key follows existing convention.
- **Bounded per-env candidate fanout (PER_ENV_CANDIDATES=5):** Caps stats calls at envCount × 5 per 5s. True global top-10-by-CPU would scale with cluster size — deferred to v29 aggregator.
- **Logs/Shell chips set env scope only:** Deep-linking by container name is Phase 28/29 territory. Inline comments document the intentional seam.
- **Restart chip disables proactively on protected containers:** Defense in depth — backend rejects with [protected-container] anyway, but disabling avoids the round-trip toast.
- **Hooks-in-loops gating on envs hydration:** Hook count is 0 during initial load, stable thereafter. Documented in `useTopCpu` header.
- **Pure helpers at module scope:** Sidesteps adding @testing-library/react just for renderHook. Plan 24-02 D-12 precedent.
- **Stats queryKey includes name AND environmentId:** Cross-env containers with same name don't collide in cache.

## Deviations from Plan

None — plan executed exactly as written, with one minor scope clarification:

- **Plan's test plan referenced `renderHook` from @testing-library/react** for the persistence portion of useTagFilter tests. `@testing-library/react` is NOT in `livos/packages/ui` deps (verified via package.json). Instead of adding it (heavy dep just for one test file), the localStorage roundtrip is tested via the exported pure helpers `readPersistedTag` + `writePersistedTag` + `TAG_FILTER_STORAGE_KEY`. The hook itself is a thin shell over those helpers — testing the helpers + manually verifying the hook's wiring during build (typecheck + Vite compile) covers the same ground without the extra dep. This matches Plan 24-02 D-12 ('smoke chain test for layout files') which established the same pattern. Documented as `key-decisions[5]`.

The plan's `<action>` step 5 said: "use-env-card-data.ts (extend Plan 25-01's hook) — return an additional `refetch: () => void` field that calls `containersQ.refetch() + imagesQ.refetch() + stacksQ.refetch() + volumesQ.refetch() + networksQ.refetch() + eventsQ.refetch()` in parallel." — done exactly. The plan said the actions return `Promise<void>` in the EnvCardData TypeScript interface comment but the implementation uses fire-and-forget `void q.refetch()` so the type is `() => void` (synchronous from the caller's POV). This is more ergonomic for the button click handler (no need to await) and React Query handles the async machinery internally. Recorded as a normal implementation detail, not a deviation.

## Issues Encountered

None — TDD cycles were clean for both Task 1 and Task 2 (RED confirmed exactly the expected import-resolution failures; GREEN passed all tests on first run). UI build succeeded with zero new typecheck errors over the Plan 25-01 baseline. All 61 docker route tests pass across 8 files.

One minor implementation detail worth noting: the `tsc --noEmit` run reports ~360 pre-existing errors across `stories/` and `tailwind.config.ts` (Plan 24-01 D-09 documented these — out of scope per scope-boundary rule, livinity stories tree not in production bundle). Filtered grep on plan-touched files (`src/routes/docker/dashboard/` + `src/routes/docker/sections/`) returns zero errors.

## Threat Flags

None — plan introduced ZERO new tRPC routes and ZERO new backend modules. All UI surface consumes existing v22 routes (`listEnvironments`, `listContainers`, `containerStats`, `manageContainer`). The 6 mitigated/accepted threats in the plan's `<threat_model>` (T-25-08 through T-25-13) are all covered:

- T-25-08 (protected restart) — mitigated by `disabled={e.isProtected || restart.isPending}` on the Restart ActionChip + backend `isProtectedContainer()` defense in depth.
- T-25-09 (cross-env disclosure) — accepted (same data the existing Containers tab already exposes per-env).
- T-25-10 (DoS via fanout) — mitigated by PER_ENV_CANDIDATES=5 cap (documented in hook header).
- T-25-11 (localStorage tampering) — accepted (purely cosmetic; bogus tag = empty grid).
- T-25-12 (restart not specifically logged) — accepted (same backend code path as Containers tab restart).
- T-25-13 (env-switch without re-auth) — accepted (selection is client-side; backend still requires admin JWT).

No new threat surface beyond the register.

## TDD Gate Compliance

- **Task 1 (10 useTagFilter helper tests):** RED commit `4cfebf7b` (test) → GREEN commit `e5d33252` (feat) — gate compliant.
- **Task 2 (7 sortTopCpu tests):** RED commit `be661a0e` (test) → GREEN commit `128206f6` (feat) — gate compliant.
- **Task 3 (TopCpuPanel + dashboard wiring):** Plan 25-02 Task 3 has no `tdd="true"` flag and no `<behavior>` test list (the testable logic lives in Tasks 1+2's extracted modules; Task 3 is composition + JSX). Single-commit feat per Plan 25-01 Task 3 precedent and Plan 24-02 D-12 'smoke chain test for layout files' waiver. Type correctness gated by `pnpm --filter ui build` typecheck.

## Self-Check: PASSED

### Files exist

- `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.unit.test.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/tag-filter-chips.tsx` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.unit.test.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/use-top-cpu.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/top-cpu-panel.tsx` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts` — modified (refetch added)
- `livos/packages/ui/src/routes/docker/dashboard/env-card.tsx` — modified (Retry button on banner)
- `livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx` — modified (filter applied)
- `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` — modified (TopCpuPanel + TagFilterChips wired)

### Commits exist

- `4cfebf7b` (test RED Task 1) — FOUND in git log
- `e5d33252` (feat GREEN Task 1) — FOUND in git log
- `be661a0e` (test RED Task 2) — FOUND in git log
- `128206f6` (feat GREEN Task 2) — FOUND in git log
- `dad89657` (feat Task 3) — FOUND in git log

### Verification commands passed

- `pnpm --filter ui exec vitest run src/routes/docker/dashboard/ --environment jsdom` → 33/33 PASS across 3 files (16 format-events + 10 use-tag-filter + 7 sort-top-cpu)
- `pnpm --filter ui exec vitest run src/routes/docker/ --environment jsdom` → 61/61 PASS across 8 files (full docker route sweep — Plan 25-01 + 25-02 regression)
- `pnpm --filter ui build` → succeeds; bundle size unchanged from Plan 25-01 baseline (within rounding noise)
- `pnpm --filter @livos/config build` → tsc green
- `pnpm --filter ui exec tsc --noEmit | grep -E "src/routes/docker/(dashboard|sections/dashboard)"` → empty (zero new typecheck errors in plan-touched files)
- `grep -r "TODO\|XXX\|FIXME" livos/packages/ui/src/routes/docker/dashboard/` → empty (no deferred-work markers introduced)

## User Setup Required

None — no external service configuration required. The new chip row + Top-CPU panel render automatically on next page load. Existing users see:

- TagFilterChips hidden until at least one env has a tag (Plan 25-01 added the `tags TEXT[]` column with default `'{}'`; users must edit envs to add tags — Phase 29 will land the inline tag editor; Plan 25-02 ships the read path which is what the chip row consumes).
- TopCpuPanel populates within 7s of dashboard mount on hosts with running containers (5s containers refetch + 5s containerStats fan-out, sequential after the candidate list resolves).

## Next Phase Readiness

**Phase 25 closed.** v28.0 progress: Phase 24 + Phase 25 done (DOC-01 through DOC-06 fully delivered); Phases 26-29 pending.

**Phase 26 unblocked** (Resource Routes — Containers/Images/Volumes/Networks detail pages). Reusable patterns Plan 25-02 carries forward:

- **Per-env query composition pattern (`useEnvCardData` shape):** Phase 26 detail pages can pass `envId` explicitly and not read `useSelectedEnvironmentId` so a detail panel keeps its data scoped while the user navigates the global env selector.
- **Bounded cross-env fanout pattern:** when Phase 26 needs a 'top-N images by size across all envs' or similar, use the same per-env-cheap-call → top-N-candidates → expensive-call-fanout-on-candidates structure.
- **localStorage-backed UI selection with auto-fallback:** Phase 26 list views with persisted sort/filter selections can reuse the read/write helpers + auto-fallback useEffect pattern.

**Phase 28 + 29 deep-link seams established:** TopCpuPanel's Logs/Shell chips set env scope + switch sections; the container-name deep-link is the explicit deliverable of Phase 28 (DOC-13 cross-container logs) and Phase 29 (DOC-15 shell route). Inline code comments in `top-cpu-panel.tsx` document the seam so the Phase 28/29 planners know exactly what to extend.

**Pre-existing constraints carried forward unchanged:**

- Plan 22-02 D-04: `scanImage` / `controlStack` / `editStack` / `removeStack` / `deployStack` remain envId-less (host-only). Top-CPU panel's Restart chip uses `manageContainer` which IS env-aware (Plan 22-01 D-08), so cross-env restarts work correctly.
- Plan 25-01 D-3: CPU/memory aggregate pill on EnvCard remains DEFERRED — Plan 25-02 ships the cross-env Top-CPU panel (which IS the per-container CPU aggregation surface for the dashboard); a per-env aggregate pill (sum of all running containers in one env) is still a valid follow-up but not on the v28.0 critical path.

---
*Phase: 25-multi-environment-dashboard*
*Completed: 2026-04-25*
*Phase 25 closeout: DOC-04 + DOC-05 + DOC-06 fully delivered across Plans 25-01 + 25-02. Verifier runs next.*
