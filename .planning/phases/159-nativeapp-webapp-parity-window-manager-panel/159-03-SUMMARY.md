---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 03
subsystem: infra
tags: [livinityd, reaper, lifecycle, defense-in-depth, native-app, setTimeout-cron, vitest-real-timers]

# Dependency graph
requires:
  - phase: 101-native-apps-pillar
    provides: "activeNative map + closeNativeApp helper + DisplayAllocator (Phase 101-05/102-08 shipped)"
  - phase: 102-native-app-per-display
    provides: "PortAllocator + StreamManager.getPortAllocator() bridge"
  - phase: 104-heartbeat
    provides: "self-rescheduling setTimeout pattern (heartbeat-sender.ts:218-243)"
  - phase: 159-01
    provides: "Wave 0 test stub at native-app-idle-reaper.test.ts (replaced with real tests)"
provides:
  - "native-app idle reaper module (defense-in-depth backstop for native-app handle leaks)"
  - "exported activeNative + nativeDisplayAllocator singletons from native-routes.ts"
  - "boot-time wire-up in livinityd start() + graceful stop() teardown"
  - "5 passing unit tests with REAL-timer pattern (vitest)"
affects: [159-04, future-native-app-lifecycle-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-rescheduling setTimeout cron (NOT setInterval) — each tick fully resolves before next is armed; copied from heartbeat-sender.ts:218-243"
    - "Env-var-tunable idle threshold (NATIVE_APP_IDLE_REAP_MS, default 30min) read at module init"
    - "REAL-timer vitest pattern for self-rescheduling chains (heartbeat-sender.test.ts precedent — fake timers interact poorly with the setTimeout chain)"
    - "Module-scope singletons exported for cross-module live-reference sharing (vs ctx injection)"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.ts (108 lines — reaper module)"
  modified:
    - "livos/packages/livinityd/source/modules/apps/native-routes.ts (+12 lines — export 2 singletons)"
    - "livos/packages/livinityd/source/index.ts (+45 lines — import + class field + start-wire + stop-wire)"
    - "livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.test.ts (199 lines — replaced Wave 0 stub with 5 real tests)"

key-decisions:
  - "Use setTimeout NOT setInterval (per Plan 03 CRITICAL — heartbeat-sender pattern)"
  - "30s walk interval hardcoded (light enough not to need tuning)"
  - "30min default idle threshold via NATIVE_APP_IDLE_REAP_MS env (operator-tunable)"
  - "Snapshot Array.from(active.entries()) up-front each tick — concurrent spawn/close mutations during iteration don't perturb the loop"
  - "Per-entry try/catch around closeNativeApp — one failing entry never blocks subsequent reaps"
  - "Reaper stop fires in stop() between stopHeartbeat and streamManager teardown — in-flight reaps finish against healthy stream-manager"
  - "REAL timers in tests (50ms interval / 1000ms idle / sleep) — fake timers race the microtask queue of the self-rescheduling chain"
  - "Reaper uses module-scope singletons from native-routes.ts directly (vs ctx injection) — same pattern Phase 104 stopHeartbeat uses for redis"

patterns-established:
  - "Pattern: defense-in-depth cron over user-facing lifecycle — even if the primary close path (159-02 close-handler registry) drops a teardown signal, the reaper catches the leak within idleMs"
  - "Pattern: 3-commit atomic execution of a backend feature (1: export deps from owner module / 2: create new module + tests / 3: wire into application root) — preserves bisectability"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-05-19
---

# Phase 159 Plan 03: Native-App Idle Reaper Summary

**Defense-in-depth backstop module: self-rescheduling 30s setTimeout walks `activeNative` and calls `closeNativeApp` on handles older than `NATIVE_APP_IDLE_REAP_MS` (default 30min); armed at livinityd start, stopped on shutdown; 5 vitest unit tests green.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-19T01:09Z
- **Completed:** 2026-05-19T01:23Z
- **Tasks:** 3 / 3 (all atomic)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **Backstop catches lifecycle leak from any source** — even if the 159-02 close-handler registry never fires, even if the native-routes `close` mutation 404s, even if the operator manually kills the UI mid-stream, the reaper guarantees a stale native-app handle (its child + Xvfb + x11vnc + display slot + port slot) is fully reclaimed within `NATIVE_APP_IDLE_REAP_MS` (default 30min).
- **Idempotent w.r.t. all other close paths** — `closeNativeApp`'s eager `active.delete` means if any other path already cleaned an entry, the reaper sees it gone on the next walk and does nothing.
- **Env-var-tunable from day 1** — `NATIVE_APP_IDLE_REAP_MS` operator override, no config file required.
- **REAL-timer test suite** (not fake) — 5 tests, ~1s total runtime, no flake against the self-rescheduling chain.

## Task Commits

Each task committed atomically:

1. **Task 1: Export activeNative + nativeDisplayAllocator from native-routes** — `02d7fc86` (feat)
2. **Task 2: Create native-app-idle-reaper.ts + 5 unit tests** — `3432cc6f` (feat)
3. **Task 3: Wire reaper into livinityd start()/stop()** — `e60e5b43` (feat)

Plan metadata (this SUMMARY) commit pending.

## Files Created/Modified

- **`livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.ts`** (created, 108 lines) — Reaper module. Exports `startNativeAppIdleReaper(opts) → stop()`. Self-rescheduling setTimeout copied verbatim from `account/heartbeat-sender.ts:218-243`. `tick()` snapshots `Array.from(opts.active.entries())` up-front so concurrent spawn/close don't perturb the loop; per-entry `try/catch` around `closeNativeApp` so one failure never blocks subsequent reaps.
- **`livos/packages/livinityd/source/modules/apps/native-routes.ts`** (+12 lines) — Promoted the two module-scope singletons (`nativeDisplayAllocator`, `activeNative`) to `export const`. Both retain field-for-field semantics; all existing spawn/close routes continue to mutate the same singletons.
- **`livos/packages/livinityd/source/index.ts`** (+45 lines net) — 4 changes:
  - Added imports for `startNativeAppIdleReaper`, `activeNative`, `nativeDisplayAllocator`.
  - Added private `nativeAppIdleReaperStop?: () => void` class field.
  - In `start()` after the StreamManager construction block, constructed `reaperLogger` via `createChildLogger('native-reaper')` and called `startNativeAppIdleReaper({active, displayAllocator, streamManager, logger})`, stashing the returned stop on `this.nativeAppIdleReaperStop`.
  - In `stop()` between the `stopHeartbeat` teardown and the streamManager teardown, called `this.nativeAppIdleReaperStop?.()` so in-flight reap ticks finish against a healthy stream-manager.
- **`livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.test.ts`** (replaced Wave 0 stub) — 5 vitest tests using the REAL-timer pattern (50ms interval / 1000ms idle / `await sleep(200)` between assertions). Tests: (1) reaps entries older than idleMs, (2) does NOT reap entries within idleMs window, (3) `stop()` halts further ticks, (4) per-entry close failure does NOT stop the tick from reaping others, (5) sacred-SHA marker invariant.

## Reaper Module API

```ts
import {startNativeAppIdleReaper} from './native-app-idle-reaper.js'

const stop = startNativeAppIdleReaper({
  active: activeNative,                        // Map<string, ActiveNativeApp>
  displayAllocator: nativeDisplayAllocator,    // DisplayAllocator
  streamManager: this.streamManager,           // StreamManager
  logger: reaperLogger,                        // {info, warn, error}
  // Optional test/operator overrides:
  // idleMs: 1_800_000,                        // default = env NATIVE_APP_IDLE_REAP_MS || 30min
  // intervalMs: 30_000,                       // default = 30s (hardcoded)
})

// On shutdown:
stop()
```

## Environment Variable

| Variable | Default | Description |
|----------|---------|-------------|
| `NATIVE_APP_IDLE_REAP_MS` | `1_800_000` (30 min) | Reap entries whose `Date.now() - startedAt` exceeds this value. Operator override only; tests pass `opts.idleMs` directly. |

## Wire-up Location

- **start():** `livinityd/source/index.ts:670` — AFTER `streamingLogger.info('StreamManager started ...')` line, BEFORE the `profileSeeder` initialization block. Mirrors the Phase 104 `stopHeartbeat` lifecycle pattern.
- **stop():** `livinityd/source/index.ts:973` — AFTER `stopHeartbeat?.()` teardown, BEFORE `webappWindowManager.stopIdleCleanup()`. Ensures in-flight reaper ticks finish against a healthy StreamManager surface.

## Test Approach

**REAL timers, not fake.** Vitest's `vi.useFakeTimers()` interacts poorly with the self-rescheduling setTimeout chain because each tick must yield to the microtask queue multiple times before resolving — flake-prone under fake timers. Instead, tests use very short intervals (50ms walk / 1000ms idle) + `await sleep(200)` between arming and assertion. Each test takes ~200-300ms; the whole suite is ~1s.

This is the same approach `account/heartbeat-sender.test.ts` already uses (precedent shipped Phase 104 plan 104-10). Documented in the test file header.

## Decisions Made

- **setTimeout NOT setInterval** — explicit Plan 03 CRITICAL. Mirrors `heartbeat-sender.ts:218-243` verbatim. Reason: a slow `closeNativeApp` tick (multi-second SIGTERM grace) cannot pile up overlapping passes — each tick fully resolves before the next is armed.
- **30s walk interval hardcoded, 30min idle threshold env-tunable** — walk frequency is "noise" cost (light); idle threshold is operator policy.
- **Snapshot entries up-front each tick** — `Array.from(opts.active.entries())` before the for-loop, so a concurrent `apps.native.spawn` mutation during the iteration doesn't add a new entry that the loop tries to reap (and a concurrent close doesn't crash on missing-key path either).
- **Per-entry try/catch** — one failing `closeNativeApp` (e.g. child already exited, Xvfb pipe broken) NEVER blocks reaping subsequent stale entries. Failure is logged at `warn`.
- **Reaper stop call lives between stopHeartbeat and streamManager teardown** — important ordering: stopHeartbeat first (independent), reaper stop next (so in-flight reap ticks see a healthy streamManager), THEN streamManager teardown.
- **Module-scope singletons exported (not ctx-injected)** — matches the existing Phase 104 pattern of `startHeartbeat` consuming `this.ai.redis` directly. The alternative (passing through ctx) would have required a deeper refactor with no actual gain.

## Deviations from Plan

None — plan executed exactly as written.

(One minor adjustment: the plan referenced `livos/packages/livinityd/source/modules/streaming/heartbeat-sender.ts` for the pattern source but the actual file lives at `livos/packages/livinityd/source/modules/account/heartbeat-sender.ts`. Same pattern, same lines 218-243. Confirmed via Glob — no work needed, just a doc-path note.)

## Issues Encountered

- **Pre-existing tsc errors in unrelated files** (`widgets/routes.ts`, `ai/routes.ts`, etc.) — 384 errors total in the livinityd workspace, none in any file this plan touched. Plan 159-03 verification confirmed via filtered tsc grep: no errors in `native-app-idle-reaper.ts`, `native-routes.ts`, or `source/index.ts`. Out-of-scope per executor scope-boundary rule.

## Sacred SHA Invariant

Verified after every commit:
```
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Sacred SHA preserved through all 3 task commits (02d7fc86, 3432cc6f, e60e5b43).

## Next Phase Readiness

- **159-04 (window-manager close-handler wire-up on NativeAppStreamWindow):** Reaper provides defense in depth. Even if 159-04 ships with bugs, the reaper guarantees no permanent leak.
- **Mini PC UAT (post-merge):** Operator should set `NATIVE_APP_IDLE_REAP_MS=60000` temporarily and force-leak a native-app handle (e.g. SIGKILL livinityd between spawn and close) to verify the reaper picks it up on next boot's first tick.
- **No follow-up plan required for 159-03 specifically** — module is feature-complete.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.ts` exists
- [x] `livos/packages/livinityd/source/modules/apps/native-routes.ts` has `export const activeNative` + `export const nativeDisplayAllocator`
- [x] `livos/packages/livinityd/source/index.ts` has reaper imports + class field + start-wire + stop-wire
- [x] Commit `02d7fc86` exists (Task 1)
- [x] Commit `3432cc6f` exists (Task 2)
- [x] Commit `e60e5b43` exists (Task 3)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged for `liv/packages/core/src/sdk-agent-runner.ts`
- [x] `pnpm --filter livinityd test -- --run native-app-idle-reaper` → 5 passed (1.44s)

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Plan: 03 (Workstream B — defense-in-depth native-app idle reaper)*
*Completed: 2026-05-19*
