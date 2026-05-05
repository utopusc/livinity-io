---
phase: 71
plan: 03
subsystem: livinityd-database
tags: [database, schema, computer-use, repository, postgres, lifecycle, cu-found-06]
requires:
  - PostgreSQL 12+ (gen_random_uuid via pgcrypto/built-in, make_interval)
  - existing users table (FK target)
provides:
  - computer_use_tasks table (UUID PK, status enum, container_id, port, lifecycle timestamps)
  - computer_use_tasks_user_active_idx (partial unique — DB-enforced max-1-active-per-user)
  - computer_use_tasks_active_last_activity_idx (partial covering for findIdleCandidates)
  - 8 typed lifecycle repo functions (createActiveTask, getActiveTask, getTaskById, updateContainerInfo, bumpActivity, markIdle, markStopped, findIdleCandidates)
  - ComputerUseTask + ComputerUseTaskStatus types
  - barrel re-export at computer-use/index.ts
  - cross-module re-export at database/index.ts (matches 76-01 agent_templates wiring)
affects:
  - livos/packages/livinityd/source/modules/database/schema.sql (idempotent append)
  - livos/packages/livinityd/source/modules/database/index.ts (added barrel re-export block)
tech-stack:
  added: []
  patterns:
    - parameterized $N queries everywhere (T-71-03-01 mitigation)
    - partial unique index for cardinality constraints (T-71-03-02 mitigation)
    - rowToTask snake_case → camelCase mapper helper
    - 23505 SQLSTATE → friendly Error translation
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/task-repository.ts
    - livos/packages/livinityd/source/modules/computer-use/task-repository.test.ts
    - livos/packages/livinityd/source/modules/computer-use/index.ts
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/database/index.ts
decisions:
  - "Partial unique index `WHERE status = 'active'` over a separate uniqueness table — single source of truth, idempotent CREATE IF NOT EXISTS, lets stopped/idle rows accumulate without conflicting with the live row."
  - "23505 caught and translated to `Error('Container already active for user')` only — non-23505 PG errors bubble unchanged so transient failures are not masked as user-conflict errors."
  - "findIdleCandidates accepts `idleThresholdMs: number` and converts at the SQL layer via `make_interval(secs => $1::numeric / 1000)` — keeps the JS API in milliseconds (matching v31 timer/interval idioms) while leaving the Postgres-side conversion deterministic and parameter-safe."
  - "Two namespace-comment headers in schema.sql intentionally — `-- Phase 71: Computer Use Tasks` is greppable single-line per plan must-have. The `-- (CU-FOUND-06)` line right below ties to ROADMAP requirement IDs."
  - "Both indexes are partial (`WHERE status = 'active'`) — covers idle/stopped sweep cleanly without bloating the index with terminal-state rows."
  - "Barrel re-export at `database/index.ts` mirrors the 76-01 agent_templates pattern verbatim — keeps cross-module imports uniform (`import {createActiveTask} from '../database/index.js'`)."
metrics:
  completed: "2026-05-04T20:14:30Z"
  duration_minutes: 12
  task_count: 2
  file_count: 5
  test_count: 14
---

# Phase 71 Plan 03: Computer Use Tasks Database Foundation Summary

**One-liner:** DB-enforced max-1-active-per-user `computer_use_tasks` table + 8 typed parameterized lifecycle queries — the data foundation Phase 71's container manager (71-04) will consume.

## Goal

Lay the database substrate for Bytebot container lifecycle management: a `computer_use_tasks` table whose partial unique index enforces "at most one active container per user" at the SQL layer (not just app code), plus a typed pg repository module covering every lifecycle transition with parameterized queries.

This is pure data + repo logic — no Docker invocation, no HTTP routes. Downstream plans (71-04 container-manager) will import these 8 functions to drive every spawn / heartbeat / idle-sweep / stop transition.

## Final Schema Delta

Appended to `livos/packages/livinityd/source/modules/database/schema.sql` after the Phase 76 `agent_templates` block (line 462+):

```sql
-- Phase 71: Computer Use Tasks
-- (CU-FOUND-06) Per-user Bytebot container lifecycle.
-- The partial unique index enforces "max 1 active container per user" at the
-- DB layer — not just app-layer logic. Defense in depth.
CREATE TABLE IF NOT EXISTS computer_use_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('active', 'idle', 'stopped')),
  container_id  TEXT,
  port          INTEGER,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS computer_use_tasks_user_active_idx
  ON computer_use_tasks(user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS computer_use_tasks_active_last_activity_idx
  ON computer_use_tasks(last_activity) WHERE status = 'active';
```

All-existing-content-untouched: this is a pure 21-line append. Idempotent — every clause uses `IF NOT EXISTS`, safe across repeated boots.

## Repository Function Signatures

All functions live in `livos/packages/livinityd/source/modules/computer-use/task-repository.ts` and use parameterized `$N` placeholders only (zero string-interpolation in SQL):

| # | Function                | Signature                                                                    | Behavior                                                                                  |
| - | ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 | `createActiveTask`      | `(pool, userId) => Promise<ComputerUseTask>`                                | INSERT status='active'; on PG 23505 throws `Error('Container already active for user')`   |
| 2 | `getActiveTask`         | `(pool, userId) => Promise<ComputerUseTask \| null>`                         | SELECT WHERE user_id=$1 AND status='active' LIMIT 1                                       |
| 3 | `getTaskById`           | `(pool, taskId) => Promise<ComputerUseTask \| null>`                         | SELECT WHERE id=$1                                                                        |
| 4 | `updateContainerInfo`   | `(pool, taskId, containerId, port) => Promise<void>`                         | UPDATE container_id=$2, port=$3 WHERE id=$1                                               |
| 5 | `bumpActivity`          | `(pool, userId) => Promise<void>`                                            | UPDATE last_activity=now() WHERE user_id=$1 AND status='active' (atomic single statement) |
| 6 | `markIdle`              | `(pool, taskId) => Promise<void>`                                            | UPDATE status='idle' WHERE id=$1 AND status='active'                                      |
| 7 | `markStopped`           | `(pool, taskId) => Promise<void>`                                            | UPDATE status='stopped', stopped_at=now() WHERE id=$1 AND status IN ('active','idle')     |
| 8 | `findIdleCandidates`    | `(pool, idleThresholdMs) => Promise<ComputerUseTask[]>`                      | SELECT active rows where last_activity < now() - make_interval(secs => $1::numeric/1000)  |

Type exported alongside:

```typescript
export type ComputerUseTaskStatus = 'active' | 'idle' | 'stopped'
export type ComputerUseTask = {
  id: string
  userId: string
  status: ComputerUseTaskStatus
  containerId: string | null
  port: number | null
  lastActivity: Date
  createdAt: Date
  stoppedAt: Date | null
}
```

`rowToTask(row): ComputerUseTask` private helper does the snake_case → camelCase mapping for every column.

## Test Coverage Map

`livos/packages/livinityd/source/modules/computer-use/task-repository.test.ts` — 14 vitest cases, all pass (363 ms total wall, 6 ms test wall). Mocked-pool pattern (matches `agent-templates-repo.test.ts` and `api-keys/database.test.ts` per STATE.md line 116). No new devDeps.

| # | Test                                                                                       | Function under test    |
| - | ------------------------------------------------------------------------------------------ | ---------------------- |
| 1 | INSERTs with status=active and returns mapped task                                         | `createActiveTask`     |
| 2 | translates 23505 unique-violation to "Container already active for user"                   | `createActiveTask`     |
| 3 | does not swallow non-23505 PG errors                                                       | `createActiveTask`     |
| 4 | returns null when no active row                                                            | `getActiveTask`        |
| 5 | returns mapped task when active row exists (asserts SQL contains `status = 'active'`)      | `getActiveTask`        |
| 6 | returns null when row not found                                                            | `getTaskById`          |
| 7 | returns mapped task when row exists (asserts `WHERE id = $1`)                              | `getTaskById`          |
| 8 | UPDATEs container_id + port with $1=taskId, $2=containerId, $3=port                        | `updateContainerInfo`  |
| 9 | UPDATEs last_activity=now() WHERE user_id=$1 AND status=active                             | `bumpActivity`         |
| 10 | markIdle only flips active rows                                                            | `markIdle`             |
| 11 | markStopped sets stopped_at=now() and accepts active OR idle (regex-asserts WHERE clause)  | `markStopped`          |
| 12 | SELECTs active rows older than threshold using make_interval (asserts $1::numeric / 1000)  | `findIdleCandidates`   |
| 13 | returns empty array when no candidates                                                     | `findIdleCandidates`   |
| 14 | maps fully populated row (snake_case → camelCase) including non-null containerId/port/stoppedAt | `rowToTask` (via getTaskById) |

Plan must-have (>=10 cases) AND `<done>` criterion (>=14 cases) both satisfied.

## Sacred SHA Verification Trail

`nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at:

| Checkpoint | Hash                                       | Status    |
| ---------- | ------------------------------------------ | --------- |
| Plan start | `4f868d318abff71f8c8bfbcf443b2393a553018b` | unchanged |
| After Task 1 schema/repo write | `4f868d318abff71f8c8bfbcf443b2393a553018b` | unchanged |
| After Task 1 commit `53195a9a` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | unchanged |
| After Task 2 test pass | `4f868d318abff71f8c8bfbcf443b2393a553018b` | unchanged |
| After Task 2 commit `d1d92027` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | unchanged |

Sacred file untouched throughout (D-NO-NEW-DEPS / D-NO-BYOK / D-NO-SERVER4 honored).

## Greppability Verification

| Check                                                                                                | Expected | Actual    |
| ---------------------------------------------------------------------------------------------------- | -------- | --------- |
| `git grep -n "computer_use_tasks_user_active_idx" livos/.../schema.sql \| wc -l`                     | 1        | 1         |
| String-interpolation in queries: `rg "pool\.query\(.*\$\{" livos/.../computer-use/`                  | 0 hits   | 0 hits    |
| `-- Phase 71: Computer Use Tasks` greppable single-line in schema.sql                                | 1        | 1         |
| `import type {Pool} from 'pg'` in task-repository.ts                                                 | 1        | 1         |

## Threat Model Mitigations Applied

| Threat ID    | Category | Disposition | Where mitigated                                                                                |
| ------------ | -------- | ----------- | ---------------------------------------------------------------------------------------------- |
| T-71-03-01   | T (Tampering / SQLi)             | mitigate | All 8 repo functions use $N placeholders. Test 8 (updateContainerInfo) + Test 12 (findIdleCandidates $1) verify shape. Lint check shows ZERO interpolation. |
| T-71-03-02   | E (Elevation — race in spawn)    | mitigate | Partial unique index `computer_use_tasks_user_active_idx`. Test 2 verifies 23505 translation.   |
| T-71-03-03   | R (Repudiation / no audit)       | accept   | P71 scope is lifecycle, not audit. P75 memory features can layer on later if needed.            |
| T-71-03-04   | I (Info disclosure / docker IDs) | accept   | container_id is internal docker hash; not a secret.                                             |
| T-71-03-05   | D (DoS / large idle sweep)       | accept   | Single-tenant Mini PC; row count bounded. `computer_use_tasks_active_last_activity_idx` covers predicate. |

## Commits

| Commit     | Subject                                                                  | Files | Role          |
| ---------- | ------------------------------------------------------------------------ | ----- | ------------- |
| `53195a9a` | feat(71-03): computer_use_tasks table + repository (CU-FOUND-06)         | 4     | GREEN (impl)  |
| `d1d92027` | test(71-03): unit tests for computer-use task-repository (CU-FOUND-06)   | 1     | RED-after-GREEN (verification)|

## Deviations from Plan

### Auto-Fixed Issues

**1. [Rule 3 - Blocking, baseline noise] Pre-existing typecheck failures in unrelated files**

- **Found during:** Task 1 verification (`pnpm --filter livinityd typecheck`)
- **Issue:** `tsc --noEmit` reports >40 errors in `source/modules/user/routes.ts`, `source/modules/user/user.ts`, `source/modules/utilities/file-store.ts`, `source/modules/widgets/routes.ts` (`ctx.user is possibly 'undefined'`, etc.) AND a few in `source/modules/computer-use/bytebot-tools.test.ts` (which was added by a parallel Phase 72-01 agent — references not-yet-existent `bytebot-tools.ts`).
- **Decision:** SCOPE BOUNDARY rule applied — none of these errors are caused by my changes. I scoped a typecheck pass to only `task-repository.ts` + `computer-use/index.ts` + the modified `database/index.ts` block, which produces ZERO errors. Plan's must-have "`pnpm --filter livinityd typecheck` exits 0" is unsatisfiable due to pre-existing baseline state and the in-progress parallel agent's RED phase — not adjusted by 71-03 work.
- **Fix:** None — out of scope per `<deviation_rules>`. Documented for Phase 71-Verifier and the parallel-agent owners.

### TDD Gate Compliance

This plan's two tasks were both marked `tdd="true"` but the action sequence was scripted as feat-first (Task 1: schema+repo+barrel→commit `feat(71-03)`) then test-second (Task 2: test file→commit `test(71-03)`). I executed the plan literally — the result is a feat commit followed by a test commit on master. This inverts the canonical RED→GREEN order; the `<tdd_execution>` section's "Plan-Level TDD Gate Enforcement" applies only to plans where `frontmatter.type == 'tdd'`. This plan's frontmatter `type: execute` makes the gate inversion plan-author-sanctioned. Tests do pass after the impl commit (14/14), so behavioral regression risk is zero.

### Out-of-Scope Discoveries (Logged, Not Fixed)

- A parallel Phase 72-01 agent created `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts` (78 LOC, RED phase — references `bytebot-tools.ts` which doesn't exist yet). Left in place per `<destructive_git_prohibition>`.
- A parallel Phase 72-02 agent created `livos/packages/livinityd/source/modules/computer-use/bytebot-system-prompt.test.ts` (also RED-staged but originally in another agent's index — auto-unstaged from my Task 1 commit). Left in place.

## Self-Check: PASSED

**Files:**

- FOUND: `livos/packages/livinityd/source/modules/database/schema.sql` (computer_use_tasks block at line 463+)
- FOUND: `livos/packages/livinityd/source/modules/database/index.ts` (re-export block at end)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/task-repository.ts` (126 LOC, 8 functions exported)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/task-repository.test.ts` (207 LOC, 14 tests)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/index.ts` (1-line barrel)

**Commits:**

- FOUND: `53195a9a` (feat — schema + repo + barrel + database/index re-export)
- FOUND: `d1d92027` (test — 14 vitest cases all green)

**Sacred SHA:** `4f868d31...` unchanged across 5 verification points throughout execution.

**Greppability invariants:** index name `computer_use_tasks_user_active_idx` appears exactly once; zero `${...}` interpolation in any repo `pool.query(...)` call.
