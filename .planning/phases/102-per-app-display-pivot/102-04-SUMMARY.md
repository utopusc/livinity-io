---
phase: 102
plan: 04
subsystem: webapps
tags: [window-manager, xvfb, chrome-subprocess, per-app-display, vnc, livinityd, wave-2]

# Dependency graph
requires:
  - phase: 102-per-app-display-pivot
    provides: 102-01 (DisplayAllocator + spawnXvfb), 102-02 (spawnChromeProcess), 102-03 (createProfileSeeder)
provides:
  - WebAppWindowManager.spawn() per-app-display orchestration body — allocates display→spawns Xvfb→seeds profile→spawns Chrome→allocates port→starts x11vnc whole-display stream
  - ActiveWebApp type extended with {displayN, display, xvfbHandle, chromeHandle, profileUuid, port} for 102-08 close lifecycle inheritance
  - withWindowManager opt (A2 fluxbox-or-not toggle) — default false; opt-in fluxbox spawn per WebApp
  - Compensating cleanup on partial failure (chrome.stop → profile.cleanup → xvfb.stop → port.release → display.release)
  - DisplayAllocator + portAllocator + profileSeeder REQUIRED + strong-typed in WebAppWindowManagerOpts
  - WebAppCdpUnavailableError retained as exported back-compat (no longer thrown from spawn())
affects: [102-05 (native-app-binder display swap consumes the same display-allocator pattern), 102-06 (LUSE_TARGET_DISPLAY env propagation), 102-08 (close lifecycle inherits ActiveWebApp handles), 102-09 (vnc-bridge default-path flip to display)]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — composes Wave 1 primitives only
  patterns:
    - "Compensating cleanup with REVERSE-order try/catch wrappers — every step is best-effort so the final `displayAllocator.release()` always runs even if earlier cleanup throws"
    - "Optional `withWindowManager: false` opt-in with lazy `await import()` of fluxbox-wm when true — keeps the hot path zero-cost (no fluxbox bundle pull-in) and gives the user a per-deploy env toggle (LIVOS_WEBAPP_USE_WM=1)"
    - "Mock-factory injection at the ctor (xvfbSpawnFn, chromeSpawnFn, fluxboxSpawnFn) — mirrors the Wave 1 factory pattern; tests assert invocationCallOrder for sequence proofs"
    - "Shared-allocator double-allocation pattern — window-manager AND stream-manager both call `portAllocator.allocate()` on the same instance. Reduces 100-slot capacity by ~half but eliminates cross-cutting refactor; documented as known cost"
    - "Vestigial wid=0 retention for v33-era idle-cleanup poller + getWidForWebapp call site back-compat — full retirement waits for 102-08 (close lifecycle) and 102-06 (luse env rename)"

key-files:
  created:
    - .planning/phases/102-per-app-display-pivot/deferred-items.md
  modified:
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
    - livos/packages/livinityd/source/index.ts
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md
  deleted: []

key-decisions:
  - "withWindowManager DEFAULTS FALSE (A2 mitigation). Chrome `--start-fullscreen` on bare Xvfb is validated in 102-RESEARCH §A2; fluxbox is opt-in via env LIVOS_WEBAPP_USE_WM=1 for cases where WM hints are required. Test 9b verifies fluxbox IS spawned when true and Test 9 verifies it is NOT spawned when false."
  - "Compensating cleanup runs REVERSE order with try/catch on EVERY step. The final `displayAllocator.release(displayN)` MUST always execute — otherwise a partial-failure spawn leaks a display slot from the 90-slot pool (10..99). All five steps (chrome.stop, profile.cleanup, xvfb.stop, port.release, display.release) catch their own errors so a thrown error from (e.g.) chrome.stop never prevents display.release."
  - "Window-manager DOES allocate a port via portAllocator.allocate() per spawn even though stream-manager allocates its own port internally from the SAME shared allocator. This is the plan author's spec (Test 7 explicitly checks `portAllocator.release` on stream failure). Effective cost: 1 port slot per WebApp is reserved in the window-manager's ActiveWebApp.port field; stream-manager's own allocation hands out the next slot. Net halving of the 100-slot port range. Documented as Decision #3 here; 102-08 close lifecycle will revisit when the port field is consumed."
  - "Pre-existing tests retired with `it.skip` + rationale comments instead of deleted. Preserves the historical contract documentation (what 100-10-08 and 101-04 explicitly contracted) so future readers can see the evolution from singleton-:1 → CDP → per-app-display. 6 individual tests + 3 entire describe blocks are skipped."
  - "registerWebAppMcp now passes only {instanceKey, display} in the descriptor. The PerWebAppMcpDescriptor type was tightened by an in-progress 102-06 migration (dropped `windowId`). 102-04 ships the consumer-side fix to unblock typecheck without committing to 102-06's full descriptor rewrite. The legacy `wid: number` arg is still in the registerWebAppMcp signature but ignored internally — v33 call sites continue to compile."
  - "Phase 102-04 close() is intentionally a stream-only teardown placeholder. Full per-app close (chrome.stop + xvfb.stop + profile.cleanup + port.release + display.release) ships in Wave 3 plan 102-08. This keeps 102-04 narrowly scoped to spawn body + ActiveWebApp + ctor wiring; subsequent calls to spawn() with the same webappId re-allocate so leaks are bounded."

patterns-established:
  - "Strong-typed required ctor opts for per-app primitives — displayAllocator + portAllocator + profileSeeder are no longer `unknown` placeholders; the spawn body actually composes them. Wave 2 plans 102-05/102-06 inherit this required-opts pattern."
  - "Mock-factory bundles in test fixtures (makeFakeDisplayAllocator, makeFakeProfileSeeder, makeFakeXvfbSpawnFn, makeFakeChromeSpawnFn, makeFakePortAllocator) — each returns `{handle/seeder/fn, callsBundle}` for invocationCallOrder + arg-shape assertions. Composable via makeManager102 builder."
  - "Test skip-with-rationale: `it.skip('Test N [Phase XYZ RETIRED]: <legacy contract>', () => {...explanatory body...})` — preserves the historical contract while making the retirement visible to future readers."
  - "ActiveWebApp.wid=0 vestigial sentinel: when wid is 0, all wid-keyed code paths (focus, idleCleanupTick, getSingleActiveWid) short-circuit. 102-08 will swap to display-keyed paths."

requirements-completed:
  - D-102-PER-APP-XVFB         # spawn() body calls displayAllocator + spawnXvfb
  - D-102-PER-APP-CHROME       # spawn() calls spawnChromeProcess with per-app userDataDir
  - D-102-MASTER-PROFILE-SEED  # spawn() calls profileSeeder.seed(uuid:webappId)
  - D-102-X11VNC-WHOLE-DISPLAY # streamManager.startStream target {display:':N'}
  - D-102-PHASE-101-SALVAGE    # CDP createWindowForUrl + closeTarget removed from spawn body
  - D-102-SACRED               # sacred SHA preserved across all 6 commits

# Metrics
duration: ~30min
completed: 2026-05-11
---

# Phase 102 Plan 04: window-manager rewrite (per-app Xvfb + Chrome subprocess) Summary

**WebAppWindowManager.spawn() rewritten end-to-end to compose Phase 102 Wave 1 primitives — DisplayAllocator + spawnXvfb + ProfileSeeder + spawnChromeProcess + PortAllocator + StreamManager (display target) — replacing the Phase 101-04 CDP-driven flow. ActiveWebApp extended with {displayN, display, xvfbHandle, chromeHandle, profileUuid, port} for 102-08 close lifecycle inheritance. A2 fluxbox-or-not opt-in via `withWindowManager` (default false). CDP createTarget surface fully removed (`grep -c createWindowForUrl` = 0). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 6 commits.**

## Performance

- **Duration:** ~30 min (autonomous, parallel worktree)
- **Started:** 2026-05-11T02:54:25Z
- **Completed:** 2026-05-11T03:24:08Z
- **Tasks:** 6 / 6 committed
- **Files modified:** 4 (3 source + 1 validation)
- **Files created:** 1 (deferred-items.md)

## Accomplishments

- WebAppWindowManager.spawn() body REWRITTEN end-to-end to compose Wave 1 primitives:
  - `displayAllocator.allocate()` → `displayN: number`
  - `spawnXvfb({display:':N', width:1280, height:720})` → readiness-polled Xvfb handle
  - Optional fluxbox spawn (A2) when `withWindowManager:true`
  - `profileSeeder.seed({uuid: webappId})` → `/tmp/livos-chrome-app-<uuid>`
  - `spawnChromeProcess({display, userDataDir, url})` → per-app Chrome subprocess
  - `portAllocator.allocate()` → port (tracking)
  - `streamManager.startStream({mode:'vnc-window', target:{display}})` → x11vnc whole-display capture
- `ActiveWebApp` type extended: `displayN: number`, `display: string`, `xvfbHandle: XvfbHandle`, `chromeHandle: ChromeProcessHandle`, `profileUuid: string`, `port: number`. Legacy `wid` retained as vestigial 0 (display is the unit of identity now).
- `WebAppWindowManagerOpts`: `displayAllocator`, `portAllocator`, `profileSeeder` are now REQUIRED + strong-typed. `xvfbSpawnFn`, `chromeSpawnFn`, `fluxboxSpawnFn`, `withWindowManager` added for injection + A2 toggle. Legacy `chromeCdpClient`, `xvfbStartFn`, `fluxboxStartFn` retained as IGNORED back-compat slots.
- Compensating cleanup on partial failure runs REVERSE order with try/catch on every step: `chrome.stop()` → `profileSeeder.cleanup(uuid)` → `xvfb.stop()` → `portAllocator.release(port)` → `displayAllocator.release(displayN)`. The final `displayAllocator.release` ALWAYS runs even if earlier cleanup throws.
- CDP createWindowForUrl + closeTarget + getChromePid + listWindowIdsForPid + findNewWindowByPid calls REMOVED from spawn body. `grep -c createWindowForUrl livos/packages/livinityd/source/modules/webapps/window-manager.ts` = **0**.
- A2 fluxbox-or-not: `withWindowManager: boolean` ctor opt (default `false`). Env toggle via `LIVOS_WEBAPP_USE_WM=1` at livinityd boot. Test 9 asserts no-fluxbox by default; Test 9b asserts fluxbox spawned between Xvfb readiness and Chrome spawn when `true`.
- PATTERNS R6 — the half-plumbed `displayAllocator` ctor opt (was `unknown`, never dereferenced) is now strong-typed `DisplayAllocator` and IS called by spawn().
- 10 new Phase 102-04 tests pass (`T-102-04-01..09b`): sequence, no-CDP, URL-forwarding, ActiveWebApp shape, 3 compensating-cleanup tests, idempotency, A2 fluxbox off/on.
- 27 pre-existing tests refactored or retired with explanatory `it.skip` rationale. Final window-manager.test.ts state: **27 passed + 22 skipped (49 total).**
- All 5 Phase 102 test files pass cleanly: display-allocator, xvfb-spawner, chrome-process-spawner, profile-seeder, window-manager — **62 passed + 22 skipped across 84 tests.**
- VALIDATION.md rows: 102-04-01 ✅ green, 102-04-02 ✅ green, 102-04-03 ⚠️ partial (full 8-step close lifecycle ships in 102-08).
- livinityd/source/index.ts ctor wiring: `new DisplayAllocator()` constructed at boot; passed alongside `sharedPortAllocator`, `this.profileSeeder`, and `withWindowManager: process.env.LIVOS_WEBAPP_USE_WM === '1'` into WebAppWindowManager ctor opts.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified UNCHANGED at every commit. Plan 102-04 does NOT touch `liv/` tree.

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree mode):

1. **Task 1: refactor — audit + comment refresh for 102-01 display-allocator deletion** — `df8670e4` (refactor)
   - Verified no live `createDisplayAllocator()` calls remain (already deleted by 102-01-04).
   - Updated source/index.ts comment to point at 102-04 wire-up rather than describing a deferred future.

2. **Task 2: RED — window-manager spawn body per-app primitives + cleanup** — `01f963d5` (test)
   - Added Phase 102-04 describe block to window-manager.test.ts with 10 failing tests.
   - Mock factories: makeFakeDisplayAllocator, makeFakeProfileSeeder, makeFakeXvfbSpawnFn, makeFakeChromeSpawnFn, makeFakePortAllocator, makeManager102.
   - VALIDATION.md rows 102-04-01..03: ⬜ pending → ❌ red.

3. **Task 3: GREEN — window-manager spawn body uses per-app Xvfb+Chrome+VNC** — `869657ae` (feat)
   - Full rewrite of window-manager.ts: new imports, extended `ActiveWebApp` type, required `displayAllocator/portAllocator/profileSeeder` ctor opts, `withWindowManager` A2 toggle, compensating cleanup, vestigial wid=0 paths.
   - 10/10 Phase 102-04 tests pass.

4. **Task 4: feat — wire DisplayAllocator + per-app primitives into WebAppWindowManager ctor** — `f700ad37` (feat)
   - livinityd/source/index.ts: `import {DisplayAllocator}`, `const webappDisplayAllocator = new DisplayAllocator()`, ctor opts include displayAllocator + portAllocator + profileSeeder + withWindowManager.
   - Zero new typecheck errors in 102-04 production files.

5. **Task 5: chore — VALIDATION.md 102-04 rows green + sacred SHA verified** — `82f7f711` (chore)
   - 102-04-01/02 ❌ red → ✅ green.
   - 102-04-03 ❌ red → ⚠️ partial (close lifecycle ships in 102-08).
   - `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` confirmed.

6. **Task 6: fix — refactor pre-existing window-manager tests for per-app-display contract** — `b20350dc` (fix)
   - makeManager() now delegates to makeManager102() for new ctor opts.
   - 6 in-place test adaptations (windowId, target shape, env keys).
   - 3 retired describe blocks + 4 retired individual tests (`it.skip` with rationale).
   - window-manager.ts registerWebAppMcp: drop `windowId` from descriptor literal (PerWebAppMcpDescriptor was tightened to {instanceKey, display}).
   - deferred-items.md created documenting pre-existing luse-mcp-config test failures + 70 pre-existing failing test files (out of scope per SCOPE BOUNDARY).

## Files Created/Modified

### Created
- `.planning/phases/102-per-app-display-pivot/deferred-items.md` — Scope-boundary documentation: pre-existing luse-mcp-config test failures (102-06 half-migration) + 70 pre-existing failing test files in full suite (none from 102-04).

### Modified
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — Full spawn body rewrite. Imports added: `DisplayAllocator`, `PortAllocator`, `spawnXvfb + XvfbHandle + XvfbSpawnOpts`, `spawnChromeProcess + ChromeProcessHandle + ChromeSpawnOpts`, `ProfileSeederHandle`, `FluxboxSpawnFn`. Removed `ChromeCdpClient` type import. `WebAppWindowManagerOpts` extended with required `displayAllocator/portAllocator/profileSeeder` + injection `xvfbSpawnFn/chromeSpawnFn/fluxboxSpawnFn` + A2 toggle `withWindowManager`. `ActiveWebApp` extended with `displayN/display/xvfbHandle/chromeHandle/profileUuid/port`. Spawn body rewritten end-to-end. Close body simplified (102-08 owns full per-app teardown). Focus/idleCleanup short-circuit when wid=0. registerWebAppMcp drops windowId from descriptor literal. Final LOC: 817 (was 883, -66 net).
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — 10 new Phase 102-04 tests appended; 27 pre-existing tests refactored or retired with `it.skip`. New mock factories added (makeFakeDisplayAllocator, makeFakeProfileSeeder, makeFakeXvfbSpawnFn, makeFakeChromeSpawnFn, makeFakePortAllocator, makeManager102). Final test count: 27 passed + 22 skipped (49 total).
- `livos/packages/livinityd/source/index.ts` — Added `import {DisplayAllocator}` and `const webappDisplayAllocator = new DisplayAllocator()` before WebAppWindowManager ctor. Ctor opts now include `displayAllocator`, `portAllocator: sharedPortAllocator`, `profileSeeder: this.profileSeeder!`, `withWindowManager: process.env.LIVOS_WEBAPP_USE_WM === '1'`. `chromeCdpClient` retained as IGNORED back-compat slot.
- `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` — Rows 102-04-01/02 status flipped ⬜ → ✅ green; 102-04-03 → ⚠️ partial (102-08 ships full close).

### Deleted
(none — Task 1 audit confirmed no `createDisplayAllocator` live references remain; legacy `webapps/display-allocator.ts` was deleted by 102-01-04.)

## CDP-Call Removal Proof

```bash
$ grep -c 'createWindowForUrl' livos/packages/livinityd/source/modules/webapps/window-manager.ts
0

$ grep -c 'chromeCdpClient\.' livos/packages/livinityd/source/modules/webapps/window-manager.ts
0
```

The legacy Phase 101-04 CDP-driven flow (chromeCdpClient.getChromePid + listWindowIdsForPid + createWindowForUrl + findNewWindowByPid + closeTarget) is entirely removed from the spawn body. `WebAppCdpUnavailableError` is exported for backward-compat but is never thrown by spawn() under 102-04.

## withWindowManager Default

`withWindowManager: false` is the constructor default — Chrome `--start-fullscreen` on bare Xvfb (no window manager) is the validated path per 102-RESEARCH §A2 ("fluxbox-or-not validation"). To opt-in fluxbox per-deploy, set `LIVOS_WEBAPP_USE_WM=1` in livinityd's environment; the ctor reads this in livinityd/source/index.ts. When `true`, fluxbox is spawned between Xvfb readiness and Chrome spawn; fluxbox failure is logged non-fatally (does NOT trip compensating cleanup) because Chrome --start-fullscreen still works without a WM in most scenarios.

## Test Count Delta

| Suite | Pre-102-04 | Post-102-04 | Delta |
|-------|-----------|-------------|-------|
| window-manager.test.ts | 36 pass + 3 skip = 39 | 27 pass + 22 skip = 49 | **+10 tests** (T-102-04-01..09b), **+19 skips** (CDP/cascade/wid-alive retired) |
| chrome-process-spawner.test.ts | 11 pass | 11 pass | 0 |
| profile-seeder.test.ts | 10 pass | 10 pass | 0 |
| xvfb-spawner.test.ts | 7 pass | 7 pass | 0 |
| display-allocator.test.ts | 7 pass | 7 pass | 0 |
| **Phase 102 total** | **71 pass + 3 skip** | **62 pass + 22 skip** | **+10 new tests, +19 skips (CDP semantics retired)** |

The 9 "missing" passes from window-manager are tests now correctly marked `it.skip` because their assertions (CDP behavior, wid-alive idle cleanup, cascade window-position) no longer apply under per-app-display.

## Sacred SHA Verification

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Plan start | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ matches D-102-SACRED |
| After Task 1 (audit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| After Task 2 (RED) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| After Task 3 (GREEN) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| After Task 4 (wire) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| After Task 5 (verify) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| After Task 6 (test refactor) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |

Plan 102-04 modifies only `livos/`, `.planning/`. The `liv/` subtree (where sdk-agent-runner.ts lives) was never touched.

## Decisions Made

1. **withWindowManager DEFAULTS FALSE (A2 mitigation).** Chrome `--start-fullscreen` on bare Xvfb is validated to render full-canvas per 102-RESEARCH §A2. Fluxbox is opt-in via env `LIVOS_WEBAPP_USE_WM=1`. The toggle threads through livinityd/source/index.ts → WebAppWindowManager ctor → spawn body conditional. Test 9 asserts no-fluxbox by default; Test 9b asserts fluxbox IS spawned between Xvfb readiness and Chrome spawn when true.

2. **Compensating cleanup runs REVERSE order with try/catch on EVERY step.** The final `displayAllocator.release(displayN)` MUST always execute — otherwise partial-failure spawns leak display slots from the 90-slot pool. All five steps catch their own errors so a thrown chrome.stop never prevents the display release.

3. **Shared-allocator double-allocation (window-manager + stream-manager both allocate).** Window-manager calls `portAllocator.allocate()` per spawn for ActiveWebApp tracking even though stream-manager allocates its own port internally on the SAME shared allocator. Effective halving of the 100-slot port range to ~50 concurrent WebApps — a documented cost of staying within plan scope (the alternative would be a stream-manager API extension to accept a pre-allocated port, which is out of 102-04 scope). 102-08 close lifecycle will revisit when port field is consumed.

4. **Pre-existing tests retired with `it.skip` + rationale, NOT deleted.** Preserves the historical contract documentation. Reading the test file now shows the evolution: 100-10-08 singleton-:1 contract → 101-04 CDP path → 102-04 per-app-display path. 6 individual tests + 3 entire describe blocks are skipped with explanatory comments.

5. **registerWebAppMcp drops `windowId` from descriptor literal.** PerWebAppMcpDescriptor was tightened by an in-progress 102-06 migration to {instanceKey, display}. 102-04 ships the consumer-side fix to unblock typecheck without committing to 102-06's full descriptor rewrite. The legacy `wid: number` arg in registerWebAppMcp signature is preserved (for v33 call-site compat) but ignored internally — flagged in a comment.

6. **Phase 102-04 close() is a stream-only teardown placeholder.** Full per-app close lifecycle (chrome.stop + xvfb.stop + profile.cleanup + port.release + display.release) ships in Wave 3 plan 102-08. This keeps 102-04 narrowly scoped to spawn body + ActiveWebApp + ctor wiring. Subsequent calls to spawn() with the same webappId re-allocate so resource leaks are bounded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PerWebAppMcpDescriptor.windowId field removed**

- **Found during:** Task 6 (full typecheck after Task 4 wire-up)
- **Issue:** TypeScript error TS2353 in `window-manager.ts:659` — `Object literal may only specify known properties, and 'windowId' does not exist in type 'PerWebAppMcpDescriptor'`. An in-progress Phase 102-06 migration had already tightened the descriptor type to `{instanceKey, display}` only (dropping the pre-102 `windowId`), but the consumer in window-manager.ts (which my Task 3 rewrite preserved verbatim from the prior code) still passed `windowId: wid`.
- **Resolution:** Updated `registerWebAppMcp` to build the descriptor without the `windowId` field. Kept the function signature `registerWebAppMcp(webappId, _wid, display)` for v33 call-site compat — the `wid` arg is now ignored internally with an explanatory comment.
- **Files modified:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- **Verification:** Typecheck error count drops; window-manager-test Test 16 (MCP env shape) updated to assert `LUSE_TARGET_DISPLAY` env presence + `LUSE_TARGET_WINDOW_ID` absence.
- **Committed in:** `b20350dc` (rolled into Task 6).

**2. [Rule 1 - Bug] Pre-existing CDP-era tests broke after spawn body rewrite**

- **Found during:** Task 3 (post-GREEN test run)
- **Issue:** 36 pre-existing tests assumed CDP semantics (windowId 0x200, target {wid}, focus wid-activate, idle wid-alive, MCP env DISPLAY=:1). After Task 3 rewrote spawn() to use per-app-display, all those assertions fail.
- **Resolution per plan Task 6:** Refactor in place — adapt assertions to new contract (window 0, target {display}, MCP env :10) for tests that still apply; retire tests that no longer apply with `it.skip` + rationale comments.
- **Files modified:** `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts`
- **Verification:** 27 active tests pass + 22 skipped (all retirements documented with describe/test names referencing what Phase contracted the behavior).
- **Committed in:** `b20350dc` (Task 6).

---

**Total deviations:** 2 auto-fixed (both Rule-grade, no scope creep). Plan executed essentially as written.

## Issues Encountered

- **CRLF / LF line-ending churn.** Windows worktree re-saves files with CRLF on each Write/Edit. The semantic diff is small but git shows large LOC deltas. Sacred SHA is path-content based (git hash-object), so CRLF normalization for `liv/` files would be a concern — but plan 102-04 never touches `liv/`. Verified at every commit.
- **Linter-driven edit reverts.** A linter intermittently re-reads `window-manager.ts` and reverts my doc-comment edits between my reads. Mitigated by using `Write` (full-file replace) for the spawn body rewrite rather than incremental `Edit` calls.
- **VALIDATION.md interleaved edits.** The user/linter independently modified VALIDATION.md rows between my edits (changing some unrelated 102-06 rows from `⬜ pending` to `❌ red`). Per system-reminder these changes are intentional; left untouched.
- **Full livinityd test suite has 70 pre-existing failing files.** None caused by 102-04. Logged to `deferred-items.md`. The 5 Phase 102 test files all pass cleanly.

## TDD Gate Compliance

Plan 102-04 contained TDD-flagged tasks (`tdd="true"` on Tasks 2 and 3). Gate sequence verified in git log:

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 2 — `test:` prefix) | `01f963d5` test(102-04-02) | ✅ commit prefix matches; 10 new failing tests added |
| GREEN (Task 3 — `feat:` prefix) | `869657ae` feat(102-04-03) | ✅ commit prefix matches; 10 new tests pass post-rewrite |
| REFACTOR (Task 6 — `fix:` prefix, regression test update) | `b20350dc` fix(102-04-06) | ✅ commit prefix matches; pre-existing tests refactored to new contract |

The RED → GREEN → REFACTOR cycle is preserved with proper commit prefixes.

## Next Phase Readiness

- **Wave 2 plan 102-05 (native-app-binder display swap)** ready to consume the same `webappDisplayAllocator` instance — share the [10, 100) pool between WebApps and native apps. Pattern: import `DisplayAllocator` + `spawnXvfb` from streaming/index.ts; consume in native-app-binder's BindOpts.
- **Wave 2 plan 102-06 (LUSE_TARGET_DISPLAY env propagation)** has its descriptor consumer aligned: `PerWebAppMcpDescriptor = {instanceKey, display}` is the type window-manager builds. 102-06 only needs to update the inverse path (mcp/server.ts env read) + agent-runner-factory.
- **Wave 3 plan 102-08 (close lifecycle)** inherits all 5 handles from ActiveWebApp (chromeHandle, xvfbHandle, profileUuid, port, displayN). The 8-step teardown lands in close().
- **Wave 3 plan 102-09 (vnc-bridge default-path flip)** is purely doc/comment work since stream-manager already supports `{display}` target since 100-10-04 and window-manager (this plan) already passes `{display}` exclusively.

## Self-Check

- ✅ `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — FOUND (817 LOC)
- ✅ `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — FOUND (27 passed + 22 skipped tests)
- ✅ `livos/packages/livinityd/source/index.ts` — FOUND (WebAppWindowManager ctor wires DisplayAllocator + portAllocator + profileSeeder + withWindowManager)
- ✅ `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` — FOUND (rows 102-04-01/02 = ✅ green; 102-04-03 = ⚠️ partial)
- ✅ `.planning/phases/102-per-app-display-pivot/deferred-items.md` — FOUND
- ✅ Commit `df8670e4` (Task 1 audit) — FOUND in git log
- ✅ Commit `01f963d5` (Task 2 RED) — FOUND
- ✅ Commit `869657ae` (Task 3 GREEN) — FOUND
- ✅ Commit `f700ad37` (Task 4 wire) — FOUND
- ✅ Commit `82f7f711` (Task 5 verify) — FOUND
- ✅ Commit `b20350dc` (Task 6 refactor) — FOUND
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — VERIFIED on `liv/packages/core/src/sdk-agent-runner.ts` (unchanged)
- ✅ CDP createWindowForUrl removed (`grep -c` = 0) — VERIFIED
- ✅ `displayAllocator.allocate()` invoked in spawn body — VERIFIED in window-manager.ts:403
- ✅ `spawnChromeProcess` invoked in spawn body — VERIFIED in window-manager.ts:438
- ✅ `withWindowManager` ctor opt + default false — VERIFIED in WebAppWindowManagerOpts and ctor (`opts.withWindowManager ?? false`)
- ✅ Test 9 (fluxbox NOT called when withWindowManager:false) — VERIFIED passing
- ✅ Test 9b (fluxbox IS called when withWindowManager:true, between xvfb and chrome) — VERIFIED passing

## Self-Check: PASSED

---
*Phase: 102-per-app-display-pivot*
*Plan: 04*
*Completed: 2026-05-11*
