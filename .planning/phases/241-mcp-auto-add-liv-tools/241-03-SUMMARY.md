---
phase: 241-mcp-auto-add-liv-tools
plan: 03
subsystem: livinityd / mcp-registrar
tags: [livinityd, mcp, aionui, orchestrator, sentinel, idempotent, tdd, vitest]

# Dependency graph
requires:
  - phase: 241
    plan: 01
    provides: readSystemMcpCatalog + transformRedisToAionUi + types (LivRedisEntry, AionUiCreateMcpServerRequest, AionUiServerRecord, SeedLogger, SeedResult, McpCatalogTarget)
  - phase: 241
    plan: 02
    provides: AionUiMcpClient (5 HTTP methods) + waitForAionUiReady (D-241-06 readiness loop)
provides:
  - seedAionUiMcpConfig(deps) — the single boot-time orchestrator (never throws)
  - MCP_SEED_SENTINEL_KEY constant — D-241-02 version-keyed Redis sentinel
  - SeedDeps interface — DI surface for livinityd index.ts wire-up
  - SeedRedisClient interface — minimal 3-method (hgetall/get/set) Redis surface
  - Module barrel index.ts re-exports all four new public symbols
affects: [241-04 (livinityd source/index.ts boot wire-up + Mini PC deploy walk)]

# Tech tracking
tech-stack:
  added: [] # zero new deps — pure composition over 241-01 + 241-02
  patterns:
    - "Seven-stage orchestration with per-stage try/catch — pure function never throws"
    - "Version-keyed Redis sentinel SET only when result.errored === 0 (Pitfall 2 guard)"
    - "Strict GET-and-skip per-tool name match (Pitfall 1 guard) — operator edits preserved"
    - "Conditional enable-toggle as a NON-fatal sub-stage (RESEARCH.md A2 acceptable degradation)"
    - "Mock-injected dependencies (client + waitForReady) for deterministic unit testing"
    - "TDD strict gate sequence: RED commit (test) precedes GREEN commit (feat)"

key-files:
  created:
    - livos/packages/livinityd/source/modules/mcp-registrar/seed.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/seed.test.ts
  modified:
    - livos/packages/livinityd/source/modules/mcp-registrar/index.ts # added 4 named exports

key-decisions:
  - "Sentinel set ONLY when result.errored === 0 — partial-failure state leaves sentinel unset so next boot retries (Pitfall 2 guard from RESEARCH.md)"
  - "Stage 5 sync-to-agents ALWAYS sends the FULL system-MCP set (not just newly-created) — robust against partial state from previous failed boots (RESEARCH.md §Idempotency Strategy step 6)"
  - "Stage 4b toggle-after-create failures are NON-fatal — server stays disabled, operator can manually flip later (RESEARCH.md A2 — acceptable degradation since EXISTS gate then preserves operator's flip on every future boot)"
  - "SeedDeps exposes optional client + waitForReady DI hooks defaulting to real impls — keeps unit tests deterministic without monkey-patching"
  - "Per-agent partial failures in syncToAgents are counted toward result.errored (each failed agent +1) so sentinel correctly stays unset until all 8 CLI configs are written successfully"
  - "Per-stage try/catch + outer try/catch defense in depth — orchestrator NEVER throws, livinityd boot continues even if redis or AionUi or anything else misbehaves catastrophically"

patterns-established:
  - "Boot-time orchestrator shape: async function(deps): Promise<SeedResult>; deps include redis + baseUrl + logger + optional DI; never throws"
  - "Sentinel key lives in module-scope const exported from seed.ts (MCP_SEED_SENTINEL_KEY) so the wire-up in 241-04 + future Phase 24X re-seed phases reference the same name"
  - "9-scenario test matrix (A-I) covering: idempotent-fast-path / first-boot / partial-resume / fully-customized / Pitfall-1-edit-preserved / readiness-timeout / Pitfall-2-sync-failed / per-tool-partial-failure / toggle-non-fatal"
  - "Test mock pattern: vi.fn()-wrapped client methods cast through unknown to AionUiMcpClient via asClient(m) helper — avoids needing a full class implementation in tests"

requirements-completed: [] # plan 241-03 frontmatter requirements field is null

# Metrics
duration: 4min
completed: 2026-05-28
---

# Phase 241 Plan 03: seedAionUiMcpConfig orchestrator Summary

**Single boot-time orchestrator (~165 lines) composing 241-01 + 241-02 building blocks into the 7-stage Idempotency Strategy from RESEARCH.md, gated by a version-keyed Redis sentinel and a strict GET-and-skip per-tool EXISTS check — 9 new unit tests covering all decision-flow branches (A-I scenarios), zero new dependencies, total mcp-registrar tests now 37/37 GREEN.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-28T17:40:48Z
- **Completed:** 2026-05-28T17:45:00Z
- **Tasks:** 1 (TDD with separate RED + GREEN commits = 2 commits for this plan)
- **Files created:** 2 (1 source + 1 test)
- **Files modified:** 1 (`index.ts` — added 4 named exports)

## Accomplishments

- **`seedAionUiMcpConfig`** ships as a single async function implementing the 7-stage Idempotency Strategy verbatim from RESEARCH.md:
  - **Stage 0 — sentinel short-circuit:** `redis.get('livos:v43:mcp_seeded:v1')` returns `'1'` → exit early with all-zero result, no I/O after.
  - **Stage 1 — readiness probe:** delegated to `waitForAionUiReady` (DI-injected for tests). Timeout returns false → leave sentinel UNSET so next boot retries.
  - **Stage 2 — catalog read:** delegated to `readSystemMcpCatalog`. Empty catalog or Redis throw → warn + early-return with sentinel unset.
  - **Stage 3 — GET existing servers:** `client.listServers()` builds the `existingNames` Set. Failure here aborts seed with `errored++` → sentinel stays unset.
  - **Stage 4 — per-tool decide:** for each of the 5 system MCP targets, if `existingNames.has(name)` → `skipped++` (Pitfall 1 guard — operator edits preserved); else `transformRedisToAionUi` + `client.createServer` → `created++`. Per-target try/catch ensures one bad payload doesn't abort the rest (Scenario H verified).
  - **Stage 4b — conditional toggle:** if `target.cfg.enabled === true` (currently only `luse`), follow create with `client.toggleServer(id, true)`. Toggle failures are NON-fatal (RESEARCH.md A2 — server stays disabled, operator can manually flip, EXISTS gate preserves the flip forever after). Scenario I verified.
  - **Stage 5 — sync-to-agents:** ALWAYS send the FULL 5-name set (not just newly-created) — robust against partial state from previous failed boots. Per-agent partial failures counted toward `result.errored`.
  - **Stage 6 — sentinel SET:** ONLY if `result.errored === 0` (Pitfall 2 guard — Scenario G verified). Even the sentinel SET itself is wrapped in try/catch so a Redis hiccup at the very last step leaves the result honest.
- **NEVER throws** — every stage has its own try/catch + an outer try/catch defense in depth. livinityd boot continues even if seedAionUiMcpConfig hits a catastrophic failure path. Scenario A through I all complete without rejection from the outer Promise.
- **9 unit tests (A-I)** comprehensively cover the decision-flow:
  - **A** (sentinel set) — no client calls; no waitForReady call; result is all-zero with sentinelSet:false
  - **B** (empty AionUi) — 5 creates + luse toggle + sync-all-5 + sentinel SET (the happy path, end-to-end)
  - **C** (partial AionUi) — 2 skipped + 3 created + sync-all-5; toggle NOT called for the already-existing luse
  - **D** (full AionUi) — 0 creates + 5 skipped + sync still runs + sentinel SET
  - **E** (Pitfall 1 — operator-edited luse) — 0 creates + 5 skipped; operator's custom `transport.command` preserved because EXISTS gate keeps registrar's hands off
  - **F** (readiness timeout) — 0 creates + sentinel UNSET; warn line logged; client never touched
  - **G** (Pitfall 2 — sync-to-agents fails after 5 creates) — sentinel UNSET; next boot retries
  - **H** (partial failure — liv-vault create fails) — 4 creates + 1 errored + sentinel UNSET; other 4 still went through (resilience)
  - **I** (Pitfall 4 / RESEARCH.md A2 — luse toggle fails) — 5 creates + sentinel SET; toggle failure does NOT increment errored (acceptable degradation)
- **Pitfall guards baked into the code AND verified by tests:**
  - **Pitfall 1** (re-POST clobbers operator edits): Scenario E asserts `createServer` is NEVER called for an already-present name; the operator's edited `transport.command` is preserved.
  - **Pitfall 2** (sentinel set too early): Scenarios F, G, H all assert `redis._setCalls === []` when any error occurred; the orchestrator gates `redis.set(MCP_SEED_SENTINEL_KEY, '1')` behind `result.errored === 0`.
  - **Pitfall 3** (wrong list endpoint): inherited from 241-02's `AionUiMcpClient.listServers()` which hits `/api/mcp/servers` (canonical), not `/api/extensions/mcp-servers` (different list).
  - **Pitfall 4** (`enabled` in create body): inherited from 241-02's `AionUiMcpClient.createServer()` which only carries the 5 fields probe-verified in RESEARCH.md §1; enable is a separate `POST /servers/{id}/toggle` call.
- **Zero new dependencies** — pure composition over existing 241-01 + 241-02 modules; vitest is already a devDep.
- **Module barrel `index.ts`** grows to 7 export blocks: `* from './types.js'` plus 6 named-export groups covering the full public API surface plan 241-04 will import.

## Task Commits

Task 1 followed TDD with separate RED + GREEN commits:

1. **Task 1 RED: failing seedAionUiMcpConfig tests (9 scenarios A-I)** — `8d9b1924` (test)
2. **Task 1 GREEN: implement seed.ts orchestrator + barrel export** — `f94a0852` (feat)

**Plan metadata commit:** (added in final docs commit after this SUMMARY.md is written)

## Files Created

- `livos/packages/livinityd/source/modules/mcp-registrar/seed.ts` — ~165 lines. `seedAionUiMcpConfig` async function + `MCP_SEED_SENTINEL_KEY` const + `SeedRedisClient` + `SeedDeps` interfaces. Pure composition; never throws.
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/seed.test.ts` — ~315 lines. 9 vitest cases covering the full A-I decision-flow matrix. FakeRedis helper tracks all `_setCalls` / `_getCalls` / `_hgetallCalls` for inspection; MockClient helper wraps the 5 `AionUiMcpClient` methods as `vi.fn()` shims; logger helper captures all info/warn/error lines for regex assertions.

## Files Modified

- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` — added a 4-symbol export block: `MCP_SEED_SENTINEL_KEY`, `seedAionUiMcpConfig`, `type SeedDeps`, `type SeedRedisClient`. No removals; preserves existing 241-01 + 241-02 exports.

## Deviations from Plan

None — plan executed exactly as written. No architectural changes. No authentication gates encountered. No checkpoints triggered. No auto-fix rules applied.

The RED phase failed as expected with `Failed to load url ../seed.js`. The GREEN phase passed all 9 scenarios on the first run (no iteration needed). Typecheck was clean on the first attempt — zero new errors anywhere in the mcp-registrar module.

## Verification

**Tests (all green — 37 cumulative across the module):**
```
cd livos/packages/livinityd && npx vitest run --no-coverage source/modules/mcp-registrar
 ✓ source/modules/mcp-registrar/__tests__/redis-catalog.test.ts (5 tests)
 ✓ source/modules/mcp-registrar/__tests__/transform.test.ts     (9 tests)
 ✓ source/modules/mcp-registrar/__tests__/ready-poll.test.ts    (5 tests)
 ✓ source/modules/mcp-registrar/__tests__/seed.test.ts          (9 tests)   ← NEW
 ✓ source/modules/mcp-registrar/__tests__/aionui-client.test.ts (9 tests)
Test Files  5 passed (5)
     Tests  37 passed (37)
```

**Typecheck (zero errors in mcp-registrar):**
```
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep -c mcp-registrar
0
```
(Pre-existing typecheck noise elsewhere in livinityd is out of scope.)

**Acceptance-criteria greps (all PASS):**

| Criterion | Grep | Expected | Actual |
|-----------|------|----------|--------|
| SENTINEL_KEY constant declared exactly once | `grep -c "MCP_SEED_SENTINEL_KEY = 'livos:v43:mcp_seeded:v1'" seed.ts` | 1 | 1 |
| Sentinel SET in exactly one place | `grep -c "redis.set(MCP_SEED_SENTINEL_KEY" seed.ts` | 1 | 1 |
| Sentinel guarded by `errored === 0` (Pitfall 2) | `grep -B3 "redis.set(MCP_SEED_SENTINEL_KEY" seed.ts \| grep -c "result.errored === 0"` | 1 | 1 |
| sync-to-agents always sends FULL set | `grep -c "targets.map((t) => t.name)" seed.ts` | 1 | 1 |
| Orchestrator never propagates throws | `grep "throw " seed.ts \| grep -v "comments"` | 0 actual statements | 0 (only JSDoc mentions) |
| Barrel exports complete surface for 241-04 | `grep -c "export" index.ts` | ≥6 | 7 |

**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — PRESERVED through both commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` reported on every commit).

## TDD Gate Compliance

Task 1 followed the strict RED → GREEN sequence with separate commits:

| Task | RED commit (test) | GREEN commit (feat) | Tests in RED | Tests in GREEN |
|------|--------------------|---------------------|--------------|----------------|
| 1 — seedAionUiMcpConfig | 8d9b1924 | f94a0852 | FAIL (Failed to load url ../seed.js) | 9/9 PASS |

No REFACTOR commit was needed — implementation passed cleanly on first GREEN with no iteration.

## Next Steps

Plan 241-04 (livinityd `source/index.ts` boot wire-up + Mini PC deploy walk) is now unblocked. It will:

1. Import `seedAionUiMcpConfig` from `./modules/mcp-registrar/index.js`
2. Add the invocation site `~/index.ts` line ~640 (per RESEARCH.md §livinityd Boot Hook Pattern) after the Phase 112 fallback, BEFORE the Phase 104 heartbeat wire-up
3. Wrap in a defense-in-depth try/catch (even though `seedAionUiMcpConfig` never throws) to log any catastrophic failure as a non-fatal warning
4. Build + deploy via `bash /opt/livos/update.sh` on Mini PC `bruce@10.69.31.68`
5. Operator UAT: open AionUi at `https://bruce.livinity.io/liv/` → Settings → MCP → verify all 5 system MCPs appear; verify luse shows as enabled; verify operator's edits survive a livinityd reboot

## Self-Check: PASSED

Verified before commit:
- `livos/packages/livinityd/source/modules/mcp-registrar/seed.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/seed.test.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` → FOUND (modified — added 4 named exports)
- Commit `8d9b1924` → FOUND (Task 1 RED)
- Commit `f94a0852` → FOUND (Task 1 GREEN)
- `vitest run source/modules/mcp-registrar` → 37/37 PASS
- `tsc --noEmit | grep mcp-registrar` → 0 errors
- Sacred SHA pre-commit hook → PASS on both commits
