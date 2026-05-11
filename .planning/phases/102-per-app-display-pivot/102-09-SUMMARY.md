---
phase: 102
plan: 09
subsystem: streaming
tags: [vnc, x11vnc, display-capture, refactor, default-path-flip]
requires:
  - 102-01-PLAN.md (DisplayAllocator + XvfbSpawner — supplies :N display tokens)
provides:
  - canonical x11vnc -display :N spawn mode (D-102-X11VNC-WHOLE-DISPLAY)
  - spawnVncForDisplay({display, rfbPort}) sugar wrapper
  - VncStreamTarget = {display: string} | {wid: number} (renamed canonical)
  - test-locked argv contract for the display branch
affects:
  - livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts
  - livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts
  - livos/packages/livinityd/source/modules/streaming/stream-manager.ts
  - livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts
tech-stack:
  added: []
  patterns:
    - default-path-flip (R3 PATTERNS — extend existing scaffolding, no rewrite)
    - type-alias back-compat (VncWindowTarget → VncStreamTarget with @deprecated alias)
    - sugar-wrapper API surface (spawnVncForDisplay hides legacy wid opt)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts
    - livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts
    - livos/packages/livinityd/source/modules/streaming/stream-manager.ts
    - livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts
decisions:
  - D-102-X11VNC-WHOLE-DISPLAY: -display :N is the canonical x11vnc spawn mode; -id <wid> retained as @deprecated legacy path
  - VncStreamTarget canonical name; VncWindowTarget kept as @deprecated alias for external back-compat (currently no external imports)
  - spawnVncForDisplay sugar wrapper (not a rewrite — delegates to spawnVncForWindow's display branch)
metrics:
  duration: 33min
  completed: 2026-05-11
  commits: 4
---

# Phase 102 Plan 09: x11vnc -display :N canonical default-path flip Summary

**One-liner:** Flipped vnc-bridge.ts default x11vnc spawn mode to `-display :N` (whole-Xvfb capture, D-102-X11VNC-WHOLE-DISPLAY); added `spawnVncForDisplay()` sugar wrapper; renamed `VncWindowTarget` → `VncStreamTarget` (back-compat alias preserved); locked the canonical argv contract with 7 new tests across vnc-bridge and stream-manager.

## Objective Delivered

Per PATTERNS R3 critical discovery #3: the `-display :N` branch ALREADY existed in `vnc-bridge.ts:96-98` (Phase 100-10-08 scaffolding) and `stream-manager.ts:54` already supported `{display: string}` targets (D-100-10-C). Plan 102-09 was therefore a **default-path flip + dead-code cleanup + documentation refresh + sugar API surface**, not a rewrite.

## Tasks Completed (5/5)

### Task 1: Refresh vnc-bridge.ts comments + add spawnVncForDisplay sugar
**Commit:** `930cb7e2`

- File header rewritten for Phase 102-09 — `-display :N` declared canonical; `-id <wid>` declared legacy back-compat.
- `SpawnVncOpts.wid` field marked `@deprecated` in JSDoc; `SpawnVncOpts.display` docstring promoted to canonical Phase 102+ path.
- New `spawnVncForDisplay({display, rfbPort, ...})` sugar wrapper exported — delegates to `spawnVncForWindow({display, rfbPort, ...})` but the type signature omits the legacy `wid` opt, giving Phase 102+ callers a clean API surface.
- New type `SpawnVncForDisplayOpts` for the sugar wrapper.
- Inline comments refreshed throughout: removed "Phase 100-10-08 reverted" / "Phase 101 scaffolding" language; replaced with current Phase 102-09 / D-102-X11VNC-WHOLE-DISPLAY references.
- Log tag comment updated to reflect canonical `display=:N` vs. legacy `wid=0xHEX`.

### Task 2: Extend vnc-bridge.test.ts — assert -display :N is canonical default argv
**Commit:** `a342fe02`

Added 4 new tests in a new `describe('vnc-bridge — spawnVncForDisplay (Phase 102-09 canonical default-path)')` block:

| Test | Assertion |
|------|-----------|
| `T-102-09-01` | `spawnVncForDisplay({display: ':10', rfbPort: 15900})` emits canonical argv: `sudo`, `-display`, `':10'`, `-rfbport`, `'15900'`, `-shared`, `-forever`, `-nopw`, `-noxdamage`, plus `DISPLAY=:10` env-prefix pin |
| `T-102-09-02` | `spawnVncForDisplay` does NOT invoke the legacy `-id` WID branch (no `-id` flag, no `0xHEX` argv element) |
| `T-102-09-03` | Back-compat: `spawnVncForWindow({wid: 0x1234567})` still emits `-id 0x1234567` argv (no `-display`) |
| `T-102-09-04` | Validation: documents empty-string display pass-through behavior (caller must validate upstream — DisplayAllocator does) |

All 17 vnc-bridge tests pass (4 new + 13 existing, 1 skipped intentionally).

### Task 3: stream-manager.ts — VncStreamTarget alias + comment refresh
**Commit:** `80a55e62`

- Renamed canonical type: `VncStreamTarget = {display: string} | {wid: number}`.
- Kept `VncWindowTarget` as `@deprecated` type alias (`VncStreamTarget`) for external back-compat (currently no external imports — verified via repo grep).
- Updated `StreamTarget` union to reference `VncStreamTarget`.
- Updated `VncSession.target` field type to `VncStreamTarget`.
- Updated cast in vnc-window branch to `as VncStreamTarget`.
- Refreshed comments at line 49-62 + line 206-220: declares `{display}` canonical Phase 102+ variant; `{wid}` retained for v33 idle-cleanup poller compat.

All 21 stream-manager tests pass (no regressions).

### Task 4: Extend stream-manager.test.ts — assert {display} routes through vnc-bridge -display path
**Commit:** `c9366980`

Added 3 new tests in the existing `describe('StreamManager — PortAllocator wire-up (Phase 101-02)')` block (logically extends the allocator + vnc routing coverage):

| Test | Assertion |
|------|-----------|
| `T-102-09-SM-01` | `startStream({target: {display: ':10'}})` spawns x11vnc with `-display :10` argv, `DISPLAY=:10` env, allocator-driven `rfbPort=15900`, `VncSession.display=':10'` with `.wid` undefined |
| `T-102-09-SM-02` | Back-compat: `startStream({target: {wid: 0x123}})` still routes through legacy `-id 0x123` argv (`VncSession.wid=0x123` with `.display` undefined) |
| `T-102-09-SM-03` | `stopStream({display}-target session)` calls `portAllocator.release(rfbPort)` and removes the session from the map (closes port-leak gap on canonical path) |

All 24 stream-manager tests pass (3 new + 21 existing).

### Task 5: VALIDATION.md green + Sacred SHA verify
**Commit:** combined with this SUMMARY.md final commit

- **Sacred SHA verified**:
  ```
  $ git hash-object liv/packages/core/src/sdk-agent-runner.ts
  f3538e1d811992b782a9bb057d1b7f0a0189f95f
  ```
  Matches D-102-SACRED requirement — `liv/` tree untouched throughout this plan (only `livos/packages/livinityd/source/modules/streaming/` modified).
- **VALIDATION.md row flip deferred to orchestrator merge time** — see Deviations below.

## x11vnc argv excerpt (from passing T-102-09-01 test)

```
cmd: sudo
args: [
  '-n', '-u', 'bruce',
  'DISPLAY=:10',
  '/usr/bin/x11vnc',
  '-display', ':10',          ← canonical Phase 102+ branch
  '-rfbport', '15900',
  '-localhost',
  '-shared',
  '-forever',
  '-noxdamage',
  '-nopw',
]
```

The argv has NO `-id` flag and NO `0xHEX` element — the canonical path is exclusively `-display :N` based.

## File Delta Summary

| File | Lines Added | Lines Removed | Net | Role |
|------|-------------|---------------|-----|------|
| `streaming/vnc-bridge.ts` | 110 | 42 | +68 | Phase 102-09 docstring + sugar wrapper + comment refresh |
| `streaming/vnc-bridge.test.ts` | 90 | 1 | +89 | 4 new tests for canonical -display branch |
| `streaming/stream-manager.ts` | 29 | 15 | +14 | VncStreamTarget rename + comment refresh |
| `streaming/stream-manager.test.ts` | 76 | 0 | +76 | 3 new tests for {display} target routing |
| **Total** | **305** | **58** | **+247** | 0 new files; 4 modified |

## Test Coverage

- **vnc-bridge:** 17 tests pass (13 existing + 4 new; 1 intentionally skipped). All Phase 102-09 canonical-path assertions green.
- **stream-manager:** 24 tests pass (21 existing + 3 new). All Phase 102-09 routing assertions green.
- **Total Phase 102-09:** 41 tests pass, 1 skipped, 0 failures.

Test commands:
```bash
pnpm --filter @livos/livinityd test:run streaming/vnc-bridge.test.ts       # 17 pass
pnpm --filter @livos/livinityd test:run streaming/stream-manager.test.ts   # 24 pass
```

## Sacred SHA Pre/Post

| Checkpoint | SHA |
|-----------|-----|
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post Task 1 (vnc-bridge.ts) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post Task 2 (vnc-bridge.test.ts) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post Task 3 (stream-manager.ts) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post Task 4 (stream-manager.test.ts) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Final (this SUMMARY commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

D-102-SACRED preserved throughout. Plan 102-09 made zero modifications to the `liv/` tree.

## Deviations from Plan

### Deferred Items

**1. VALIDATION.md row flip for 102-09-01 + 102-09-02 (Task 5)**
- **Reason:** This parallel executor worktree was branched from commit `abdfe9f6` (pre-Phase-102 planning commit). The file `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` does not exist in the worktree's tree. Writing a fresh copy here would create a 3-way merge conflict with the existing file in main (which has rows for 102-04..102-08 already flipped by sibling executors during this parallel run).
- **Action:** Orchestrator merge time. The merge agent applies the row flip post-merge OR a follow-up sweep commit handles it. The Task 5 row content is unambiguous:
  ```diff
  - | 102-09-01 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | vnc-bridge spawn x11vnc with -display :N (not -id <wid>) | unit | `pnpm --filter @livos/livinityd test:run streaming/vnc-bridge.test.ts` | ✅ (extend) | ⬜ pending |
  + | 102-09-01 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | vnc-bridge spawn x11vnc with -display :N (not -id <wid>) | unit | `pnpm --filter @livos/livinityd test:run streaming/vnc-bridge.test.ts` | ✅ (extend) | ✅ green |

  - | 102-09-02 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | stream-manager VncDisplayTarget variant routes to display-mode spawn | unit | `pnpm --filter @livos/livinityd test:run streaming/stream-manager.test.ts` | ✅ (extend) | ⬜ pending |
  + | 102-09-02 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | stream-manager VncDisplayTarget variant routes to display-mode spawn | unit | `pnpm --filter @livos/livinityd test:run streaming/stream-manager.test.ts` | ✅ (extend) | ✅ green |
  ```
- **Verification basis:** Both rows can now be flipped because both test suites (vnc-bridge.test.ts, stream-manager.test.ts) pass with the new Phase 102-09 contract assertions live.

### Auto-fixed Issues

None — plan executed cleanly. The R3 PATTERNS guidance (this is a default-path flip, not a rewrite) was correct: the `-display :N` branch was already in place from Phase 100-10-08 scaffolding, so the work was additive documentation + sugar API + test contract lock, with no architectural changes required.

## Carry-Forward Notes for Downstream Plans

- **102-04 (window-manager rewrite):** Should call `spawnVncForDisplay({display, rfbPort})` directly OR continue to use `streamManager.startStream({mode: 'vnc-window', target: {display: ':N'}})`. Both routes now resolve to the canonical `-display :N` x11vnc spawn.
- **102-05 (native-app-binder display swap):** Same as above — pass `{display: ':N'}` as the `vnc-window` target.
- **VncWindowTarget alias:** No external imports as of this plan. The alias can be removed in a future cleanup once stream-manager tests stop referencing it (currently they do via the `as any` casts, but the type alias still resolves). Safe to defer to a v34+ housekeeping sweep.
- **Legacy `wid` path:** Still functional for the v33 idle-cleanup poller. Future plans that retire that poller can drop the `wid` branch entirely from `SpawnVncOpts` and `spawnVncForWindow` (a small breaking change).

## Self-Check: PASSED

**Created files:**
- (none — plan only modifies)

**Modified files:**
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` ✅ exists
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts` ✅ exists
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` ✅ exists
- `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts` ✅ exists

**Commits:**
- `930cb7e2` ✅ found — `refactor(102-09-01): vnc-bridge -display :N canonical; mark wid @deprecated; add spawnVncForDisplay sugar`
- `a342fe02` ✅ found — `test(102-09-02): vnc-bridge -display :N canonical default-path argv coverage`
- `80a55e62` ✅ found — `refactor(102-09-03): stream-manager VncStreamTarget canonical; comments refresh; {display} canonical`
- `c9366980` ✅ found — `test(102-09-04): stream-manager {display} target routes through vnc-bridge -display canonical path`

**Sacred SHA pre+post: VERIFIED** (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`)

**Tests: GREEN** (41 pass, 1 intentional skip, 0 failures across vnc-bridge + stream-manager suites)
