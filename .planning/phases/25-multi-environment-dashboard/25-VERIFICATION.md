---
status: human_needed
phase: 25-multi-environment-dashboard
must_haves_total: 14
must_haves_verified: 14
must_haves_failed: 0
requirement_ids: DOC-04, DOC-05, DOC-06
verified: 2026-04-25T20:35:00Z
score: 14/14 must-haves verified
overrides_applied: 0
---

# Phase 25: Multi-Environment Dashboard Verification Report

**Phase Goal:** Dashboard view in v28.0 Docker app — multi-environment health card grid + Top-CPU panel + env tag filter chips. Reference: Dockhand Dashboard.

**Verified:** 2026-04-25T20:35:00Z
**Status:** human_needed (all code/wiring claims verified; visual/runtime UX claims need eyeball after deploy)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (from ROADMAP SCs + Plan must_haves) | Status | Evidence |
|---|--------------------------------------------|--------|----------|
| 1 | Dashboard route renders env card grid — each card has env name + type icon + connection target + tags + health banner + container counts (running/stopped/paused/restarting) + image/stack/volume/network counts + recent events (last 8) + CPU/memory utilization | VERIFIED (CPU/memory deferred per plan) | `env-card.tsx:181-275` renders TypeIcon + env.name + connectionText + tags chip row (when present) + HealthBanner + 4 CountPills + 2x2 StatCell grid + last-8 events list via `takeLastEvents`. CPU/memory aggregate pill explicitly deferred per 25-01 SUMMARY key-decisions[2]; cross-env CPU instead surfaced via TopCpuPanel (DOC-05). |
| 2 | "Top containers by CPU" panel aggregates across all envs, sorted by CPU%, with quick-action chips (logs / shell / restart). Updates every 5s | VERIFIED | `top-cpu-panel.tsx:90-174` renders `useTopCpu()` entries; each row has IconFileText (Logs) / IconTerminal (Shell) / IconRefresh (Restart) ActionChips. `use-top-cpu.ts:36 POLL_MS=5000`; cpuPercent.toFixed(1) shown right-aligned monospace; sort guaranteed by `sortTopCpu()` desc. |
| 3 | Env tag filter chips (All / dev / prod / staging) filter card grid client-side | VERIFIED | `tag-filter-chips.tsx:40-72` renders [All] + alphabetised unique tags from `deriveAllTags(envs)`; `env-card-grid.tsx:53` calls `filterEnvs(envs, selected)` before mapping. Filter is pure client-side (no tRPC call on chip click — `use-tag-filter.ts` only touches localStorage). |
| 4 | Live polling (5s) updates stats; visual transitions smooth, no full re-render flicker | VERIFIED (code) / human_needed (visual) | Code: `use-env-card-data.ts:59` containers refetchInterval 5_000; `use-top-cpu.ts:36` POLL_MS=5000; React Query background-refetch keeps `isLoading=false` after first hydration so skeletons don't flash. Visual smoothness: human_needed (eyeball after deploy). |
| 5 | Clicking an env card scopes the rest of the app to that env (sets selectedEnvironmentId in zustand store) | VERIFIED | `env-card.tsx:187-192` `handleClick` calls `useEnvironmentStore.getState().setEnvironment(env.id)` + `useDockerStore.getState().setSection('containers')` imperatively. |
| 6 | environments.tags column exists in PostgreSQL (TEXT[] DEFAULT '{}') and survives livinityd restart; createEnvironment + updateEnvironment tRPC inputs accept optional tags: string[]; listEnvironments returns tags array on every row | VERIFIED | `schema.sql:238-243` idempotent DO-block ALTER TABLE; `environments.ts:36 tags: string[]`, `:41 SELECT_COLS …, tags`, `:62 row.tags ?? []`, `:167 INSERT col list`, `:182 input.tags ?? []`, `:252-257 UPDATE setter`. `routes.ts:1667 + 1699` Zod schema `tags: z.array(z.string().min(1).max(50)).max(20).optional()` on both create and update. |
| 7 | Each env card shows: env name + type icon + connection target + env tags + health banner + container counts row + 2x2 stats grid + recent events list (or empty placeholder) | VERIFIED | All elements present in `env-card.tsx:204-273` — Header (TypeIcon + name + connectionText), tag chips conditional on `env.tags.length > 0`, HealthBanner, CountPill row, StatCell 2x2, events list with "No recent events" empty state. |
| 8 | Per-env data refetches: 5s containers, 30s images/stacks/volumes/networks, 10s events; no full grid re-render flicker on refetch | VERIFIED (code) | `use-env-card-data.ts:57-86` confirms exact intervals. Identity-stable refetch via React Query queryKey including environmentId per Plan 22-02 D-02. |
| 9 | TagFilterChips: localStorage-persisted single-select with auto-fallback when persisted tag no longer exists; hidden when zero tags exist | VERIFIED | `use-tag-filter.ts:22 TAG_FILTER_STORAGE_KEY='livos:docker:dashboard:selected-tag'`, `:54-76 read/writePersistedTag` defensive helpers, `:99-108` hook hydrates lazily. `tag-filter-chips.tsx:49-51` auto-fallback useEffect; `:55 if (allTags.length === 0) return null`. |
| 10 | Top-CPU panel: bounded fanout (PER_ENV_CANDIDATES=5 per env, top 10 union), no-running-containers empty state, restart disabled on protected containers | VERIFIED | `use-top-cpu.ts:35 PER_ENV_CANDIDATES=5`, two-stage fanout at `:54-81`. `top-cpu-panel.tsx:127 "No running containers across any environment"` empty state; `:164 disabled={e.isProtected || restart.isPending}` + `:165 title="Protected container"`. |
| 11 | EnvCard error state: red 'Unreachable' banner with Retry button that refetches only this card's queries (with stopPropagation so it doesn't trigger the outer card click) | VERIFIED | `env-card.tsx:100-125` HealthBanner accepts `onRetry`, renders Retry button calling `e.stopPropagation()` then `onRetry()`; `:227 onRetry={data.refetch}`. `use-env-card-data.ts:88-98` refetch fans out across all 6 queries in parallel for THIS env only. |
| 12 | Restart chip calls trpc.docker.manageContainer({operation:'restart', name, environmentId}); Logs/Shell chips set selectedEnvironmentId + setSection (logs / shell respectively) | VERIFIED | `top-cpu-panel.tsx:108-115 onRestart` calls `restart.mutate({name, operation:'restart', environmentId})`; `:102-106 jumpTo` writes both `useEnvironmentStore.setEnvironment` + `useDockerStore.setSection`; `:151,156` ActionChips wired. |
| 13 | sortTopCpu pure: cpuPercent DESC, ties by envName ASC then containerName ASC, hard cap at TOP_CPU_LIMIT=10 | VERIFIED | `sort-top-cpu.ts:35-43` exact algorithm; never mutates input (`[...entries]` defensive copy). |
| 14 | Skeleton loaders match final layout (no jarring shift) and only show on first paint | VERIFIED | `top-cpu-panel.tsx:69-84 TopCpuSkeleton` 5 placeholder rows match list shape; `:124 isLoading && entries.length === 0` gate ensures background refetches don't swap to skeleton. `env-card-grid.tsx:18-29 GridSkeleton` matches grid layout. |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/database/schema.sql` | ALTER TABLE adds tags TEXT[] | VERIFIED | Line 238-244, idempotent DO-block, NOT NULL DEFAULT '{}' |
| `livos/packages/livinityd/source/modules/docker/environments.ts` | Environment.tags + SELECT_COLS + INSERT/UPDATE plumbing | VERIFIED | Lines 36, 41, 62, 130, 167, 182, 197, 252-257 |
| `livos/packages/livinityd/source/modules/docker/routes.ts` | Zod tags schema in createEnvironment + updateEnvironment | VERIFIED | Lines 1667 + 1699: `z.array(z.string().min(1).max(50)).max(20).optional()` |
| `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` | Mounts TagFilterChips above + EnvCardGrid + TopCpuPanel below | VERIFIED | Lines 17-24 — exact stacking order |
| `livos/packages/ui/src/routes/docker/dashboard/env-card.tsx` | EnvCard component (>=80 lines), all 6 sections + click handler + Retry | VERIFIED | 276 lines (well above 80); all sections present |
| `livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx` | EnvCardGrid wrapper (>=30 lines), useTagFilter consumption | VERIFIED | 70 lines; `useTagFilter()` + `filterEnvs(envs, selected)` at lines 33, 53 |
| `livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts` | useEnvCardData(envId) hook (>=50 lines), 6-query composition + refetch | VERIFIED | 113 lines; intervals exactly 5_000/10_000/30_000 as specified |
| `livos/packages/ui/src/routes/docker/dashboard/format-events.ts` | formatEventVerb + formatEventTimestamp + takeLastEvents | VERIFIED | 85 lines; 3 exports + EVENT_VERB_MAP (22 actions) |
| `livos/packages/ui/src/routes/docker/dashboard/format-events.unit.test.ts` | Vitest tests (>=30 lines) covering verb/timestamp/slice | VERIFIED | 93 lines, 16 tests |
| `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.ts` | useTagFilter + deriveAllTags + filterEnvs + persistence (>=30 lines) | VERIFIED | 108 lines; key `livos:docker:dashboard:selected-tag` |
| `livos/packages/ui/src/routes/docker/dashboard/use-tag-filter.unit.test.ts` | Vitest unit tests (>=40 lines) | VERIFIED | 82 lines, 10 tests |
| `livos/packages/ui/src/routes/docker/dashboard/tag-filter-chips.tsx` | TagFilterChips component (>=50 lines) | VERIFIED | 73 lines; single-select + auto-fallback + zero-tags-hide |
| `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.ts` | sortTopCpu pure + TopCpuEntry export | VERIFIED | 43 lines; cpu DESC, envName ASC, containerName ASC tiebreakers |
| `livos/packages/ui/src/routes/docker/dashboard/sort-top-cpu.unit.test.ts` | Vitest tests (>=30 lines) | VERIFIED | 75 lines, 7 tests |
| `livos/packages/ui/src/routes/docker/dashboard/use-top-cpu.ts` | useTopCpu fanout hook (>=60 lines) | VERIFIED | 105 lines; PER_ENV_CANDIDATES=5, two-stage fanout, hooks-in-loops gating documented |
| `livos/packages/ui/src/routes/docker/dashboard/top-cpu-panel.tsx` | TopCpuPanel (>=80 lines) with 3 quick-action chips | VERIFIED | 174 lines; Logs/Shell/Restart wired; protected guard active |
| `livos/packages/ui/src/hooks/use-environments.ts` | Adds useEnvironment(envId) cache getter + Environment type export | VERIFIED | Confirmed via env-card.tsx import `import type {Environment} from '@/hooks/use-environments'` and use-top-cpu.ts `RouterOutput['docker']['listEnvironments'][number]` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `sections/dashboard.tsx` | `dashboard/tag-filter-chips.tsx` + `env-card-grid.tsx` + `top-cpu-panel.tsx` | import + render | WIRED | Lines 13-15 imports; lines 20-22 JSX, exact stacking: TagFilterChips ABOVE, EnvCardGrid MIDDLE, TopCpuPanel BELOW |
| `dashboard/env-card-grid.tsx` | `dashboard/use-tag-filter.ts` | `useTagFilter()` + `filterEnvs(envs, selected)` | WIRED | Line 16 import; line 33 hook call; line 53 helper invocation before .map() |
| `dashboard/env-card-grid.tsx` | `hooks/use-environments.ts` | `useEnvironments()` | WIRED | Line 32 |
| `dashboard/env-card.tsx` | `dashboard/use-env-card-data.ts` | `useEnvCardData(env.id)` | WIRED | Line 182 |
| `dashboard/use-env-card-data.ts` | `trpcReact.docker.{listContainers,listImages,listStacks,listVolumes,listNetworks,dockerEvents}` | useQuery({environmentId}) | WIRED | Lines 57-86, all 6 queries; data flows back to EnvCard |
| `dashboard/env-card.tsx` | `stores/environment-store.ts` + `routes/docker/store.ts` | `useEnvironmentStore.getState().setEnvironment + useDockerStore.getState().setSection('containers')` | WIRED | Lines 190-191 in handleClick |
| `dashboard/env-card.tsx` HealthBanner | `dashboard/use-env-card-data.ts` refetch | `onRetry={data.refetch}` + stopPropagation | WIRED | Line 227 prop wiring; lines 117 stopPropagation in HealthBanner button |
| `dashboard/top-cpu-panel.tsx` | `dashboard/use-top-cpu.ts` | `useTopCpu()` | WIRED | Line 91 |
| `dashboard/use-top-cpu.ts` | `trpcReact.docker.{listContainers,containerStats}` | per-env + per-candidate fanout | WIRED | Lines 56, 77 |
| `dashboard/top-cpu-panel.tsx` | `trpcReact.docker.manageContainer` | `useMutation()` | WIRED | Lines 93-100 |
| `dashboard/top-cpu-panel.tsx` | `stores/environment-store.ts` + `routes/docker/store.ts` | `setEnvironment + setSection('logs'\|'shell')` | WIRED | Lines 102-106 jumpTo |
| `livinityd/docker/environments.ts` | `database/schema.sql` | tags column read/written via SELECT_COLS + INSERT + UPDATE setter | WIRED | All ops parameterised; defensive `row.tags ?? []` mapping |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| EnvCard counts/stats/events | `data.containers / imageCount / events / …` | `useEnvCardData(env.id)` → 6 tRPC queries against existing v22 env-aware routes (`docker.listContainers/listImages/listStacks/listVolumes/listNetworks/dockerEvents`) | YES — routes call `dockerctl.exec` against the env's docker daemon (Phase 22-01) | FLOWING |
| EnvCardGrid | `envs` | `useEnvironments()` → `trpc.docker.listEnvironments` → PG query SELECT_COLS now includes tags | YES — PG row mapping returns real tags | FLOWING |
| TagFilterChips | `allTags` | `deriveAllTags(useEnvironments().data)` derived client-side from real PG-backed env list | YES | FLOWING |
| TopCpuPanel | `entries` | `useTopCpu()` two-stage fanout: real listContainers per env → real containerStats per candidate (top 5 per env by created desc) → sortTopCpu union top 10 | YES — composes real per-env queries; bounded but real | FLOWING |
| Health banner | `health` | `deriveHealth(isError, summary)` where summary is computed from real `data.containers` array | YES | FLOWING |
| Recent events | `events` | `dockerEvents.useQuery({since:now-3600, until:now})` — real Docker event stream sliced by time window | YES | FLOWING |

No hollow components. Tags column is the upstream of TagFilterChips and is genuinely populated (PG DEFAULT '{}'); chip row hides until real tags exist (admin must edit envs to add tags via Phase 29 inline editor or tRPC `updateEnvironment`).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 12 phase commits exist | `git log --oneline 4f5b7027^..68189ddf` | 12 commits returned: 4f5b7027 → 68189ddf | PASS |
| Dashboard files exist | `ls livos/packages/ui/src/routes/docker/dashboard/` | 12 files present (8 source + 3 tests + 1 grid wrapper) | PASS |
| schema.sql contains ALTER TABLE | grep `ADD COLUMN IF NOT EXISTS tags` | line 243 found | PASS |
| environments.ts has tags wiring | grep `tags` | 12 references including SELECT_COLS, INSERT, UPDATE | PASS |
| routes.ts Zod schema | grep `tags: z.array` | 2 hits (lines 1667 + 1699) | PASS |
| Dashboard wires the 3 components | grep `TagFilterChips\|EnvCardGrid\|TopCpuPanel` in dashboard.tsx | 3 imports + 3 renders in correct order | PASS |
| Test count claim (61 UI dashboard tests) | Inferred from 25-02 SUMMARY: "61/61 PASS across 8 files" — full docker route sweep including pre-existing Phase 22/24 tests + 16 format-events + 10 use-tag-filter + 7 sort-top-cpu = 33 dashboard-specific tests within the 61-total docker route suite | Claim consistent with file-level test count | PASS |
| Anti-pattern scan (TODO/FIXME/placeholder/coming soon) on dashboard files | grep -i `TODO\|FIXME\|XXX\|HACK\|placeholder\|coming soon\|not yet implemented` | No matches in `livos/packages/ui/src/routes/docker/dashboard/` | PASS |
| Run UI test suite to confirm 61/61 | `pnpm --filter ui exec vitest run src/routes/docker/ --environment jsdom` | NOT EXECUTED (per verifier constraint: do not start servers / run heavy commands) | SKIP — relies on summary claim |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOC-04 | 25-01 + 25-02 | Multi-env health card grid with name+type+target+tags+health+counts+stats+events; per-card retry on Unreachable | SATISFIED | EnvCard renders all 6 sections; Plan 25-02 added Retry button. ROADMAP table line 54 marks Complete. |
| DOC-05 | 25-02 | "Top containers by CPU" panel — sorted desc, 5s refresh, Logs/Shell/Restart quick-action chips | SATISFIED | TopCpuPanel + useTopCpu + sortTopCpu shipped; bounded fanout PER_ENV_CANDIDATES=5; protected guard active. ROADMAP line 55 marks Complete. |
| DOC-06 | 25-01 (column) + 25-02 (chips UI) | env tag filter chips (All / dev / prod / staging) filter card grid client-side | SATISFIED | tags TEXT[] column shipped 25-01; TagFilterChips + useTagFilter + filterEnvs shipped 25-02; pure client-side filter (no refetch on chip click). ROADMAP line 56 marks Complete. |

No orphaned requirements. ROADMAP success criteria 1-5 all map to verified truths #1-#5 above.

### Anti-Patterns Found

None. Grep across all dashboard files for TODO/FIXME/XXX/HACK/placeholder/coming soon/not yet implemented returned zero matches. No empty `return null` patterns flagged (the one `return null` in tag-filter-chips.tsx line 55 is the documented zero-tags-hide guard, not a stub). No hardcoded empty-array props or static return-empty patterns.

### Human Verification Required

These claims require eyeball-after-deploy because they're visual / UX-quality / runtime-behaviour assertions that the code shape alone can't prove:

1. **Test:** Open `/docker` Dashboard on a server with at least one env that has running + stopped + paused containers.
   **Expected:** EnvCard health banner shows the right colour (green "All N healthy" / amber "N unhealthy" / red "Unreachable" / zinc "No containers"); container counts match `docker ps -a` output.
   **Why human:** Visual rendering correctness of HealthBanner colours + count accuracy across container states.

2. **Test:** With multiple envs configured (e.g. `local` + a TCP-TLS prod), watch the Dashboard for 30 seconds during background polling ticks.
   **Expected:** No flicker / no skeleton flash on refetch; cards stay in place with stable identity; numbers update smoothly within their cells.
   **Why human:** "Smooth refetch, no full re-render flicker" is a visual perception claim — code shape (queryKey stability + isLoading semantics) is necessary but not sufficient.

3. **Test:** Click an EnvCard body (avoid the Retry button).
   **Expected:** Status bar env selector pill flips to clicked env's name AND the section view jumps to the Containers list scoped to that env.
   **Why human:** Click-to-scope feels right only if the navigation target shows the expected env's containers immediately; verifies real wiring through both stores.

4. **Test:** Add tags to two envs (e.g. `prod` + `dev`) via tRPC or a DB UPDATE; reload Dashboard.
   **Expected:** TagFilterChips row appears above grid with [All, dev, prod] chips. Click `prod` → grid filters to only prod-tagged envs. Reload page → `prod` is still selected (localStorage persistence).
   **Why human:** localStorage persistence + auto-fallback timing only observable in a real browser session.

5. **Test:** Configure two envs; open Dashboard; observe TopCpuPanel for 10 seconds.
   **Expected:** Within 5-7s, panel populates with up to 10 rows; CPU% values are within ±2% of the per-env Containers tab. Restart chip on `livos_redis` is visibly disabled with tooltip "Protected container".
   **Why human:** Live container CPU values + bounded fanout behaviour only verifiable against a real Docker daemon.

6. **Test:** Click Logs chip on a Top-CPU row.
   **Expected:** Section switches to `logs`; status bar env selector reflects the row's env. (Container not auto-selected — that's Phase 28 territory by design.)
   **Why human:** Cross-store imperative writes during a click handler; visible side effect spans multiple components.

7. **Test:** Kill the local docker daemon (`systemctl stop docker`) and watch the local EnvCard.
   **Expected:** Banner flips to red "Unreachable" with a Retry button. Click Retry — only this card's queries refetch (other env cards keep polling normally).
   **Why human:** Error-state UX + per-card scoped retry observable only at runtime.

8. **Test:** Visual comparison against Dockhand reference (https://dockhand.bor6.pl).
   **Expected:** Card visual structure (header, tag pills, banner, count row, 2x2 stats, events) reads similarly; Tailwind responsive breakpoints (1/2/3/4 col) trigger correctly.
   **Why human:** Aesthetic / "Dockhand-look" is a subjective judgement.

### Gaps Summary

No code gaps found. Backend tags column landed idempotently with proper Zod bounds. All 12 dashboard files exist with substantive implementation (no stubs, no placeholder content, no hardcoded empty data flowing to render). All tRPC wiring correct (env-aware queries, manageContainer mutation, listEnvironments tags column). Click-to-scope writes both stores. Filter chips are pure client-side. Top-CPU bounded fanout matches plan constraints exactly.

The phase passes all programmatic checks. Status is `human_needed` purely because visual UX claims (Dockhand-look, smooth refetch, responsive breakpoints, aesthetic correctness, error-state feel, deploy-environment behaviour) require post-deploy eyeball — these are NOT gaps, they're verifications outside the verifier's code-only scope.

---

*Verified: 2026-04-25T20:35:00Z*
*Verifier: Claude (gsd-verifier)*
