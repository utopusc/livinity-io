---
phase: 246
plan: 02
subsystem: livos/packages/livinityd/pty-sessions
tags: [terminal, scrollback, redis, ring-buffer, tdd]
provides:
  - PTY_SESSION_SCROLLBACK_SUFFIX (':scrollback' drift-lock)
  - SCROLLBACK_MAX_LINES (10000 drift-lock, D-V44-TERMINAL-SCROLLBACK-RING)
  - buildScrollbackKey / appendScrollback / readScrollback / deleteScrollback
  - touchLastAttachAt (HSET on existing Phase 243 metadata hash)
  - PtyScrollbackRedisClient interface
requires:
  - PTY_SESSION_REDIS_PREFIX (Phase 243-01 — imported, NOT duplicated)
affects:
  - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel extended)
tech-stack:
  added: []
  patterns:
    - stateless DI module (every function takes the redis client — mirrors metadata.ts)
    - narrow Redis interface defined alongside the module (PtyScrollbackRedisClient lives in scrollback.ts, not types.ts — keeps Phase 243's PtyMetadataRedisClient unchanged per SC-05)
    - ring buffer via RPUSH + LTRIM key -N -1 (Redis-idiomatic bounded LIST)
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/scrollback.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/scrollback.test.ts
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts
decisions:
  - PtyScrollbackRedisClient defined in scrollback.ts (NOT types.ts) — Phase 243's PtyMetadataRedisClient stays untouched per SC-05
  - buildScrollbackKey reuses imported PTY_SESSION_REDIS_PREFIX — single source of truth for the prefix literal
  - touchLastAttachAt targets the metadata HASH key (no `:scrollback` suffix) — drift-lock asserted by test case 10
  - REFACTOR phase skipped — module is 101 lines, no duplication observed
metrics:
  duration: 2m
  tasks_completed: 3
  commits: 3
  tests_added: 10
  tests_total_module: 55
  files_created: 2
  files_modified: 1
  completed: 2026-05-28
---

# Phase 246 Plan 02: Redis scrollback ring + lastAttachAt persistence Summary

**One-liner:** Per-session Redis ring buffer at `livos:pty:session:<id>:scrollback` with `RPUSH` + `LTRIM key -10000 -1` bounded write, plus `touchLastAttachAt` HSET on the existing Phase 243 metadata hash — the data layer that lets 246-03 replay scrollback on reattach and lets 246-05 GC idle sessions.

## Tasks Executed

| Task | Name                                                                | Commit     |
| ---- | ------------------------------------------------------------------- | ---------- |
| 1    | RED — scrollback.test.ts (10 cases failing, module-not-found)       | `42000a6e` |
| 2    | GREEN — scrollback.ts implementation (10/10 tests pass)             | `8633add1` |
| 3    | Barrel re-exports scrollback ring + touchLastAttachAt               | `f7ca5006` |

## Files Created (2)

- `livos/packages/livinityd/source/modules/pty-sessions/scrollback.ts` — 101 lines (4 functions + 2 const + 1 interface)
- `livos/packages/livinityd/source/modules/pty-sessions/__tests__/scrollback.test.ts` — 148 lines (10 vitest cases)

## Files Modified (1)

- `livos/packages/livinityd/source/modules/pty-sessions/index.ts` — +12 lines (Phase 246-02 export block: 2 const + 4 functions + 1 type re-export)

## Drift-Locks

- **`PTY_SESSION_SCROLLBACK_SUFFIX === ':scrollback'`** — test case 1 asserts exact literal; module declares `as const`. Composes with Phase 243's prefix.
- **`SCROLLBACK_MAX_LINES === 10000`** — test case 2 asserts exact value (D-V44-TERMINAL-SCROLLBACK-RING). `as const` in module.
- **Key shape `livos:pty:session:<id>:scrollback`** — test case 3 asserts `buildScrollbackKey('abc') === 'livos:pty:session:abc:scrollback'`.
- **RPUSH before LTRIM** — test case 5 asserts `rpush.mock.invocationCallOrder[0] < ltrim.mock.invocationCallOrder[0]`.
- **`touchLastAttachAt` targets metadata HASH (NOT scrollback LIST)** — test case 10 asserts `redis.hset` first arg is `'livos:pty:session:abc'` AND `not.toContain(':scrollback')`.
- **Prefix reuse, no string duplication** — `grep -c "PTY_SESSION_REDIS_PREFIX" scrollback.ts` = 4 (1 import + 3 usages: buildScrollbackKey, touchLastAttachAt, etc.).
- **D-V44-SACRED:** `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits — sacred-sha pre-commit hook fired `PASS: 20 files verified` on each.

## Test Counts

| Module file                  | Cases  | Status |
| ---------------------------- | ------ | ------ |
| feature-flag.test.ts         | 4      | GREEN  |
| metadata.test.ts             | 6      | GREEN  |
| session.test.ts              | 10     | GREEN  |
| ws-handler.test.ts           | 13     | GREEN  |
| session-manager.test.ts      | 12     | GREEN  |
| scrollback.test.ts (new)     | **10** | GREEN  |
| **Total**                    | **55** | GREEN  |

Matches plan's "55 when 246-01 also shipped" target (45 baseline + 10 new). Plan's standalone "43 cumulative" arithmetic counted only 243-baseline (33) + scrollback (10) and excluded 246-01's SessionManager — both lines hold once you pick the relevant baseline.

## Sacred SHA Verify

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Preserved across all 3 commits (`42000a6e`, `8633add1`, `f7ca5006`).

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria

- [x] **SC-01:** `pnpm vitest run source/modules/pty-sessions/__tests__/scrollback.test.ts` → 10/10 green
- [x] **SC-02:** `pnpm vitest run source/modules/pty-sessions/__tests__/` → 55 baseline preserved (45 prior + 10 new = 55 total)
- [x] **SC-03:** `pnpm tsc --noEmit` zero new errors in pty-sessions (verified via `grep "source/modules/pty-sessions" | wc -l` = 0)
- [x] **SC-04:** D-V44-TERMINAL-SCROLLBACK-RING honored — `LTRIM key -10000 -1` after every `RPUSH` (drift-locked by test cases 5+6)
- [x] **SC-05:** PtyMetadataRedisClient interface UNCHANGED — new ops live in `PtyScrollbackRedisClient` defined alongside scrollback.ts (NOT in types.ts)
- [x] **SC-06:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits

## Threat Surface

The plan's `<threat_model>` covers scrollback surface (T-246-02-01 through 05). Mitigations enforced:

- **T-246-02-02 (DoS via RPUSH flood) — MITIGATED:** `LTRIM key -SCROLLBACK_MAX_LINES -1` after every `RPUSH` caps the LIST at 10000 entries. Memory bound ~10MB per session worst case.
- **T-246-02-03 (Key namespace collision) — MITIGATED:** all writes route through `buildScrollbackKey()` composing the locked prefix + sessionId (uuidv7, unguessable) + suffix.
- **T-246-02-05 (Unauth read) — MITIGATED at caller layer:** module enforces no auth; 243-02 cookie auth + feature flag gate all callers (documented contract).

No new threat surface introduced beyond the register. No `threat_flag:` entries needed.

## TDD Gate Compliance

- ✅ RED gate: `test(246-02): RED — pty-sessions scrollback ring tests (10 cases failing)` — commit `42000a6e`
- ✅ GREEN gate: `feat(246-02): GREEN — scrollback ring buffer (10/10 tests pass)` — commit `8633add1`
- REFACTOR gate skipped — 101-line module with no duplication observed

RED gate confirmed: vitest ran on the test file before the module existed and reported `Failed to load url ../scrollback.js` — no "test passing unexpectedly" risk encountered.

## Self-Check: PASSED

- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/scrollback.ts`
- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/__tests__/scrollback.test.ts`
- [x] scrollback.ts contains: `PTY_SESSION_SCROLLBACK_SUFFIX = ':scrollback'` exactly 1 occurrence
- [x] scrollback.ts contains: `SCROLLBACK_MAX_LINES = 10000` exactly 1 occurrence
- [x] scrollback.ts contains: `PTY_SESSION_REDIS_PREFIX` 4 occurrences (≥2 required)
- [x] scrollback.ts contains: `redis.ltrim` exactly 1 occurrence
- [x] scrollback.test.ts contains: `vi.fn()` 5 occurrences (≥5 required)
- [x] scrollback.test.ts contains: `':scrollback'` 4 occurrences (≥1 required)
- [x] scrollback.test.ts contains: `10000` 7 occurrences (≥1 required)
- [x] index.ts contains: `scrollback` 3 occurrences
- [x] index.ts contains: `from './scrollback.js'` exactly 2 occurrences (runtime + type)
- [x] FOUND commit `42000a6e` (Task 1 RED)
- [x] FOUND commit `8633add1` (Task 2 GREEN)
- [x] FOUND commit `f7ca5006` (Task 3 barrel)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- [x] `pnpm vitest run source/modules/pty-sessions/__tests__/` → 55/55 GREEN
- [x] `pnpm tsc --noEmit` → zero new errors in `source/modules/pty-sessions/`
