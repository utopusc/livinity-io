---
phase: 102-per-app-display-pivot
plan: 01
subsystem: infra
tags: [xvfb, x11, display-allocator, vitest, livinityd, streaming]

# Dependency graph
requires:
  - phase: 101-livos-universal-app-orchestration
    provides: streaming/port-allocator.ts (verbatim companion pattern), webapps/xvfb-display.ts (spawn argv analog), webapps/fluxbox-wm.ts (500ms early-exit pattern), streaming/vnc-bridge.ts (FakeChild + factory injection test pattern)
provides:
  - DisplayAllocator class (number-returning, range [10, 100), 90 slots; linear-walker; idempotent release)
  - DisplayRangeExhaustedError typed error (code 'DISPLAY_RANGE_EXHAUSTED')
  - spawnXvfb({display, width, height, ...}) async factory with xdpyinfo readiness poll (200ms × 25 → 5s deadline)
  - XvfbHandle {pid, display, exited, stop()} — SIGTERM → 2s grace → SIGKILL on stop()
  - XvfbReadyTimeoutError typed error (code 'XVFB_READY_TIMEOUT'); SIGKILLs orphan child before throwing
  - streaming/index.ts barrel re-exports for Wave 2 consumers
affects: [102-04 (window-manager rewrite), 102-05 (native-app-binder display swap), 102-08 (close lifecycle), 102-09 (x11vnc whole-display)]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — composed from node:child_process + node:util.promisify
  patterns:
    - "Verbatim allocator companion (port-allocator → display-allocator) — same linear-walker semantics, different range"
    - "xdpyinfo readiness poll (200ms interval, 5s deadline) gates Xvfb-ready handoff to Chrome/native binary spawn"
    - "FakeChild + injected spawnFn + injected execFileFn test pattern (mirrors vnc-bridge.test.ts factory-injection)"
    - "Configurable pollIntervalMs lets tests run with 1ms polling instead of fake timers — simpler + maintainable"
    - "SIGTERM → graceMs → SIGKILL with both kills wrapped in try/catch (idempotent for already-gone process)"

key-files:
  created:
    - livos/packages/livinityd/source/modules/streaming/display-allocator.ts
    - livos/packages/livinityd/source/modules/streaming/display-allocator.test.ts
    - livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts
    - livos/packages/livinityd/source/modules/streaming/xvfb-spawner.test.ts
  modified:
    - livos/packages/livinityd/source/modules/streaming/index.ts (barrel append)
    - livos/packages/livinityd/source/index.ts (remove legacy createDisplayAllocator import + call)
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts (drop DisplayAllocator type import; opt re-typed `unknown`)
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md (wave_0_complete: true; 102-01-01 + 102-01-02 rows green)
  deleted:
    - livos/packages/livinityd/source/modules/webapps/display-allocator.ts (legacy string-returning, Phase 100-10-01 scaffolding superseded)
    - livos/packages/livinityd/source/modules/webapps/display-allocator.test.ts (paired test file)

key-decisions:
  - "DisplayAllocator returns `number` (10, 11, ...), matching PortAllocator.allocate() — Wave 2 spawn bodies compose the two allocators symmetrically; caller composes display string as `:${n}`."
  - "Configurable pollIntervalMs (default 200ms; test override 1ms) instead of fake timers — keeps tests deterministic without vitest fake-timer plumbing."
  - "On readiness timeout, SIGKILL the orphan child BEFORE throwing XvfbReadyTimeoutError — prevents resource leak under failure."
  - "Old webapps/display-allocator.ts DELETED (importers re-wired) per orchestrator success criterion. window-manager.ts displayAllocator opt re-typed `unknown` to keep test-fixture compat — Wave 2 102-04 will replace with strong type once spawn body composes the new allocator."

patterns-established:
  - "Pattern: number-returning allocator in `streaming/` folder — composable with PortAllocator for per-app spawn orchestration"
  - "Pattern: spawn + readiness poll factory function returning `{pid, display, exited, stop}` handle (mirrors xvfb-display.ts shape with added readiness gate)"
  - "Pattern: test injection via spawnFn + execFileFn opts — FakeChild EventEmitter as canonical mock primitive"

requirements-completed:
  - D-102-DISPLAY-ALLOCATOR
  - D-102-PER-APP-XVFB
  - D-102-SACRED

# Metrics
duration: 25min
completed: 2026-05-11
---

# Phase 102 Plan 01: DisplayAllocator + XvfbSpawner Summary

**Number-returning DisplayAllocator (range [10, 100)) + xdpyinfo-readiness-polled XvfbSpawner — Wave 1 foundation for per-app X display orchestration; legacy string-returning allocator deleted with importers re-wired.**

## Performance

- **Duration:** ~25 min (autonomous, parallel worktree)
- **Started:** 2026-05-11T09:24:00Z
- **Completed:** 2026-05-11T09:49:29Z
- **Tasks:** 5 / 5 committed
- **Files created:** 4 (2 source + 2 test)
- **Files modified:** 4 (index.ts, window-manager.ts, streaming/index.ts barrel, VALIDATION.md)
- **Files deleted:** 2 (webapps/display-allocator.{ts,test.ts})

## Accomplishments

- DisplayAllocator class with [10, 100) range = 90 slots, linear-walker cursor, idempotent release, integer-guard release, DisplayRangeExhaustedError on exhaustion (7/7 vitest)
- XvfbSpawner with `sudo -n -u bruce Xvfb :N -screen 0 1280x720x24 -nolisten tcp -ac` argv (detached), xdpyinfo readiness poll (200ms × 25 → 5s deadline), XvfbReadyTimeoutError with SIGKILL-before-throw, handle.stop() SIGTERM→graceMs→SIGKILL (7/7 vitest)
- Legacy `webapps/display-allocator.ts` (Phase 100-10-01 string-returning) DELETED; non-test importers re-wired (livinityd/source/index.ts dropped the import + the unused allocator construction; webapps/window-manager.ts dropped the type import + retyped opt as `unknown` to keep test fixtures compiling)
- `streaming/index.ts` barrel exports new symbols for Wave 2 consumption: `import {DisplayAllocator, spawnXvfb} from '../streaming/index.js'`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified PRE and POST every commit — plan did not touch `liv/` tree
- VALIDATION.md `wave_0_complete: false` → `true` flipped; table rows 102-01-01 + 102-01-02 → ✅ green

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree mode):

1. **Task 1: RED — DisplayAllocator stubs + flip wave_0_complete** — `cf44ec48` (test)
   - Created `streaming/display-allocator.test.ts` with 7 failing tests (suite `'102-01-01 DisplayAllocator'`)
   - Flipped VALIDATION.md `wave_0_complete: true` and table row to `❌ red`

2. **Task 2: GREEN — DisplayAllocator class with [10, 100) range** — `054eec0b` (feat)
   - Created `streaming/display-allocator.ts` verbatim copy of `port-allocator.ts` with substitutions (Port→Display, 15900→10, 16000→100, PortRangeExhaustedError→DisplayRangeExhaustedError)
   - 7/7 vitest pass

3. **Task 3: XvfbSpawner with xdpyinfo readiness poll** — `4deb1173` (feat)
   - Created `streaming/xvfb-spawner.ts` + `streaming/xvfb-spawner.test.ts`
   - argv: `['-n', '-u', user, 'Xvfb', display, '-screen', '0', resolution, '-nolisten', 'tcp', '-ac']` via `sudo` with `detached:true`
   - Tests use FakeChild EventEmitter + injected spawnFn + injected execFileFn (mirrors vnc-bridge.test.ts factory-injection pattern)
   - 7/7 vitest pass

4. **Task 4: refactor — delete legacy webapps/display-allocator.ts (importers re-wired)** — `0d889ac9` (refactor)
   - `git rm` legacy file pair
   - Re-wired livinityd/source/index.ts (removed import + call; replaced with comment explaining Wave 2 will re-introduce via new module)
   - Re-typed webapps/window-manager.ts opt `displayAllocator?: DisplayAllocator` → `displayAllocator?: unknown` (window-manager never dereferences it; Wave 2 102-04 will fix the strong type once spawn body composes the new allocator)

5. **Task 5: barrel export streaming/index.ts; sacred SHA verified** — `cabeafe1` (feat)
   - Appended `DisplayAllocator`, `DisplayRangeExhaustedError`, `DisplayAllocatorOpts`, `spawnXvfb`, `XvfbReadyTimeoutError`, `XvfbSpawnOpts`, `XvfbHandle` (+ injection types) to streaming barrel
   - Flipped VALIDATION.md table rows 102-01-01 + 102-01-02 to `✅ green`

## Files Created/Modified

### Created
- `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` — Number-returning DisplayAllocator class; verbatim port-allocator.ts companion with Display/10..100 substitution; DisplayRangeExhaustedError; 108 LOC
- `livos/packages/livinityd/source/modules/streaming/display-allocator.test.ts` — 7 vitest tests in `'102-01-01 DisplayAllocator'` suite; pure unit, no I/O
- `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` — spawnXvfb async factory; xdpyinfo readiness poll loop; XvfbReadyTimeoutError; stopProc helper; XvfbHandle return shape with SIGTERM→graceMs→SIGKILL stop()
- `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.test.ts` — 7 vitest tests in `'102-01-02 XvfbSpawner'` suite; FakeChild + injected spawnFn + execFileFn mocks

### Modified
- `livos/packages/livinityd/source/modules/streaming/index.ts` — Append DisplayAllocator + XvfbSpawner re-exports
- `livos/packages/livinityd/source/index.ts` — Drop `createDisplayAllocator` import + boot-time construction; replaced with explanatory comment (Wave 2 102-04 will re-introduce via new streaming/display-allocator + spawnXvfb)
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — Drop `import type {DisplayAllocator}`; re-type `displayAllocator?: DisplayAllocator` → `displayAllocator?: unknown` (opt-in compat; never dereferenced)
- `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` — frontmatter `wave_0_complete: false` → `true`; rows 102-01-01 + 102-01-02 `⬜ pending` → `✅ green`

### Deleted
- `livos/packages/livinityd/source/modules/webapps/display-allocator.ts` — Phase 100-10-01 scaffolding; string-returning superseded by number-returning streaming/display-allocator.ts
- `livos/packages/livinityd/source/modules/webapps/display-allocator.test.ts` — paired test file

## Decisions Made

1. **Number return type, not string** — `DisplayAllocator.allocate(): number` (e.g., `10`, `11`) instead of legacy `string` (`':10'`, `':11'`). Matches `PortAllocator.allocate(): number` so Wave 2 spawn bodies compose the two allocators symmetrically. Caller composes `:${n}` when handing off to Xvfb argv.

2. **Configurable pollIntervalMs over fake timers** — XvfbSpawner accepts `pollIntervalMs` opt (default 200ms; tests pass 1ms). Avoids vitest fake-timer plumbing complexity while keeping tests deterministic. Aligns with patterns in vnc-bridge.test.ts.

3. **SIGKILL orphan BEFORE throwing XvfbReadyTimeoutError** — On readiness timeout, `try { child.kill('SIGKILL') } catch {}` runs before the throw so the caller doesn't leak an orphan Xvfb process when the X server never came up.

4. **Legacy `webapps/display-allocator.ts` DELETED (not deprecated)** — Per orchestrator success criterion ("DELETED (no longer in repo)"). Importers re-wired:
   - `index.ts` no longer pre-constructs an allocator at boot (Wave 2 102-04 will compose the new one inline)
   - `window-manager.ts` opt re-typed `unknown` so existing test fixtures keep type-checking. Wave 2 102-04 will replace with strong reference to the new allocator once it actually composes it.

5. **`streaming/index.ts` barrel export ADDED, not replaced** — Appended new exports beneath existing PortAllocator exports so downstream import sites continue to work unchanged. New consumers can pull a single barrel root.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-wired legacy importers to enable file deletion**

- **Found during:** Task 4 (Importer audit + delete old webapps/display-allocator.ts)
- **Issue:** Plan's Task 4 specifies CASE A (delete) vs CASE B (deprecate marker only) based on importer presence. Grep found 2 non-test importers — `livinityd/source/index.ts` (line 53 import + line 574 call) and `webapps/window-manager.ts` (line 89 type import + line 202 opt + line 294 field). Per plan that would mean CASE B (deprecate). BUT the orchestrator's success criterion explicitly says `webapps/display-allocator.ts` DELETED (no longer in repo) — these conflict.
- **Resolution:** Followed orchestrator (delete) and auto-fixed the blocking issue by re-wiring importers:
  - `index.ts`: Removed import + the `createDisplayAllocator()` call + the `displayAllocator` field passed to WebAppWindowManager (was a no-op since 100-10-08 anyway; comment in window-manager.ts:188 confirms "spawn() NO LONGER calls allocate() / release()").
  - `window-manager.ts`: Dropped `import type {DisplayAllocator}`; re-typed `displayAllocator?: DisplayAllocator` → `displayAllocator?: unknown`. Test fixtures cast their mock allocators through `as any` already, so this keeps compatibility.
- **Verification:** All 36 window-manager tests pass (3 skipped pre-existing). All 85 streaming tests pass. `pnpm typecheck` shows 376 errors — IDENTICAL count to pre-change (verified via git stash + re-run), meaning zero new TS errors from the deletion.
- **Files modified:** `livos/packages/livinityd/source/index.ts`, `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- **Committed in:** `0d889ac9` (Task 4)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Enables orchestrator success criterion ("file DELETED") without breaking the unrelated window-manager test suite. Wave 2 plan 102-04 will tighten the `unknown` type to a strong DisplayAllocator reference once the spawn body actually composes the new allocator. No scope creep — touched only the minimum surface needed to delete the file.

## Issues Encountered

- **node_modules missing in worktree** — Installed via `pnpm install --prefer-offline` (~3min). UI package `postinstall` failed on Windows due to POSIX `cp` syntax, but that's unrelated to plan 102-01 (livinityd builds fine).
- **`pnpm build` script doesn't exist** — Used `pnpm typecheck` (which does exist) to verify no new TS errors from the file deletion.
- **Pre-existing typecheck errors (376)** — None introduced by plan 102-01; all in unrelated modules (user/routes.ts, file-store.ts, webapps/trpc-router.ts logger interface drift, widgets/routes.ts ctx narrowing). Documented to `deferred-items.md` is NOT needed per SCOPE BOUNDARY — these pre-exist plan 102-01 and are out of scope.

## Importer-Audit Result

**Case B+ resolution** (per Rule 3 escalation to match orchestrator delete criterion).

Non-test importers found pre-Task-4:
1. `livos/packages/livinityd/source/index.ts:53` — `import {createDisplayAllocator}` — **REMOVED**
2. `livos/packages/livinityd/source/index.ts:574` — `const displayAllocator = createDisplayAllocator()` — **REMOVED**
3. `livos/packages/livinityd/source/index.ts:587` — `displayAllocator` opt passed to WebAppWindowManager — **REMOVED**
4. `livos/packages/livinityd/source/modules/webapps/window-manager.ts:89` — `import type {DisplayAllocator}` — **REMOVED**
5. `livos/packages/livinityd/source/modules/webapps/window-manager.ts:202` — `displayAllocator?: DisplayAllocator` — **re-typed `unknown`**
6. `livos/packages/livinityd/source/modules/webapps/window-manager.ts:294` — `private readonly displayAllocator: DisplayAllocator | undefined` — **re-typed `unknown`**

Test importers found (auto-deleted with the source file):
- `livos/packages/livinityd/source/modules/webapps/display-allocator.test.ts` — DELETED via `git rm`

Post-deletion verification: `grep -r createDisplayAllocator livos/packages/livinityd/source` returns 0 hits.

## Sacred SHA Verification

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Start of plan | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ matches D-102-SACRED |
| Pre-Task-5 edit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |
| Post-Task-5 edit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ unchanged |

Plan 102-01 did not touch the `liv/` tree at any point. D-102-SACRED lock satisfied.

## Test Count

- **Tests added:** 14 (7 DisplayAllocator + 7 XvfbSpawner)
- **Pre-existing tests removed:** 5 (legacy `webapps/display-allocator.test.ts`)
- **Net test delta:** +9 unit tests
- **Streaming suite total:** 85 pass, 1 skipped (9 test files)
- **Webapps window-manager suite:** 36 pass, 3 skipped (no regressions)

## Files-Touched Count

- Created: 4 (display-allocator.ts, display-allocator.test.ts, xvfb-spawner.ts, xvfb-spawner.test.ts)
- Modified: 4 (streaming/index.ts, livinityd/source/index.ts, webapps/window-manager.ts, .planning/.../102-VALIDATION.md)
- Deleted: 2 (webapps/display-allocator.{ts,test.ts})
- **Total: 10 file operations**

## TDD Gate Compliance

Plan 102-01 contained TDD-flagged tasks (`tdd="true"` on Tasks 1, 2, 3). Gate sequence verified:

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1 — `test:` prefix) | `cf44ec48` test(102-01-01) | ✅ commit prefix matches |
| GREEN (Task 2 — `feat:` prefix) | `054eec0b` feat(102-01-02) | ✅ commit prefix matches |
| Combined RED+GREEN (Task 3 — `feat:` prefix per plan-action wording) | `4deb1173` feat(102-01-03) | ✅ commit prefix matches; tests + impl shipped together per plan |

Note: Task 3 plan explicitly says "RED+GREEN" in same task (test file + impl committed together). This is documented in the plan and is the intended pattern for this task, not a TDD gate violation.

## Next Phase Readiness

- **Wave 1 102-01 complete.** Plan 102-02 (ChromeProcessSpawner) and 102-03 (MasterProfileSeeder) can now proceed in parallel; they are file-disjoint from 102-01.
- **Wave 2 102-04 (window-manager rewrite) ready to consume.** Both new modules importable via `import {DisplayAllocator, spawnXvfb} from '../streaming/index.js'`. Wave 2 will:
  1. Re-type `window-manager.ts` `displayAllocator?: unknown` → `displayAllocator?: DisplayAllocator` (strong type)
  2. Actually call `displayAllocator.allocate()` + `await spawnXvfb({display: ':${n}', ...})` in the spawn body
  3. Track `displayN` + `xvfbHandle` on `ActiveWebApp` map entries
- **Wave 2 102-05 (native-app-binder) ready to consume.** Same import surface; per D-102-NATIVE-APP-PARITY lock, native apps follow identical allocator+Xvfb flow (no profile seeding).
- **No blockers.** Sacred SHA stable. Mini PC deploy gated on Wave 4 (102-10).

## Self-Check: PASSED

Verified all claims:
- `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` — FOUND
- `livos/packages/livinityd/source/modules/streaming/display-allocator.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` — FOUND
- `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/webapps/display-allocator.ts` — MISSING (intended — deleted)
- `livos/packages/livinityd/source/modules/webapps/display-allocator.test.ts` — MISSING (intended — deleted)
- Commit `cf44ec48` — FOUND in git log
- Commit `054eec0b` — FOUND in git log
- Commit `4deb1173` — FOUND in git log
- Commit `0d889ac9` — FOUND in git log
- Commit `cabeafe1` — FOUND in git log
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — VERIFIED on `liv/packages/core/src/sdk-agent-runner.ts`
- `wave_0_complete: true` — VERIFIED in 102-VALIDATION.md
- 14/14 tests pass — VERIFIED (7 display-allocator + 7 xvfb-spawner)

---
*Phase: 102-per-app-display-pivot*
*Plan: 01*
*Completed: 2026-05-11*
