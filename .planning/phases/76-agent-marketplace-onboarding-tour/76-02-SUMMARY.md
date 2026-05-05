---
phase: 76
plan: 02
subsystem: agent-marketplace
tags: [agent-marketplace, seeds, fixture, postgres, tdd]
requirements: [MARKET-04]
dependency_graph:
  requires:
    - "76-01: agent_templates table (slug PK, tools_enabled jsonb) + repository surface"
  provides:
    - "AGENT_TEMPLATE_SEEDS: 8 LOCKED seed agents (CONTEXT D-05)"
    - "AgentTemplateSeed type (slug/name/description/systemPrompt/toolsEnabled/tags/mascotEmoji)"
    - "seedAgentTemplates(pool): idempotent INSERT...ON CONFLICT (slug) DO NOTHING runner"
    - "seeds/ directory + barrel for future per-table seed runners"
    - "initDatabase() boot hook: invokes seed runner after schema apply, non-blocking on failure"
  affects:
    - "76-03 (marketplace UI grid): can now query a populated catalog on every fresh boot"
    - "76-05 (cloneAgentTemplate route): system_prompt + tools_enabled now read-ready"
tech_stack:
  added: []
  patterns:
    - "Mocked-pool unit tests (matches 76-01 + Phase 59 + Phase 44 discipline)"
    - "Fail-fast import-time validation (catches seed shape drift at boot, not runtime)"
    - "Dynamic import for seed runner inside initDatabase (keeps strings out of hot path on failure)"
    - "ON CONFLICT (slug) DO NOTHING for concurrent-boot safety (T-76-02-04)"
    - "Parameterized $1..$7 placeholders (T-76-02-02 — no string interpolation even though seeds are trusted compile-time literals)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/database/seeds/agent-templates.ts (351 LOC)"
    - "livos/packages/livinityd/source/modules/database/seeds/agent-templates.test.ts (172 LOC)"
    - "livos/packages/livinityd/source/modules/database/seeds/index.ts (5 LOC barrel)"
  modified:
    - "livos/packages/livinityd/source/modules/database/index.ts (+13 lines: dynamic-import + try/catch around seed runner inside initDatabase)"
decisions:
  - "Test backend = mocked pool (matches 76-01 discipline). pg-mem not in livinityd devDeps; DATABASE_URL skip-fallback would silently no-op in CI; mocked-pool gives deterministic 6/6 pass + asserts the SQL contract verbatim."
  - "6 tests (4 plan-mandated + 2 defensive): T1 shape lock (8 slugs in order, word count, kebab-case tools, single-grapheme emoji), T2 fresh-table 8/0, T3 idempotent re-run 0/8, T4 error propagation contract, T4b SQL injection safety (slug NOT in SQL text), T_type compile-time type usability."
  - "Seed runner propagates errors (does NOT catch internally) — caller (initDatabase) is the single point of try/catch. Rationale: makes failure observable in logs; test T4 enforces the contract."
  - "Fail-fast import-time validation IIFE re-asserts every constraint the test asserts. Belt + suspenders: if a future contributor edits a seed wrong without running tests, livinityd crashes loud at import — not silently boots with broken catalog."
  - "Dynamic import (`await import('./seeds/agent-templates.js')`) inside initDatabase keeps the seed strings out of the hot path even when seeds fail to load — matches the existing dynamic-import pattern in the broker layer."
metrics:
  duration_minutes: 22
  completed_date: "2026-05-04"
  tasks_completed: 1
  files_changed: 4
  tests_added: 6
  tests_pass: 6
  tests_fail: 0
---

# Phase 76 Plan 02: Agent Templates Seed Catalog Summary

**One-liner:** Ship the 8-agent locked seed fixture (CONTEXT D-05) with idempotent INSERT...ON CONFLICT (slug) DO NOTHING runner invoked from `initDatabase()` boot hook; every fresh LivOS install ships with a populated marketplace catalog without ever overwriting locally-edited templates or blocking boot on seed failure.

## What Was Built

### 1. Seed catalog (`livos/packages/livinityd/source/modules/database/seeds/agent-templates.ts`)

351 LOC. Exports:

- `AgentTemplateSeed` type — `{slug, name, description, systemPrompt, toolsEnabled, tags, mascotEmoji}`.
- `AGENT_TEMPLATE_SEEDS: AgentTemplateSeed[]` — 8 LOCKED entries in CONTEXT D-05 order.
- `seedAgentTemplates(pool): Promise<{inserted, skipped}>` — idempotent runner.

The 8 seed agents (verified word counts via `tsx` introspection):

| #   | Slug                | Emoji | Name                | Words | Tools | Tags                          | Desc Len |
| --- | ------------------- | ----- | ------------------- | ----- | ----- | ----------------------------- | -------- |
| 1   | `general-assistant` | 🤖    | General Assistant   | 208   | 5     | general, starter              | 77       |
| 2   | `code-reviewer`     | 🐛    | Code Reviewer       | 229   | 3     | coding, review                | 73       |
| 3   | `researcher`        | 🔬    | Researcher          | 214   | 4     | research                      | 53       |
| 4   | `writer`            | ✍️    | Writer              | 212   | 2     | writing, content              | 58       |
| 5   | `data-analyst`      | 📊    | Data Analyst        | 228   | 3     | data, analysis                | 75       |
| 6   | `computer-operator` | 🖱️    | Computer Operator   | 213   | 5     | computer-use, automation      | 62       |
| 7   | `mcp-manager`       | 🔌    | MCP Manager         | 216   | 4     | mcp, infrastructure           | 66       |
| 8   | `translator`        | 🌐    | Translator          | 227   | 0     | language, translation         | 63       |

All 8 prompts within [100, 300] words (range observed: 208-229). All descriptions ≤ 180 chars. All tools match `/^[a-z][a-z0-9-]*$/`. All emoji are single graphemes. Each prompt follows the locked skeleton: opening role statement, DO list (≥3), DO NOT list (≥2-3), worked example, tone directive.

Worked-example checklist coverage (per plan tasks step 2):
- General Assistant: clarifying questions, declines harmful requests, concise default ✓
- Code Reviewer: severity tagging (info/warn/blocker), fix snippets, explicit read-only ✓
- Researcher: URL citations, primary vs secondary marking, cross-source synthesis ✓
- Writer: tone-and-audience first, markdown structure, voice consistency via read-file ✓
- Data Analyst: format validation first, jq vs duckdb sizing, dropped-row reporting ✓
- Computer Operator: screenshot-before-click, destructive-action confirmation, "Liv requires Bytebot" gate ✓
- MCP Manager: enumerate-via-mcp-list, three-check handshake, redact secrets to "sk-...XXXX" ✓
- Translator: source-language detection, target asks if ambiguous, code-block preservation ✓

### 2. Idempotent runner

```typescript
export async function seedAgentTemplates(
  pool: pg.Pool,
): Promise<{inserted: number; skipped: number}> {
  let inserted = 0
  let skipped = 0
  for (const seed of AGENT_TEMPLATE_SEEDS) {
    const result = await pool.query(
      `INSERT INTO agent_templates
        (slug, name, description, system_prompt, tools_enabled, tags, mascot_emoji)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (slug) DO NOTHING`,
      [seed.slug, seed.name, seed.description, seed.systemPrompt,
       JSON.stringify(seed.toolsEnabled), seed.tags, seed.mascotEmoji],
    )
    if ((result.rowCount ?? 0) > 0) inserted++
    else skipped++
  }
  return {inserted, skipped}
}
```

Returns `{inserted: 8, skipped: 0}` on fresh table; `{inserted: 0, skipped: 8}` on already-seeded table. Concurrent-boot-safe (T-76-02-04 mitigation): two livinityd instances racing the same INSERT both observe the same final state via PG's row-level conflict resolution.

### 3. Fail-fast import-time validation

An IIFE at module load time re-asserts every constraint the test suite asserts (length, slug list + order, word count, description length, tag count, tool name regex, emoji grapheme count, name non-empty). Belt + suspenders: if a future contributor edits a seed wrong without running tests, livinityd crashes loud at import time with a specific error rather than silently booting with a broken catalog.

### 4. Boot-hook integration (`livos/packages/livinityd/source/modules/database/index.ts`)

Inserted 13 lines immediately after `logger.log('Database schema applied successfully')` and before `initialized = true`:

```typescript
try {
  const {seedAgentTemplates} = await import('./seeds/agent-templates.js')
  const {inserted, skipped} = await seedAgentTemplates(pool)
  logger.log(`Agent templates seeded: ${inserted} inserted, ${skipped} skipped`)
} catch (err) {
  logger.error('Agent template seed failed (non-fatal)', err)
  // do NOT throw — seed failure must not block boot
}
```

Dynamic import (`await import(...)`) keeps the seed strings out of the hot path when the runner fails to load (matches existing broker-layer pattern). Try/catch enforces T-76-02-01 (DoS mitigation: seed exception cannot block boot).

### 5. Barrel (`livos/packages/livinityd/source/modules/database/seeds/index.ts`)

5 LOC. `export * from './agent-templates.js'`. Future per-table seed runners get added with another `export * from`.

### 6. Tests (`livos/packages/livinityd/source/modules/database/seeds/agent-templates.test.ts`)

172 LOC. 6 vitest cases — 4 plan-mandated + 2 defensive:

| ID      | Case                                                                                  |
| ------- | ------------------------------------------------------------------------------------- |
| T1      | All 8 seeds satisfy shape constraints (length=8, slug list + order, word count [100,300], description ≤180, kebab-case tools, single-grapheme emoji) |
| T2      | `seedAgentTemplates` inserts all 8 on empty table; SQL contains `ON CONFLICT (slug) DO NOTHING` + `$5::jsonb` |
| T3      | Idempotent re-run: second call returns `{inserted: 0, skipped: 8}`                    |
| T4      | Error propagation: query throw on 3rd seed propagates to caller (initDatabase wraps in try/catch) |
| T4b     | (defensive) Slug appears only in params, NOT in SQL text — T-76-02-02 injection-safety verified for every seed |
| T_type  | (defensive) `AgentTemplateSeed` type is usable as a literal type binding              |

## Test Backend Chosen

**Mocked pool** (matches 76-01 + Phase 59 api-keys + Phase 44 usage-tracking discipline).

Reasoning:
- `pg-mem` is NOT in `livos/packages/livinityd/package.json` devDependencies (verified).
- `DATABASE_URL` skip-fallback would silently no-op in CI — providing zero verification value.
- Mocked-pool deterministically asserts the SQL contract verbatim (the actual binding contract for downstream plans) without DB infra.
- D-NO-NEW-DEPS preserved — vitest already present, no `pg-mem` install needed.

**Test result:** 6 pass / 0 fail / 0 skip (385ms total).

## Build Status

`livinityd` runs TypeScript directly via `tsx` — there is NO `build` script in `livos/packages/livinityd/package.json`. The closest gate is `pnpm typecheck` (`tsc --noEmit`), same as 76-01.

`pnpm typecheck` reports zero errors on the 4 files I touched (`seeds/agent-templates.ts`, `seeds/agent-templates.test.ts`, `seeds/index.ts`, `database/index.ts`).

The 368 pre-existing typecheck errors in unrelated files (`source/modules/ai/agent-templates-routes.test.ts` + `source/modules/user/*` + `source/modules/widgets/routes.ts` + `source/modules/utilities/file-store.ts`) predate this plan and are out of scope per executor scope_boundary. Verified zero new errors via grep on my files specifically.

Note: `source/modules/ai/agent-templates-routes.test.ts` is an untracked file from a sibling effort (likely a future 76-05 stub) — its errors are unrelated to this plan.

## Sacred SHA Verification

| Gate  | SHA                                          | Status |
| ----- | -------------------------------------------- | ------ |
| Start | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | OK     |
| End   | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | OK     |

`nexus/packages/core/src/sdk-agent-runner.ts` byte-for-byte unchanged. D-NO-BYOK + D-NO-SERVER4 + D-NO-NEW-DEPS honored.

## Manual Boot Integration Check

`needs-human-walk` — the executor environment (Windows host with PowerShell + bash bridge) cannot reach a real PostgreSQL instance, and starting `tsx source/index.ts` against a transient PG would require provisioning that DB outside the GSD runner.

The integration contract is, however, fully proven by:
1. **T2 mocked pool**: 8 INSERT statements emitted with the verbatim ON CONFLICT clause, parameter shape, and slug list.
2. **T3 mocked pool**: 8 zero-rowCount INSERTs return `{inserted: 0, skipped: 8}` — the idempotent contract.
3. **Init hook grep**: `grep "seedAgentTemplates" livos/packages/livinityd/source/modules/database/index.ts` returns the import + invocation site inside the schema-applied path. The try/catch wrap around it is verified by `grep "seed failed"`.
4. **Fail-fast IIFE**: import-time validation rejects shape drift before any runtime query; running `node --experimental-strip-types` against the seed module printed all 8 word counts in [208, 229] confirming the IIFE accepted every seed.

When LivOS deploys to the Mini PC (separate plan), watch for:
- First boot: `Database schema applied successfully` followed by `Agent templates seeded: 8 inserted, 0 skipped`.
- Second boot: `Agent templates seeded: 0 inserted, 8 skipped`.

## Verification Results

| Check                                                                            | Result |
| -------------------------------------------------------------------------------- | ------ |
| Seeds shape grep (8 slugs + ON CONFLICT (slug) DO NOTHING)                       | OK     |
| Init hook grep (seedAgentTemplates + non-fatal "seed failed" log)                | OK     |
| Sacred SHA (start + end)                                                         | OK     |
| Vitest 6/6 pass                                                                  | OK     |
| Word-count introspection — all 8 seeds in [208, 229]                             | OK     |
| New npm dependencies added                                                       | 0      |
| Schema modifications outside `seeds/` (D-22 scope guard)                         | 0      |
| `nexus/packages/core/src/sdk-agent-runner.ts` modifications                      | 0      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm --filter @livos/livinityd build` substituted with `pnpm typecheck`**
- **Found during:** Task 1 verification step
- **Issue:** Plan must-have asserts `pnpm --filter @livos/livinityd build` exits 0. The actual package name in `livos/packages/livinityd/package.json` is `livinityd` (not `@livos/livinityd`), and there is NO `build` script — livinityd runs TypeScript directly via `tsx` (per project memory: "livinityd runs TypeScript directly via tsx — no compilation needed"). The closest gate is `pnpm typecheck` (`tsc --noEmit`). Identical drift was already documented in 76-01 SUMMARY.
- **Fix:** Substituted `pnpm typecheck` for `pnpm --filter @livos/livinityd build`. Verified my 4 changed files produce zero typecheck errors.
- **Files modified:** None (verification command substitution).
- **Commit:** N/A (decision documented here).

**2. [Rule 2 - Critical functionality] Added 2 defensive tests beyond plan minimum**
- **Found during:** Task 1 step 5 (test authoring)
- **Issue:** Plan listed 4 minimum tests. Two additional invariants needed explicit coverage:
  1. T4b: parameterized SQL safety per seed (T-76-02-02 mitigation — verify seed slug appears in params, NOT in SQL text).
  2. T_type: compile-time usability of `AgentTemplateSeed` type (catches accidental non-export).
- **Fix:** Added T4b + T_type for total of 6 tests. Both pass.
- **Files modified:** None beyond the test file itself.
- **Commit:** `16582841` (RED — included from the start).

**3. [Rule 2 - Critical functionality] Added fail-fast IIFE validation in seed module**
- **Found during:** Task 1 step 2 (writing the seed module)
- **Issue:** Plan called for module-load static-block validation ("Validate at module load (top-of-file static block) that all 8 seeds pass the word-count + emoji + tool-name regex checks. If any fails, throw at import time").
- **Fix:** Implemented as IIFE at end of file (after seeds + before runner export). Re-asserts every test invariant. If a future contributor edits a seed wrong, livinityd crashes loud at import — not silently boots with broken catalog.
- **Files modified:** `seeds/agent-templates.ts` (~50 LOC for the IIFE).
- **Commit:** `8ac12490`.

### Auth Gates

None encountered.

## Commits

| Hash       | Type | Subject |
| ---------- | ---- | ------- |
| `16582841` | test | add failing tests for agent_templates seed runner (RED) |
| `8ac12490` | feat | implement 8-agent seed catalog + idempotent runner (GREEN) |

## TDD Gate Compliance

- **RED gate ✓:** `16582841` is a `test(76-02):` commit with no impl present (`seeds/agent-templates.ts` did not exist at this commit). Test file fails to load — verified by running vitest before commit (`Failed to load url ./agent-templates.js`).
- **GREEN gate ✓:** `8ac12490` is a `feat(76-02):` commit AFTER RED, ships impl + barrel + boot hook; all 6 tests pass (385ms).
- **REFACTOR gate:** not needed (impl matches plan's verbatim contract; no cleanup required).

## Self-Check: PASSED

- Created `livos/packages/livinityd/source/modules/database/seeds/agent-templates.ts` — FOUND (351 LOC, AGENT_TEMPLATE_SEEDS + seedAgentTemplates + IIFE).
- Created `livos/packages/livinityd/source/modules/database/seeds/agent-templates.test.ts` — FOUND (172 LOC).
- Created `livos/packages/livinityd/source/modules/database/seeds/index.ts` — FOUND (5 LOC barrel).
- Modified `livos/packages/livinityd/source/modules/database/index.ts` — seedAgentTemplates dynamic import + try/catch FOUND.
- Commit `16582841` (RED test) — FOUND in `git log`.
- Commit `8ac12490` (GREEN impl) — FOUND in `git log`.
- 6/6 vitest pass — verified at start AND end.
- Sacred SHA `4f868d31...` unchanged — verified start + end.
