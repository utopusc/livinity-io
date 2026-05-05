---
phase: 76
plan: 01
subsystem: agent-marketplace
tags: [agent-marketplace, postgres, schema, repository, foundation, tdd]
requirements: [MARKET-03]
dependency_graph:
  requires: []
  provides:
    - "agent_templates table (Postgres) — slug PK, tools_enabled jsonb, GIN(tags)"
    - "agent-templates-repo.ts surface — listAgentTemplates / getAgentTemplate / incrementCloneCount"
    - "AgentTemplate TS type (camelCase)"
    - "database/index.ts barrel re-export of the 3 functions + type"
  affects:
    - "76-02 (seed runner): can now `import {listAgentTemplates}` from '../database/index.js'"
    - "76-05 (tRPC routes): can now expose `agentMarketplace.list/get/clone` via repo"
tech_stack:
  added: []
  patterns:
    - "Mocked-pool unit tests (matches api-keys/database.test.ts + usage-tracking/database.test.ts discipline)"
    - "Atomic UPDATE single-statement clone_count increment (no SELECT-then-UPDATE race)"
    - "Parameterized $1 placeholders only — pg driver escapes; never string-interpolated"
    - "Idempotent schema.sql append (CREATE TABLE/INDEX IF NOT EXISTS)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/database/agent-templates-repo.ts (103 LOC)"
    - "livos/packages/livinityd/source/modules/database/agent-templates-repo.test.ts (217 LOC)"
  modified:
    - "livos/packages/livinityd/source/modules/database/schema.sql (+23 lines, 0 deletions)"
    - "livos/packages/livinityd/source/modules/database/index.ts (+10 lines barrel re-export)"
decisions:
  - "Test backend = mocked pool (Claude's discretion clause in plan must-haves). pg-mem not in livinityd devDeps; DATABASE_URL skip-fallback would silently no-op in CI; mocked pool gives deterministic 9/9 pass + asserts the SQL contract verbatim. Pattern matches api-keys/database.test.ts (Phase 59) + usage-tracking/database.test.ts (Phase 44)."
  - "9 tests > 5 minimum: 5 plan-mandated cases (T1/T2/T3/T4/T5) + 4 defensive edge cases (T2b null tools_enabled fallback, T3b empty tags array treated as no-filter, T4b getAgentTemplate hit mapping, T5b incrementCloneCount undefined-rowCount → false)."
  - "Schema block namespaced under '-- Phase 76: Agent Templates' header so concurrent 75-01/75-03 appends to schema.sql in this same batch don't conflict — locator comment makes diff hunks resolve cleanly."
  - "incrementCloneCount uses single UPDATE statement (no SELECT-then-UPDATE) — atomic at PG row level (T-76-01-04 mitigation)."
metrics:
  duration_minutes: 18
  completed_date: "2026-05-04"
  tasks_completed: 1
  files_changed: 4
  tests_added: 9
  tests_pass: 9
  tests_fail: 0
---

# Phase 76 Plan 01: Agent Templates Repository Foundation Summary

**One-liner:** Append `agent_templates` table + GIN(tags) index to `schema.sql`; ship `agent-templates-repo.ts` with parameterized list/get/incrementCloneCount + 9 mocked-pool vitest cases — locks the data access boundary for 76-02 (seeds) and 76-05 (tRPC routes).

## What Was Built

### 1. Schema append (`livos/packages/livinityd/source/modules/database/schema.sql`)
- `+23 lines, 0 deletions` (verified via `git diff --stat`)
- New block lands AFTER the Phase 75-01 `idx_messages_content_tsv` index (line 415).
- `CREATE TABLE IF NOT EXISTS agent_templates` with locked column shape per CONTEXT D-02:
  - `slug VARCHAR(64) PRIMARY KEY`
  - `name VARCHAR(128) NOT NULL`
  - `description TEXT NOT NULL`
  - `system_prompt TEXT NOT NULL`
  - `tools_enabled JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `tags TEXT[] NOT NULL DEFAULT '{}'`
  - `mascot_emoji VARCHAR(16) NOT NULL DEFAULT '🤖'`
  - `clone_count INTEGER NOT NULL DEFAULT 0`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `CREATE INDEX IF NOT EXISTS idx_agent_templates_tags ON agent_templates USING GIN (tags)` for tag-filter queries.
- Idempotent — running schema.sql twice is a no-op (matches existing project convention; verified by reading `database/index.ts:initDatabase` which re-runs schema on every boot).
- Namespaced under `-- Phase 76: Agent Templates` comment header to disambiguate from concurrent 75-* appends in this batch.

### 2. Repository (`livos/packages/livinityd/source/modules/database/agent-templates-repo.ts`)
103 LOC. Three exported async functions + one type:

```typescript
export type AgentTemplate = {slug, name, description, systemPrompt,
  toolsEnabled, tags, mascotEmoji, cloneCount, createdAt}

export async function listAgentTemplates(pool, opts?: {tags?: string[]}): Promise<AgentTemplate[]>
export async function getAgentTemplate(pool, slug): Promise<AgentTemplate | null>
export async function incrementCloneCount(pool, slug): Promise<boolean>
```

Internal `rowToTemplate()` maps snake_case → camelCase explicitly. `tools_enabled` is defensively unwrapped — if PG returns non-array (null edge case), falls back to `[]`.

### 3. Barrel re-export (`livos/packages/livinityd/source/modules/database/index.ts`)
Added 10 lines at end of file (after `rowToAppInstance`):

```typescript
export {
  listAgentTemplates,
  getAgentTemplate,
  incrementCloneCount,
  type AgentTemplate,
} from './agent-templates-repo.js'
```

`.js` extension matches the existing module-resolution convention (verified via grep — every `'../database/index.js'` import in the codebase uses `.js`).

### 4. Tests (`livos/packages/livinityd/source/modules/database/agent-templates-repo.test.ts`)
217 LOC. 9 vitest cases, all using mocked `pool.query` to assert (a) emitted SQL string, (b) parameter shape, (c) row→type mapping:

| ID  | Case |
| --- | --- |
| T1  | `listAgentTemplates` returns `[]` on empty table; SQL contains ORDER BY created_at ASC, no `@>` |
| T2  | `listAgentTemplates` returns 1 row after INSERT; row→camelCase mapping verified field-by-field |
| T2b | (defensive) `rowToTemplate` falls back to `[]` when `tools_enabled` is null |
| T3  | `listAgentTemplates({tags:['research']})` emits `tags @> $1::text[]` with params `[['research']]` |
| T3b | (defensive) `listAgentTemplates({tags:[]})` treats empty filter as no-filter |
| T4  | `getAgentTemplate(pool, 'nope')` returns `null` (no throw); SQL = `SELECT * FROM agent_templates WHERE slug = $1` |
| T4b | (defensive) `getAgentTemplate` hit → returns mapped row |
| T5  | `incrementCloneCount` hit → true (rowCount=1); miss → false (rowCount=0); atomic UPDATE shape verified |
| T5b | (defensive) `incrementCloneCount` undefined-rowCount → false |

## Test Backend Chosen

**Mocked pool** (Claude's discretion clause in plan must-haves: "Tests use `pg-mem` if installed OR skip-if-no-DATABASE_URL fallback (Claude's discretion — match the existing test discipline). NO supertest, NO new test framework deps.").

Reasoning:
- `pg-mem` is NOT in `livos/packages/livinityd/package.json` devDependencies (verified via Read).
- `DATABASE_URL` skip-fallback would silently no-op in CI — providing zero verification value.
- Existing project test discipline for repository unit tests is mocked-pool: `api-keys/database.test.ts` (Phase 59), `usage-tracking/database.test.ts` (Phase 44). Both use `vi.fn()` queryMock + `getPool: () => ({query: queryMock})` pattern.
- Mocked-pool deterministically asserts the SQL contract verbatim (the actual binding contract for 76-02 + 76-05) without requiring any DB infra.
- D-NO-NEW-DEPS preserved — vitest already present, no `pg-mem` install needed.

**Test result:** 9 pass / 0 fail / 0 skip (342ms total).

## Build Status

`pnpm typecheck` (livinityd uses `tsc --noEmit`, NOT a separate build step — `tsx` runs source directly) reports zero errors on the 4 files I touched (`agent-templates-repo.ts`, `agent-templates-repo.test.ts`, `database/index.ts`, `schema.sql` not type-checked).

Pre-existing typecheck errors in unrelated files (`user/routes.ts`, `user/user.ts`, `widgets/routes.ts`, `utilities/file-store.ts`) are out-of-scope per executor scope_boundary — they predate this plan and stem from earlier phases. Verified zero new errors via `pnpm typecheck 2>&1 | grep -E "agent-templates|database/index"` → no output.

## Sacred SHA Verification

| Gate  | SHA                                          | Status |
| ----- | -------------------------------------------- | ------ |
| Start | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | OK     |
| End   | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | OK     |

`nexus/packages/core/src/sdk-agent-runner.ts` byte-for-byte unchanged. D-NO-BYOK + D-NO-SERVER4 honored (no broker / Server4 paths touched).

## No Existing CREATE TABLE Modified

Verified via `git diff --stat livos/packages/livinityd/source/modules/database/schema.sql` → `1 file changed, 23 insertions(+)`, **zero deletions**. Every existing `CREATE TABLE` block (users, sessions, user_preferences, system_settings, user_app_access, user_app_instances, invites, custom_domains, channel_identity_map, device_audit_log, scheduled_jobs, git_credentials, registry_credentials, stacks, environments, docker_agents, ai_alerts, broker_usage, api_keys, conversations, messages) preserved byte-for-byte.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan must-have used wrong package name + script**
- **Found during:** Task 1 (verification step)
- **Issue:** Plan must-have asserts `pnpm --filter @livos/livinityd build` exits 0. The actual package name in `livos/packages/livinityd/package.json` is `livinityd` (not `@livos/livinityd`), and there is NO `build` script — livinityd runs TypeScript directly via `tsx` (per project memory: "livinityd runs TypeScript directly via tsx — no compilation needed"). The closest gate is `pnpm typecheck` (`tsc --noEmit`).
- **Fix:** Substituted `pnpm typecheck` for `pnpm --filter @livos/livinityd build`. Verified my 4 changed files produce zero typecheck errors. Pre-existing errors in unrelated files remain (out-of-scope).
- **Files modified:** None (verification command substitution).
- **Commit:** N/A (decision documented here in SUMMARY).

**2. [Rule 3 - Test backend choice] Mocked-pool over skip-fallback**
- **Found during:** Task 1 step 5 (test backend selection)
- **Issue:** Plan offered three backends: pg-mem (not installed) → DATABASE_URL skip-fallback (silently no-op in CI) → mocked-pool (Claude's discretion under "match existing test discipline").
- **Fix:** Chose mocked-pool — matches existing project test discipline (api-keys/database.test.ts, usage-tracking/database.test.ts) and gives deterministic 9/9 pass + asserts the actual SQL contract.
- **Files modified:** None (test file authored to mocked-pool pattern from the start).
- **Commit:** `bdf90519` (test) + `49aaec94` (impl).

### Auth Gates

None encountered.

## Commits

| Hash       | Type | Subject |
| ---------- | ---- | ------- |
| `bdf90519` | test | add failing tests for agent_templates repository (RED) |
| `49aaec94` | feat | implement agent_templates repository + schema (MARKET-01) (GREEN) |

## TDD Gate Compliance

- RED gate ✓: `bdf90519` is a `test(76-01):` commit with no impl present (`agent-templates-repo.ts` did not exist at this commit). Test file would fail to import.
- GREEN gate ✓: `49aaec94` is a `feat(76-01):` commit AFTER RED, ships impl + schema + barrel; all 9 tests pass.
- REFACTOR gate: not needed (impl matches plan's verbatim contract; no cleanup required).

## Verification Results

| Check | Result |
| ----- | ------ |
| `schema.sql` shape grep (CREATE TABLE, slug PK, tools_enabled JSONB, GIN, Phase 76 header) | OK |
| `agent-templates-repo.ts` shape grep (AgentTemplate, list/get/increment, `tags @>`, `clone_count + 1`, `export type`, `export async function`) | OK |
| Sacred SHA (start) | `4f868d31...` |
| Sacred SHA (end) | `4f868d31...` |
| schema.sql diff stat | +23, -0 |
| Vitest agent-templates-repo | 9 pass / 0 fail (342ms) |
| Pre-existing typecheck errors in my 4 files | 0 |
| New npm dependencies added | 0 |

## Self-Check: PASSED

- Created `livos/packages/livinityd/source/modules/database/agent-templates-repo.ts` — FOUND (103 LOC).
- Created `livos/packages/livinityd/source/modules/database/agent-templates-repo.test.ts` — FOUND (217 LOC).
- Modified `livos/packages/livinityd/source/modules/database/schema.sql` — agent_templates block FOUND.
- Modified `livos/packages/livinityd/source/modules/database/index.ts` — barrel re-export FOUND.
- Commit `bdf90519` (RED test) — FOUND in `git log --oneline -5`.
- Commit `49aaec94` (GREEN impl) — FOUND in `git log --oneline -5`.
- 9/9 vitest pass — verified.
- Sacred SHA `4f868d31...` unchanged — verified start + end.
