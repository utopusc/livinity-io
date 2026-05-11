---
phase: 102-per-app-display-pivot
plan: 05
subsystem: livinityd-apps
tags: [native-app, xvfb, display-allocator, x11vnc, vitest]

# Dependency graph
requires:
  - phase: 102-per-app-display-pivot
    plan: 01
    provides: DisplayAllocator, spawnXvfb, XvfbHandle (streaming/index.ts barrel)
  - phase: 101-livos-universal-app-orchestration
    plan: 02
    provides: PortAllocator (range [15900, 16000))
  - phase: 101-livos-universal-app-orchestration
    plan: 03
    provides: spawnNativeApp + nativeAppConfigSchema (binary launch with DISPLAY=:N env)
  - phase: 101-livos-universal-app-orchestration
    plan: 05
    provides: native-app-binder.ts (Phase 101-05 WM_CLASS poll shape — replaced here)
  - phase: 100-multi-stream-window-redesign
    plan: 10
    provides: stream-manager VncWindowTarget union (line 54) + vnc-bridge -display :N branch (line 96-98)
  - phase: 100-08
    plan: 01
    provides: fluxbox-wm.ts startFluxbox helper (best-effort WM spawn pattern)
provides:
  - bind(opts) display-only binder primitive (replaces bindNativeAppWindow)
  - StreamStartFn signature ({display, port, label?}) Promise resolves to {streamId, wsUrl}
  - nativeAppsRouter.spawn — per-app-display orchestration mutation
  - ActiveNativeApp interface + module-scope activeNative map (consumed by 102-08)
  - Test hooks _setXvfbSpawnFnForTest, _snapshotActiveNativeForTest, _clearActiveNativeForTest
affects: [102-06 (Luse env switch — consumer of display target), 102-08 (close lifecycle — consumes activeNative), 102-09 (x11vnc whole-display — already supported by vnc-bridge)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope singleton allocator (nativeDisplayAllocator) — process-global resource, no per-request injection needed"
    - "Test injection hooks via prefixed _setXvfbSpawnFnForTest / _snapshotActiveNativeForTest / _clearActiveNativeForTest (underscore prefix marks them as test-only API)"
    - "Display-based binder: bind(opts) does zero subprocess work — pure port allocation + startStreamFn invocation; route owns all spawn orchestration"
    - "Cleanup-on-failure: try/catch wraps spawn sequence; Xvfb.stop() + DisplayAllocator.release() before rethrow; binary intentionally left running for user debug (matches Phase 101-05)"
    - "Best-effort fluxbox via dynamic import('../webapps/fluxbox-wm.js') + try/catch — missing fluxbox on host degrades gracefully"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/native-app-binder.ts (231 to 114 LOC, -117 / -51%)
    - livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts (311 to 141 LOC, -170 / -55%)
    - livos/packages/livinityd/source/modules/apps/native-routes.ts (292 to 311 LOC, +19 / +6.5%)
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md (rows 102-05-01 + 102-05-02 to green)

key-decisions:
  - "Drop bindNativeAppWindow + NativeAppWindowNotFoundError + snapshotWindowIds + ExecFileFn entirely. No remaining callers post-rewrite — clean break is safer than half-deprecated surface."
  - "Module-scope nativeDisplayAllocator singleton in native-routes.ts (rather than ctx-injected). Allocator is a process-global resource; ctx injection would require boot-time wiring. Wave 2 102-04 (window-manager) will mirror this pattern for WebApps; INDEPENDENT slot pools."
  - "Best-effort fluxbox via dynamic import + try/catch — keeps native-app spawn working on hosts without fluxbox. Some native apps may render poorly without a WM but the user sees a clear warning."
  - "Cleanup on failure releases display + stops Xvfb but LEAVES the binary running — mirrors Phase 101-05 (leave child alive on bind failure) for debug. 102-08 close-lifecycle is the right place to add binary SIGTERM on user-initiated close."
  - "inferWmClass retained as pure helper — still used by config schema metadata. Keeping the helper avoids breaking the config layer."

patterns-established:
  - "Pattern: subprocess-free binder primitive — bind(opts) allocates a port + invokes a Promise-returning startStreamFn callback; all spawn orchestration lives one level up in the route handler."
  - "Pattern: test-only module exports prefixed with underscore (e.g. _setXvfbSpawnFnForTest) — marks public-but-private surface."
  - "Pattern: module-scope allocator singleton per subsystem (native-routes vs webapps) — independent pools, no cross-subsystem coordination."

requirements-completed:
  - D-102-NATIVE-APP-PARITY
  - D-102-PER-APP-XVFB
  - D-102-SACRED

# Metrics
duration: ~25min
completed: 2026-05-11
---

# Phase 102 Plan 05: native-app-binder display swap Summary

**Replaced WM_CLASS xdotool poll on shared :1 with per-app dedicated Xvfb display + display-target x11vnc stream (D-102-NATIVE-APP-PARITY). Binder shrinks 231 to 114 LOC; route orchestrates DisplayAllocator -> spawnXvfb -> fluxbox -> spawnNativeApp(DISPLAY=:N) -> bind(display). Sacred SHA preserved.**

## Performance

- **Duration:** ~25 min (autonomous, parallel worktree)
- **Tasks:** 4 / 4 committed
- **Files modified:** 4 (binder.ts, binder.test.ts, native-routes.ts, VALIDATION.md)
- **Files created:** 0 (no new modules — all changes are in-place rewrites)
- **Files deleted:** 0
- **Net LOC:** -271 (binder + tests collapsed; route +19)

## Accomplishments

- **Binder rewrite** (native-app-binder.ts): Dropped 5 obsolete exports (bindNativeAppWindow, NativeAppWindowNotFoundError, snapshotWindowIds, ExecFileFn, default constants). Added new bind({display, portAllocator, startStreamFn, label, logger}) primitive — zero subprocess work, pure port allocation + startStreamFn invocation. StreamStartFn signature swapped from {wid, port, label?} to {display, port, label?}.
- **Route rewrite** (native-routes.ts): apps.native.spawn orchestrates the full per-app-display flow:
  1. nativeDisplayAllocator.allocate() -> :N
  2. spawnXvfb({display: ':N', 1280x720, logger}) (readiness-polled per 102-01)
  3. Best-effort startFluxbox({display, logger}) via dynamic import (catches missing fluxbox gracefully)
  4. spawnNativeApp({cfg, display, logger}) — binary inherits DISPLAY=:N env
  5. bind({display, portAllocator: sm.getPortAllocator(), startStreamFn: ({display}) -> sm.startStream({mode: vnc-window, target: {display}})})
  6. Persist ActiveNativeApp handle in module-scope activeNative map for 102-08
- **Test rewrite** (native-app-binder.test.ts): Replaced 10 WM_CLASS poll tests with 5 display-based bind tests + 3 retained inferWmClass helper tests. All 8 tests pass.
- **Cleanup-on-failure**: try/catch in spawn handler stops Xvfb + releases display slot + rethrows TRPCError. Binary intentionally left running for user debug (matches Phase 101-05 pattern).
- **Test injection hooks exposed** (_setXvfbSpawnFnForTest, _snapshotActiveNativeForTest, _clearActiveNativeForTest) — underscore-prefixed to mark test-only API; not consumed yet but ready for 102-08 close-lifecycle test coverage.
- **VALIDATION.md** rows 102-05-01 + 102-05-02 flipped to green.
- **Sacred SHA** f3538e1d811992b782a9bb057d1b7f0a0189f95f verified PRE and POST every commit. Plan touched zero files in liv/ tree.

## Task Commits

Each task committed atomically with --no-verify (parallel worktree mode):

1. **Task 1: RED — display-based bind tests** — ec820a7a (test)
   - Rewrite apps/native-app-binder.test.ts with 5 new display-based bind() tests + 3 retained inferWmClass tests
   - Drop 10 legacy WM_CLASS poll tests (deadline expiration, baseline diff, snapshotWindowIds, etc.)
   - VALIDATION.md 102-05-01 + 102-05-02 set to red (RED gate)
2. **Task 2: GREEN — display-only binder** — 8064f21e (feat)
   - Rewrite apps/native-app-binder.ts: drop bindNativeAppWindow + NativeAppWindowNotFoundError + snapshotWindowIds + ExecFileFn; add new bind(opts) primitive with pure port-alloc + startStreamFn invocation
   - StreamStartFn interface: {wid, port, label?} -> {display, port, label?}
   - 8/8 vitest pass (GREEN gate)
3. **Task 3: route orchestrates per-app-display** — 2b1dae68 (feat)
   - Rewrite apps/native-routes.ts spawn handler: DisplayAllocator -> spawnXvfb -> fluxbox -> spawnNativeApp -> bind -> activeNative.set
   - Module-scope nativeDisplayAllocator + injectable xvfbSpawnFn + ActiveNativeApp map + test hooks
   - Fixed binder test tuple-type strictness (mock.calls as any[]) + corrected fluxbox-wm export name (startFluxbox not spawnFluxbox)
   - 35/35 apps/native* tests pass; tsc clean for changed files
4. **Task 4: VALIDATION green + sacred SHA verify** — 2df3214e (chore)
   - Flip 102-05-01 + 102-05-02 rows to green
   - Sacred SHA confirmed f3538e1d811992b782a9bb057d1b7f0a0189f95f

## Files Modified

### livos/packages/livinityd/source/modules/apps/native-app-binder.ts
**LOC: 231 to 114 (-117 / -51%)**

Removed:
- bindNativeAppWindow (entire WM_CLASS poll loop)
- NativeAppWindowNotFoundError typed error
- snapshotWindowIds baseline helper
- ExecFileFn type alias
- DEFAULT_DEADLINE_MS + DEFAULT_POLL_INTERVAL_MS + DEFAULT_DISPLAY constants

Added:
- bind(opts) — pure port-alloc + startStreamFn invocation; no subprocess work
- StreamStartFn shape: ({display, port, label?}) Promise resolves to {streamId, wsUrl} (was {wid, port, label?})
- BindOpts shape: {display, portAllocator, startStreamFn, label?, logger?}

Retained: inferWmClass(binaryPath) pure helper (still used by config schema metadata)

### livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts
**LOC: 311 to 141 (-170 / -55%)**

Removed tests (10):
- snapshotWindowIds parsing (2)
- bindNativeAppWindow first-iteration match (1)
- bindNativeAppWindow baseline-and-poll new wid (1)
- bindNativeAppWindow deadline expiration -> NativeAppWindowNotFoundError (1)
- bindNativeAppWindow port allocator order invariant (1)
- bindNativeAppWindow port release on startStreamFn throw (1)
- bindNativeAppWindow label propagation (1)
- bindNativeAppWindow logger info on success (1)
- bindNativeAppWindow default display :1 (1)

Added tests (5):
- bind() display-based — returns {display, port, streamId, wsUrl}
- bind() performs no xdotool / WM_CLASS poll
- bind() releases port if startStreamFn rejects (cleanup safety)
- bind() propagates optional label to startStreamFn
- bind() matches StreamStartFn signature (no wid key)

Retained tests (3): inferWmClass (basename, lowercase, extension strip)

### livos/packages/livinityd/source/modules/apps/native-routes.ts
**LOC: 292 to 311 (+19 / +6.5%)**

Added:
- Module-scope nativeDisplayAllocator = new DisplayAllocator() singleton
- xvfbSpawnFn mutable factory (default spawnXvfb) — test injection point
- ActiveNativeApp interface + activeNative Map<string, ActiveNativeApp> (102-08 consumer)
- _setXvfbSpawnFnForTest, _snapshotActiveNativeForTest, _clearActiveNativeForTest test hooks
- 6-step spawn orchestration body (DisplayAllocator -> Xvfb -> fluxbox -> binary -> bind -> persist)
- Cleanup-on-failure: stop Xvfb + release displayN before rethrow; binary left alive

Changed:
- makeStartStreamFn adapter signature: ({wid}) -> ({display}) — pins target to {display}
- bind call shape — no wmClass, no execFileFn, no deadlineMs/pollIntervalMs
- Logger adapter retained but NativeAppWindowNotFoundError catch arm removed (error class deleted upstream)

Retained:
- All 4 CRUD endpoints unchanged (list, get, create, delete)
- adminProcedure on mutations / privateProcedure on queries (T-101-02 gate intact)
- inferWmClass(cfg.binaryPath) call retained for diagnostic log metadata enrichment

## Decisions Made

1. Drop all WM_CLASS poll-related exports (bindNativeAppWindow, NativeAppWindowNotFoundError, snapshotWindowIds, ExecFileFn). No remaining callers post-rewrite. Clean break is safer than half-deprecated surface.

2. Module-scope nativeDisplayAllocator singleton instead of ctx-injected DisplayAllocator. The allocator is a process-global resource. ctx injection would require boot-time wiring through livinityd index.ts; module-scope keeps the wiring local. Wave 2 102-04 (window-manager) will follow the same pattern, maintaining an INDEPENDENT pool for WebApps.

3. Best-effort fluxbox via dynamic import wrapped in try/catch. Keeps native-app spawn working on hosts without fluxbox installed (degrades to chromeless window).

4. Cleanup on failure releases display + stops Xvfb but LEAVES the binary running. Mirrors Phase 101-05 (leave child alive on bind failure) so the user can manually inspect the half-spawned app for debug. The binary SIGTERM on user-initiated close is the responsibility of 102-08 close-lifecycle.

5. inferWmClass retained as pure helper. Upstream callers persist wmClassHint metadata on the native-app config schema (D-101). Keeping the helper avoids breaking the config layer.

6. Test injection hooks underscore-prefixed (_setXvfbSpawnFnForTest, etc.) mark public-but-private surface. The route handler IS the public surface; the test hooks are escape hatches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected fluxbox-wm export name**
- Found during: Task 3 (typecheck)
- Issue: Plan instructed `await fluxMod.spawnFluxbox(...)` but the actual export in webapps/fluxbox-wm.ts:56 is `startFluxbox`. TypeScript TS2339.
- Fix: Renamed call to fluxMod.startFluxbox({display, logger}). Verified StartFluxboxOpts signature matches.
- Files modified: livos/packages/livinityd/source/modules/apps/native-routes.ts (line 231)
- Committed in: 2b1dae68 (Task 3)

**2. [Rule 1 - Bug] Fixed test tuple-type strictness on vi.fn mock.calls**
- Found during: Task 3 (typecheck)
- Issue: vi.fn(async () => ...) infers args tuple [] so mock.calls[0][0] triggers TS2493.
- Fix: Cast via (startStreamFn.mock.calls as any[])[0][0].label.
- Files modified: livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts (line 118)
- Committed in: 2b1dae68 (Task 3)

### Out-of-scope deferrals

- 5 pre-existing test failures in apps/ directory (4 integration tests failing on vite resolving @livos/config + 1 missing draft manifest file). SAME failures as on the base commit a884a382 (verified via git stash + re-run). Out of scope.
- The route child variable is intentionally captured but void-cast in the cleanup branch (binary left alive on failure per the design above). Linter-clean.

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug, surfaced by typecheck and fixed in Task 3 commit)

## Sacred SHA Verification

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Plan start (post worktree-reset to a884a382) | f3538e1d811992b782a9bb057d1b7f0a0189f95f | matches D-102-SACRED |
| Post-Task-1 (test RED commit) | f3538e1d811992b782a9bb057d1b7f0a0189f95f | unchanged |
| Post-Task-2 (binder GREEN commit) | f3538e1d811992b782a9bb057d1b7f0a0189f95f | unchanged |
| Post-Task-3 (routes commit) | f3538e1d811992b782a9bb057d1b7f0a0189f95f | unchanged |
| Post-Task-4 (VALIDATION + final) | f3538e1d811992b782a9bb057d1b7f0a0189f95f | unchanged |

Plan 102-05 did not touch the liv/ tree at any point. D-102-SACRED lock satisfied.

## Test Count

- Tests added: 5 new bind() tests
- Tests retained: 3 inferWmClass tests
- Tests removed: 10 legacy WM_CLASS poll tests (no longer applicable)
- Net test delta: -2 module-level (10 removed + 5 added + 3 retained = 8 final vs 13 baseline)
- Native-app suite total: 35/35 pass (binder 8 + config 14 + spawner 13)

## Removed WM_CLASS Dependency Proof

- grep "xdotool search" native-app-binder.ts -> 0 hits
- grep "wmClass:" native-app-binder.ts -> 0 hits (appears only in inferWmClass helper name + doc comments)
- grep "snapshotWindowIds" native-app-binder.ts -> 0 hits
- grep "NativeAppWindowNotFoundError" native-app-binder.ts -> 0 hits
- grep "display: string" native-app-binder.ts -> 1 hit (StreamStartFn interface)

Display-based StreamStartFn confirmed.

## DISPLAY=:N Env Pass-through Proof

native-routes.ts spawn handler chain:
- displayN = nativeDisplayAllocator.allocate()
- display = ":" + displayN
- xvfb = await xvfbSpawnFn({display, ...})
- await fluxMod.startFluxbox({display, logger})
- await spawnNativeApp({cfg, display, logger}) — spawner builds env as process.env + cfg.env + DISPLAY: display

native-app-spawner.ts:109-113 confirms DISPLAY pinning at the bottom of the env merge order. DISPLAY ALWAYS wins; cfg.env cannot shadow it accidentally.

## TDD Gate Compliance

Plan 102-05 contained TDD-flagged tasks (tdd=true on Tasks 1, 2, 3). Gate sequence verified:

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1, test: prefix) | ec820a7a test(102-05-01) | commit prefix matches |
| GREEN (Task 2, feat: prefix) | 8064f21e feat(102-05-02) | commit prefix matches |
| GREEN extension (Task 3, feat: prefix) | 2b1dae68 feat(102-05-03) | commit prefix matches |

RED commit pre-dates GREEN; tests fail in RED commit then pass in GREEN. Gate sequence enforced.

## Next Phase Readiness

- Wave 2 102-05 complete. Wave 2 in flight:
  - 102-04 (window-manager rewrite) file-disjoint; consumes same DisplayAllocator + spawnXvfb pattern this plan establishes for native apps.
  - 102-06 (Luse env switch LUSE_TARGET_DISPLAY) file-disjoint; consumer of display target from this route.
- Wave 3 102-08 (close lifecycle) will consume activeNative map + ActiveNativeApp interface from this plan to implement clean shutdown:
  - SIGTERM binary -> wait 2s -> SIGKILL
  - streamManager.stopStream(streamId) (kills x11vnc + releases port)
  - xvfb.stop() (SIGTERM Xvfb)
  - nativeDisplayAllocator.release(displayN)
  - activeNative.delete(id)
- No blockers. Sacred SHA stable. Mini PC deploy gated on Wave 4 (102-10).

## Self-Check: PASSED

Verified all claims:
- livos/packages/livinityd/source/modules/apps/native-app-binder.ts - FOUND (114 LOC, new bind export)
- livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts - FOUND (141 LOC, 8 tests)
- livos/packages/livinityd/source/modules/apps/native-routes.ts - FOUND (311 LOC, includes DisplayAllocator + spawnXvfb + bind)
- .planning/phases/102-per-app-display-pivot/102-VALIDATION.md - FOUND (102-05 rows green)
- Commit ec820a7a (Task 1 RED) - FOUND in git log
- Commit 8064f21e (Task 2 GREEN) - FOUND in git log
- Commit 2b1dae68 (Task 3 route) - FOUND in git log
- Commit 2df3214e (Task 4 VALIDATION + sacred SHA) - FOUND in git log
- Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f - VERIFIED on liv/packages/core/src/sdk-agent-runner.ts
- 8/8 native-app-binder tests pass - VERIFIED
- 35/35 native* tests pass (binder 8 + config 14 + spawner 13) - VERIFIED

---
*Phase: 102-per-app-display-pivot*
*Plan: 05*
*Completed: 2026-05-11*
