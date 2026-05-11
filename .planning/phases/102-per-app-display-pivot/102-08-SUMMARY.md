---
phase: 102
plan: 08
subsystem: livinityd-lifecycle
tags: [close-lifecycle, idempotency, native-app, webapps, sigterm-sigkill, wave-3]

# Dependency graph
requires:
  - phase: 102-per-app-display-pivot
    plan: 04
    provides: ActiveWebApp {chromeHandle, xvfbHandle, profileUuid, displayN, port, streamId}; WebAppWindowManager.close() stream-only placeholder
  - phase: 102-per-app-display-pivot
    plan: 05
    provides: ActiveNativeApp {child, xvfb, displayN, port, streamId}; activeNative module-scope map; nativeDisplayAllocator
  - phase: 102-per-app-display-pivot
    plan: 01
    provides: DisplayAllocator.release(N), XvfbHandle.stop()
  - phase: 101-livos-universal-app-orchestration
    plan: 02
    provides: PortAllocator.release(port) idempotent
provides:
  - WebAppWindowManager.close() — full D-102-CLOSE-LIFECYCLE 8-step ordered teardown (replaces the 102-04 stream-only placeholder)
  - closeNativeApp(opts) primitive — 7-step ordered teardown for native apps (no master-profile cleanup; native binaries manage their own state)
  - NativeActiveEntry interface (exported from native-app-binder.ts) — production map shape for active native-app instances
  - apps.native.close tRPC mutation (adminProcedure + z.string().uuid()) — routes to closeNativeApp; returns {ok:true} idempotently
  - SIGKILL fallback ladder for native binaries (default killGraceMs=2000)
affects: [102-10 (Mini PC UAT — close-lifecycle is a UAT pillar)]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — composes Wave 1-2 primitives only
  patterns:
    - "Eager active-map delete BEFORE teardown — concurrent close() races short-circuit on the missing-entry path; failures during teardown do NOT put the entry back"
    - "Every teardown step wrapped in try/catch with warn-level logging — failures in (e.g.) chrome.stop NEVER block subsequent releases. displayAllocator.release ALWAYS runs as long as the entry was registered"
    - "SIGKILL fallback ladder via Promise.race — SIGTERM first, exit/error event vs. timeout race; if timer wins, SIGKILL fires; whichever resolves first, we move on"
    - "Idempotent close at allocator + primitive layers — DisplayAllocator.release + PortAllocator.release ignore out-of-range or already-released slots; closeNativeApp + WebAppWindowManager.close return clean no-ops for missing/already-closed ids"
    - "Re-declare NativeActiveEntry in native-app-binder.ts (not import from native-routes.ts) — preserves Phase 102-05 inversion (primitive is route-agnostic)"
    - "Stream-manager stopStream return-type widening — primitive accepts Promise<unknown> not Promise<void> to match production StreamManager.stopStream's {stopped:boolean} return"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
    - livos/packages/livinityd/source/modules/apps/native-app-binder.ts
    - livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts
    - livos/packages/livinityd/source/modules/apps/native-routes.ts
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md
  deleted: []

key-decisions:
  - "WebApp close() signature PRESERVED as close(opts: {webappId, userId, killWindow?}) — NOT the simpler close(webappId) in the plan task body. Reason: 27 pre-existing tests (Test 8, Test 13, Test 17, Test 20, etc.) call close with the {webappId, userId} shape; switching the signature would have broken them. Plan acceptance criteria are about call-site behavior (chromeHandle.stop, xvfbHandle.stop, profileSeeder.cleanup, displayAllocator.release all invoked) — all satisfied by the preserved-signature impl."
  - "Eager active.delete() BEFORE any teardown work. A concurrent second close() with the same webappId observes the missing entry first and returns {ok:true} immediately. This is the canonical concurrent-close pattern from the plan body. The teardown loop runs only on a captured local `entry` reference."
  - "Each teardown step wrapped in try/catch with WARN-level logging (not ERROR), and the close() Promise NEVER rejects. The contract is 'best-effort drain' — even if chromeHandle.stop throws, streamManager.stopStream + xvfbHandle.stop + profileSeeder.cleanup + displayAllocator.release + portAllocator.release all still run. Verified by T-102-08-05/06/07/08 cascade tests."
  - "Native binary kill ladder: SIGTERM first, then Promise.race(exit-event, killGraceMs-timeout). If the timer wins, SIGKILL fires. killGraceMs is a test-injectable opt (default 2000ms). Test T-102-08-N-03 forces stay-alive via _setStayAlive() and asserts SIGKILL was invoked after the grace window."
  - "userId mismatch on close() still returns {ok: false} (NOT {ok: true}). Preserves the 102-04 contract — a user who tries to close another user's webappId is informed of the no-op outcome. Missing-entry (idempotent path) returns {ok: true} because there's no security distinction (the entry doesn't exist for ANY user)."
  - "Re-declare NativeActiveEntry in native-app-binder.ts (sibling of the route-owned activeNative map) instead of importing the route's ActiveNativeApp. Preserves Phase 102-05's primitive-vs-route inversion: the binder is route-agnostic and only depends on streaming primitives (PortAllocator, DisplayAllocator, XvfbHandle, ChildProcess). The route owns the singleton map; the primitive operates on a passed-in Map<string, NativeActiveEntry>."
  - "Stream-manager type relaxation — CloseNativeOpts.streamManager.stopStream returns Promise<unknown> not Promise<void>. Production StreamManager.stopStream resolves to {stopped: boolean}; the binder never reads the value. Without this widening, native-routes.ts wouldn't pass through the full StreamManager (TS2322) and would need awkward adapter wrapping."
  - "tRPC close mutation is adminProcedure (T-101-02 carry). Every native-app mutation that can affect a binary process (spawn, delete, close) must be admin-only. Input gated by z.string().uuid() schema BEFORE the primitive sees the id; the primitive itself does NOT validate id format (T-102-08-N-04 smoke verifies invalid id is a clean no-op anyway)."

patterns-established:
  - "8-step ordered teardown contract for app instances — chromeHandle/binary.stop → streamManager.stopStream → xvfbHandle.stop → [profile.cleanup if WebApp] → display.release → port.release → unregister-MCP → active.delete. Same shape on WebApp + native paths so future plans (e.g. extension to other app types) inherit a single mental model."
  - "Eager-delete-then-drain pattern: remove entry from map FIRST, then run teardown. Prevents concurrent close() races without needing locks. The captured local `entry` reference holds all the handles."
  - "Best-effort drain with WARN-not-ERROR logging — close() never rejects. Caller-side error handling becomes trivial: `await close()` and you're done."

requirements-completed:
  - D-102-CLOSE-LIFECYCLE   # ordered teardown + idempotency for WebApps AND native apps
  - D-102-SACRED            # Sacred SHA f3538e1d... unchanged across all 4 commits

# Metrics
duration: ~7min
completed: 2026-05-11
---

# Phase 102 Plan 08: Close lifecycle (ordered teardown + idempotency, WebApps + Native apps) Summary

**Implemented the full D-102-CLOSE-LIFECYCLE ordered teardown across both app surfaces — WebAppWindowManager.close() executes the 8-step shutdown (chromeHandle.stop → streamManager.stopStream → xvfbHandle.stop → profileSeeder.cleanup → displayAllocator.release → portAllocator.release → deregisterWebAppMcp → active.delete) and native-app-binder.closeNativeApp() executes the 7-step variant (no master-profile cleanup for native binaries). Both paths idempotent (re-call = no-op), both use eager active-map delete to prevent concurrent-close races, both wrap every step in try/catch so a failure NEVER blocks subsequent releases. apps.native.close tRPC mutation (adminProcedure + z.uuid()) wires the native primitive to the route layer. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 4 commits.**

## Performance

- **Duration:** ~7 min (autonomous, parallel worktree)
- **Started:** 2026-05-11T10:31:53Z
- **Completed:** 2026-05-11T10:38:21Z
- **Tasks:** 4 / 4 committed
- **Files modified:** 6 (3 source + 2 test + 1 validation)
- **Files created:** 0 (no new modules — all extensions of existing files)
- **Files deleted:** 0
- **Net LOC delta:** +817 / -25 (mostly tests + new closeNativeApp + new tRPC route)

## Accomplishments

- **WebApp close path (window-manager.ts)** — replaced the Phase 102-04 stream-only placeholder with the full 8-step ordered teardown:
  1. `entry.chromeHandle.stop()` — SIGTERM Chrome → 2s grace → SIGKILL (kill ladder owned by the spawnChromeProcess handle from 102-02).
  2. `streamManager.stopStream(streamId)` — kills x11vnc child + releases its allocated stream port internally.
  3. `entry.xvfbHandle.stop()` — SIGTERM Xvfb (102-01 readiness-polled spawner handle owns the kill ladder).
  4. `profileSeeder.cleanup(entry.profileUuid)` — `rm -rf /tmp/livos-chrome-app-<uuid>` (102-03 cleanup).
  5. `displayAllocator.release(entry.displayN)` — :N back to [10..99) pool.
  6. `portAllocator.release(entry.port)` — tracking port slot back (stream-manager already released its own; second release on the shared allocator is a no-op per 101-02 contract).
  7. `deregisterWebAppMcp(webappId)` — drop the per-WebApp Luse MCP child via livinityd's McpConfigManager (Redis pub-sub reconcile to liv-core is async, ~1-2s lag).
  8. `active.delete(webappId)` — performed eagerly FIRST so concurrent close() races short-circuit on the missing-entry path.

- **Native app close path (native-app-binder.ts)** — new `closeNativeApp(opts)` primitive performs the 7-step variant (no master-profile cleanup; native binaries manage their own state per D-102-MASTER-PROFILE-SEED scope):
  1. `entry.child.kill('SIGTERM')` — graceful.
  2. `entry.child.kill('SIGKILL')` — fires after `killGraceMs` (default 2000ms) if the child has not exited. Implemented via `Promise.race(exited, killer)` — whichever wins, we move on.
  3. `streamManager.stopStream(streamId)`.
  4. `entry.xvfb.stop()` — SIGTERM Xvfb.
  5. `displayAllocator.release(displayN)`.
  6. `portAllocator.release(port)` — idempotent.
  7. `active.delete(id)` — performed eagerly first.

- **NativeActiveEntry interface** — exported from native-app-binder.ts (mirrors the production ActiveNativeApp shape in native-routes.ts field-for-field). Re-declared in the primitive module rather than imported from the route layer to preserve the Phase 102-05 inversion (primitive is route-agnostic).

- **apps.native.close tRPC mutation** — registered in native-routes.ts:
  - `adminProcedure` gate (T-101-02 carry — every mutation affecting a binary process is admin-only).
  - `z.string().uuid()` input schema validation BEFORE the primitive sees the id.
  - Routes to `closeNativeApp` with module-scope `activeNative` + `nativeDisplayAllocator` + `ctx.streamManager.getPortAllocator()` + `ctx.streamManager` (full StreamManager passed through because the primitive only needs `stopStream`).
  - Returns `{ok: true as const}` idempotently whether the id was active or not.

- **Idempotency proof** — both paths verified by tests:
  - `T-102-08-03`: second WebApp close() on same webappId — chromeHandle.stop, xvfbHandle.stop, profileSeeder.cleanup, displayAllocator.release, portAllocator.release ALL called EXACTLY once.
  - `T-102-08-04`: WebApp close() on never-spawned id — zero teardown side effects, returns cleanly.
  - `T-102-08-N-02`: second native close() on same id — child.kill, stopStream, display.release, port.release ALL called EXACTLY once.

- **Cascade-on-failure proof** — every teardown step wrapped in try/catch; verified by:
  - `T-102-08-05`: WebApp chromeHandle.stop throws → streamManager.stopStream + xvfbHandle.stop + profileSeeder.cleanup + display.release + port.release all still run.
  - `T-102-08-06`: WebApp streamManager.stopStream throws → all subsequent steps still run.
  - `T-102-08-07`: WebApp xvfbHandle.stop throws → profile.cleanup + display.release + port.release still run.
  - `T-102-08-08`: WebApp profileSeeder.cleanup throws → displayAllocator.release + portAllocator.release still run.
  - `T-102-08-N-05`: Native streamManager.stopStream throws → child.kill + xvfb.stop + display.release + port.release still run.

- **SIGKILL fallback verified** — `T-102-08-N-03` forces the child to stay alive after SIGTERM (`child._setStayAlive()`); close() invokes SIGKILL after `killGraceMs=30ms`, and the elapsed time satisfies `elapsed >= 25ms`.

- **VALIDATION.md** rows 102-08-01 + 102-08-02 flipped from `❌ red` to `✅ green`.

- **Sacred SHA** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified PRE and POST every commit. Plan 102-08 touched zero files in `liv/` tree.

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree mode):

1. **Task 1: RED — window-manager.close lifecycle tests** — `1c99a591` (test)
   - Appended Phase 102-08 describe block to window-manager.test.ts with 8 new tests (T-102-08-01..08).
   - VALIDATION.md rows 102-08-01 + 102-08-02 flipped to `❌ red`.
   - 6/8 tests fail (T-102-08-02 active.delete and T-102-08-04 no-such-id pass on existing 102-04 close).

2. **Task 2: GREEN — window-manager.close ordered teardown** — `96ce6d50` (feat)
   - Replaced stream-only placeholder with full 8-step teardown.
   - Eager `active.delete(webappId)` BEFORE teardown loop (concurrent-close guard).
   - 8/8 new T-102-08-xx tests pass; 27 pre-existing tests still green.
   - Total window-manager.test.ts: 35 passed + 22 skipped (57 total).

3. **Task 3: native-app close lifecycle + apps.native.close tRPC route** — `d1aba6fa` (feat)
   - Added `closeNativeApp(opts)` primitive to native-app-binder.ts.
   - Added `NativeActiveEntry` interface (re-declared, not imported).
   - Added `apps.native.close` mutation to native-routes.ts (adminProcedure, z.string().uuid()).
   - Added 5 new T-102-08-N-xx tests (order, idempotency, SIGKILL ladder, uuid smoke, cascade).
   - Auto-fixed Rule 1 bug: widened CloseNativeOpts.streamManager.stopStream return type from `Promise<void>` to `Promise<unknown>` to match production StreamManager.stopStream's `Promise<{stopped: boolean}>`.

4. **Task 4: VALIDATION green + sacred SHA verified** — `40bd5eb9` (chore)
   - 102-08-01/02 flipped `❌ red` → `✅ green`.
   - Sacred SHA confirmed `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged.

## Files Modified

### livos/packages/livinityd/source/modules/webapps/window-manager.ts

**Net delta:** +86 LOC (close() body expanded from stream-only placeholder to full 8-step teardown). The `close(opts)` signature preserved as `close({webappId, userId, killWindow?})` for back-compat with 27 pre-existing tests; the plan-task-body's simpler `close(webappId)` form would have broken them.

Key changes:
- Replaced stream-only close body with ordered 8-step teardown.
- Added eager `active.delete(opts.webappId)` immediately after the entry-lookup short-circuits, BEFORE any teardown work — concurrent-close guard.
- Missing entry returns `{ok: true}` immediately (idempotent no-op).
- userId mismatch returns `{ok: false}` (legacy contract preserved).
- Every step wrapped in try/catch with `logger.warn` — close() Promise NEVER rejects.

### livos/packages/livinityd/source/modules/webapps/window-manager.test.ts

**Net delta:** +220 LOC (8 new T-102-08-xx tests appended). Pre-existing tests untouched.

8 tests cover:
- T-102-08-01: ordered teardown call sequence (mock.invocationCallOrder proof).
- T-102-08-02: active.delete — list returns empty after close.
- T-102-08-03: idempotent — second close call is no-op.
- T-102-08-04: no-such-id — close on never-spawned webappId is no-op.
- T-102-08-05: chromeHandle.stop failure → subsequent steps still execute.
- T-102-08-06: streamManager.stopStream failure → subsequent steps still execute.
- T-102-08-07: xvfbHandle.stop failure → profile/display/port release still execute.
- T-102-08-08: release-before-delete — displayAllocator.release runs even if profileSeeder.cleanup rejects.

Final test count: 35 active + 22 skipped (57 total). All pass.

### livos/packages/livinityd/source/modules/apps/native-app-binder.ts

**Net delta:** +183 LOC.

Added:
- `closeNativeApp(opts: CloseNativeOpts): Promise<void>` — 7-step ordered teardown primitive.
- `NativeActiveEntry` interface — mirror of production ActiveNativeApp shape.
- `CloseNativeOpts` interface — {id, active, displayAllocator, portAllocator, streamManager, logger?, killGraceMs?}.
- `NATIVE_KILL_GRACE_MS = 2000` constant.
- New imports: `ChildProcess` from `node:child_process`, `DisplayAllocator`, `XvfbHandle`.

Modified:
- `CloseNativeOpts.streamManager.stopStream` return type widened from `Promise<void>` to `Promise<unknown>` to accept production StreamManager's `Promise<{stopped: boolean}>`.

### livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts

**Net delta:** +200 LOC (5 new T-102-08-N-xx tests appended).

Added:
- `FakeNativeChild` class with `kill` vi.fn, `exitCode`/`signalCode` getters, and `_setStayAlive()` helper for SIGKILL-ladder testing.
- `makeFakeXvfbHandle(display)` factory.
- `makeActiveEntry(id, displayN, port)` factory.
- 5 closeNativeApp tests (T-102-08-N-01..05).

Final test count: 13 (was 8) — all pass.

### livos/packages/livinityd/source/modules/apps/native-routes.ts

**Net delta:** +37 LOC.

Added:
- `closeNativeApp` import from native-app-binder.js.
- `closeInput = z.object({id: z.string().uuid()})` schema.
- `close` adminProcedure mutation that routes to `closeNativeApp` with module-scope `activeNative` + `nativeDisplayAllocator` + `ctx.streamManager.getPortAllocator()` + full `ctx.streamManager`. Returns `{ok: true as const}`.

### .planning/phases/102-per-app-display-pivot/102-VALIDATION.md

Rows 102-08-01 + 102-08-02 transitioned `⬜ pending` → `❌ red` (Task 1) → `✅ green` (Task 4).

## Decisions Made

1. **WebApp close() signature preserved.** Kept `close({webappId, userId, killWindow?})` instead of the simpler `close(webappId)` shown in the plan task body. 27 pre-existing tests call close with the object shape; switching the signature would have broken them. Plan acceptance criteria are call-site oriented (chromeHandle.stop, xvfbHandle.stop, profileSeeder.cleanup, displayAllocator.release ALL invoked) — all satisfied.

2. **Eager active.delete BEFORE teardown.** Both paths perform `active.delete(id)` IMMEDIATELY after entry lookup but BEFORE any teardown step. A concurrent second close() observes the missing entry first and returns clean. Teardown runs on a captured local `entry` reference, so the delete-first ordering doesn't cost anything semantically.

3. **try/catch on EVERY step with WARN-not-ERROR logging.** close() Promise NEVER rejects. Caller-side error handling becomes trivial. Verified by 5 cascade-on-failure tests (T-102-08-05/06/07/08 + T-102-08-N-05).

4. **SIGKILL ladder via Promise.race.** SIGTERM first; then race the child's `exit` event against a `killGraceMs` timer. If the timer wins, SIGKILL fires. `killGraceMs` is a test-injectable opt (default 2000ms). Verified by T-102-08-N-03 with killGraceMs=30ms.

5. **userId mismatch returns {ok: false}; missing entry returns {ok: true}.** Distinguishes "this isn't yours" (auth-grade) from "doesn't exist" (idempotent no-op).

6. **Re-declare NativeActiveEntry in the primitive module.** Preserves Phase 102-05 inversion (primitive is route-agnostic). The route's ActiveNativeApp interface is field-for-field equivalent — both modules document the same shape from their respective perspectives.

7. **Stream-manager type widened to Promise<unknown>.** Production StreamManager.stopStream returns Promise<{stopped: boolean}>; the primitive doesn't read the return value. Avoids awkward adapter wrapping at the route layer.

8. **tRPC close mutation = adminProcedure + z.string().uuid().** T-101-02 carry: every native-app mutation that affects a binary process is admin-only. Input gated by schema BEFORE the primitive sees the id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StreamManager.stopStream return-type mismatch (TS2322)**

- **Found during:** Task 3 (post-implementation typecheck).
- **Issue:** Plan specified `streamManager: {stopStream(id: string): Promise<void>}` in `CloseNativeOpts`. Production `StreamManager.stopStream` returns `Promise<{stopped: boolean}>`, so passing the full StreamManager from native-routes.ts triggered `TS2322: Type 'StreamManager' is not assignable to type '{ stopStream(id: string): Promise<void>; }'`.
- **Fix:** Widened `CloseNativeOpts.streamManager.stopStream` return type from `Promise<void>` to `Promise<unknown>`. The primitive never reads the return value, so the widening is semantically free.
- **Files modified:** `livos/packages/livinityd/source/modules/apps/native-app-binder.ts`.
- **Verification:** typecheck clean on changed files; 13/13 native-app-binder tests pass.
- **Committed in:** `d1aba6fa` (rolled into Task 3).

### Plan-task-body adaptations

**A. WebApp `close(webappId)` → kept as `close({webappId, userId, killWindow?})`.** Plan task 2 showed a simpler `close(webappId: string)` signature in the code block. Switching from object-arg to scalar-arg would have broken 27 pre-existing tests in window-manager.test.ts. Acceptance criteria (greps + behavioral) all satisfied by the preserved-signature impl.

**B. `unregisterWebAppMcp` → kept as `deregisterWebAppMcp`.** The plan body referred to `unregisterWebAppMcp(webappId)`; the actual existing method name is `deregisterWebAppMcp`. Verified via grep — used the actual name.

**Total deviations:** 1 auto-fixed (Rule 1 - Bug, typecheck-surfaced and fixed in Task 3 commit). 2 plan-task-body adaptations (preserved-signature + correct-method-name) documented for traceability.

## Sacred SHA Verification

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Plan start (post worktree-reset to c55908b2) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ matches D-102-SACRED |
| Post-Task-1 (RED commit `1c99a591`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| Post-Task-2 (GREEN commit `96ce6d50`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| Post-Task-3 (native commit `d1aba6fa`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| Post-Task-4 (VALIDATION commit `40bd5eb9`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |

Plan 102-08 modified only `livos/` + `.planning/`. The `liv/` subtree (where sdk-agent-runner.ts lives) was never touched. D-102-SACRED lock satisfied.

## Test Count

| Suite | Pre-102-08 | Post-102-08 | Delta |
|-------|-----------|-------------|-------|
| `window-manager.test.ts` | 27 passed + 22 skipped (49 total) | 35 passed + 22 skipped (57 total) | **+8 tests** (T-102-08-01..08) |
| `native-app-binder.test.ts` | 8 passed (8 total) | 13 passed (13 total) | **+5 tests** (T-102-08-N-01..05) |
| **Phase 102-08 contribution** | — | — | **+13 tests, 13/13 passing** |

## Close-Step Order Diagram

### WebApp close (8 steps, ordered)

```
WebAppWindowManager.close({webappId, userId})
    │
    ├─ entry = active.get(webappId)
    ├─ if (!entry) → return {ok: true}      ← idempotent no-op
    ├─ if (entry.userId !== userId) → return {ok: false}
    │
    ├─ active.delete(webappId)               ← eager, concurrent-close guard
    │
    ├─ 1. entry.chromeHandle.stop()          [try/catch warn]
    ├─ 2. streamManager.stopStream(streamId) [try/catch warn]
    ├─ 3. entry.xvfbHandle.stop()            [try/catch warn]
    ├─ 4. profileSeeder.cleanup(profileUuid) [try/catch warn]
    ├─ 5. displayAllocator.release(displayN) [try/catch warn]
    ├─ 6. portAllocator.release(port)        [try/catch warn — idempotent]
    ├─ 7. deregisterWebAppMcp(webappId)      [try/catch warn]
    └─ 8. broadcastActiveWid + log
       → return {ok: true}
```

### Native app close (7 steps, ordered — no profile cleanup)

```
closeNativeApp({id, active, displayAllocator, portAllocator, streamManager, killGraceMs?})
    │
    ├─ entry = active.get(id)
    ├─ if (!entry) → return              ← idempotent no-op
    │
    ├─ active.delete(id)                  ← eager, concurrent-close guard
    │
    ├─ 1. entry.child.kill('SIGTERM')     [try/catch warn]
    ├─ 2. SIGKILL ladder:                 Promise.race(exit-event, killGraceMs-timer)
    │     ─ if timer wins: entry.child.kill('SIGKILL')
    │     ─ if exit fires first: skip SIGKILL
    ├─ 3. streamManager.stopStream(streamId) [try/catch warn]
    ├─ 4. entry.xvfb.stop()                [try/catch warn]
    ├─ 5. displayAllocator.release(displayN) [try/catch warn]
    ├─ 6. portAllocator.release(port)      [try/catch warn — idempotent]
    └─ 7. log "complete"
```

## Idempotency Proof

| Test | Path | Scenario | Assertion |
|------|------|----------|-----------|
| T-102-08-02 | WebApp | close() then list() | list returns empty |
| T-102-08-03 | WebApp | close() called twice | each teardown step called EXACTLY once |
| T-102-08-04 | WebApp | close() on never-spawned id | zero teardown side effects, no throw |
| T-102-08-N-02 | Native | close() called twice | each teardown step called EXACTLY once |
| T-102-08-N-04 | Native | close() on non-uuid id (or never-spawned) | no throw, stopStream not called |

## Failure-Cascade Test Results

| Test | Path | Failure injected at | Subsequent steps still execute |
|------|------|--------------------|--------------------------------|
| T-102-08-05 | WebApp | chromeHandle.stop throws | streamManager.stopStream ✅, xvfbHandle.stop ✅, profileSeeder.cleanup ✅, displayAllocator.release ✅, portAllocator.release ✅ |
| T-102-08-06 | WebApp | streamManager.stopStream throws | (chromeHandle.stop already ran), xvfbHandle.stop ✅, profileSeeder.cleanup ✅, displayAllocator.release ✅, portAllocator.release ✅ |
| T-102-08-07 | WebApp | xvfbHandle.stop throws | profileSeeder.cleanup ✅, displayAllocator.release ✅, portAllocator.release ✅ |
| T-102-08-08 | WebApp | profileSeeder.cleanup throws | displayAllocator.release ✅, portAllocator.release ✅ |
| T-102-08-N-05 | Native | streamManager.stopStream throws | (child.kill already ran), xvfb.stop ✅, displayAllocator.release ✅, portAllocator.release ✅ |

## TDD Gate Compliance

Plan 102-08 contained TDD-flagged tasks (tdd=true on Tasks 1, 2, 3). Gate sequence verified in git log:

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1, `test:` prefix) | `1c99a591` test(102-08-01) | ✅ commit prefix matches; 8 new tests added, 6 failing |
| GREEN (Task 2, `feat:` prefix) | `96ce6d50` feat(102-08-02) | ✅ commit prefix matches; 8/8 tests pass after impl |
| GREEN extension (Task 3, `feat:` prefix) | `d1aba6fa` feat(102-08-03) | ✅ commit prefix matches; native primitive + 5 new tests pass |

RED → GREEN → GREEN-extension gate sequence preserved. The native-app path didn't need a separate RED commit because Task 3 was a parallel addition (different file) rather than an extension of the WebApp test set — Task 1's RED gate covers the contract.

## Next Phase Readiness

- **Wave 3 102-08 complete.** Wave 3 in flight:
  - 102-07 (Master Chrome Login UX flow) — file-disjoint; independent.
  - 102-09 (vnc-bridge default-path flip) — file-disjoint; doc/comment work since stream-manager already supports `{display}` target.
- **Wave 4 102-10 (Mini PC UAT)** consumes this close lifecycle directly:
  - UAT row "App close clean lifecycle" verifies `pgrep -af 'Xvfb|x11vnc|chrome.*livos-chrome-app'` shows zero zombies post-close and `ls /tmp/livos-chrome-app-*` doesn't list closed app's dir.
  - With this plan shipped, that UAT row should pass first-try on Mini PC for both WebApps AND native apps.
- **No blockers.** Sacred SHA stable. The pre-existing `native-routes-new.ts` typecheck error (spawnFluxbox export mismatch in an untracked WIP file) is out of scope and unchanged.

## Issues Encountered

- **CRLF / LF line-ending churn (Windows worktree).** Same as 102-04/102-05 — Windows worktree re-saves files with CRLF, so git shows large LOC deltas. Semantic deltas are small. Sacred SHA is path-content based (git hash-object), so CRLF normalization for `liv/` files would be a concern — but plan 102-08 never touches `liv/`. Verified at every commit.
- **Pre-existing `native-routes-new.ts` typecheck error.** Untracked WIP file from another agent (`?? livos/packages/livinityd/source/modules/apps/native-routes-new.ts`) has a `spawnFluxbox` export mismatch. Out of scope per SCOPE BOUNDARY (Task 1-4 don't touch it). Not in my staged files.
- **27 pre-existing window-manager tests at risk.** Decided early to preserve the existing `close({webappId, userId, killWindow?})` signature rather than switching to the plan-body's `close(webappId)` form — would have broken Test 8, Test 13, Test 17, Test 20, etc. Plan acceptance criteria are call-site-behavioral; all satisfied.

## Self-Check

Verified all claims:

- ✅ `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — FOUND (902 LOC; close() body expanded with full 8-step teardown)
- ✅ `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — FOUND (1517 LOC; 35 passed + 22 skipped)
- ✅ `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` — FOUND (297 LOC; new closeNativeApp + NativeActiveEntry exports)
- ✅ `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` — FOUND (340 LOC; 13/13 pass)
- ✅ `livos/packages/livinityd/source/modules/apps/native-routes.ts` — FOUND (349 LOC; apps.native.close mutation registered)
- ✅ `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` — FOUND (102-08 rows ✅ green)
- ✅ Commit `1c99a591` (Task 1 RED) — FOUND in git log
- ✅ Commit `96ce6d50` (Task 2 GREEN) — FOUND in git log
- ✅ Commit `d1aba6fa` (Task 3 native + tRPC) — FOUND in git log
- ✅ Commit `40bd5eb9` (Task 4 VALIDATION + sacred SHA) — FOUND in git log
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — VERIFIED on `liv/packages/core/src/sdk-agent-runner.ts` (unchanged across all 4 commits)
- ✅ `grep -q "chromeHandle?.stop\|entry.chromeHandle.stop" window-manager.ts` exits 0 — VERIFIED
- ✅ `grep -q "xvfbHandle?.stop\|entry.xvfbHandle.stop" window-manager.ts` exits 0 — VERIFIED
- ✅ `grep -q "profileSeeder.cleanup" window-manager.ts` exits 0 — VERIFIED
- ✅ `grep -q "displayAllocator.release" window-manager.ts` exits 0 — VERIFIED
- ✅ `grep -q "closeNativeApp" native-app-binder.ts` exits 0 — VERIFIED
- ✅ `grep -q "close:" native-routes.ts` exits 0 — VERIFIED
- ✅ `grep -qE "SIGTERM|SIGKILL" native-app-binder.ts` exits 0 — VERIFIED
- ✅ `pnpm test:run webapps/window-manager.test.ts apps/native-app-binder.test.ts` exits 0 (48 passed + 22 skipped) — VERIFIED
- ✅ Typecheck clean on changed files (pre-existing native-routes-new.ts WIP file out of scope) — VERIFIED
- ✅ No modifications to STATE.md or ROADMAP.md (parallel worktree contract) — VERIFIED via `git status --short`

## Self-Check: PASSED

---
*Phase: 102-per-app-display-pivot*
*Plan: 08*
*Completed: 2026-05-11*
