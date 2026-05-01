---
phase: 41-anthropic-messages-broker
plan: 41-05
status: complete-locally
completed: 2026-04-30
type: tests-and-uat
---

# Plan 41-05 Summary — Tests + UAT + test:phase41 npm script

## Files Created (5 + 1 npm-script edit + 1 UAT)

| File | Purpose | Lines | Test cases |
|------|---------|-------|------------|
| `livos/packages/livinityd/source/modules/livinity-broker/translate-request.test.ts` | Pure-function translator unit tests | 95 | 8 |
| `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.test.ts` | SSE adapter event-order + wire-format tests | 117 | 4 |
| `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` | IP guard 9-IP test matrix | 110 | 9 |
| `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` | End-to-end mounted Express + mocked /api/agent/stream + mocked pg.Pool | 220 | 5 |
| `nexus/packages/core/src/providers/api-home-override.test.ts` | X-LivOS-User-Id → homeOverride wiring + source-grep mirror protection | 90 | 7 |
| `nexus/packages/core/package.json` | Adds `test:phase41` npm script | +1 line | — |
| `.planning/phases/41-anthropic-messages-broker/41-UAT.md` | Manual UAT checklist (9 sections, 34 steps) | 116 | — |

**New test cases this plan: 33** (8 + 4 + 9 + 5 + 7 — matches the plan's `<truths>` test-count budget)

## test:phase41 Result

```
$ cd nexus/packages/core && npm run test:phase41

  PASS Test 1-7 — api-home-override (Phase 41 wiring)
All api-home-override.test.ts tests passed (7/7)

  PASS Test 1-4 — sdk-agent-runner-home-override (Phase 40 plumbing)
All sdk-agent-runner-home-override.test.ts tests passed (4/4)

  PASS Test (a)/(b)/(c) — claude.ts API-key path / subscription mode / no-creds
All claude.test.ts tests passed (3/3)

  PASS — claude.ts contains zero `authToken:` occurrences
All no-authtoken-regression.test.ts tests passed (1/1)

  PASS — sdk-agent-runner.ts integrity verified (SHA: 623a65b9a50a89887d36f770dcd015b691793a7f)
All sdk-agent-runner-integrity.test.ts tests passed (1/1)
```

**Chained: 16/16 PASS** (7 + 4 + 3 + 1 + 1 = 16)

## Livinityd-side test results (run individually)

```
$ cd livos/packages/livinityd && \
    npx tsx ./source/modules/livinity-broker/translate-request.test.ts && \
    npx tsx ./source/modules/livinity-broker/sse-adapter.test.ts && \
    npx tsx ./source/modules/livinity-broker/auth.test.ts && \
    npx tsx ./source/modules/livinity-broker/integration.test.ts
```

- `translate-request.test.ts`: 8/8 PASS
- `sse-adapter.test.ts`: 4/4 PASS
- `auth.test.ts`: 9/9 PASS
- `integration.test.ts`: 5/5 PASS

**Total Phase 41 new tests passing: 26 (livinityd) + 7 (nexus) = 33/33.**

## Sacred File Verification

- Pre-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f`
- Post-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (unchanged across entire Phase 41)
- `git diff nexus/packages/core/src/sdk-agent-runner.ts` → empty
- Chained test:phase39 `sdk-agent-runner-integrity.test.ts` reports SHA match in test:phase41 every run

## 41-UAT.md Coverage

9 sections, 34 numbered manual steps:

| Section | Topic | Maps to ROADMAP criterion |
|---------|-------|---------------------------|
| A | Sync POST end-to-end | Criterion 1 (FR-BROKER-A-01, FR-BROKER-A-03) |
| B | SSE streaming end-to-end | Criterion 2 (FR-BROKER-A-02) |
| C | Per-user HOME isolation (admin) | Criterion 4 (FR-BROKER-A-04) |
| D | Cross-user isolation | Criterion 4 (FR-BROKER-A-04) |
| E | Container-network reachability | Criterion 1 from container side |
| F | IP guard rejects external traffic | Defense-in-depth check |
| G | AI Chat carry-forward (Phase 40 closure) | Phase 40 deferred work item #1 |
| H | Single-user mode regression | Byte-identical preservation |
| I | Sacred file integrity | Criterion 5 |

## Deviations from Plan

### [Rule 3 — Blocking] ESM module exports are immutable; integration test required pg.Pool patching instead

- **Found during:** integration.test.ts Task 2.
- **Issue:** Plan 41-05 example used `Object.defineProperty` to monkey-patch `findUserById` and `getAdminUser` exports of `database/index.ts`. Node 22 ESM exports are read-only — the assignment failed with `Cannot redefine property`.
- **Fix:** Patched `pg.Pool.prototype.connect` + `pg.Pool.prototype.query` BEFORE importing the database module, then called `initDatabase` so the module-level `pool` variable was set to a real `Pool` instance whose prototype methods are mocked. The mock `mockPoolQuery(sql, params)` dispatches on SQL substring patterns to return canned rows for the broker's `findUserById` and `getAdminUser` calls.
- **Files modified:** `integration.test.ts` (only the test file; production code untouched).

### [Rule 1 — Bug] Mocked fetch was over-broad; intercepted test's own broker call

- **Found during:** integration.test.ts Task 2 first run.
- **Issue:** First version of `mockUpstreamSse()` replaced `globalThis.fetch` with a stub returning SSE for ALL fetch calls — including the test's own fetch to the broker. Test 1 saw raw upstream SSE in the broker response body (the test's fetch to the broker returned the SSE stream directly because the mock intercepted it).
- **Fix:** Scoped the mock to only intercept calls whose URL contains `/api/agent/stream` — the test's fetch to `http://127.0.0.1:<port>/u/...` falls through to the real `fetch`, while the broker's internal fetch to `${LIV_API_URL}/api/agent/stream` is mocked.
- **Files modified:** `integration.test.ts` (test-only fix).

## Pointer

This is the final plan in Phase 41. Next artifact: `41-SUMMARY.md` (full phase summary, separate commit, written by the executor).
