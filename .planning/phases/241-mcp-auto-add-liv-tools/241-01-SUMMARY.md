---
phase: 241-mcp-auto-add-liv-tools
plan: 01
subsystem: livinityd / mcp-registrar
tags: [livinityd, mcp, aionui, redis, transform, tdd, vitest]

# Dependency graph
requires:
  - phase: 219
    provides: SYSTEM_MCP_NAMES + liv:mcp:config Redis hash (5 system MCPs)
  - phase: 223
    provides: liv-assistant systemd service on port 3020 (AionUi 2.1.4)
provides:
  - Pure-function transformRedisToAionUi (Liv catalog entry → AionUi CreateMcpServerRequest)
  - Pure-async readSystemMcpCatalog (HGETALL liv:mcp:config + filter + parse)
  - SeedLogger / SeedResult / McpCatalogTarget / AionUiServerRecord type contracts shared by plans 241-02/03/04
  - SYSTEM_MCP_NAMES tuple + SYSTEM_MCP_NAMES_SET duplicated locally (boot-time-safe, drift-locked by test)
  - Module barrel index.ts re-exporting the public API surface
affects: [241-02 (HTTP client), 241-03 (seed orchestrator), 241-04 (boot wire-up)]

# Tech tracking
tech-stack:
  added: [] # zero new deps — vitest + Node stdlib only
  patterns:
    - "TDD with vitest describe/expect/test pattern — co-located in source/modules/<name>/__tests__/"
    - "Boot-time-lightweight module shape: no transitive tRPC deps; SYSTEM_MCP_NAMES duplicated locally + lock-tested"
    - "Pure transform + pure async reader — no I/O outside dependency-injected redis.hgetall"

key-files:
  created:
    - livos/packages/livinityd/source/modules/mcp-registrar/types.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/transform.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/redis-catalog.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/index.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/transform.test.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/redis-catalog.test.ts
  modified: []

key-decisions:
  - "SYSTEM_MCP_NAMES duplicated in redis-catalog.ts (NOT imported from mcp-config-router.ts) to keep this boot-time module clear of the tRPC dep graph; drift-detection test locks the 5 names"
  - "transform.ts strips the enabled field on output (AionUi CreateMcpServerRequest has no enabled — enable via follow-up POST /api/mcp/servers/{id}/toggle, deferred to 241-03)"
  - "transform.ts conditionally spreads env/headers/description so no undefined leaks into the JSON payload (matches AionUi serde behavior verified in 241-RESEARCH §1)"
  - "TDD: RED commits (test + types only) precede GREEN commits (impl) — 4 commits total, gate sequence test→feat→test→feat"

patterns-established:
  - "TDD vitest layout: source/modules/<name>/__tests__/<file>.test.ts importing ../<file>.js with ESM .js suffix per livinityd convention"
  - "Test fake Redis: vi.fn() wrapping an in-memory hash, asserting the queried key matches the module's exported constant"
  - "Drift-detection test: a small unit test asserts that a duplicated constant exactly matches its 5-element source-of-truth tuple"

requirements-completed: [] # plan 241-01 frontmatter requirements field is null

# Metrics
duration: 5min
completed: 2026-05-28
---

# Phase 241 Plan 01: mcp-registrar foundation Summary

**Pure-function module skeleton for Phase 241's Liv→AionUi MCP seed — 6 new files under `livos/packages/livinityd/source/modules/mcp-registrar/`, 14 unit tests green, zero new deps, zero wire-up changes.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-28T00:20:32Z
- **Completed:** 2026-05-28T00:25:02Z
- **Tasks:** 2 (both TDD with separate RED + GREEN commits = 4 commits total)
- **Files created:** 6 (4 source + 2 test)
- **Files modified:** 0 outside the new module dir

## Accomplishments

- **`transformRedisToAionUi`** ships as a pure, side-effect-free function with 9 unit tests covering: stdio happy path, stdio args-default, stdio missing-command throw, http happy path, http missing-url throw, unknown transport throw, description present/absent, http headers passthrough, env-absence (no undefined leak).
- **`readSystemMcpCatalog`** ships as a pure async function with 5 unit tests covering: empty hash, non-system filtering, all-5-system-MCPs happy path, malformed-JSON skip-with-warn, and a SYSTEM_MCP_NAMES drift-detection lock.
- **Zero new dependencies** — built on vitest (already present) + Node stdlib only.
- **Boot-time safety preserved** — the new module imports zero tRPC-surface code; the SYSTEM_MCP_NAMES constant is duplicated locally + drift-locked by test, so plans 241-02/03/04 can be wired into livinityd boot without dragging in zod/openclaw-config-store.
- **AionUi API quirks honored** — `enabled` stripped from request body; `description`/`env`/`headers` conditionally spread to avoid undefined leaks. All quirks were probe-verified in 241-RESEARCH.md §1 against Mini PC liv-assistant 2.1.4.

## Task Commits

Each task followed TDD (RED commit then GREEN commit) and was committed atomically:

1. **Task 1 RED: failing transform tests + types skeleton** — `f9348bc2` (test)
2. **Task 1 GREEN: implement transformRedisToAionUi** — `788348af` (feat)
3. **Task 2 RED: failing redis-catalog tests** — `bebc3d9d` (test)
4. **Task 2 GREEN: implement readSystemMcpCatalog + module barrel** — `988a6ede` (feat)

**Plan metadata commit:** (added in final docs commit after this SUMMARY.md is written)

## Files Created

- `livos/packages/livinityd/source/modules/mcp-registrar/types.ts` — 6 exported interfaces (LivRedisEntry, AionUiCreateMcpServerRequest, AionUiServerRecord, SeedLogger, SeedResult, McpCatalogTarget)
- `livos/packages/livinityd/source/modules/mcp-registrar/transform.ts` — `transformRedisToAionUi(name, redisEntry) → AionUiCreateMcpServerRequest`; pure; throws on missing command/url/unknown transport
- `livos/packages/livinityd/source/modules/mcp-registrar/redis-catalog.ts` — `readSystemMcpCatalog(redis, logger) → Promise<McpCatalogTarget[]>`; exports `SYSTEM_MCP_NAMES`, `SYSTEM_MCP_NAMES_SET`, `MCP_CONFIG_REDIS_HASH_KEY`, `RedisCatalogClient`
- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` — module barrel: `export * from './types.js'` + named exports from transform + redis-catalog
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/transform.test.ts` — 9 vitest cases
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/redis-catalog.test.ts` — 5 vitest cases (including the drift-lock test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Typecheck] cast through unknown for enabled-must-be-undefined assertion**
- **Found during:** Task 2 typecheck sweep after Task 1 had already committed
- **Issue:** `(out as Record<string, unknown>).enabled` triggered TS2352 "neither type sufficiently overlaps" because `AionUiCreateMcpServerRequest` has no string-indexable signature
- **Fix:** Changed to `(out as unknown as Record<string, unknown>).enabled` per the TS error message's suggestion
- **Files modified:** `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/transform.test.ts`
- **Commit:** Bundled into Task 2 GREEN commit `988a6ede` (not worth a separate commit — single-line fix to a test assertion)

**2. [Documentation-only] Acceptance criterion grep regex satisfied semantically, not syntactically**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** The plan specified `grep -c "'luse', 'liv-docker', 'liv-system', 'liv-apps', 'liv-vault'"` expecting one hit. My redis-catalog.ts declares the tuple on multiple lines (one name per line) for readability, so the single-line grep returns 0.
- **Fix:** Verified the semantic intent — `grep -c "'luse'" redis-catalog.ts` returns exactly 1, confirming single source of truth for these names in the module.
- **Files modified:** none; documentation-only deviation
- **Commit:** none (no code change needed)

No architectural changes. No authentication gates encountered. No checkpoints triggered.

## Verification

**Tests (all green):**
```
cd livos/packages/livinityd && npx vitest run --no-coverage source/modules/mcp-registrar
✓ source/modules/mcp-registrar/__tests__/transform.test.ts (9 tests)
✓ source/modules/mcp-registrar/__tests__/redis-catalog.test.ts (5 tests)
Test Files  2 passed (2)
     Tests  14 passed (14)
```

**Typecheck (zero errors in new module):**
```
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep -c mcp-registrar
0
```
(Pre-existing typecheck errors elsewhere in the repo are out of scope — not introduced by this plan.)

**File inventory (exactly 6 files in the new module — matches plan output spec):**
```
livos/packages/livinityd/source/modules/mcp-registrar/__tests__/redis-catalog.test.ts
livos/packages/livinityd/source/modules/mcp-registrar/__tests__/transform.test.ts
livos/packages/livinityd/source/modules/mcp-registrar/index.ts
livos/packages/livinityd/source/modules/mcp-registrar/redis-catalog.ts
livos/packages/livinityd/source/modules/mcp-registrar/transform.ts
livos/packages/livinityd/source/modules/mcp-registrar/types.ts
```

**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — PRESERVED through all 4 commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` reported on every commit).

## TDD Gate Compliance

Both tasks followed the strict RED → GREEN sequence with separate commits:

| Task | RED commit (test) | GREEN commit (feat) | Tests in RED | Tests in GREEN |
|------|--------------------|---------------------|--------------|----------------|
| 1 — transform | f9348bc2 | 788348af | FAIL (Failed to load url ../transform.js) | 9/9 PASS |
| 2 — redis-catalog | bebc3d9d | 988a6ede | FAIL (Failed to load url ../redis-catalog.js) | 5/5 PASS |

No REFACTOR commits were needed — implementations passed cleanly on first GREEN.

## Next Steps

Plan 241-02 (HTTP client + readiness poll) and Plan 241-03 (seedAionUiMcpConfig orchestrator) can now proceed in parallel — they consume the type contracts and pure functions shipped here. Plan 241-04 (livinityd `index.ts` wire-up + Mini PC deploy) depends on 241-03 only.

## Self-Check: PASSED

Verified before commit:
- `livos/packages/livinityd/source/modules/mcp-registrar/types.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/transform.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/redis-catalog.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/transform.test.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/redis-catalog.test.ts` → FOUND
- Commit `f9348bc2` → FOUND (Task 1 RED)
- Commit `788348af` → FOUND (Task 1 GREEN)
- Commit `bebc3d9d` → FOUND (Task 2 RED)
- Commit `988a6ede` → FOUND (Task 2 GREEN)
