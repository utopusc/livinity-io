---
phase: 103
plan: 05
subsystem: computer-use
tags:
  - mcp
  - boot-cleanup
  - env-flag
  - tdd
  - idempotent-sweep
  - single-mcp
dependency-graph:
  requires:
    - 103-03-single-mcp-display-aware-tool-schema (provides per-call `display: ":N"` arg on 13 luse tools)
    - 103-04-prescriptive-display-arg-instruction (prompt instructs agent to pass `display` arg)
    - 100-10-09-cleanupLegacyBytebotState (idempotent + non-fatal boot-cleanup template + interfaces)
  provides:
    - "LIVOS_PER_APP_LUSE default OFF (only literal '1' opts in; was: anything-but-'0' default ON)"
    - "cleanupOrphanedPerWebAppLuseEntries({mcpConfigManager, logger?}) boot-time sweep"
    - "Wired in agent-runs.ts: cleanupLegacyBytebotState → cleanupOrphanedPerWebAppLuseEntries → registerLuseMcpServer"
  affects:
    - 103-06 (E2E acceptance — clean boot with single global luse MCP, no per-WebApp regs by default)
    - Mini PC deploy (existing luse:webapp:* entries in Redis are swept on next boot; no migration script needed)
tech-stack:
  added: []
  patterns:
    - "Strict-string env-flag pattern (`=== '1'` over `!== '0'`) — only the literal '1' opts in; matches Bytebot opt-ins"
    - "Idempotent + non-fatal boot cleanup mirroring cleanupLegacyBytebotState (Phase 100-10-09)"
    - "Defensive filter at trust boundary — `typeof name === 'string' && name.startsWith('luse:webapp:')` survives pathologically-shaped Redis blobs"
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
    - livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.ts
    - livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.test.ts
    - livos/packages/livinityd/source/modules/ai/agent-runs.ts
key-decisions:
  - "Gate inverted to `process.env.LIVOS_PER_APP_LUSE === '1'` — only literal '1' opts in. ' 1 ' / 'true' / 'yes' / 'on' / 'TRUE' / '2' all skip registration. Mirrors strict-string env-flag pattern used by Bytebot opt-ins elsewhere in the codebase."
  - "Orphan sweep filter is `typeof name === 'string' && name.startsWith('luse:webapp:')` — strict prefix + string-type guard. The global `luse` entry, `memory`, `bytebot`, and any other server are LEFT ALONE; only per-WebApp orphans match."
  - "Sweep runs BEFORE registerLuseMcpServer in agent-runs.ts boot block. Order is intentional: cleanupLegacyBytebotState (line 203) → cleanupOrphanedPerWebAppLuseEntries (line 227) → registerLuseMcpServer (line 238). Ensures the fresh `luse` registration is the only luse* entry visible to liv-core after boot — preventing Claude Code wildcard-permission prompts on stale luse:webapp:* descriptors."
  - "Sweep is non-fatal at three levels: (1) listServers throws → caught, logged via opts.logger.error, recorded in result.errors, returns early; (2) removeServer throws for one entry → continues with next, error recorded; (3) caller wraps in `.catch()` in agent-runs.ts as belt-and-suspenders. Boot continues regardless of cleanup outcome."
  - "Defensive non-string-name filter (`typeof s.name === 'string'`) added beyond plan spec — Redis JSON blobs are caller-controlled-ish (anyone with `liv:mcp:config` write access). Pathologically-shaped entries are silently filtered out rather than crashing boot. Test SWEEP-06 encodes this contract."
patterns-established:
  - "Strict-string env opt-in pattern: `if (process.env.FLAG === '1')` — only the literal '1' opts in, all other values (unset, '0', 'true', 'yes', ' 1 ', etc.) take the safe default path"
  - "Boot-time orphan-sweep template: defensive prefix filter + per-entry try/catch + result.errors accumulator + logger.log/error fallback. Mirrors cleanupLegacyBytebotState and is now the canonical shape for future McpConfigManager hygiene passes"
requirements-completed:
  - REQ-103-B5
metrics:
  duration: 22min
  completed: 2026-05-11
  tests_total: 51
  tests_added: 11
  commits: 4
---

# Phase 103 Plan 05: LIVOS_PER_APP_LUSE Default-Off + Orphan Sweep Summary

**Per-WebApp Luse MCP registration flipped OFF by default (only `LIVOS_PER_APP_LUSE=1` opts in), and boot-time `cleanupOrphanedPerWebAppLuseEntries` sweeps stale `luse:webapp:*` entries from McpConfigManager — closes the per-WebApp-MCP redundancy now that 103-03 + 103-04 ship the single-MCP display-aware path.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-11T~14:30 PT
- **Completed:** 2026-05-11T~14:50 PT
- **Tasks:** 2 (both TDD: RED + GREEN per task)
- **Commits:** 4 (2 RED + 2 GREEN)
- **Files modified:** 5
- **Tests added:** 11 (5 env-coverage on window-manager + 6 orphan-sweep on legacy-bytebot-cleanup)

## Accomplishments

- **Default-off flip:** `WebAppWindowManager.spawn()` no longer registers a per-WebApp Luse MCP unless `LIVOS_PER_APP_LUSE=1` is explicitly set. Eliminates Claude Code wildcard-permission prompts (one per WebApp registration) on every deploy and reduces MCP tool budget by ~80% (~17 tools instead of ~85 across 5 WebApps).
- **Boot-time orphan sweep:** New `cleanupOrphanedPerWebAppLuseEntries({mcpConfigManager, logger?})` removes any stale `luse:webapp:*` entries left in McpConfigManager from pre-103 deploys. Idempotent (re-run = no-op) + non-fatal (errors caught at three levels, boot always continues).
- **Wired into livinityd boot:** Sweep runs AFTER `cleanupLegacyBytebotState` and BEFORE `registerLuseMcpServer` so liv-core sees a clean MCP config blob on its first reconcile cycle after a livinityd restart.
- **Backwards-compat preserved:** Operators wanting the legacy per-app MCP path for debug / token-budget testing set `LIVOS_PER_APP_LUSE=1` explicitly. The descriptor + descriptor-validation + installServer path is unchanged.

## Task Commits

1. **Task 1 RED — failing tests for `LIVOS_PER_APP_LUSE` default-off** — `f2e7f2a2` (test) — `window-manager.test.ts +106 / -2`
2. **Task 1 GREEN — flip gate to `=== '1'`** — `65f8838c` (feat) — `window-manager.ts +18 / -8`, `window-manager.test.ts +8 / -2`
3. **Task 2 RED — failing tests for `cleanupOrphanedPerWebAppLuseEntries`** — `c15a9660` (test) — `legacy-bytebot-cleanup.test.ts +197 / -2`
4. **Task 2 GREEN — implement function + wire into agent-runs.ts** — `ca1b1f79` (feat) — `legacy-bytebot-cleanup.ts +95 / -1`, `agent-runs.ts +25 / -2`

## Files Created/Modified

- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — Flipped gate from `process.env.LIVOS_PER_APP_LUSE !== '0'` to `=== '1'`. Updated comment block to reference Phase 103-05 + 103-03/04 carry-forward, retire the Phase 102 r7 "REVERT default" rationale, and explain the strict-string opt-in semantics. Skip-branch log now says "(LIVOS_PER_APP_LUSE != '1', Phase 103-05 default-off). Agent uses the single global 'luse' MCP with per-call display arg."
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — Updated Test 16 + Test 18 to explicitly set `LIVOS_PER_APP_LUSE='1'` (they assert the legacy per-app installServer path; default-off now requires opt-in). Added new `describe('Phase 103-05 — LIVOS_PER_APP_LUSE default-off env coverage')` block with 5 tests covering: unset → not called, '0' → not called, '1' → called once, ambiguous strings ('true'/'yes'/'on'/'TRUE'/'2'/' 1 ') → not called, skip-branch log emission.
- `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.ts` — New exported `cleanupOrphanedPerWebAppLuseEntries(opts)` function alongside `cleanupLegacyBytebotState`. Lists every server in McpConfigManager, filters by `typeof name === 'string' && name.startsWith('luse:webapp:')`, calls `removeServer` on each. Idempotent + non-fatal. Internal three-level error containment: listServers catch → return early with errors entry; per-entry removeServer try/catch → continue, record error; removeServer-not-implemented guard → record error.
- `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.test.ts` — Added 6 new tests under `describe('cleanupOrphanedPerWebAppLuseEntries (Phase 103-05)')`: SWEEP-01 (removes only luse:webapp:* prefix), SWEEP-02 (listServers throws → caught + logged + non-throwing), SWEEP-03 (per-entry removeServer throws → continues + records errors + removes successes), SWEEP-04 (empty list → clean-state log), SWEEP-05 (idempotent — second run is a no-op), SWEEP-06 (defensive non-string-name filter).
- `livos/packages/livinityd/source/modules/ai/agent-runs.ts` — Added `cleanupOrphanedPerWebAppLuseEntries` to the existing `legacy-bytebot-cleanup` import. Inserted call between `cleanupLegacyBytebotState` and `registerLuseMcpServer` in the boot block, with the same `.catch()` belt-and-suspenders guard that catches anything that slips through the function's internal try/catch.

## Decisions Made

See frontmatter `key-decisions` for the full list. Summary:

1. **Strict-string opt-in** — `=== '1'` not `!== '0'`. Only literal '1' opts in. Mirrors Bytebot opt-in pattern elsewhere; eliminates "I set it to 'true' but it didn't work" confusion.
2. **Prefix + type guard** — sweep filter is `typeof name === 'string' && name.startsWith('luse:webapp:')`. Strict; never touches `luse`, `memory`, `bytebot`, or any other entry.
3. **Boot order: legacy-bytebot → orphan-sweep → register** — sweep runs before registerLuseMcpServer so the fresh `luse` is the only `luse*` entry on the first reconcile.
4. **Three-level non-fatal containment** — listServers / per-entry removeServer / outer `.catch()` in agent-runs.ts all catch. Boot continues regardless.
5. **Defensive non-string-name filter (beyond plan spec)** — added to T-103-05-SWEEP-06. Redis JSON blobs CAN be pathological; pathological entries are silently filtered, never crashing boot.

## Verification — Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `grep -F "process.env.LIVOS_PER_APP_LUSE === '1'" window-manager.ts` matches | matches (line 514) |
| `grep -F "process.env.LIVOS_PER_APP_LUSE !== '0'" window-manager.ts` does NOT match | confirmed (old gate removed) |
| `grep -F "Phase 103-05" window-manager.ts` matches | matches (comment + log) |
| `grep -F "default-off" window-manager.ts` matches | matches (skip log) |
| `pnpm vitest run window-manager.test.ts` — all 5 env-coverage tests pass | 40/40 pass (35 prior + 5 new under Phase 103-05) |
| `pnpm vitest run webapps/` — no regressions | 232/254 pass (22 skipped, same as baseline) |
| `export async function cleanupOrphanedPerWebAppLuseEntries` exists | matches |
| `startsWith('luse:webapp:')` in legacy-bytebot-cleanup.ts | matches (JSDoc + filter) |
| `cleanupOrphanedPerWebAppLuseEntries` appears ≥2× in agent-runs.ts | 3 occurrences (import + comment + call) |
| Boot-order line numbers A < B < C in agent-runs.ts | A=203, B=227, C=238 → A < B < C confirmed |
| `pnpm vitest run legacy-bytebot-cleanup.test.ts` — 5 new orphan-sweep tests pass | 11/11 pass (5 existing + 6 new) |
| `pnpm tsc --noEmit -p .` — 0 new errors in modified files | confirmed (grep on modified file paths returns no diagnostics) |

## Sacred SHA

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED across all 4 commits)
```

Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) fired and passed on commits `f2e7f2a2` (Task 1 RED), `65f8838c` (Task 1 GREEN), `c15a9660` (Task 2 RED), `ca1b1f79` (Task 2 GREEN). This plan touched only `livos/packages/livinityd/source/modules/` files — `liv/packages/core/src/*` is untouched.

## Threat Model Verification

| Threat ID | Component | Disposition | Status |
|-----------|-----------|-------------|--------|
| T-103-05-01 | `removeServer` iteration over McpConfigManager entries | mitigate | Strict filter `typeof s.name === 'string' && s.name.startsWith('luse:webapp:')` applied at entry of the for-loop. Only matching strings reach `removeServer`. SWEEP-01 verifies non-prefixed entries (`luse`, `memory`, `bytebot`) are untouched. SWEEP-06 verifies non-string names (`123`, `null`) are silently filtered. Errors caught + logged + never re-thrown. |
| T-103-05-02 | Slow `McpConfigManager.listServers()` on cold-boot Redis | accept | Cost is additive over the existing `cleanupLegacyBytebotState` call (which already pays the same `listServers` cost). No new I/O introduced — both functions share the same `luseConfigManager` instance constructed once before either runs. |

## Tests

**Coverage matrix:**

| Test ID | Behavior Verified |
|---------|-------------------|
| Test 21 (window-manager) | env unset → `installServer` NOT called |
| Test 22 (window-manager) | `LIVOS_PER_APP_LUSE='0'` → NOT called |
| Test 23 (window-manager) | `LIVOS_PER_APP_LUSE='1'` → called once (legacy opt-in) |
| Test 24 (window-manager) | `'true'`/`'yes'`/`'on'`/`'TRUE'`/`'2'`/`' 1 '` → NOT called (only literal '1') |
| Test 25 (window-manager) | skip branch emits "per-WebApp Luse MCP SKIPPED ... Phase 103-05 default-off" |
| SWEEP-01 (legacy-bytebot-cleanup) | removes ONLY `luse:webapp:*`; leaves `luse`, `memory`, `bytebot` intact |
| SWEEP-02 (legacy-bytebot-cleanup) | `listServers` throws → caught, logged via `opts.logger.error`, error recorded; never throws |
| SWEEP-03 (legacy-bytebot-cleanup) | per-entry `removeServer` throws → continues, records error, removes successes |
| SWEEP-04 (legacy-bytebot-cleanup) | empty list → 0 removed, "clean state" log emitted |
| SWEEP-05 (legacy-bytebot-cleanup) | idempotent — second run is a no-op (entries already gone) |
| SWEEP-06 (legacy-bytebot-cleanup) | defensive — non-string name fields silently filtered (never throws) |

**Test results:**

```
$ pnpm vitest run source/modules/webapps/window-manager.test.ts
Test Files  1 passed (1)
     Tests  40 passed | 22 skipped (62)

$ pnpm vitest run source/modules/computer-use/legacy-bytebot-cleanup.test.ts
Test Files  1 passed (1)
     Tests  11 passed (11)
```

Broader webapps/ suite: 232/254 pass (22 skipped, same as baseline — Phase 102-04 retired-test set).
Broader computer-use/ suite: 227/244 pass (17 pre-existing platform-specific failures unchanged from baseline — Windows tests that try to spawn Linux `xdotool`/`maim` binaries; same 17 failed on `git stash` of these changes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added non-string-name defensive filter (SWEEP-06)**
- **Found during:** Task 2 GREEN phase, while writing the orphan-sweep function
- **Issue:** Plan's filter was `name.startsWith('luse:webapp:')` only. Redis JSON blobs at `liv:mcp:config` are caller-controlled-ish (anyone with write access to that key can inject a non-string name field). If a pathological entry like `{name: 123}` or `{name: null}` survived the JSON parse, `startsWith` would throw at runtime and crash boot.
- **Fix:** Filter extended to `typeof s.name === 'string' && s.name.startsWith('luse:webapp:')`. Encoded as test SWEEP-06.
- **Files modified:** `legacy-bytebot-cleanup.ts`, `legacy-bytebot-cleanup.test.ts`
- **Verification:** SWEEP-06 passes — `{name: 123}` and `{name: null}` are silently filtered out; only the string-name entry is removed.
- **Committed in:** `ca1b1f79` (Task 2 GREEN)

**2. [Rule 2 - Missing Critical] Added removeServer-not-implemented guard**
- **Found during:** Task 2 GREEN phase
- **Issue:** `McpConfigManagerLike.removeServer?` is optional in its TypeScript shape (luse-mcp-config.ts:60). The existing `cleanupLegacyBytebotState` checks `typeof mcpConfigManager.removeServer === 'function'` before calling. My initial implementation called `removeServer` unconditionally — would throw `TypeError: opts.mcpConfigManager.removeServer is not a function` on a config manager that doesn't implement it.
- **Fix:** Added explicit guard `if (typeof opts.mcpConfigManager.removeServer !== 'function') { log + record error + continue; }`.
- **Files modified:** `legacy-bytebot-cleanup.ts`
- **Verification:** TypeScript compiles cleanly (the function is typed-optional on the interface). Test suite passes.
- **Committed in:** `ca1b1f79` (Task 2 GREEN)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical defensive guards).
**Impact on plan:** Both auto-fixes are pure additive defensive hardening — same idempotent + non-fatal contract the plan called for, with stricter trust-boundary guards. No scope creep.

## Issues Encountered

**1. Pre-existing test infra failure — agent-runs.test.ts ESM import**

`pnpm vitest run source/modules/ai/agent-runs.test.ts` fails at module resolution:
```
Error: Cannot find package '...node_modules/.pnpm/@liv+core@file+..+liv+packages...@anthropic-ai/claude-agent-sdk/index.js' imported from .../@liv/core/dist/sdk-agent-runner.js
```

Verified via `git stash` of my changes: identical failure with no changes applied. This is a pre-existing peer-dep resolution issue (the pnpm-linked `@liv/core` dist references `@anthropic-ai/claude-agent-sdk` which isn't hoisted into livinityd's resolution scope). NOT a regression from this plan — out of scope per `<scope_boundary>`.

**Workaround:** Verified the boot-order wiring via grep + line-number assertion in acceptance criteria, since the test file can't be executed in this environment. The wire-up is a 22-line additive edit to an existing boot block; reading the diff is sufficient to verify correctness.

**2. Minor typo in test fixture name expectation**

In test 23, my initial assertion was `'luse:webapp:example-webap'` (5 chars after dash). The real `mcpServerNameFor` takes `webappId.substring(0, 4)` so for `webappId='webapp-one'` the suffix is `'weba'`. Fixed before GREEN commit; not a deviation, just a typo.

## TDD Gate Compliance

| Gate | Commit | Verification |
|------|--------|--------------|
| Task 1 RED | `f2e7f2a2` | 4/5 new tests failed against unchanged source (Test 23 passed because the existing default-on path satisfied it). All failures matched expected new assertions. |
| Task 1 GREEN | `65f8838c` | 40/40 pass — 5 new env-coverage + 35 existing. The flipped gate (`=== '1'`) satisfies all 5 new assertions. |
| Task 2 RED | `c15a9660` | 6/6 new tests failed with `TypeError: cleanupOrphanedPerWebAppLuseEntries is not a function` against unchanged source. 5 existing `cleanupLegacyBytebotState` tests continue to pass. |
| Task 2 GREEN | `ca1b1f79` | 11/11 pass (5 existing + 6 new orphan-sweep). |

Gate sequence verified in `git log`: `test(103-05) → feat(103-05) → test(103-05) → feat(103-05)`.

## Carry-forward to 103-06 / Mini PC deploy

- **103-06** (E2E acceptance — Mini PC live walk): Open 2 WebApps. Verify in `journalctl -u livos --since today | grep -i "luse"`:
  - 1 × `[103-05 orphan-sweep] no luse:webapp:* entries found (clean state)` (or `removing N stale entries` on the first boot after deploy).
  - 2 × `webapp <id>: per-WebApp Luse MCP SKIPPED (LIVOS_PER_APP_LUSE != '1', Phase 103-05 default-off).` (one per WebApp spawn).
  - 0 × `per-WebApp Luse MCP registered` (would indicate the gate broke).
  - 0 × Claude Code wildcard-permission prompts on liv-core connect.
- **Token budget:** With 5 WebApps open, MCP tool surface should reduce from ~85 tools (5 × 17 per-app `mcp__luse:webapp:*` + 17 host `mcp__luse__*`) to ~17 (single global luse). Verify with `liv:cap:tool:mcp_luse_*` Redis key count.
- **Operator escape hatch:** `LIVOS_PER_APP_LUSE=1` in `/opt/livos/.env` re-enables per-app MCP registration for debug. The descriptor / validateDescriptorDisplay / installServer path is unchanged and still works.

## Next Phase Readiness

103-05 is the final code-only plan in Phase 103 sub-goal B. After this:
- 103-06 is the user-walked Mini PC deploy + UAT (`bash /opt/livos/update.sh` then verify the journalctl signals above + observed agent transcripts).
- Phase 103 SUMMARY rolls up sub-goal A (Master Chrome streaming, 103-01/02) + sub-goal B (single-MCP display-aware, 103-03/04/05).

No blockers introduced. The orphan sweep runs idempotently on every boot, so deploys with stale Redis are self-healing.

## Self-Check

- File: `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — FOUND
- File: `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — FOUND
- File: `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.ts` — FOUND
- File: `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.test.ts` — FOUND
- File: `livos/packages/livinityd/source/modules/ai/agent-runs.ts` — FOUND
- Commit `f2e7f2a2` (Task 1 RED) — FOUND in `git log`
- Commit `65f8838c` (Task 1 GREEN) — FOUND in `git log`
- Commit `c15a9660` (Task 2 RED) — FOUND in `git log`
- Commit `ca1b1f79` (Task 2 GREEN) — FOUND in `git log`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — preserved after all 4 commits

## Self-Check: PASSED

All 6 modified/created files present on disk. All 4 commit hashes present in `git log`. Sacred SHA verified post-final-commit. Boot order (line numbers in agent-runs.ts) verified: A=203 (cleanupLegacyBytebotState) < B=227 (cleanupOrphanedPerWebAppLuseEntries) < C=238 (registerLuseMcpServer).

---

*Phase: 103-master-chrome-streaming-single-mcp-display-aware*
*Plan: 05*
*Completed: 2026-05-11*
