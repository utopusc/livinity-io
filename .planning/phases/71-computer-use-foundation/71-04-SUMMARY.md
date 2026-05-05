---
phase: 71-computer-use-foundation
plan: 04
subsystem: livinityd
tags: [container, lifecycle, docker, computer-use, idle-timeout, bytebot, ci]
dependency-graph:
  requires:
    - 71-01-bytebot-catalog-manifest
    - 71-03-computer_use_tasks-repository
    - apps.installForUser  # livos/packages/livinityd/source/modules/apps/apps.ts
  provides:
    - ComputerUseContainerManager class
    - IDLE_THRESHOLD_MS (30 min) constant
    - TICK_INTERVAL_MS (5 min) constant
    - SPAWN_BUDGET_MS (15s) constant
    - DockerInspectFn DI seam
  affects:
    - livos/packages/livinityd/source/modules/computer-use/index.ts (barrel re-export)
tech-stack:
  added: []  # D-NO-NEW-DEPS — used existing execa + pg + vitest
  patterns:
    - DI-seam via optional constructor field (DockerInspectFn)
    - mocked-pool unit tests (matches 71-03 task-repository.test.ts)
    - Promise.race for time budget enforcement
    - setInterval-based reaper (NOT setTimeout-recursion to avoid jitter accumulation)
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/container-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/container-manager.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/index.ts
decisions:
  - DI-seam dockerInspect lets tests bypass execa/Docker entirely (no real container needed)
  - Used Promise.race against setTimeout for the 15s budget (greppable `15s budget`)
  - Race-condition retry: 23505 → re-fetch once → throw "state inconsistent" (NOT infinite retry loop)
  - setInterval (NOT recursive setTimeout) for reaper — jitter accumulation hazard
  - tickIdleTimeouts catches errors at every level — never throws to interval (avoids livinityd crash)
  - Restart-stopped-container path uses execa docker compose (NO new compose generation)
  - Used vi.mock on '../database/index.js' to override getUserAppInstance globally per file
  - Used vi.mock on 'execa' to make all docker-compose calls no-ops in tests
metrics:
  duration: 5m 0s
  completed: 2026-05-04T20:28:11Z
  tasks_completed: 2
  test_count: 16
  files_created: 2
  files_modified: 1
  lines_added_impl: 266  # container-manager.ts
  lines_added_test: 420  # container-manager.test.ts
  commits: 2
---

# Phase 71 Plan 04: ComputerUseContainerManager Summary

ComputerUseContainerManager — single lifecycle owner for Bytebot per-user containers — composing 71-01 (manifest), 71-03 (DB lifecycle), and existing apps.installForUser into one surface 71-05 (gateway) and P72 (agent loop) call without knowing Docker internals.

## Class shape

| Method                | Signature                                                                                           | Purpose                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ensureContainer`     | `(userId: string) => Promise<{taskId, containerId, port, subdomain}>`                               | Idempotent: cache hit / restart / fresh install. 15s budget enforced. |
| `stopContainer`       | `(userId: string) => Promise<void>`                                                                  | Looks up active task, docker compose stop, markStopped. No-op if absent. |
| `getStatus`           | `(userId: string) => Promise<'running' \| 'idle' \| 'stopped' \| 'absent'>`                          | Branches on task row + dockerInspect result.                         |
| `bumpActivity`        | `(userId: string) => Promise<void>`                                                                  | Delegates to repo bumpActivity.                                      |
| `tickIdleTimeouts`    | `() => Promise<void>`                                                                                | Iterates findIdleCandidates(IDLE_THRESHOLD_MS) → stopContainer each. |
| `start`               | `() => void`                                                                                         | Boots 5-min interval. Idempotent.                                    |
| `stop`                | `() => void`                                                                                         | Clears interval (graceful shutdown).                                 |

7 public methods + 3 exported constants (`IDLE_THRESHOLD_MS = 30 * 60 * 1000`, `TICK_INTERVAL_MS = 5 * 60 * 1000`, `SPAWN_BUDGET_MS = 15_000`).

## DI seams for testability

The constructor accepts:

```typescript
type Deps = {
  apps: Apps                          // production: real Apps singleton from livinityd
  pool: Pool                          // production: pg.Pool
  logger: Livinityd['logger']         // production: createChildLogger output
  dockerInspect?: DockerInspectFn     // production: defaults to execa `docker inspect`; tests override
}
```

The optional `dockerInspect` is the load-bearing seam — tests inject `async () => ({running: true|false})` and never spawn execa. The `apps` and `pool` mocks are object literals matching the runtime shape (no class instantiation needed).

## Test coverage (16 cases — exceeds plan's >= 9 target)

`livos/packages/livinityd/source/modules/computer-use/container-manager.test.ts`:

| Group              | Cases | Coverage                                                                                       |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------- |
| `ensureContainer`  | 5     | cached running, restart on stopped (no install), fresh install path, race retry inconsistent, 15s timeout |
| `stopContainer`    | 2     | happy path (markStopped called), absent (no-op)                                                |
| `getStatus`        | 4     | 'absent' / 'idle' (no containerId) / 'running' / 'stopped' — all 4 distinct values             |
| `bumpActivity`     | 1     | delegates to repo with userId                                                                  |
| `tickIdleTimeouts` | 2     | iterates 2 candidates + 2 log entries, catches PG-down error and continues                     |
| `start / stop`     | 2     | setInterval bound to TICK_INTERVAL_MS + clearInterval on stop, idempotent start                |
| **Total**          | **16** | **All 7 methods + 3 constants exercised**                                                    |

Test result: `73 passed (73)` across the whole `computer-use/` module after adding 16 new ones (no regressions in 57 existing).

## Decisions logged

1. **`Promise.race` vs AbortController for the 15s budget.** Promise.race with `setTimeout(reject)` is simplest — doesn't require modifying `apps.installForUser` to accept an AbortSignal (apps.ts is read-only per scope_guard). The work promise continues running after the race rejects; that's acceptable because it can only land successful state into the DB (next ensureContainer call sees the active row + restart path takes over).

2. **Restart-stopped-container path.** When an active task row exists but `dockerInspect(containerId).running === false`, we restart by calling `docker compose --file <volumePath>/docker-compose.yml up -d` directly via execa — NOT by re-running `apps.installForUser` (which would attempt a fresh install and fail at the "user already has X installed" guard inside apps.ts:957). The compose path is recovered from the existing `getUserAppInstance` row.

3. **23505 race handling.** When `createActiveTask` throws "Container already active for user" (translated 23505 from task-repository), we re-fetch via `getActiveTask`. If the re-fetch returns the task, proceed. If it still returns null, throw `Error('Bytebot container state inconsistent')` rather than retry-loop forever. This is a hard signal that the partial unique index `computer_use_tasks_user_active_idx` is in an unexpected state and operator intervention is needed.

4. **`setInterval` not `setTimeout` recursion.** The plan's scope_guard explicitly forbids `setTimeout` recursion to avoid jitter accumulation. `setInterval` semantics: callback returns even if previous tick's promise hasn't resolved — but `tickIdleTimeouts` catches all errors and the only side effect is logging + DB writes which are PG-protected.

5. **`tickIdleTimeouts` error containment.** The interval callback wraps `tickIdleTimeouts().catch(logger.error)` AND the method itself wraps `findIdleCandidates` in try/catch AND each per-candidate `stopContainer` call has its own `.catch`. Triple-layer safety because an unhandled rejection inside the interval would crash livinityd.

6. **`vi.mock('../database/index.js')` over re-implementing the re-export chain.** The test mocks the database/index.js module so `getUserAppInstance` returns a synthetic `UserAppInstance`. Avoids needing a real PG connection or pg-mem dependency. Other re-exports (`createActiveTask`, `getActiveTask`, etc.) are NOT mocked at this level — they pass through to the real task-repository functions, which in turn use the mocked `pool.query` from `makePool(...)`. This keeps the SQL contract assertions live.

7. **`vi.mock('execa')`.** The restart and stop paths emit `docker compose ... up -d` / `... stop` via execa template literal. Tests mock execa to a no-op promise so the test process never touches docker.

8. **Plan-prescribed import path.** Plan code imported task-repo functions from `../database/index.js` (the barrel re-export added by 71-03). Confirmed by grep — `database/index.js:725-736` re-exports `createActiveTask, getActiveTask, ...` for exactly this purpose. Followed the plan verbatim.

## Sacred SHA verification trail

| When                            | SHA                                          | Status |
| ------------------------------- | -------------------------------------------- | ------ |
| Pre-Task-1 implementation       | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | ✓      |
| Post-Task-1 commit `16293fa3`   | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | ✓      |
| Post-Task-2 commit `11d3f13c`   | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | ✓      |

`nexus/packages/core/src/sdk-agent-runner.ts` content unchanged across 2 commits.

## Greppability anchors (must-have truths)

```
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:35:  IDLE_THRESHOLD_MS = 30 * 60 * 1000
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:36:  TICK_INTERVAL_MS = 5 * 60 * 1000
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:37:  SPAWN_BUDGET_MS = 15_000           // 15s budget
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:55:  docker inspect --format
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:139: state inconsistent
livos/packages/livinityd/source/modules/computer-use/container-manager.ts:149: this.apps.installForUser
```

All four must-have grep targets land in the new file.

## Commits

| Hash       | Message                                                              |
| ---------- | -------------------------------------------------------------------- |
| `16293fa3` | feat(71-04): ComputerUseContainerManager lifecycle owner (CU-FOUND-06) |
| `11d3f13c` | test(71-04): unit tests for ComputerUseContainerManager (CU-FOUND-06)  |

## Verification trail

- ✅ `pnpm --filter livinityd exec vitest run source/modules/computer-use/container-manager.test.ts` → 16 passed
- ✅ `pnpm --filter livinityd exec vitest run source/modules/computer-use/` → 73 passed (16 new + 57 existing, zero regression)
- ✅ Greppability anchors confirmed (`IDLE_THRESHOLD_MS`, `15s budget`, `state inconsistent`, `this.apps.installForUser`)
- ✅ Sacred SHA `4f868d31...` unchanged across both commits
- ✅ No file deletions in either commit
- ✅ `livinityd` package has no `build` script (runs TS via tsx; per CLAUDE.md memory) — `typecheck` invocation produces 358 pre-existing errors in unrelated files; ZERO errors in new files (filtered: `pnpm --filter livinityd typecheck 2>&1 | grep -E "^source/modules/computer-use/container-manager"` returns empty). Same scope-boundary disposition as 71-03 SUMMARY (Rule 3 - Blocking, baseline noise).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, baseline noise] Pre-existing typecheck errors in unrelated files**
- **Found during:** Task 1 verification (`pnpm --filter livinityd typecheck`)
- **Issue:** `tsc --noEmit` reports 358 errors in `source/modules/user/routes.ts`, `source/modules/user/user.ts`, `source/modules/utilities/file-store.ts`, `source/modules/widgets/routes.ts`, etc. (`ctx.user is possibly 'undefined'`, default-import vs esModuleInterop, etc.).
- **Decision:** SCOPE BOUNDARY — none caused by this plan. Filtered grep against new files: ZERO errors. Same disposition as 71-03 SUMMARY. Plan must-have "`pnpm --filter livinityd typecheck` exits 0" is unsatisfiable due to pre-existing baseline.
- **Fix:** None — out of scope per `<deviation_rules>`. Documented for Phase 71-Verifier.

**2. [Rule 3 - Blocking] `pnpm --filter livinityd build` does not exist**
- **Found during:** Task 1 verification step
- **Issue:** Plan calls for `pnpm --filter livinityd typecheck && pnpm --filter livinityd build`. The livinityd package's package.json has NO `build` script — runs TypeScript directly via tsx (per CLAUDE.md memory and 71-03 history).
- **Fix:** Substituted vitest run as the behavioral verification (16 cases passing), retained the typecheck baseline-noise scope filter. No actual build step omitted — there is no build step.

**3. [Rule 1 - Bug, prevention] Test fake-timer rejection-handler attach order**
- **Found during:** Drafting Task 2 test for 15s timeout
- **Issue:** If `vi.advanceTimersByTime(SPAWN_BUDGET_MS + 1)` runs BEFORE `expect(promise).rejects.toThrow(...)` is awaited, vitest emits an unhandled rejection warning because the promise rejects with no listener attached.
- **Fix:** Build the rejection expectation FIRST (`const expectation = expect(promise).rejects.toThrow(...)`), THEN advance timers, THEN await the expectation. Used `vi.advanceTimersByTimeAsync` for proper async coordination. Result: clean test run, no unhandled-rejection warnings.

### Non-deviations (planned-as-written)

- DI-seam pattern, mocked-pool pattern, Promise.race timeout, setInterval reaper — all implemented per plan code-block verbatim, with stylistic conformance to project tab/CRLF conventions.

### TDD Gate Compliance

This plan's two tasks were both marked `tdd="true"` but the action sequence was scripted as feat-first (Task 1: impl + barrel → commit `feat(71-04)`) then test-second (Task 2: test file → commit `test(71-04)`). I executed the plan literally — the result is a feat commit followed by a test commit on master. Same disposition as 71-03 SUMMARY: `<tdd_execution>`'s "Plan-Level TDD Gate Enforcement" applies only to plans where `frontmatter.type == 'tdd'`. This plan's `type: execute` makes the inversion plan-author-sanctioned. Tests pass after the impl commit (16/16 + 73/73 module-wide), so behavioral regression risk is zero.

## Threat surface scan

No new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries introduced by this plan beyond what 71-03 already added (`computer_use_tasks` table). Container-manager is a pure orchestrator over existing primitives. Threat register from the plan is fully addressed:

| Threat ID    | Mitigation Implemented                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| T-71-04-01 (E) | execa template literal `${containerId}` auto-escapes (no shell-eval). Greppable: `docker inspect --format`. |
| T-71-04-03 (T) | `installForUser` failure aborts before `updateContainerInfo` — no orphaned active row.          |
| T-71-04-06 (E) | Triple try/catch in `tickIdleTimeouts` + interval callback `.catch` — unhandled-rejection-proof.|

Other entries (T-71-04-02 D, T-71-04-04 I, T-71-04-05 R) marked `accept` in plan; no implementation required.

## Self-Check: PASSED

- ✅ FOUND: livos/packages/livinityd/source/modules/computer-use/container-manager.ts
- ✅ FOUND: livos/packages/livinityd/source/modules/computer-use/container-manager.test.ts
- ✅ FOUND (modified): livos/packages/livinityd/source/modules/computer-use/index.ts — re-exports added
- ✅ FOUND: commit `16293fa3` on master
- ✅ FOUND: commit `11d3f13c` on master
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged
- ✅ All 4 greppability anchors land
- ✅ 16 test cases pass (>= plan's 12 minimum, >= must-haves's 9 minimum)
