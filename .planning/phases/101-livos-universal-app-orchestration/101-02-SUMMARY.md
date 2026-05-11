---
phase: 101
plan: 02
title: Per-App Stream Port Allocator (15900..15999) — Summary
subsystem: livinityd / streaming
tags: [port-allocator, vnc, stream-manager, refactor, tdd]
requirements:
  - D-101-PORT-ALLOC
  - D-101-PORT-RANGE-EXTEND
  - D-101-SACRED
dependency_graph:
  requires: []
  provides:
    - PortAllocator class (15900..15999, 100 slots)
    - PortRangeExhaustedError
    - streaming/index.ts barrel
  affects:
    - StreamManager constructor (new optional portAllocator opt)
    - StreamManager vnc-window spawn path (allocate)
    - StreamManager stopStream vnc branch (release)
    - StreamManager x11vnc exit handler (release on crash)
tech_stack:
  added: []
  patterns:
    - "Linear-walking allocator with cursor + in-use Set"
    - "Idempotent release with out-of-range no-op for defensive cleanup"
    - "Constructor-injected dependency with sensible default"
    - "Spy-based wiring test (vi.spyOn allocator instance)"
key_files:
  created:
    - livos/packages/livinityd/source/modules/streaming/port-allocator.ts
    - livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts
    - livos/packages/livinityd/source/modules/streaming/index.ts
  modified:
    - livos/packages/livinityd/source/modules/streaming/stream-manager.ts
    - livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts
decisions:
  - "Linear-walk allocator (not LRU/free-stack) — predictable port progression simplifies debugging on Mini PC"
  - "release() is idempotent + out-of-range-no-op — lets every close path call it unconditionally"
  - "release() called from BOTH x11vnc exit handler AND stopStream vnc branch (WARNING #6) — idempotency makes the duplicate safe"
  - "Default range [15900, 16000) burned into constructor as fallback; tests inject narrow ranges"
  - "Barrel index.ts is additive — does not change StreamManager's existing import surface"
metrics:
  duration: ~12min
  completed: 2026-05-11
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  commits: 3
---

# Phase 101 Plan 02: Per-App Stream Port Allocator (15900..15999) Summary

Replaced the inline Phase-99 `VNC_PORT_COUNTER` counter at `stream-manager.ts:43-49` with an explicit `PortAllocator` class that supports `release()`, caps at 100 concurrent slots, and is wired into both close paths of `StreamManager` (stopStream + x11vnc exit handler) so closed apps' ports return to the pool — the foundation Phase 101 needs to scale from 2-3 concurrent x11vnc streams up to 100.

## Files Created

| File | Purpose |
|------|---------|
| `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` | `PortAllocator` + `PortRangeExhaustedError` classes |
| `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts` | 9 pure-function vitest cases |
| `livos/packages/livinityd/source/modules/streaming/index.ts` | Barrel re-export for `PortAllocator` / error / opts type |

## Files Modified

### `livos/packages/livinityd/source/modules/streaming/stream-manager.ts`

**Before (lines 40-49):**
```ts
// Phase 99 — VNC rfbPort allocator. In-process counter; LivOS-private
// range [15900, 16100). Bind race covered by attachVncBridge's 3×100ms
// retry (Pitfall 4 mitigation in vnc-bridge.ts).
let VNC_PORT_COUNTER = 15900
function allocateVncPort(): number {
	const port = VNC_PORT_COUNTER
	VNC_PORT_COUNTER += 1
	if (VNC_PORT_COUNTER >= 16100) VNC_PORT_COUNTER = 15900
	return port
}
```

**After (same line range):** module-level counter deleted; `PortAllocator` imported from `./port-allocator.js`; constructor takes optional `portAllocator?: PortAllocator` (defaults to `new PortAllocator()`); `this.portAllocator.allocate()` replaces the local `allocateVncPort()` call at the vnc-window spawn site; `this.portAllocator.release(rfbPort)` is invoked from the x11vnc `'exit'` handler AND from `stopStream`'s vnc branch (idempotent — duplicate call is safe).

Also added `getPortAllocator()` accessor for future boot-time wiring and diagnostics (101-05 native binder will read live in-use count).

### `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts`

Added 4 new tests under a `Phase 101-02 — PortAllocator wire-up` describe block:
- **T-101-02-SM-01:** `startStream(vnc-window)` calls `portAllocator.allocate()` and the first port is 15900.
- **T-101-02-SM-02:** `stopStream` triggers `portAllocator.release(port)` and `inUseCount` returns to 0.
- **T-101-02-SM-03:** x11vnc crash exit (non-zero, no stop request) ALSO releases the port — WARNING #6 "every close path" audit.
- **T-101-02-SM-04:** Round-trip start→stop→start tracks `inUseCount === 1` (next port is 15901 per linear-walker semantics, not 15900 — documented in port-allocator Test 4).

## Tests

| Suite | Count | Status |
|-------|-------|--------|
| `port-allocator.test.ts` (new) | 9 | PASS |
| `stream-manager.test.ts` (extended) | 21 (was 17; +4 new) | PASS |
| Full streaming suite (`streaming/`) | 71 pass + 1 skipped (pre-existing) | PASS |

Test-runner invocation: `livos/packages/livinityd/node_modules/.bin/vitest run source/modules/streaming/ --reporter=dot` (parent worktree's installed `node_modules` junction-linked into this worktree at `livos/packages/livinityd/node_modules` since no pnpm install runs inside parallel worktrees).

## Acceptance Criteria — Verified

| Criterion | Result |
|-----------|--------|
| `test -f port-allocator.ts` | PASS (3521 bytes) |
| `test -f port-allocator.test.ts` | PASS (4103 bytes) |
| `grep -q 'class PortAllocator'` in port-allocator.ts | PASS |
| `grep -q 'class PortRangeExhaustedError'` in port-allocator.ts | PASS |
| `grep -q '15900' && grep -q '16000'` in port-allocator.ts | PASS |
| `vitest run streaming/port-allocator.test.ts` exits 0 | PASS (9/9) |
| `grep -c 'VNC_PORT_COUNTER' stream-manager.ts` outputs 0 | PASS (was 2 in comments — comments rewritten) |
| `grep -q 'PortAllocator' stream-manager.ts` | PASS (8 occurrences) |
| `grep -c 'portAllocator.release' stream-manager.ts >= 2` (WARNING #6) | PASS (exactly 2 — exit handler + stopStream) |
| `vitest run streaming/` exits 0 | PASS (71 pass) |
| `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS (pre + post) |
| `git log -1 --format=%s` contains `101-02` | PASS |

## Commits (3)

| Hash | Message |
|------|---------|
| `280c3d7a` | `test(101-02): add failing tests for PortAllocator (RED)` |
| `55a38ecc` | `feat(101-02): implement PortAllocator (GREEN)` |
| `db8a5756` | `feat(101-02): wire StreamManager to PortAllocator + barrel export` |

Plan tasks executed as RED → GREEN (Task 1) → wire-up (Task 2) → verify-and-commit (Task 3). Task 3's "single final commit" was merged with Task 2's wire-up because Task 3 was purely a verify-and-commit step over Task 2's artifacts; the verification ran before commit, the commit shipped Task 2's changes plus the barrel + extension tests in one atomic unit, sacred SHA stayed at `f3538e1d…`.

## Deviations from Plan

### Rule 3 (Auto-fix blocking issue)

**1. [Rule 3 - Tooling] `pnpm --filter @livos/livinityd test:run` script does not exist**
- **Found during:** Pre-Task 1 smoke check
- **Issue:** Plan's `<verify>` blocks invoke `pnpm --filter @livos/livinityd test:run streaming/...`. The livinityd `package.json` defines `test` (which already runs `vitest --reporter verbose ...`) but no `test:run` alias. Additionally, parallel worktrees do not run `pnpm install`, so `pnpm` from inside the worktree cannot resolve the workspace filter.
- **Fix:** Junction-linked the parent worktree's `livos/packages/livinityd/node_modules` and `livos/node_modules` directories into this worktree (Windows `New-Item -ItemType Junction`), then ran tests via the local binary `./node_modules/.bin/vitest run source/modules/streaming/... --reporter=dot`. This is the equivalent of what the plan's `pnpm --filter @livos/livinityd test:run` would resolve to, just without the npm-script alias indirection.
- **Files modified:** None (test invocation only — no source changes)
- **Commit:** N/A (tooling adjustment, not a code change)

### Rule 1 (Auto-fix bug in own test)

**2. [Rule 1 - Test assumption mismatch] SM-04 round-trip test expected port reuse**
- **Found during:** Task 2 (full streaming suite run)
- **Issue:** My initial T-101-02-SM-04 asserted that after stop→start round-trip the second stream would get back 15900 (the released port). The `PortAllocator` is a linear-walker — releasing 15900 leaves the cursor at 15901, so the next allocate hands out 15901 (this is the documented `port-allocator.test.ts` Test 4 behaviour: the wrap-and-reuse only happens after the cursor returns to 15900 via wrap-around).
- **Fix:** Rewrote SM-04 to assert the actual invariant we care about for `StreamManager`: `inUseCount === 1` after the round-trip + `secondPort === 15901 && secondPort !== firstPort`. The "released ports come back when the cursor wraps" behaviour is already covered by `port-allocator.test.ts` Test 3.
- **Files modified:** `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts` (test body only, no source change)
- **Commit:** `db8a5756` (rolled into Task 2 commit before commit landed)

## Deferred Issues (out of scope)

Pre-existing tsc errors in livinityd (e.g. `skills/leadgen-auto.ts` flash-model union mismatch, `source/modules/ai/routes.ts ctx.livinityd undefined` checks, `source/modules/ai/conversation-search.test.ts limit-arg variance). None touched by Plan 101-02. None are in the streaming/ subtree. Out of scope per Rule 1-3 scope boundary; vitest transforms TS without strict tsc so all 71 streaming tests still pass at runtime.

`pnpm --filter @livos/livinityd build` not run because the worktree has no full pnpm install + parent's prebuilt dist would be stale; the relevant typecheck pass for our new files (`port-allocator.ts`, `index.ts`) was clean and the modified stream-manager.ts ran the full test suite green. A live build will happen on Mini PC during Wave 4 (101-10 deploy walk).

## Authentication Gates

None.

## Sacred SHA Verification

| Phase | SHA | Match |
|-------|-----|-------|
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | YES |
| Post-Task 1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | YES |
| Post-Task 2/3 (final commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | YES |

`liv/packages/core/src/sdk-agent-runner.ts` not touched (plan operates exclusively in `livos/packages/livinityd/source/modules/streaming/` and `.planning/`). Sacred constraint upheld.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` exists (3521 bytes)
- `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts` exists (4103 bytes)
- `livos/packages/livinityd/source/modules/streaming/index.ts` exists (655 bytes)
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` modified (inline counter gone, allocator wired, 2× release calls)
- Commit `280c3d7a` exists (test RED)
- Commit `55a38ecc` exists (impl GREEN)
- Commit `db8a5756` exists (wire-up + barrel + extension tests)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified post-everything
- All 9 port-allocator tests pass
- All 71 streaming tests pass (1 pre-existing skipped)
- `grep -c 'VNC_PORT_COUNTER' stream-manager.ts` = 0
- `grep -c 'portAllocator.release' stream-manager.ts` = 2 (WARNING #6 audit)
