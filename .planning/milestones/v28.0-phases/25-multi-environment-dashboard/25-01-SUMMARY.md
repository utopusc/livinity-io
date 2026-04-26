---
phase: 25-multi-environment-dashboard
plan: 01
subsystem: ui

tags: [react, tailwind, postgres, trpc, react-query, zustand, dashboard, multi-env, vitest]

requires:
  - phase: 24-docker-app-skeleton
    provides: "DockerApp shell, useDockerSection / useSetDockerSection store, SectionId union, Sidebar, StatusBar"
  - phase: 22-multi-host-docker
    provides: "environments PG table + CRUD, env-aware tRPC routes, useSelectedEnvironmentId / useEnvironmentStore"

provides:
  - "tags: TEXT[] NOT NULL DEFAULT '{}' column on environments (idempotent ADD COLUMN IF NOT EXISTS)"
  - "Environment.tags: string[] field across livinityd CRUD + tRPC inputs (createEnvironment + updateEnvironment accept optional tags array, max 20 entries × 50 chars)"
  - "Multi-env Dashboard section — replaces Phase 24 placeholder with EnvCardGrid → EnvCard cards, one per environment"
  - "useEnvCardData(envId) — per-env query composition pattern (containers 5s, events 10s, images/stacks/volumes/networks 30s) reusable for cross-env aggregation in future phases"
  - "format-events pure module — formatEventVerb, formatEventTimestamp, takeLastEvents (16-test coverage)"
  - "useEnvironment(envId) — zero-request cache getter that derives a single row from useEnvironments() data"
  - "Card click handler — imperatively writes both useEnvironmentStore (env scope) + useDockerStore (section) so global state flips on a single tick"

affects:
  - 25-02 (filter chips + Top-CPU panel — consume the same EnvCardGrid + tags column)
  - 26-resource-routes (containers/images/volumes/networks detail pages — reuse useEnvCardData polling shape per env)
  - 28-cross-container-logs (events across envs — extend takeLastEvents to multi-env aggregation)
  - 29-settings (tag editor UI — Phase 29 owns the inline tag editing surface)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-env query composition (one tRPC hook per metric, explicit envId override) — does NOT read global useSelectedEnvironmentId so each card displays ITS OWN env's metrics"
    - "Imperative store writes via .getState().setX() inside event handlers — prevents the firing component from subscribing and re-rendering on its own writes"
    - "Pure formatter modules with vi.useFakeTimers + vi.setSystemTime for deterministic timestamp boundary tests"
    - "Idempotent schema migration via DO $$ BEGIN ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... END$$ block (matches device_audit_log_no_modify trigger pattern)"

key-files:
  created:
    - "livos/packages/ui/src/routes/docker/dashboard/format-events.ts (85 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/format-events.unit.test.ts (93 lines, 16 tests)"
    - "livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts (93 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/env-card.tsx (253 lines)"
    - "livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx (55 lines)"
  modified:
    - "livos/packages/livinityd/source/modules/database/schema.sql (+8 lines: ALTER TABLE environments ADD tags TEXT[])"
    - "livos/packages/livinityd/source/modules/docker/environments.ts (Environment.tags + SELECT_COLS + INSERT/UPDATE wiring)"
    - "livos/packages/livinityd/source/modules/docker/routes.ts (tags Zod schema in createEnvironment + updateEnvironment, max 20×50)"
    - "livos/packages/livinityd/source/modules/docker/environments.unit.test.ts (+109 lines, +6 tests for tags column)"
    - "livos/packages/ui/src/hooks/use-environments.ts (export Environment type via RouterOutput, add useEnvironment(envId) cache getter)"
    - "livos/packages/ui/src/routes/docker/sections/dashboard.tsx (placeholder body replaced with <EnvCardGrid />)"

key-decisions:
  - "Polling intervals: containers 5s (most dynamic), events 10s (recent activity), images/stacks/volumes/networks 30s — listImages on a 357-image env is too expensive at 5s (Plan 22-01 D-06 / Dockhand precedent). staleTime is half each interval so React Query doesn't fire dup-fetches on focus."
  - "No backend aggregator route — UI composes 6 per-env tRPC hooks client-side. CONTEXT.md `decisions` permitted a single docker.dashboardSnapshot route if multi-env fanout (e.g. 5+ envs × 6 polls each) showed strain; for v1 (typical 1-3 envs) per-resource queries are sufficient and the existing v22.x routes are already env-aware. Re-evaluate at 5+ envs (T-25-04 register entry)."
  - "CPU/memory aggregate pill DEFERRED — requires per-container stats fanout (docker stats stream) which the polling loop doesn't yet do. Plan 25-02 may add it via a single docker.containerStats batch call OR ship without it (CONTEXT.md `specifics` blesses text-only metrics for Phase 25). EnvCard renders 4 stat cells (Images / Stacks / Volumes / Networks) in a 2x2 grid — no '—' placeholder slot for CPU/memory."
  - "Event verb mapping: 22 docker actions in EVENT_VERB_MAP, unmapped actions echo verbatim (formatEventVerb returns action as-is) — defensive against future Docker minor releases that might emit new actions; we'd rather show 'oom_kill' raw than crash the card."
  - "Card click writes BOTH useEnvironmentStore AND useDockerStore in a single handler tick (imperative .getState().setX()) — scopes the rest of the app to the clicked env AND auto-jumps to the containers section. Single store write would leave the user on the dashboard staring at the same card highlighted; double write matches Dockhand UX where clicking a card 'enters' that env."
  - "Tags column DEFAULT '{}' (empty PG array literal) NOT NULL — Environment.tags type is `string[]` (never undefined post-bootstrap). rowToEnvironment maps `row.tags ?? []` defensively even though PG guarantees an array (mirrors 22-01 D-04 alias-resolution defensiveness)."
  - "Tags Zod schema: `z.array(z.string().min(1).max(50)).max(20).optional()` — bounds total tag count to 20 and per-tag to 50 chars (T-25-01 mitigation: prevents DoS via 10k-element arrays AND bounds row size)."
  - "Health derivation: 'paused' + 'restarting' count toward 'unhealthy' banner; 'exited'/'dead'/'created' do NOT (operators routinely keep stopped containers around — flagging them red would create false alarms). 'isError' (containers query failed) → red 'Unreachable' banner. Empty container list → neutral zinc 'No containers' banner."
  - "Type inference for Environment in UI: derived via `RouterOutput['docker']['listEnvironments'][number]` (added Environment type export to use-environments.ts). Single source of truth — avoids duplicating the Environment shape between UI and livinityd."

patterns-established:
  - "Per-env dashboard hook (useEnvCardData(envId)): explicit envId param overrides global selection — every metric panel that should show one env's data regardless of global scope follows this pattern. Reusable for Phase 26 detail pages (a container detail panel that wants to keep showing the right metrics even while the user navigates the list)."
  - "Card click → dual store write (env + section) for in-app navigation: clicking a list item that should both scope AND change view writes both stores imperatively. Pattern reusable for Phase 26 stack cards / image rows."
  - "Idempotent schema additions via wrapped DO block: `DO $$ BEGIN ALTER TABLE … ADD COLUMN IF NOT EXISTS … END$$;` — matches the existing device_audit_log_no_modify pattern. Pattern reusable for any future column addition without a separate migration runner."
  - "tRPC RouterOutput type inference for shared types: instead of duplicating type definitions across livinityd and UI, derive the UI type via `RouterOutput['route']['nested'][number]`. Already in use for backups types — Plan 25-01 carries it forward to Environment."

requirements-completed: []
# DOC-04 (env card grid) — partial: grid + cards shipped. Filter chips + Top-CPU panel ship in 25-02.
# DOC-06 (env tags column) — partial: PG column + read/write CRUD shipped. Filter chips UI ships in 25-02.
# Full closure of DOC-04 + DOC-06 tracked in 25-02 SUMMARY.

# Metrics
duration: 7min
completed: 2026-04-25
---

# Phase 25 Plan 01: Multi-Environment Dashboard — Backend Tags + EnvCard Grid Summary

**EnvCardGrid replaces the Phase 24 dashboard placeholder with one Dockhand-style health card per environment (header + tags + health banner + container counts + 2x2 stats + 8-event feed); environments.tags TEXT[] column lands idempotently for the filter chips Plan 25-02 consumes.**

## Performance

- **Duration:** 7 min (413 s)
- **Started:** 2026-04-25T20:02:53Z
- **Completed:** 2026-04-25T20:09:46Z
- **Tasks:** 3 (all TDD — 5 commits: 2 RED + 3 GREEN)
- **Files created:** 5
- **Files modified:** 6

## Accomplishments

- **DOC-06 storage layer:** `tags TEXT[] NOT NULL DEFAULT '{}'` column added to `environments` table via idempotent `DO $$ BEGIN ALTER TABLE … ADD COLUMN IF NOT EXISTS … END$$` block. `Environment.tags: string[]` plumbed through livinityd CRUD (SELECT_COLS, INSERT, UPDATE setter branch) and tRPC schemas (createEnvironment + updateEnvironment accept `tags: string[]` bounded to 20 entries × 50 chars per T-25-01 mitigation).
- **DOC-04 grid + cards:** Dashboard section (`routes/docker/sections/dashboard.tsx`) replaced wholesale with `<EnvCardGrid />`. Each `EnvCard` renders header (type icon + env name + connection target), tags chip pills (only when present), health banner (green "All N healthy" / amber "N unhealthy" / red "Unreachable" / zinc "No containers"), container counts row (running/paused/restarting/stopped + total), 2x2 stats grid (Images/Stacks/Volumes/Networks), and a recent-events list capped at 8 entries via `takeLastEvents`.
- **Per-env query composition pattern:** `useEnvCardData(envId)` composes 6 tRPC queries with explicit envId override (does NOT read `useSelectedEnvironmentId`) at fixed polling intervals matching plan constraints (5s containers, 10s events, 30s images/stacks/volumes/networks). Pattern reusable for Phase 26 detail pages.
- **Click-to-scope:** Card click imperatively writes both `useEnvironmentStore.setEnvironment(env.id)` and `useDockerStore.setSection('containers')` in one handler — scopes the rest of the Docker app to the clicked env AND jumps to its containers list.
- **Pure utilities:** `format-events.ts` ships 3 exports + EVENT_VERB_MAP covering 22 docker actions; 16 unit tests lock down verb mapping (mapped + unmapped echo), timestamp bucketing (just now / Nm / Nh / Nd ago), and time-desc slice math via `vi.useFakeTimers + vi.setSystemTime`.
- **Defensive cache getter:** `useEnvironment(envId)` derives a single env row from the existing `useEnvironments()` cache — zero extra requests; returns `undefined` when the id is missing (e.g. deleted in another tab).

## Task Commits

Each task was committed atomically following TDD (RED → GREEN):

1. **Task 1 RED: failing tests for tags column** — `4f5b7027` (test) — 6 new tests, 5 fail as expected, Test F passes (local-protection guard runs before SQL).
2. **Task 1 GREEN: tags column implementation** — `ee16d187` (feat) — schema.sql ALTER TABLE + environments.ts plumbing + tRPC Zod schemas. 25/25 tests pass.
3. **Task 2 RED: failing tests for format-events** — `a0ffb73b` (test) — 16 tests; all fail because module doesn't exist.
4. **Task 2 GREEN: format-events module + useEnvironment getter** — `07a2d5d6` (feat) — pure formatters + cache getter. 16/16 tests pass.
5. **Task 3: Dashboard wiring** — `9c210d26` (feat) — EnvCard, EnvCardGrid, useEnvCardData, dashboard.tsx replacement. UI build green, all 44 docker route tests pass.

(Task 3 was authored without a separate RED commit — per Plan 25-01 Task 3 `<behavior>` block, layout files use the formatter-chain assertions established in Plan 24-02 D-12 in lieu of heavy-mock render tests; the testable logic lives in Tasks 1+2's extracted modules.)

## Files Created/Modified

### Created (5)

- `livos/packages/ui/src/routes/docker/dashboard/format-events.ts` — Pure verb/timestamp/slice formatters for the recent-events list. Exports `EVENT_VERB_MAP`, `formatEventVerb`, `formatEventTimestamp(unixSeconds, now?)`, `takeLastEvents<T extends {time:number}>(events, limit)`.
- `livos/packages/ui/src/routes/docker/dashboard/format-events.unit.test.ts` — 16 tests covering verb mapping (10 cases), timestamp boundaries (4 cases via fake timers), and slice math (2 cases).
- `livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts` — Per-env composition hook. Returns `{containers, imageCount, stackCount, volumeCount, networkCount, events, isError, isLoading}`. Polling intervals locked per plan constraints.
- `livos/packages/ui/src/routes/docker/dashboard/env-card.tsx` — Single-env health card with sub-helpers (TypeIcon, connectionText, summarizeContainers, deriveHealth, HealthBanner, CountPill, StatCell). Card body is a `<button>` so the entire surface is clickable.
- `livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx` — Tailwind responsive grid (1/2/3/4 cols at default/sm/xl/2xl). GridSkeleton during load, friendly error state, empty-state pointing to Settings.

### Modified (6)

- `livos/packages/livinityd/source/modules/database/schema.sql` — Added DO-block ALTER TABLE for `tags TEXT[] NOT NULL DEFAULT '{}'` after the existing environments index.
- `livos/packages/livinityd/source/modules/docker/environments.ts` — `Environment.tags: string[]` field; `SELECT_COLS` ends with `, tags`; `rowToEnvironment` maps `row.tags ?? []`; `CreateEnvironmentInput.tags?: string[]` and `UpdateEnvironmentInput.tags?: string[]`; INSERT becomes 11-column with `input.tags ?? []` default; UPDATE setter branch for tags appended to optional setters.
- `livos/packages/livinityd/source/modules/docker/routes.ts` — `createEnvironment` + `updateEnvironment` Zod schemas accept `tags: z.array(z.string().min(1).max(50)).max(20).optional()`.
- `livos/packages/livinityd/source/modules/docker/environments.unit.test.ts` — `localRow` and `tcpRow` fixtures gain `tags: []`; new describe block "environments.tags (Phase 25 DOC-06)" with 6 tests (A: list returns tags=[]; B: create with tags writes & returns; C: create with undefined defaults to []; D: update tags writes only that column; E: update with [] clears; F: local protection still blocks tag-only updates).
- `livos/packages/ui/src/hooks/use-environments.ts` — Exports `Environment` type via `RouterOutput['docker']['listEnvironments'][number]`; adds `useEnvironment(envId): Environment | undefined` cache getter.
- `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` — Placeholder body replaced with `<EnvCardGrid />` inside a `flex h-full flex-col overflow-y-auto` wrapper. Same `export function Dashboard()` signature so SectionView in DockerApp keeps importing the same name.

## Decisions Made

See frontmatter `key-decisions` for the canonical 9-decision list. Highlights:

- **Polling cadence per plan constraints, NOT a flat 5s** — listImages on a 357-image env is too expensive to poll every 5s; the cadence ladder (5s containers / 10s events / 30s static counts) matches Dockhand reference behaviour and respects Plan 22-01 D-06.
- **No new tRPC route** — client-side composition over 6 existing env-aware queries is sufficient for v1 (typical 1-3 envs). Aggregator (`docker.dashboardSnapshot`) deferred per CONTEXT.md `decisions`; T-25-04 register entry tracks the re-eval threshold (5+ envs).
- **CPU/memory pill deferred** — requires per-container stats fanout. Plan 25-02 may add it; Phase 25 intentionally ships text-only metrics per CONTEXT.md `specifics`.
- **Imperative store writes for click handlers** — prevents the EnvCard from subscribing to the store it's writing to (avoids self-induced re-renders).
- **Schema migration via wrapped DO block** — idempotent on every PG version, no separate migration runner needed (livinityd reads schema.sql at boot).

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` step 1 specified "place [tags update branch] AFTER the `tlsKeyPem` block" — done. The plan's instruction to "place tags param at the 11th INSERT column" — done. The plan's polling cadence (5s/10s/30s × 6 queries) — implemented exactly. The plan's `<behavior>` test list (Tests A-F for Task 1, 16 cases for Task 2, smoke checklist for Task 3) — implemented exactly.

The plan permitted EITHER omitting CPU/memory slots OR rendering them with `'—'` placeholders for Plan 25-02 to fill in. Implementation chose the **omit** path: EnvCard's 2x2 stats grid contains only Images/Stacks/Volumes/Networks. Plan 25-02 can add a 3-column row above the stats grid OR extend it to 2x3 — both layouts are pure addition. Documented as a Decision (key-decisions[2]), not a deviation.

## Issues Encountered

None — TDD cycle was clean for both Task 1 and Task 2 (RED confirmed exactly the expected failures; GREEN passed all tests on the first run). UI build succeeded with zero new typecheck errors over the Phase 24 baseline. The full UI test sweep (44 tests across 6 files in `routes/docker/`) passes.

One minor hygiene note: the placeholder-replacement guard grep (`grep -r "Coming in Phase 25"`) initially returned 1 match — but that match is in the new `dashboard.tsx` comment header that documents what was replaced ("Replaces the Phase 24 'Coming in Phase 25' placeholder…"). The actual user-facing copy is gone (verified via stricter grep `"Coming in Phase 25 — Multi"`).

## Threat Flags

None — plan introduced no new security surface beyond what `<threat_model>` already enumerated. The 4 mitigated threats (T-25-01 through T-25-03 plus T-25-05's existing adminProcedure gate) are all mitigated as planned. No new auth paths, network endpoints, or trust boundaries.

## TDD Gate Compliance

- **Task 1 (Tests A-F for tags column):** RED commit `4f5b7027` (test) → GREEN commit `ee16d187` (feat) — gate compliant.
- **Task 2 (16 format-events tests):** RED commit `a0ffb73b` (test) → GREEN commit `07a2d5d6` (feat) — gate compliant.
- **Task 3 (layout files — no separate test commit per plan):** Plan 25-01 Task 3 explicitly waived the RED gate for layout files ("No new vitest tests for these layout files (matches Plan 24-02 D-12 'smoke chain test for layout files'); the `tdd="true"` flag here applies to the `useEnvCardData` hook design"). The hook's call shape is type-checked by the consuming EnvCard's render and by the `pnpm --filter ui build` typecheck. Compliant per plan waiver.

## Self-Check: PASSED

### Files exist
- `livos/packages/ui/src/routes/docker/dashboard/format-events.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/format-events.unit.test.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/use-env-card-data.ts` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/env-card.tsx` — FOUND
- `livos/packages/ui/src/routes/docker/dashboard/env-card-grid.tsx` — FOUND
- `livos/packages/ui/src/hooks/use-environments.ts` — modified (useEnvironment + Environment type export verified)
- `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` — modified (placeholder body replaced)
- `livos/packages/livinityd/source/modules/database/schema.sql` — modified (tags ALTER TABLE block verified at line 238-244)
- `livos/packages/livinityd/source/modules/docker/environments.ts` — modified (Environment.tags + plumbing verified)
- `livos/packages/livinityd/source/modules/docker/routes.ts` — modified (Zod tags field in both schemas verified)
- `livos/packages/livinityd/source/modules/docker/environments.unit.test.ts` — modified (6 new tests verified)

### Commits exist
- `4f5b7027` (test RED Task 1) — FOUND in git log
- `ee16d187` (feat GREEN Task 1) — FOUND in git log
- `a0ffb73b` (test RED Task 2) — FOUND in git log
- `07a2d5d6` (feat GREEN Task 2) — FOUND in git log
- `9c210d26` (feat Task 3) — FOUND in git log

### Verification commands passed
- `pnpm --filter livinityd exec vitest run source/modules/docker/environments.unit.test.ts` → 25/25 PASS (19 existing + 6 new)
- `pnpm --filter ui exec vitest run src/routes/docker/ --environment jsdom` → 44/44 PASS across 6 files
- `pnpm --filter ui build` → succeeds, zero new typecheck errors

## User Setup Required

None — no external service configuration required. The new `tags` column auto-applies on next livinityd boot via the idempotent ALTER TABLE statement; existing environments rows get `tags = '{}'` (empty array) automatically.

## Next Phase Readiness

**Plan 25-02 unblocked.** Plan 25-02 layers:
1. **Tag filter chips** ABOVE `<EnvCardGrid />` — collect unique tags from `useEnvironments()`, render "All / dev / prod / staging" pill toggles, filter the env list before mapping to EnvCards.
2. **Top-CPU panel** BELOW `<EnvCardGrid />` — across-all-envs union of `listContainers({environmentId: each}).filter(running).sort(cpu_percent desc).slice(0, 10)`. Quick-action chips (logs / shell / restart) inline.
3. (optional) **CPU/memory aggregate pill** on each EnvCard — extend `useEnvCardData` to also call `docker.containerStats` per running container and sum, OR add a single batch `docker.envStats({environmentId})` route.

**Plan 25-02 changes nothing in 25-01:**
- The `tags` column accepts both reads (chip filtering) and writes (deferred tag editor in Phase 29).
- `EnvCardGrid` and `EnvCard` are pure consumers — the filter chips can intercept `useEnvironments().data` before passing to the grid OR the grid can accept an optional `envs` prop. Either pattern is non-breaking.
- The `useEnvCardData` polling cadence is configurable per call site if 25-02 wants to tune it for the Top-CPU aggregator.

**Pre-existing Plan 22-02 D-04 constraint still applies:** stack/scan mutations are envId-less. Plan 25-02's Top-CPU panel quick-actions (logs/shell/restart) target running containers — these go through `docker.manageContainer` which IS env-aware (Plan 22-01 D-08 envId fanout) so cross-env restarts will work correctly without further plumbing.

---
*Phase: 25-multi-environment-dashboard*
*Completed: 2026-04-25*
