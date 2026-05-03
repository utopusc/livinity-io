---
phase: 62-usage-tracking-settings-ui
plan: 01
subsystem: database

tags: [schema-migration, postgres, broker-usage, api-keys, tdd-red, foundation]

requires:
  - phase: 59-bearer-token-auth
    provides: api_keys table (FK target) + Bearer middleware setting req.apiKeyId
  - phase: 44-usage-tracking
    provides: broker_usage table + capture middleware + insertUsage helper
provides:
  - broker_usage.api_key_id nullable UUID FK column with ON DELETE SET NULL
  - Partial index idx_broker_usage_api_key_id on non-NULL rows
  - UsageInsertInput.apiKeyId + UsageRow.api_key_id (string | null)
  - 8-column / 8-param insertUsage with api_key_id at position 3
  - queryUsageByUser + queryUsageAll optional apiKeyId filter (parameterized)
  - Wave 0 RED tests: FR-BROKER-E1-01 (GREEN after Task 2), FR-BROKER-E1-02 ×2 (Plan 02), FR-BROKER-E1-03 (Plan 02 + 05)
affects:
  - 62-02-capture-middleware (consumes UsageInsertInput.apiKeyId; greens E1-02 ×2)
  - 62-03-usage-router-filter (consumes queryUsageByUser/queryUsageAll apiKeyId opts)
  - 62-04-settings-ui (consumes apiKeyId via tRPC)
  - 62-05-integration (greens E1-03 with real broker streaming wiring)

tech-stack:
  added: []
  patterns:
    - "Idempotent ALTER TABLE in DO-block (Phase 25 precedent at schema.sql:261-264)"
    - "Partial index on FK column with WHERE NOT NULL (low-cardinality optimization)"
    - "Additive optional field on Zod-validated tRPC input (backwards-compat by default)"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/usage-tracking/database.ts
    - livos/packages/livinityd/source/modules/usage-tracking/database.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/aggregations.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/schema-migration.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/integration.test.ts

key-decisions:
  - "ON DELETE SET NULL on api_key_id FK — preserves historic attribution if a key row is hard-deleted (Phase 59 soft-deletes via revoked_at, but defense-in-depth per CONTEXT.md)"
  - "api_key_id column placed at SQL position 3 (between app_id and model) so insertUsage param-array order matches schema column order verbatim"
  - "Partial index WHERE api_key_id IS NOT NULL — most legacy rows are NULL until Bearer adoption; full index would waste B-tree space"
  - "queryUsageByUser apiKeyId filter ANDs onto WHERE (does NOT widen scope) — even if attacker passes another user's key UUID, user_id scope returns zero rows (T-62-02 mitigation)"

patterns-established:
  - "DO-block ALTER for FK additions (extends Phase 25 column-add pattern)"
  - "8-param insertUsage as Wave 1 contract for Plans 62-02..05"

requirements-completed:
  - FR-BROKER-E1-01

duration: 5 min
completed: 2026-05-03
---

# Phase 62 Plan 01: Backend Foundation Summary

**Idempotent `broker_usage.api_key_id` FK + partial index migration + 8-param `insertUsage` with `apiKeyId` plumbing for Phase 62 capture/router/UI consumers, plus three Wave 0 RED scaffolds wired for Plans 62-02/05 to green out.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-03T07:01:46Z
- **Completed:** 2026-05-03T07:07:09Z
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments

- **FR-BROKER-E1-01 satisfied** — `broker_usage` now has nullable `api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL` plus a partial index on non-NULL rows.
- **`database.ts` ready for Wave 2** — `UsageInsertInput.apiKeyId`, `UsageRow.api_key_id`, 8-param `insertUsage`, and optional `apiKeyId` filters on `queryUsageByUser`/`queryUsageAll` are all in place. Plans 62-02/03 can call them without further plumbing.
- **Wave 0 RED scaffolds landed** — `FR-BROKER-E1-01` (GREEN after Task 2), `FR-BROKER-E1-02` x2 (RED, owned by Plan 62-02), `FR-BROKER-E1-03` (RED, owned by Plans 62-02 + 62-05). Per the Nyquist rule each later plan has a precise verify target.
- **No regressions** — 40/43 usage-tracking tests GREEN; only the 3 intentional REDs remain (all named with their owning plan in the failure path).

## Task Commits

1. **Task 1: Wave 0 — extend backend test scaffolds with RED assertions** — `434967c0` (test)
2. **Task 2: Schema migration block + database.ts 8-param refactor** — `fd0a75a6` (feat)

**Plan metadata:** _to be added by final docs commit_

## Files Created/Modified

### schema.sql diff (appended after `idx_api_keys_active`)

```sql
-- =========================================================================
-- Phase 62 FR-BROKER-E1-01 — broker_usage.api_key_id (per CONTEXT.md decision).
-- Idempotent ADD COLUMN IF NOT EXISTS in DO-block (matches Phase 25 pattern
-- at line 261-264). Backward-compat: existing rows + legacy URL-path traffic
-- get NULL. ON DELETE SET NULL preserves historic attribution if a key row
-- is hard-deleted (Phase 59 soft-deletes via revoked_at, but defense-in-depth).
-- =========================================================================
DO $$
BEGIN
  ALTER TABLE broker_usage
    ADD COLUMN IF NOT EXISTS api_key_id UUID
    REFERENCES api_keys(id) ON DELETE SET NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id
  ON broker_usage(api_key_id)
  WHERE api_key_id IS NOT NULL;
```

### database.ts diff (key sections)

`UsageInsertInput` and `UsageRow` gain the new field (between `appId`/`app_id` and `model`):

```typescript
export type UsageInsertInput = {
  userId: string
  appId: string | null
  apiKeyId: string | null   // NEW
  model: string
  promptTokens: number
  completionTokens: number
  requestId: string | null
  endpoint: string
}

export type UsageRow = {
  id: string
  user_id: string
  app_id: string | null
  api_key_id: string | null   // NEW
  // ... existing fields ...
}
```

`insertUsage` becomes 8 columns / 8 params (column order matches schema):

```typescript
await pool.query(
  `INSERT INTO broker_usage
   (user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [
    input.userId, input.appId, input.apiKeyId,
    input.model, input.promptTokens, input.completionTokens,
    input.requestId, input.endpoint,
  ],
)
```

`queryUsageByUser` accepts optional `apiKeyId`; SELECT list adds `api_key_id`; WHERE conditionally appends `AND api_key_id = $3`:

```typescript
export async function queryUsageByUser(opts: {
  userId: string; since?: Date; apiKeyId?: string
}): Promise<UsageRow[]> {
  // ... params start with [userId, since] ...
  if (opts.apiKeyId) {
    params.push(opts.apiKeyId)
    whereExtras = ` AND api_key_id = $${params.length}`
  }
  // SELECT now includes api_key_id; WHERE = "user_id = $1 AND created_at >= $2{whereExtras}"
}
```

`queryUsageAll` mirrors the same pattern in the dynamic-builder branch (parameterized, never string-concatenated — T-62-01 mitigated).

### Test outcomes

| Test | File | Status | Owner |
|------|------|--------|-------|
| FR-BROKER-E1-01: api_key_id column + FK + partial index | schema-migration.test.ts | GREEN (after Task 2) | this plan |
| FR-BROKER-E1-02: bearer auth → apiKeyId propagated | capture-middleware.test.ts | RED | Plan 62-02 |
| FR-BROKER-E1-02: url-path auth → apiKeyId is null | capture-middleware.test.ts | RED | Plan 62-02 |
| FR-BROKER-E1-03: OpenAI streaming + apiKeyId set | integration.test.ts | RED | Plan 62-02 + 62-05 |
| All other usage-tracking tests (40 of them) | parse-usage / aggregations / database / routes / integration / capture-middleware | GREEN | n/a |

Test fixture patches (apiKeyId: null) added to:
- `database.test.ts` — `T1` insertUsage fixture (1 insertion)
- `aggregations.test.ts` — `makeRow` factory (1 insertion, used by all 6 tests in the file)

### Sacred file

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← MATCHES expected SHA
```

UNCHANGED start to end of plan.

## Decisions Made

- **`ON DELETE SET NULL` over `CASCADE`** — historical attribution must survive even if a key row is hard-deleted (Phase 59 soft-deletes via `revoked_at`, but the FK is defense-in-depth per CONTEXT.md decisions §`broker_usage` Schema Migration).
- **`api_key_id` at SQL position 3** — between `app_id` and `model` so `insertUsage`'s 8-param array order matches schema column order verbatim. Easier mental model for code-readers; avoids two-place edits when adding future columns.
- **Partial index `WHERE api_key_id IS NOT NULL`** — most pre-Bearer rows are NULL forever; a full index would waste B-tree space without query benefit (RESEARCH.md Pattern 1).
- **Additive optional `apiKeyId` on queries** — backwards-compat: existing callers (Plan 44 routes that don't yet pass apiKeyId) still compile and behave identically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Schema-migration RED test regex too narrow**
- **Found during:** Task 2 (after applying schema.sql migration, the FR-BROKER-E1-01 test was still failing on the `partial index` assertion).
- **Issue:** My Task 1 outer regex used `idx_broker_usage_api_key_id[^\n]*` to capture the partial-index block — but the index spans 3 lines (`CREATE INDEX … \n ON broker_usage(...) \n WHERE …;`), so the captured `block` substring stopped at the first newline and the inner multi-line index regex never had a chance to match.
- **Fix:** Widened the outer regex to `[\s\S]*?WHERE api_key_id IS NOT NULL\s*;` so the whole 3-line index block is captured.
- **Files modified:** `livos/packages/livinityd/source/modules/usage-tracking/schema-migration.test.ts`
- **Verification:** FR-BROKER-E1-01 went GREEN after the regex fix (with the schema.sql migration already applied).
- **Committed in:** `fd0a75a6` (Task 2 commit).

**2. [Rule 3 - Blocking] aggregations.test.ts makeRow factory missing api_key_id**
- **Found during:** Task 2 typecheck.
- **Issue:** Adding `api_key_id: string | null` to `UsageRow` made the existing `makeRow` factory in `aggregations.test.ts` fail typecheck for every test (6 failures cascaded from one fixture).
- **Fix:** Added `api_key_id: null` to the `makeRow` factory's default object — same one-line collateral the plan already prescribed for `database.test.ts:T1`.
- **Files modified:** `livos/packages/livinityd/source/modules/usage-tracking/aggregations.test.ts`
- **Verification:** All 6 aggregations tests still GREEN; usage-tracking-module typecheck now reports only the expected `capture-middleware.ts:53` handoff error.
- **Committed in:** `fd0a75a6` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 3 blocking-fixture).
**Impact on plan:** Both auto-fixes were collateral to the planned shape changes — no new scope, no new files, no new contracts. The plan already anticipated `database.test.ts` fixture patching; the aggregations file is the same pattern, one degree deeper. No deviations affect the Wave 1/2 contract.

## Issues Encountered

None — both tasks executed cleanly. The 3 RED tests at end of plan are intentional Wave 0 contracts owned by downstream plans, not failures.

## D-NO-NEW-DEPS Audit

GREEN. Zero new dependencies installed; zero `package.json` edits. Only used existing `pg`, `vitest`, and language-built-ins.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Wave 2 is unblocked. Three plans are now parallel-eligible because they all consume the Wave 1 contract independently:

| Plan | Consumes from Wave 1 | Greens RED |
|------|----------------------|------------|
| 62-02 capture-middleware | `UsageInsertInput.apiKeyId` field | E1-02 ×2 + E1-03 (apiKeyId leg) |
| 62-03 usage-router-filter | `queryUsageByUser` / `queryUsageAll` `apiKeyId?` opts | (Wave 2/3 own UI tests) |
| 62-04 UI (settings tabs) | tRPC route shape (after 62-03) | (own UI unit tests) |
| 62-05 integration | E1-03 streaming usage chunk wiring | E1-03 (token leg) |

**Handoff signal preserved intentionally:** `livinityd typecheck` fails ONLY on `capture-middleware.ts:53` (missing `apiKeyId` in `insertUsage` call). Plan 62-02's first commit closes that error. Any other typecheck regression in `usage-tracking/` would be a Wave 1 escape and should be raised before Wave 2.

**Sacred SHA invariant:** `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` at end of plan.

## Self-Check: PASSED

- All 7 modified files present on disk
- Both commits found in `git log`: `434967c0` (test) + `fd0a75a6` (feat)
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at end of plan

---
*Phase: 62-usage-tracking-settings-ui*
*Completed: 2026-05-03*
