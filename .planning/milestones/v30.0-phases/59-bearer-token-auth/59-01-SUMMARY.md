---
phase: 59-bearer-token-auth
plan: 01
subsystem: testing
tags: [bearer-auth, test-infra, api-keys, vitest, tdd-red, sha-256]

# Dependency graph
requires:
  - phase: 56-research-spike
    provides: D-30-05 manual revoke + recreate (Stripe parity); D-30-07 sacred file untouched
  - phase: 44 (existing — usage-tracking)
    provides: schema-migration.test.ts + database.test.ts + routes.test.ts patterns mirrored
  - phase: 22 (existing — docker_agents)
    provides: token_hash + revoked_at + cleartext-once twin pattern (RESEARCH.md Pattern 1)
  - phase: 46 (existing — fail2ban-admin)
    provides: device_audit_log REUSE pattern with sentinel device_id
provides:
  - Six failing test files in `livos/packages/livinityd/source/modules/api-keys/`
  - Wave 1-3 contracts fully specified before any production code is written
  - schema.sql convention guard — ZERO `CREATE EXTENSION` lines locked in (RESEARCH.md Pitfall 6)
  - Mount-order assertion — Bearer middleware between usage capture (line 1228) and broker routes (line 1234)
  - Plaintext-never-stored regression guard (T-59-02)
  - Source-string assertion that listAll is wired as adminProcedure (T-59-04)
affects:
  - 59-02 (Wave 1 — schema migration + database.ts)
  - 59-03 (Wave 2 — cache + bearer-auth middleware)
  - 59-04 (Wave 3 — events + tRPC routes + httpOnlyPaths + mount)
  - 59-05 (Wave 4 — integration + UAT)

# Tech tracking
tech-stack:
  added: []  # NO new deps — D-NO-NEW-DEPS preserved
  patterns:
    - "Vitest RED-phase contract — module-not-found is the correct RED signal"
    - "vi.mock('../database/index.js') for PG-free unit tests (mirrors usage-tracking)"
    - "Source-string positional check (mirrors common.test.ts:160-178) for mount-order + adminProcedure invariants"
    - "Convention guard — assert ABSENCE of forbidden patterns to prevent regression"

key-files:
  created:
    - livos/packages/livinityd/source/modules/api-keys/database.test.ts (5 tests, FR-BROKER-B1-01..02 + B1-04)
    - livos/packages/livinityd/source/modules/api-keys/schema-migration.test.ts (4 tests, FR-BROKER-B1-01)
    - livos/packages/livinityd/source/modules/api-keys/mount-order.test.ts (1 test, FR-BROKER-B1-03)
    - livos/packages/livinityd/source/modules/api-keys/cache.test.ts (5 tests, cross-cutting)
    - livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts (8 tests, FR-BROKER-B1-03 + B1-05)
    - livos/packages/livinityd/source/modules/api-keys/routes.test.ts (7 tests, FR-BROKER-B1-04)
  modified: []

key-decisions:
  - "RESEARCH.md Open Question 1 closed — schema.sql will NOT include CREATE EXTENSION pgcrypto. Codebase convention (14× gen_random_uuid() without any CREATE EXTENSION line) wins over CONTEXT.md's pgcrypto suggestion. Locked in by schema-migration.test.ts T4 — any future drift adding the line is blocked at CI."
  - "RESEARCH.md Open Question 3 leaning — explicit cache.invalidate(hash) on revoke is the contract (synchronous propagation, not 5s TTL fallback). Locked in by routes.test.ts T4."
  - "Test fixture format: vi.mock('../database/index.js') — no real PG, no testcontainers. Matches usage-tracking precedent."

patterns-established:
  - "Pattern: convention guard via absent-pattern assertion (schema-migration.test.ts T4 asserts CREATE EXTENSION matches null) — locks in codebase invariants against silent regression"
  - "Pattern: plaintext-never-stored test by walking ALL queryMock.mock.calls params (database.test.ts T4) — defense against debug-induced regression"
  - "Pattern: source-string positional ordering (mount-order.test.ts) — Express middleware insertion order asserted as text-position invariant"

requirements-completed:
  - FR-BROKER-B1-01
  - FR-BROKER-B1-02
  - FR-BROKER-B1-03
  - FR-BROKER-B1-04
  - FR-BROKER-B1-05

# NOTE: This Wave 0 plan establishes the RED-phase test contract for all 5
# requirements but does NOT implement them. Final completion is via Waves 1-4.
# The requirements are listed here per plan frontmatter; mark-complete is run
# at the end of the wave that ships the GREEN implementation.

# Metrics
duration: 12min
completed: 2026-05-02
---

# Phase 59 Plan 01: Wave 0 RED Test Scaffolds Summary

**Six failing Vitest test files describing the exact contract for the new `api-keys/` module — TDD RED phase complete; production code does not yet exist.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-02T20:09:00Z
- **Completed:** 2026-05-02T20:18:00Z
- **Tasks:** 2/2
- **Files created:** 6

## Accomplishments

- Six failing test files (30 individual tests across 6 files) cover all 5 phase requirements (FR-BROKER-B1-01..05)
- Schema convention pre-flight evidence captured: `grep -c "CREATE EXTENSION" schema.sql = 0` — RESEARCH.md Open Question 1 closed
- Sacred file SHA pre-flight + post-flight identical: `4f868d318abff71f8c8bfbcf443b2393a553018b`
- Three threat-mitigation tests embedded (T-59-01 schema convention guard; T-59-02 plaintext-never-stored; T-59-04 mount-order + adminProcedure invariants)
- D-NO-NEW-DEPS preserved (zero npm dependencies added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema pre-flight + database/schema-migration/mount-order tests** — `34858a8c` (test)
2. **Task 2: cache + bearer-auth + routes tests** — `d07f78f2` (test)

**Plan metadata commit:** appended after this summary write.

## Files Created

| File | Tests | RED reason |
|------|-------|------------|
| `livos/packages/livinityd/source/modules/api-keys/database.test.ts` | 5 | Module not found: `./database.js` (Wave 1) |
| `livos/packages/livinityd/source/modules/api-keys/schema-migration.test.ts` | 4 (T1+T2+T3 RED, T4 already PASS — convention guard) | T1+T2+T3: api_keys block does not yet exist in schema.sql (Wave 1) |
| `livos/packages/livinityd/source/modules/api-keys/mount-order.test.ts` | 1 | `mountBearerAuthMiddleware` not yet referenced in `server/index.ts` (Wave 2/3) |
| `livos/packages/livinityd/source/modules/api-keys/cache.test.ts` | 5 | Module not found: `./cache.js` (Wave 2) |
| `livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts` | 8 | Module not found: `./bearer-auth.js` (Wave 2) |
| `livos/packages/livinityd/source/modules/api-keys/routes.test.ts` | 7 | Module not found: `./routes.js` (Wave 3) |

**Final test run (all 6 files):** `Test Files  6 failed (6)` · `Tests  4 failed | 1 passed (5)` (only the convention-guard test in schema-migration.test.ts can collect + pass at this stage; everything else fails at module-resolution before tests can be collected — exactly the RED signal the plan specifies).

## Pre-Flight Evidence

```
$ grep -c "CREATE EXTENSION" livos/packages/livinityd/source/modules/database/schema.sql
0

$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Both invariants held at Task 1 start, Task 1 end, Task 2 end, and SUMMARY-write time.

## Decisions Made

- **Open Question 1 closed:** schema.sql will NOT add `CREATE EXTENSION pgcrypto`. The codebase already uses `gen_random_uuid()` 14× with zero extension lines (Mini PC PG either has pgcrypto pre-installed OR runs PG 13+ where it's core). schema-migration.test.ts T4 is the convention lock-in.
- **Open Question 3 leaning:** explicit `cache.invalidate(key_hash)` is the contract; routes.test.ts T4 asserts it. The 5s negative-cache TTL becomes the failure-mode fallback only.
- **Test fixture choice:** `vi.mock('../database/index.js')` — no real PG, no testcontainers. Matches usage-tracking precedent.

## Deviations from Plan

None - plan executed exactly as written.

The plan called for ALL three test files in Task 1 to FAIL when run, and that is what happened (T4 of schema-migration.test.ts passes because it asserts the absence of `CREATE EXTENSION`, which is already true today; the plan explicitly documents this as the locked-in convention guard, not as a "premature pass" failure).

## Issues Encountered

None.

## Sacred File Audit

```
Pre-flight (Task 1 start):  4f868d318abff71f8c8bfbcf443b2393a553018b
Post-Task-1:                4f868d318abff71f8c8bfbcf443b2393a553018b
Post-Task-2 / Wave 0 end:   4f868d318abff71f8c8bfbcf443b2393a553018b
Match status: BYTE-IDENTICAL across all checkpoints
```

## D-NO-NEW-DEPS Audit

GREEN. No `package.json` modifications. Zero new dependencies. All test code uses pre-existing `vitest`, `@trpc/server`, `node:crypto` (built-in), and Node fs/path built-ins.

## Hand-off to Wave 1

Wave 1 (Plan 59-02) must:

1. Append the `api_keys` block to `livos/packages/livinityd/source/modules/database/schema.sql` (no `CREATE EXTENSION` line — locked by `schema-migration.test.ts T4`).
2. Create `livos/packages/livinityd/source/modules/api-keys/database.ts` with `createApiKey`, `findApiKeyByHash`, `revokeApiKey`, `listApiKeysForUser`, `listAllApiKeys`, `hashKey` exports matching the contract in `database.test.ts`.

When Wave 1 completes, the following Wave 0 RED tests must flip GREEN:

- `database.test.ts` — all 5 tests (T1..T5)
- `schema-migration.test.ts` — T1, T2, T3 (T4 stays green; it's the convention guard)

`mount-order.test.ts`, `cache.test.ts`, `bearer-auth.test.ts`, `routes.test.ts` remain RED until Waves 2-3.

## Next Phase Readiness

- Wave 0 complete — Wave 1 (schema + database.ts) is unblocked.
- All 6 test files double as executable specifications for Waves 1-3.
- Sacred file invariant locked at every commit checkpoint.
- D-NO-NEW-DEPS preserved.

## Self-Check: PASSED

Verified files exist on disk:
- FOUND: livos/packages/livinityd/source/modules/api-keys/database.test.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/schema-migration.test.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/mount-order.test.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/cache.test.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/routes.test.ts

Verified commits exist:
- FOUND: 34858a8c (Task 1)
- FOUND: d07f78f2 (Task 2)

Sacred SHA verified: 4f868d318abff71f8c8bfbcf443b2393a553018b (unchanged)

---
*Phase: 59-bearer-token-auth*
*Completed: 2026-05-02*
