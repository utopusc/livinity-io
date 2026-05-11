---
phase: 103
plan: 01
subsystem: chrome-master
tags:
  - chrome-master
  - streaming
  - xvfb
  - trpc
  - factory-injection
dependency-graph:
  requires:
    - 102-01-display-allocator-xvfb-spawner
    - 102-02-chrome-process-spawner
    - 102-03-master-profile-seeder
    - 102-07-chrome-master-login-routes
    - 102-09-vnc-bridge-display-mode
  provides:
    - chromeMaster.startLogin (Xvfb pipeline)
    - chromeMaster.stopLogin
    - chromeMaster.input.{click,key,type,scroll}
    - chromeMaster.status (extended with display/wsUrl/streamId)
    - createAppRouter factory + setProductionAppRouter swap
  affects:
    - server/trpc/index.ts (factory + swap proxy)
    - livinityd/source/index.ts (production wire-up)
tech-stack:
  added:
    - factory-injected tRPC router with late-binding express proxy
  patterns:
    - REVERSE-order compensating cleanup on spawn-cascade failure
    - idempotent cleanupMaster reachable from chrome.on('exit'), stopLogin, and startLogin catch
    - module-singleton lock (currentMaster) preserved through the rewrite
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts
    - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts
    - livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts
    - livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts
    - livos/packages/livinityd/source/modules/chrome-master/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - "USER_DATA_DIR_RE widened with anchored alternation (master constant added as a literal, not pattern) — T-103-01-02 disposition: mitigate"
  - "Late-binding setProductionAppRouter proxy pattern chosen over deferring Server.start() because trpcExpressHandler is imported by server/index.ts BEFORE the streaming subsystem (which builds the deps) finishes starting"
  - "Bare chromeMasterRouter default throws INTERNAL_SERVER_ERROR on Phase 103 routes when injection is missing — fails loud rather than silently using :0"
  - "`display` argument NOT accepted from input.* callers — derived from currentMaster.display so admin payload cannot drive xdotool against arbitrary X displays (T-103-01-03)"
metrics:
  duration: 25min
  completed: 2026-05-11
---

# Phase 103 Plan 01: Master Chrome Xvfb Streaming Backend Summary

Wire master Chrome onto the per-app Xvfb + x11vnc + StreamManager pipeline so headless Mini PCs can master-login without a physical monitor. Phase 102 r14 UAT exposed that the original `:0` path showed nothing on hosts without a display; this plan composes the Phase 102 primitives the user already shipped (DisplayAllocator + XvfbSpawner + ChromeProcessSpawner + spawnVncForDisplay + StreamManager) into a Master-Chrome-shaped variant of the per-app flow.

## What Shipped

| Task | Commit | Files | Lines (+/-) |
|------|--------|-------|-------------|
| 1. Widen chrome-process-spawner USER_DATA_DIR_RE | `978f7bae` | 2 (`chrome-process-spawner.{ts,test.ts}`) | +56 / -6 |
| 2. Factory-inject Xvfb pipeline into chromeMaster | `2f68de16` | 3 (`chrome-master/{master-login-routes.ts, master-login-routes.test.ts, index.ts}`) | +967 / -221 |
| 3. Wire chromeMaster injection from livinityd start | `f0f09922` | 3 (`livinityd/source/index.ts`, `server/trpc/index.ts`, `master-login-routes.ts` type tweak) | +166 / -54 |

**Total: 1188 +/ 280 - across 7 files in 3 commits.**

## Behaviour

### Before (Phase 102-07 r14)
`chromeMaster.startLogin` spawned `sudo -n -u bruce DISPLAY=:0 google-chrome --user-data-dir=/opt/livos/data/chrome-master`. On headless Mini PCs `:0` is the physical-screen display that does not exist; the spawn succeeded but the user saw nothing. Returned `{pid, startedAt}` only.

### After (Phase 103-01)
`chromeMaster.startLogin` returns `{pid, startedAt, display, wsUrl, streamId}` after running the full per-app cascade against the master:

1. `profileSeeder.ensureMasterExists()` (idempotent mkdir on MASTER_PROFILE_DIR)
2. `displayAllocator.allocate()` → e.g. `:42`
3. `spawnXvfb({display: ':42', width: 1280, height: 720})`
4. `spawnChromeProcess({display: ':42', userDataDir: '/opt/livos/data/chrome-master', url: 'https://accounts.google.com'})`
5. `streamManager.getPortAllocator().allocate()` → e.g. `15942`
6. `spawnVncForDisplay({display: ':42', rfbPort: 15942})`
7. `streamManager.startStream({mode: 'vnc-window', target: {display: ':42'}})`
8. `chrome.child.on('exit', () => void cleanupMaster())`

`cleanupMaster()` is idempotent and runs through ALL three exit paths (`chrome.on('exit')`, explicit `stopLogin`, `startLogin` compensating-cleanup) — REQ-103-A4. Every `allocate` is paired with a `release` in REVERSE order.

New tRPC surface:
- `chromeMaster.stopLogin` — explicit teardown (PRECONDITION_FAILED if not running, `{ok:true}` after cleanup).
- `chromeMaster.input.click({x, y, button, kind})` — admin-gated, zod-validated; dispatches via `dispatchPointer(0, x, y, button, kind, currentMaster.display)`.
- `chromeMaster.input.key({key, kind})` — dispatchKey display-mode.
- `chromeMaster.input.type({text})` — dispatchType display-mode.
- `chromeMaster.input.scroll({x, y, direction, clicks})` — dispatchScroll display-mode.
- `chromeMaster.status` — extended with `display`, `wsUrl`, `streamId` when running.

## Key Decisions

- **USER_DATA_DIR_RE widening (T-103-01-02):** Added the master path as a literal alternative in an anchored alternation, preserving the per-app branch's path-traversal protection. Both alternatives are fully anchored (`^...$`) so `/opt/livos/data/chrome-master/foo` and similar traversal attempts still throw `CHROME_INVALID_USERDATADIR`.

- **Late-binding tRPC swap (Task 3 architectural):** The trpcExpressHandler is imported by `server/index.ts` and mounted via `app.use('/trpc', trpcExpressHandler)` during `server.start()` inside `Promise.all([server.start(), ai.start(), ...])`. The streaming subsystem (which builds DisplayAllocator + StreamManager + ProfileSeeder) only completes AFTER that Promise.all resolves. Solving this required a mutable cached middleware closure inside `server/trpc/index.ts` — `setProductionAppRouter(r)` rebuilds the closure against the injected appRouter and `trpcExpressHandler` is now a thin proxy that delegates to whichever closure is current. Tests + the bare back-compat default keep working unchanged.

- **`display` not caller-controlled (T-103-01-03):** Every input.* mutation reads `currentMaster.display` from the singleton — callers cannot pass arbitrary X11 display tokens. Combined with zod `.finite()` on x/y, `.int().min(1).max(3)` on button, and `.enum()` on kind/direction, the xdotool argv has no caller-controlled surface beyond text/key strings (further bounded by max length).

- **Bare default fails loud:** The empty-injection chromeMasterRouter (used by tests, by cli-client back-compat, and by the express middleware before Task 3's swap fires at livinityd start) throws `INTERNAL_SERVER_ERROR` from startLogin/stopLogin/input.*. Better than silently using `:0` again.

## Tests

| Suite | Before | After | Notes |
|-------|--------|-------|-------|
| chrome-process-spawner | 11 | 15 | +4 (master accept, legacy uuid accept, /etc/passwd reject, trailing master reject) |
| master-login-routes | 9 | 19 | +10 (full surface presence, startLogin happy + compensating, chrome.on('exit') cascade, input.* dispatch + zod, status extended, stopLogin, missing-deps INTERNAL_SERVER_ERROR) |
| chrome-master folder full | 19 | 29 | profile-seeder.test.ts untouched (10 tests) |
| webapps folder full | — | 191/213 (22 pre-existing skips) | no regressions |
| streaming folder full | — | 92/93 (1 pre-existing skip) | no regressions |

All 348 relevant tests pass via `pnpm vitest run --poolOptions.threads.singleThread true` per 103-VALIDATION.md.

## TypeScript Compliance

`pnpm tsc --noEmit -p .` (livinityd workspace) — 0 new errors. One pre-existing error remains in `server/trpc/index.ts` at the WebSocketServer type position (cross-pnpm-store @types/ws type quirk, present on master before this plan) — verified via `git stash` of my changes.

## Sacred SHA Verification

| Checkpoint | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|------------|--------------------------------------------------------------|
| Baseline (pre-Task 1) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task 1 commit `978f7bae` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task 2 commit `2f68de16` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task 3 commit `f0f09922` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

The pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) fired and passed on every commit in this plan.

## Deviations from Plan

### Minor

**1. [Adaptation] Late-binding mutable closure for trpcExpressHandler swap (Task 3 Step B).**
- **Found during:** Task 3 planning.
- **Issue:** The plan said "after the appRouter is referenced for the trpcExpressHandler (search `createExpressMiddleware({router: appRouter`), replace the import `import {appRouter}` with `import {createAppRouter}`". But the consumer is `server/index.ts` (not `livinityd/source/index.ts`), and the express middleware mounts during `Promise.all([server.start(), ai.start(), ...])` BEFORE the streaming subsystem builds the deps.
- **Fix:** Added a mutable cached middleware closure inside `server/trpc/index.ts` + a `setProductionAppRouter(r)` swap function. The static `trpcExpressHandler` is now a delegating proxy. livinityd `start()` calls `setProductionAppRouter()` after the streaming deps come up.
- **Files modified:** `server/trpc/index.ts`, `livinityd/source/index.ts`.
- **Commit:** `f0f09922`.
- **Rationale:** Preserves back-compat for `cli-client.ts` + `create-test-livinityd.ts` + the existing `appRouter.createCaller(...)` test pattern in `fail2ban-admin/integration.test.ts`. Does not require touching `Server` class signatures or Promise.all timing.

**2. [Type widening] StreamManagerLike.stopStream return type.**
- **Found during:** Task 3 typecheck.
- **Issue:** Real `StreamManager.stopStream` returns `Promise<{stopped: boolean}>`, but my StreamManagerLike interface in master-login-routes.ts expected `Promise<void>` — TS rejected the production-deps injection.
- **Fix:** Widened to `Promise<unknown>` (we await but never inspect).
- **Files modified:** `master-login-routes.ts`.
- **Commit:** `f0f09922`.

**3. [Cosmetic] Acceptance criterion "≤ 6 lines changed (regex + comment only)" exceeded.**
- **Found during:** Task 1 implementation.
- **Issue:** The plan's `<action>` block explicitly specified the longer comment text (12 lines vs. the original 7) that documents the T-103-01-02 rationale. Following the plan's prescriptive text yields a 9+/6− diff (15-line delta) instead of ≤ 6.
- **Rationale:** Plan's prescriptive `<action>` text takes precedence over the aspirational `<acceptance_criteria>` line count. The behaviour is regex + comment only — no other change.

**4. [Conflict avoidance] `MASTER_PROFILE_DIR` re-export NOT added from master-login-routes.js to chrome-master/index.ts.**
- **Found during:** Task 2 implementation (Step 9).
- **Issue:** `chrome-master/index.ts` already re-exports `MASTER_PROFILE_DIR` from `profile-seeder.js` (same `/opt/livos/data/chrome-master` constant). Adding a second re-export of the same name from `master-login-routes.js` would create a barrel-binding collision.
- **Fix:** Kept the existing profile-seeder re-export; the barrel exposes `MASTER_PROFILE_DIR` (just not from the master-login-routes path).
- **Files modified:** `chrome-master/index.ts` (added a comment explaining the decision; added `_resetMasterStateForTest` re-export).
- **Commit:** `2f68de16`.
- **Acceptance criterion:** `grep -F "MASTER_PROFILE_DIR" livos/packages/livinityd/source/modules/chrome-master/index.ts` still matches (3 hits via the profile-seeder line + comments).

### None Material

No bugs, security gaps, blocking issues, or scope changes. Task 1 and Task 2 were straightforward TDD implementations of the plan's prescriptive text.

## Authentication Gates

None — Phase 103-01 is code-only. The Mini PC deploy + UAT walk lands in 103-02+.

## Carry-Forward Notes for 103-02 (Master Chrome UI / noVNC viewer)

- `chromeMaster.status` now returns `{display, wsUrl, streamId}` when running. The UI viewer in 103-02 should:
  - Read these on mount.
  - Pass `wsUrl` to `useWebAppVnc(wsUrl)` (gated on `wsUrl !== null` — Pitfall 4 in 103-RESEARCH.md).
  - Use `streamId` for explicit stream lifecycle if needed.
  - Use `display` only for diagnostics; the input.* mutations derive it from the singleton themselves.

- `chromeMaster.input.{click,key,type,scroll}` are admin-gated and HTTP-only (via `httpOnlyPaths` — already registered for `startLogin/reset/restoreBackup/status` in Phase 102-07; 103-02 will add the four new mutation paths if it wants the admin-mid-restart resilience guarantee).

- `chromeMaster.stopLogin` is the explicit teardown surface for the UI's Close button. PRECONDITION_FAILED if already stopped — UI should treat that as success (idempotent close).

- The bare empty-injection `chromeMasterRouter` (back-compat default) throws `INTERNAL_SERVER_ERROR` on Phase 103 routes — production swap happens automatically at livinityd boot, so this is only relevant for direct router-import test code paths.

- **Pitfall 8 reminder:** The chrome-master singleton uses `currentMaster.display` for input dispatch. Concurrent input.* calls share the singleton; the chrome-master flow is single-user-single-window by design, so there's no race. Per-app WebApps remain a separate concern.

## Self-Check: PASSED

All seven modified files exist on disk. All three commits present in `git log`. Sacred SHA preserved through every commit. Verified via:

```bash
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ git log --oneline 978f7bae~1..f0f09922
f0f09922 feat(103-01): wire chromeMaster injection from livinityd start()
2f68de16 feat(103-01): factory-inject Xvfb pipeline into chromeMaster router
978f7bae feat(103-01): widen chrome-process-spawner USER_DATA_DIR_RE for master path

$ pnpm vitest run source/modules/chrome-master source/modules/webapps source/modules/streaming
Test Files  29 passed (29)
     Tests  348 passed | 23 skipped (371)
```
