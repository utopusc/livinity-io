---
phase: 202-agents-platform
plan: 01
subsystem: database
tags: [postgres, drizzle, migration, agent-registry, repository-pattern, wave-1]

# Dependency graph
requires:
  - phase: 197-mastra-liv-ai
    provides: LIV_AI_SYSTEM_PROMPT literal + livos PG database + runMastraMigrations pattern
provides:
  - PostgreSQL `livos_agents` table with UNIQUE(name) + parent_agent_id FK + depth-2 trigger guard
  - `runLivOSMigrations(opts)` idempotent migration runner (sibling of runMastraMigrations)
  - Drizzle schema bindings `livosAgents` + `LivosAgent` + `LivosAgentInsert` types
  - `AgentRepository` class with 7 CRUD methods (listAll, getById, getByName, create, update, delete, listChildren)
  - `seedSystemAgents(repo)` boot-time helper that idempotently upserts the original `livAi` row (system=true)
  - livinityd boot wire-up that runs migration + seed after the existing Phase 197-05 Mastra block
affects:
  - 202-02 (dynamic Mastra registry — reads AgentRepository on boot + every CRUD)
  - 202-03 (scheduler + agent CRUD tRPC routes consume AgentRepository directly)
  - 202-04, 202-05, 202-06 (frontend pages all hit the same repo via tRPC)

# Tech tracking
tech-stack:
  added:
    - drizzle-orm@^0.45.2 (livinityd dependency — only library added in this plan)
  patterns:
    - "LivOS-owned migration tree: `livos/packages/livinityd/source/db/migrations/000N_*.sql` (numbered to slot AFTER the Mastra `001-*.sql` series)"
    - "Drizzle-on-pg pattern: caller owns the `pg.Pool`, repository wraps an already-constructed `NodePgDatabase`"
    - "Boot-time seed via short-lived pool: `new Pool(...)` → drizzle(pool) → `repo` → `await seedSystemAgents(repo)` → `pool.end()` inside try/finally, dynamic imports keep the heavy module out of the hot path"
    - "DB-level invariant enforcement: UNIQUE(name) + plpgsql trigger for grandchild rejection — failures propagate unchanged to the repository caller (no transformation; the tRPC layer in 202-03 maps to user-facing error codes)"

key-files:
  created:
    - livos/packages/livinityd/source/db/migrations/0002_livos_agents.sql
    - livos/packages/livinityd/source/db/migrate.ts
    - livos/packages/livinityd/source/db/schema.ts
    - livos/packages/livinityd/source/modules/mastra/agents/agent-repository.ts
    - livos/packages/livinityd/source/modules/mastra/agents/agent-repository.test.ts
  modified:
    - livos/packages/livinityd/source/index.ts (boot wire-up — runLivOSMigrations + seedSystemAgents block added between runMastraMigrations and createLivOSMemory)
    - livos/packages/livinityd/package.json (drizzle-orm dep added)

key-decisions:
  - "Mirrored Mastra `migrate.ts` shape exactly (pre/post existence count + redactPgUrl error scrubbing + dryRun flag) instead of inventing a different runner pattern — keeps Phase 197 review muscle memory."
  - "Self-referencing FK in Drizzle uses the documented `(): any` thunk escape hatch (circular pgTable identifier)."
  - "AgentRepository wraps `NodePgDatabase<any>` (rather than a strongly-typed schema generic) to keep the call site flexible — schema generic adds friction without runtime benefit at this surface area."
  - "delete() is idempotent for missing rows (no-op rather than throw) so the future tRPC mutation surface doesn't need a separate exists check. delete() still throws for system=true rows (D-202-20)."
  - "Boot-time seed uses dynamic imports of `pg` + `drizzle-orm/node-postgres` inside the try/finally so a seed-path module-load failure can't break the rest of the Phase 197-05 wire-up."
  - "T-202-02 (UNIQUE) and T-202-04 (depth guard) enforcement lives at the DB layer; the repository propagates the native error unchanged so the tRPC mutation in 202-03 owns the user-facing message mapping."

patterns-established:
  - "Boot-time seed pattern: short-lived pg.Pool + drizzle client + repository inside a try/finally; idempotent helper guards against double-insert; non-fatal logging on failure."
  - "DB-trigger invariant pattern: SQL trigger raises a tagged EXCEPTION string ('Sub-agent depth > 2 not allowed (D-202-13)') that test mocks and tRPC mappers can grep for."
  - "Vitest mock-NodePgDatabase pattern: hand-rolled builder chain + `vi.mock('drizzle-orm')` eq() stub + `vi.mock` of the schema module — sidesteps live PG without sacrificing API coverage."

requirements-completed: [REQ-202-01]

# Metrics
duration: ~50min
completed: 2026-05-23
---

# Phase 202 Plan 01: Agent Registry Schema + Drizzle Migration + AgentRepository Summary

**PostgreSQL `livos_agents` table + idempotent Drizzle migration + `AgentRepository` CRUD class + boot-time `livAi` seed — the durable substrate every later Phase 202 plan reads/writes.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-23T06:18Z (approx)
- **Completed:** 2026-05-23T06:32Z (approx — wall clock for executor, including drizzle-orm install)
- **Tasks:** 5 (plan tasks) + 1 chore commit for the drizzle-orm dep
- **Files created:** 5 (migration SQL + migrate runner + Drizzle schema + repository + test)
- **Files modified:** 2 (livinityd `index.ts` boot wire-up + livinityd `package.json` dep)
- **Tests:** 13 vitest cases PASS (≥ 8 required by the plan's Task 5 acceptance)

## Accomplishments

- New `livos_agents` table with the 11 columns the rest of Phase 202 needs, including UNIQUE(`name`) and a self-referencing parent FK with `ON DELETE SET NULL`.
- A plpgsql trigger `livos_agents_no_grandchildren` enforces T-202-04 / D-202-13 at the DB layer — any insert/update that would create a depth-3 row raises `EXCEPTION 'Sub-agent depth > 2 not allowed (D-202-13)'` before the row lands.
- Migration runner runs idempotently on every livinityd boot — `runLivOSMigrations({databaseUrl})` mirrors the Phase 197-03 `runMastraMigrations` shape so the review surface is familiar.
- `AgentRepository` exposes the 7 CRUD primitives every later 202-XX plan needs; `delete()` already enforces the D-202-20 system-agent lockout.
- The original Phase 197-04 `livAi` agent is now persisted with `system: true` on first boot (idempotent via `getByName('livAi')` guard) — this is what flips Phase 202 acceptance-envelope step 2 to PASS once the executor reaches deploy.
- 13 vitest cases lock the repo + seed contract (8+ required, 5 extra for defense-in-depth: idempotent delete, getById miss, getByName miss, update merge with timestamp bump, seed-second-call no-op).

## Task Commits

Each task was committed atomically; sacred SHA hook PASS × 6.

1. **Task 1: Drizzle migration SQL + runner** — `16b76525` (feat) — `0002_livos_agents.sql` + `db/migrate.ts` + index.ts wire-up
2. **Task 2: Drizzle schema TS binding** — `3d6cc7a8` (feat) — `db/schema.ts`
3. **Task 3: AgentRepository class + seedSystemAgents helper** — `2aa8ddb4` (feat) — `agent-repository.ts`
4. **Task 4: Wire seed into livinityd boot** — `dd3bb3f3` (feat) — `index.ts` boot block
5. **Task 5: Tests** — `eccb8df5` (test) — 13 vitest cases (`agent-repository.test.ts`)
6. **Task 6: Commit envelope — drizzle-orm dep** — `a0dd7a1b` (chore) — `livos/packages/livinityd/package.json`

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (INV-202-01 PASS × 6).

## Files Created/Modified

### Created

- `livos/packages/livinityd/source/db/migrations/0002_livos_agents.sql` — Idempotent table + indexes + plpgsql trigger.
- `livos/packages/livinityd/source/db/migrate.ts` — `runLivOSMigrations({databaseUrl, dryRun?})` runner.
- `livos/packages/livinityd/source/db/schema.ts` — Drizzle `pgTable` definition + `LivosAgent` / `LivosAgentInsert` types.
- `livos/packages/livinityd/source/modules/mastra/agents/agent-repository.ts` — `AgentRepository` class + `seedSystemAgents` helper.
- `livos/packages/livinityd/source/modules/mastra/agents/agent-repository.test.ts` — 13 vitest cases (mock NodePgDatabase).

### Modified

- `livos/packages/livinityd/source/index.ts` — added two import lines and two boot-time blocks (runLivOSMigrations, seedSystemAgents) inside the existing Phase 197-05 try/catch.
- `livos/packages/livinityd/package.json` — added `drizzle-orm: ^0.45.2` to `dependencies`.

## Decisions Made

All decisions came from `202-CONTEXT.md` (D-202-01..24). Five execution-level choices documented above under `key-decisions`. No new design-space decisions had to be made on the fly — Plan 202-01 was crisp enough that every code path had a single obvious shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Installed `drizzle-orm` as livinityd dependency**
- **Found during:** Task 2 (Drizzle schema TS binding)
- **Issue:** The plan's Task 2 / Task 3 templates use `import {pgTable, ...} from 'drizzle-orm/pg-core'` and `NodePgDatabase` from `drizzle-orm/node-postgres`, but `drizzle-orm` was NOT in `livos/packages/livinityd/package.json` (`pg` was, but no Drizzle wrapper).
- **Fix:** `pnpm --filter livinityd add drizzle-orm` — `0.45.2` resolved.
- **Files modified:** `livos/packages/livinityd/package.json` (+1 dep line) and `livos/pnpm-lock.yaml` (NOT committed in this plan; lockfile already had unrelated pending diff from prior planning sessions, regenerated on Mini PC at next deploy via the existing `env CI=true pnpm install` step in update.sh — same pattern as the Plan 201-08 deploy fix).
- **Verification:** `npx vitest run` resolves the import; 13 tests PASS.
- **Committed in:** `a0dd7a1b` (chore commit at the tail of the plan)

**2. [Rule 2 — Missing Critical] Added LivOS-owned migration tree at `db/migrations/`**
- **Found during:** Task 1 (Drizzle migration)
- **Issue:** The plan's `files_modified` block named `livos/packages/livinityd/source/db/migrations/0002_livos_agents.sql` but the `db/` tree did not exist (only `modules/mastra/migrations/` existed for the Mastra-owned tables).
- **Fix:** Created the new `source/db/` tree mirroring the Mastra one — a sibling `migrate.ts` runner + numbered migration file. Plan Task 1's action step ("Wire migration into the existing `runMastraMigrations` pattern (or create a sibling `runLivOSMigrations` that fires after Mastra's own migrations)") explicitly anticipated this branch.
- **Files modified:** `livos/packages/livinityd/source/db/migrations/0002_livos_agents.sql` (new), `livos/packages/livinityd/source/db/migrate.ts` (new).
- **Verification:** Files compile against the rest of livinityd; boot wire-up in index.ts pulls them in.
- **Committed in:** `16b76525` (Task 1 commit)

**3. [Rule 2 — Missing Critical] `delete()` made idempotent for missing rows**
- **Found during:** Task 3 (AgentRepository)
- **Issue:** Plan's pseudo-code raises `Error('Agent {id} not found')` for both missing-row delete AND missing-row update. Future tRPC mutations would then have to do their own exists check before delegating, which is wasteful round-trips.
- **Fix:** `delete()` returns silently when the row is absent; still throws for `system: true` rows. `update()` keeps the throw because the caller does want to know about a stale row id.
- **Files modified:** `livos/packages/livinityd/source/modules/mastra/agents/agent-repository.ts`
- **Verification:** Test 9 ("delete is idempotent for missing rows") PASS.
- **Committed in:** `2aa8ddb4` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking dep install + 2 missing-critical infra/correctness)
**Impact on plan:** Zero scope creep. All three deviations are correctness or infrastructure prerequisites that the plan template anticipated but did not pre-install. No checkpoint needed.

## Issues Encountered

- The pre-existing working-tree had unrelated modifications under `livos/packages/liv-ai-app/` and a modified `pnpm-lock.yaml` from prior planning sessions. These were left untouched in every commit — only files inside the Phase 202-01 scope were staged via explicit `git add <file>` calls. INV-202-02 (backend stays in livinityd) preserved: every file mutated by this plan lives under `livos/packages/livinityd/`.

## User Setup Required

None — no external service configuration. Existing `DATABASE_URL` env var already covers the new table (D-202-01 reuses the `livos` PG database).

## Next Phase Readiness

- **202-02** can immediately consume `AgentRepository.listAll()` to build the dynamic Mastra map on boot and on every CRUD mutation; the FK + UNIQUE constraints surface T-202-02 + T-202-04 as plain `Error` instances the tRPC layer can map.
- **202-03** can consume `AgentRepository.create / update / delete / listChildren` directly + add the cron field to the existing schema without further migration.
- **202-04..06** read the same repository through 202-03's tRPC routes — no direct DB access needed from the subapp tier (INV-202-02 preserved across the wave).

## Self-Check

**Files asserted exist:**
- `livos/packages/livinityd/source/db/migrations/0002_livos_agents.sql` — FOUND
- `livos/packages/livinityd/source/db/migrate.ts` — FOUND
- `livos/packages/livinityd/source/db/schema.ts` — FOUND
- `livos/packages/livinityd/source/modules/mastra/agents/agent-repository.ts` — FOUND
- `livos/packages/livinityd/source/modules/mastra/agents/agent-repository.test.ts` — FOUND

**Commits asserted exist:**
- `16b76525` (Task 1) — FOUND
- `3d6cc7a8` (Task 2) — FOUND
- `2aa8ddb4` (Task 3) — FOUND
- `dd3bb3f3` (Task 4) — FOUND
- `eccb8df5` (Task 5) — FOUND
- `a0dd7a1b` (Task 6 chore) — FOUND

## Self-Check: PASSED

---
*Phase: 202-agents-platform*
*Plan: 01*
*Completed: 2026-05-23*
