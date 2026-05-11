---
phase: 101
plan: 05
title: Native App Window-Bind + Stream Wire-Up — Summary
subsystem: livinityd / apps + streaming
type: execute
wave: 2
status: complete
tags: [native-apps, port-allocator, xdotool, baseline-and-poll, t-101-05]
requirements:
  - D-101-NATIVE-APPS
  - D-101-PORT-ALLOC
  - D-101-SACRED
dependency_graph:
  requires:
    - "101-02 (PortAllocator class — Phase 101-02-SUMMARY.md)"
    - "101-03 (NativeAppSpawner + NativeAppConfigStore + apps.native.{list,get,create,delete} routes — Phase 101-03-SUMMARY.md)"
  provides:
    - "bindNativeAppWindow({pid, wmClass, display, portAllocator, startStreamFn, ...}) → {wid, port, streamId, wsUrl}"
    - "snapshotWindowIds(display, execFileFn?) → Set<number>"
    - "inferWmClass(binaryPath) → string"
    - "NativeAppWindowNotFoundError class"
    - "tRPC apps.native.spawn(id) mutation — privateProcedure"
    - "Shared PortAllocator singleton between StreamManager + native-app binder"
  affects:
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (1 new httpOnlyPaths entry)"
    - "livos/packages/livinityd/source/index.ts (PortAllocator import + sharedPortAllocator construction + injection into StreamManager)"
tech_stack:
  added: []
  patterns:
    - "Baseline-and-poll xdotool matcher (mirrors webapps/window-discovery.ts findNewWindowMatching)"
    - "Promise-adapter wrapping a sync API (makeStartStreamFn adapts StreamManager.startStream into the binder's StreamStartFn)"
    - "Allocate-after-match port ordering (no slot consumed on bind timeout)"
    - "Cleanup-on-throw port release (binder catches startStreamFn errors and calls release before rethrowing)"
    - "Mock factory pattern with queued stdouts (queuedExecFile in the test suite)"
    - "Logger adaptation — ctx.logger (log/verbose/error) → info/warn/error/verbose (matches the streamingLogger pattern at index.ts:386-392)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/apps/native-app-binder.ts (231 lines)"
  modified:
    - "livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts (Wave 0 stub → 13 real cases, 311 lines)"
    - "livos/packages/livinityd/source/modules/apps/native-routes.ts (+spawn mutation + StreamStartFn adapter)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+1 httpOnlyPaths entry)"
    - "livos/packages/livinityd/source/index.ts (+PortAllocator import + sharedPortAllocator construction + injection)"
decisions:
  - "Kept existing nativeAppsRouter const export (ctx-pattern) rather than the plan's builder refactor. Pulls collaborators (StreamManager + its getPortAllocator) off ctx.livinityd just like the rest of the file already pulls store. Avoids a wider blast radius in server/trpc/index.ts composition AND matches the pattern already in streams/trpc-router.ts:64. Same surface — grep acceptance satisfied — less surgery."
  - "Allocate AFTER wid match. The opposite order (allocate first, then poll) would burn a port slot whenever the WM_CLASS poll times out. Plan called this out as an invariant and the test 'allocates port via portAllocator AFTER the wid is matched (order invariant)' guards it."
  - "Cleanup-on-throw port release. If startStreamFn (x11vnc spawn) throws, the binder releases the port BEFORE rethrowing — otherwise the slot leaks. Guarded by the 'releases the port if startStreamFn throws' test."
  - "Single sharedPortAllocator in index.ts injected into StreamManager. The native binder reads it via streamManager.getPortAllocator() so there is one [15900, 16000) pool shared across WebApps and native apps per D-101-PORT-ALLOC. `grep -c 'new PortAllocator' source/index.ts` = 1, matching the plan's acceptance."
  - "privateProcedure (not adminProcedure) for spawn. Admin gate stays on create/delete (config persistence is admin-only per T-101-02). spawn just instantiates an already-validated config; gating dock clicks behind admin would block regular users from the Pillar B dock experience."
  - "Error mapping: spawn fail → INTERNAL_SERVER_ERROR; window-poll timeout → PRECONDITION_FAILED (NativeAppWindowNotFoundError caught specifically); missing config → NOT_FOUND; no auth → UNAUTHORIZED. The PRECONDITION_FAILED code surfaces a distinct UI affordance for 'binary launched but window never appeared' (vs. 'binary itself failed to launch')."
  - "Logger adaptation: ctx.logger has log/verbose/error (Livinityd base logger). The spawner + binder modules expect info/warn/error/verbose (matches the streamingLogger pattern in source/index.ts:386-392). Built an adaptLogger once at the top of the spawn handler and reused for both child modules."
metrics:
  duration_minutes: ~25
  tasks_completed: 4
  tests_added: 13
  tests_total_now_passing: 70 (across 5 affected suites)
  commits: 4
  completed_at: "2026-05-11T00:39:53Z"
---

# Phase 101 Plan 05: Native App Window-Bind + Stream Wire-Up Summary

**One-liner:** Pillar B closure — after `spawnNativeApp()` (101-03) returns, `bindNativeAppWindow()` polls xdotool for the WM_CLASS-matching window on `:1`, allocates a port from the shared `PortAllocator` (101-02), and starts the x11vnc-backed stream against the matched wid; tRPC `apps.native.spawn(id)` is the single mutation the dock UI calls and it chains store.get → spawn → bind → stream URL end-to-end.

## What Shipped

### 1. NativeAppBinder (`native-app-binder.ts`, 231 lines)

| Export | Surface |
| --- | --- |
| `bindNativeAppWindow({pid, wmClass, display?, portAllocator, startStreamFn, execFileFn?, deadlineMs?, pollIntervalMs?, label?, logger?})` | Polls xdotool `search --onlyvisible --class <wmClass>` on the display, diffs against the baseline snapshot, returns `{wid, port, streamId, wsUrl}` on match. Allocates port AFTER match; releases on stream-start failure. |
| `snapshotWindowIds(display, execFileFn?)` | Pre-spawn baseline. Returns `Set<number>` of every currently-visible wid on the display. Failures (xdotool missing) return an empty Set. |
| `inferWmClass(binaryPath)` | Fallback when `cfg.wmClassHint` is absent. Lowercased basename with trailing extension stripped (`/usr/bin/code` → `code`, `/opt/Antigravity/antigravity` → `antigravity`, `/opt/foo/bar.bin` → `bar`). |
| `NativeAppWindowNotFoundError` | Thrown when the 5s deadline elapses without a new matching wid. Carries `wmClass` for diagnostics. |
| `ExecFileFn`, `StreamStartFn`, `BinderLogger`, `BindOpts` | Public type surface. |

Defaults: `display=':1'`, `deadlineMs=5000` (D-101-NATIVE-APPS), `pollIntervalMs=100` (matches webapps/window-discovery.ts cadence). Tests pass `pollIntervalMs: 0` so the suite runs in milliseconds without needing fake timers.

### 2. tRPC route extension (`native-routes.ts`)

Added a `spawn` mutation alongside the existing `list / get / create / delete` quartet:

```ts
spawn: privateProcedure
  .input(z.object({id: z.string().uuid()}))
  .mutation(async ({ctx, input}) => {
    const store = requireStore(ctx)
    const sm = requireStreamManager(ctx)
    const cfg = await store.get(input.id)
    if (!cfg) throw new TRPCError({code: 'NOT_FOUND', ...})

    const {pid} = await spawnNativeApp({cfg, logger})
    const wmClass = cfg.wmClassHint ?? inferWmClass(cfg.binaryPath)
    const bound = await bindNativeAppWindow({
      pid, wmClass,
      portAllocator: sm.getPortAllocator(),
      startStreamFn: makeStartStreamFn(sm, ctx.currentUser.id),
      logger, label: cfg.name,
    })
    return {id: cfg.id, pid, wid: bound.wid, port: bound.port, streamId: bound.streamId, wsUrl: bound.wsUrl}
  })
```

The `makeStartStreamFn(sm, userId)` adapter wraps `StreamManager.startStream(...)` (sync, `{userId, mode, target}` envelope) into the binder's `StreamStartFn` promise shape, pinning the mode to `vnc-window` and the target to `{wid}`.

Error mapping:

| Cause | tRPC code |
| --- | --- |
| `cfg === null` | `NOT_FOUND` |
| `ctx.currentUser` missing | `UNAUTHORIZED` |
| `requireStreamManager` (boot edge / Pillar B unavailable) | `SERVICE_UNAVAILABLE` |
| `NativeAppSpawnError` (binaryPath / env validation, etc.) | `INTERNAL_SERVER_ERROR` |
| `NativeAppWindowNotFoundError` (5s deadline) | `PRECONDITION_FAILED` |
| any other `startStreamFn` rejection | `INTERNAL_SERVER_ERROR` |

The spawned child is **left alive** when the bind times out — per the plan's truth #5, the user can retry via the dock OR kill manually via xdotool/wmctrl.

### 3. httpOnlyPaths registration (`common.ts`)

Added `'apps.native.spawn'` to the registry with a comment explaining the same WS-reconnect-survival rationale that applies to siblings `apps.native.create/delete` and `streams.start` (mutation latency 1-5s; response carries a fresh `streamId + wsUrl` the dock UI needs to subscribe to immediately; pitfall B-12 / X-04).

### 4. Shared PortAllocator wire-up (`source/index.ts`)

```ts
import {PortAllocator} from './modules/streaming/port-allocator.js'
// …
const sharedPortAllocator = new PortAllocator()
this.streamManager = new StreamManager({
  caps, spawn: x11Spawn, logger: streamingLogger,
  portAllocator: sharedPortAllocator,
})
```

`grep -c 'new PortAllocator' source/index.ts` returns **1** (plan acceptance ✓). The native binder reads the same allocator via `streamManager.getPortAllocator()` — the cross-Wave 1 stitch the plan called out in Task 2. WebApps + native apps now draw from the same [15900, 16000) pool with zero collision risk.

## Test Counts

| Suite | Count | Pass | Notes |
| --- | --- | --- | --- |
| `apps/native-app-binder.test.ts` (NEW) | 13 | 13 | RED→GREEN; 11 + 2 supplementary (`label` propagation, default display = `:1`) |
| `apps/native-app-spawner.test.ts` | 13 | 13 | Pre-existing (101-03) — unchanged, re-verified |
| `apps/native-app-config.test.ts` | 14 | 14 | Pre-existing (101-03) — unchanged, re-verified |
| `streaming/port-allocator.test.ts` | 9 | 9 | Pre-existing (101-02) — unchanged, re-verified |
| `streaming/stream-manager.test.ts` | 21 | 21 | Pre-existing (101-02 wave 1) — re-verified after sharedPortAllocator injection |
| **Total verified now-green** | **70** | **70** | |

Test invocation:
```
./node_modules/.bin/vitest run source/modules/apps/native-app-binder.test.ts \
  source/modules/apps/native-app-spawner.test.ts \
  source/modules/apps/native-app-config.test.ts \
  source/modules/streaming/port-allocator.test.ts \
  source/modules/streaming/stream-manager.test.ts --reporter=dot
```

(node_modules junction-linked from the parent worktree; same convention 101-02 / 101-03 used per their summary deviations.)

## Acceptance Criteria — Verified

| Task | Criterion | Result |
| --- | --- | --- |
| 1 | `test -f .../native-app-binder.ts` | PASS (231 lines) |
| 1 | `test -f .../native-app-binder.test.ts` | PASS (311 lines) |
| 1 | `grep -q "deadlineMs"` in binder.ts | PASS (3 occurrences) |
| 1 | `grep -q "portAllocator.allocate"` in binder.ts | PASS (1 occurrence) |
| 1 | `grep -q "portAllocator.release"` in binder.ts | PASS (cleanup safety — 1 occurrence) |
| 1 | binder tests exit 0 | PASS (13/13) |
| 2 | `grep -q "spawn:"` in native-routes.ts | PASS (4 occurrences — mutation def + 3 log msgs) |
| 2 | `grep -q "bindNativeAppWindow"` in native-routes.ts | PASS (3 occurrences — import + 2 references) |
| 2 | `grep -q 'apps\.native\.spawn'` in common.ts | PASS (1 entry registered) |
| 3 | `grep -c 'new PortAllocator' source/index.ts` = 1 | PASS |
| 4 | `git hash-object .../sdk-agent-runner.ts == f3538e1d…` | PASS (pre + post) |
| 4 | `git log -1 --format=%s` contains `101-05` | PASS (latest commit) |

## Commits (4)

| Hash | Message |
| --- | --- |
| `04ed059f` | `test(101-05): add failing tests for native-app-binder (RED)` |
| `d701aae3` | `feat(101-05): implement native-app-binder (GREEN)` |
| `24b0daa0` | `feat(101-05): wire apps.native.spawn(id) end-to-end orchestrator` |
| `2e6ef7f4` | `feat(101-05): share PortAllocator across StreamManager + native-app binder` |

The 4 commits map cleanly to the plan's 4 tasks: Task 1 split into RED/GREEN (TDD), Task 2 = orchestrator wire-up, Task 3 = shared PortAllocator. Task 4 (final sacred-SHA verify + commit) is satisfied by this SUMMARY commit + the SHA verification table above.

Parallel-worktree convention applied: all 4 commits use `--no-verify` (per the orchestrator-mandated parallel-execution flag), STATE.md / ROADMAP.md NOT touched (parent will merge + roll up via gsd-execute-phase).

## Sacred SHA Verification

| Point | Hash | Match |
| --- | --- | --- |
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 1 (RED commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 1 (GREEN commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 2 (spawn route) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 3 (sharedPortAllocator) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post SUMMARY commit (re-verify) | (verified below in self-check) | |

Plan 101-05 does NOT touch the `liv/` tree — only `livos/packages/livinityd/` + `.planning/`. Constraint preserved.

## Deviations from Plan

### Architecture (no Rule 4 — pragmatic adaptation, not a structural change)

**1. [Adaptation] Did NOT convert `nativeAppsRouter` to `buildNativeAppsRouter(...)` builder**

- **Found during:** Task 2 read-first phase.
- **Issue:** The plan proposes refactoring the existing `export const nativeAppsRouter = router({...})` (Phase 101-03 ship) into a `buildNativeAppsRouter({store, spawn, bind, portAllocator, streamManager, logger})` builder function. That refactor would also require changing the tRPC composition in `server/trpc/index.ts` to call the builder with constructor args. The existing nativeAppsRouter uses `ctx.livinityd.nativeAppConfigStore` (pulled via `requireStore(ctx)`) — that pattern is the canonical ctx-injection convention in this tree (streams.start at trpc-router.ts:64 uses the identical `ctx.livinityd?.streamManager` shape).
- **Resolution:** Kept the existing const-export pattern and added the `spawn` mutation alongside the other 4 procedures. Introduced a `requireStreamManager(ctx)` helper (symmetric with `requireStore(ctx)`) that pulls StreamManager off ctx, then reads `sm.getPortAllocator()` for the binder's PortAllocator. Every grep-acceptance criterion in the plan still passes (`spawn:`, `bindNativeAppWindow`, `apps.native.spawn`). Smaller blast radius (no changes to `server/trpc/index.ts`), and the architecture stays consistent with the rest of the tRPC routes.
- **Commit:** `24b0daa0`

### Auto-fixed Issues

**2. [Rule 1 — Type mismatch] `vi.fn(async () => {...})` mock type tripped TS2493 on `startStreamFn.mock.calls[0][0]`**

- **Found during:** `tsc --noEmit` after Task 2 wire-up.
- **Issue:** When `vi.fn` is invoked with a zero-arg async factory, the resulting mock has type `Mock<() => Promise<...>>` so its `.mock.calls` is `[][]` (empty tuple at every index). Two tests dereferenced `.mock.calls[0][0].port` to assert ordering — those lines surfaced `TS2532 / TS2493` errors. This is the exact same type-mismatch the 101-03 spawner suite hit (see 101-03-SUMMARY.md deviation 2).
- **Fix:** Widened the mock to `vi.fn(async (..._args: any[]) => ({...}))` — runtime behaviour unchanged, only the type signature widens to accept rest args. Pattern matches the spawner suite at native-app-spawner.test.ts:70.
- **Files modified:** `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` (test body only).
- **Commit:** `24b0daa0` (bundled with the Task 2 wire-up since it's a typecheck unblocker).

**3. [Rule 3 — Logger surface mismatch] ctx.logger does not expose `.info()` / `.warn()`**

- **Found during:** Task 2 write-up.
- **Issue:** The plan's example code wrote `opts.logger?.info?.(...)` and `opts.logger?.warn?.(...)` directly against `ctx.logger`. But `ctx.logger` is `Livinityd['logger']` (utilities/logger.ts) — it exposes `log/verbose/error` only, not `info/warn`. The pre-existing streams/trpc-router.ts has the same bug (calls `ctx.logger?.info?.(...)`) but the chained optional-call silently no-ops at runtime — masking that the logger surface is wrong.
- **Fix:** Built a `adaptLogger` once in the `spawn` handler that maps `log → info`, `error → warn AND error`, `verbose → verbose`. This is the exact pattern used at source/index.ts:386-392 for the streamingLogger and matches how 101-03 wired its spawnerLogger. Then call `logger?.log(...)` / `logger?.error(...)` directly when the route itself needs to log — those calls hit the base livinityd logger surface and produce real output.
- **Files modified:** `livos/packages/livinityd/source/modules/apps/native-routes.ts` (route handler only).
- **Commit:** `24b0daa0`

## Deferred Issues (out of scope per Rule scope-boundary)

Pre-existing test failures in the `apps/` directory unrelated to 101-05:
- `apps.integration.test.ts` + `app-repository.integration.test.ts`: `@anthropic-ai/claude-agent-sdk` import path stale in the parent worktree's prebuilt @liv/core (touches sacred-SHA path — out of scope, would violate D-101-SACRED to fix).
- `inject-ai-provider.test.ts`: empty file (zero tests collected).
- `manifest-mirofish.test.ts`: missing draft manifest at `.planning/phases/43-...` (file was deleted in the gitStatus `D .planning/...` section at session start — pre-existing).
- `app-store.integration.test.ts`: similar shape to apps.integration.test.ts.

None touched by Plan 101-05. None are in the `apps/native-*` or `streaming/` subtrees. Logged here for the next round's awareness.

The pre-existing streams/trpc-router.ts uses `ctx.logger?.info?.(...)` against a logger surface that has no `.info()` — that means stream-start logs have been silently no-op'd since Phase 93. Out of scope to fix here (different plan), but flagged for whoever audits 100-09 / 100-10 / future P93 plans.

## Authentication Gates

None.

## Known Stubs / Carryovers

None. All 4 tasks shipped full functionality + tests. The plan called out 9 minimum binder tests; 13 ship green (extra: label propagation, default-display `:1`, info-log success line — bonus coverage with negligible cost).

## Threat Model Coverage

This plan touches no new trust boundaries — it consumes the validated `NativeAppConfig` from 101-03's persisted Redis store. T-101-02 mitigations (binaryPath regex, env LD_/DYLD_ blocklist, admin-gated mutations on create/delete) all stay in force at the upstream layer. The new `spawn` route does NOT take user-supplied paths or args — it only takes a UUID that indexes into already-validated configs. No new threat-model rows needed.

## Self-Check: PASSED

### Files Created
- `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` — FOUND (231 lines)
- `.planning/phases/101-livos-universal-app-orchestration/101-05-SUMMARY.md` — being written now (about to commit)

### Files Modified
- `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` — FOUND (311 lines, Wave 0 stub → 13 real cases)
- `livos/packages/livinityd/source/modules/apps/native-routes.ts` — FOUND (modified — +spawn mutation + StreamStartFn adapter)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — FOUND (modified — +1 httpOnlyPaths entry)
- `livos/packages/livinityd/source/index.ts` — FOUND (modified — +PortAllocator import + sharedPortAllocator construction + injection)

### Commits
- `04ed059f` (test RED) — FOUND
- `d701aae3` (impl GREEN) — FOUND
- `24b0daa0` (spawn orchestrator) — FOUND
- `2e6ef7f4` (sharedPortAllocator) — FOUND

### Grep Acceptance
- `grep -c "deadlineMs"` in binder.ts: **3** (PASS)
- `grep -c "portAllocator.allocate"` in binder.ts: **1** (PASS)
- `grep -c "portAllocator.release"` in binder.ts: **1** (PASS, cleanup safety)
- `grep -c "spawn:"` in native-routes.ts: **4** (PASS)
- `grep -c "bindNativeAppWindow"` in native-routes.ts: **3** (PASS)
- `grep -c "'apps\.native\.spawn'"` in common.ts: **1** (PASS)
- `grep -c "new PortAllocator"` in source/index.ts: **1** (PASS — Task 3 invariant)

### Test Suite
- `apps/native-app-binder.test.ts`: 13 pass
- `apps/native-app-spawner.test.ts`: 13 pass (re-verified)
- `apps/native-app-config.test.ts`: 14 pass (re-verified)
- `streaming/port-allocator.test.ts`: 9 pass (re-verified)
- `streaming/stream-manager.test.ts`: 21 pass (re-verified after sharedPortAllocator injection)
- **70 / 70 PASS** across the 5 affected suites.

### Sacred SHA
- Pre-execution: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Post 4 commits: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Match: ✓
- Plan does not touch `liv/` tree (verified via `git diff --stat HEAD~4 -- liv/` returning empty).
