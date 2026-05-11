---
phase: 102-per-app-display-pivot
plan: 03
subsystem: infra
tags: [chrome, profile, cp, reflink, singleton-lock, uuid, fs, livinityd, xvfb]

# Dependency graph
requires:
  - phase: 102-per-app-display-pivot
    provides: D-102-MASTER-PROFILE-SEED contract from 102-CONTEXT.md + Pattern 3 spec from 102-RESEARCH.md
provides:
  - createProfileSeeder({masterDir, appPrefix, execFileFn, accessFn, mkdirFn, uuidFn, logger}) → ProfileSeederHandle
  - ProfileSeederHandle.seed(opts) — cp -r master → /tmp/livos-chrome-app-<uuid> with A1 reflink fallback + A7 SingletonLock cleanup + T-102-03 uuid validation
  - ProfileSeederHandle.ensureMasterExists — idempotent mkdir -p of /opt/livos/data/chrome-master/
  - ProfileSeederHandle.cleanup(uuid) — idempotent rm -rf of per-app dir
  - ProfileSeederHandle.sweepOrphans — boot-time sweep of /tmp/livos-chrome-app-*
  - MasterProfileMissingError (code: MASTER_PROFILE_MISSING)
  - ProfileSeederInputError (code: PROFILE_INVALID_UUID)
  - livinityd.profileSeeder field wired into Livinityd class for Wave 2 plan 102-04 consumption
affects: [102-04 window-manager-rewrite, 102-07 master-chrome-login-ui, 102-08 close-lifecycle]

# Tech tracking
tech-stack:
  added: [no new deps — uses node:child_process execFile + node:fs/promises + node:crypto randomUUID]
  patterns:
    - "Adapter-shape logger ({info, warn, error, verbose}) bridging livinityd's {log, error, verbose} createChildLogger → in-module ProfileSeederLogger interface"
    - "Empirical-risk-named comment blocks (A1 reflink, A7 SingletonLock) tying threat names from CONTEXT.md to the exact code line that mitigates them"
    - "RFC 4122 v4 regex validation BEFORE filesystem interpolation for path-traversal hardening (T-102-03 pattern, reusable for any uuid-keyed filesystem op)"
    - "Factory-function module exporting createProfileSeeder() opts-injection — matches port-allocator.ts companion pattern"

key-files:
  created:
    - livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts
    - livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts
    - livos/packages/livinityd/source/modules/chrome-master/index.ts
  modified:
    - livos/packages/livinityd/source/index.ts (import + class field + boot-wire block)
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md (rows 102-03-01 + 102-03-02 → ✅ green)

key-decisions:
  - "Used callback-shaped (cmd, args, cb) execFileFn mocks in tests so that the production code's promisify(execFn) keeps a vanilla typeof execFile contract — mocks honor the Node child_process callback ABI without needing a separate util.promisify wrapper in test scaffolding."
  - "ProfileSeederLogger left as a separate interface inside profile-seeder.ts rather than depending on livinityd's logger.ts type — keeps the module dependency-free of the in-process logger and easier to consume from other workspaces (matches Phase 99 vnc-bridge pattern)."
  - "Sweep on every boot uses sh -c 'rm -rf <prefix>*' rather than fs.readdir + per-dir rm — single subprocess is faster than 90 syscalls and matches the Risk #3 mitigation language in 102-CONTEXT.md verbatim."
  - "Wave-2 consumer wiring (passing this.profileSeeder into WebAppWindowManager ctor) intentionally deferred to plan 102-04 because the ctor signature change is part of that plan's RED-phase test spec, not this plan."
  - "Empty commit for sacred SHA verify (Task 4) instead of touching any file — plan 102-03 modifies only the livos/ subtree, so the gate is a checkpoint not a code change."

patterns-established:
  - "chrome-master/ module boundary — first module under livinityd that owns the persistent /opt/livos/data/chrome-master/ master profile. Future Wave 3 master-login-routes.ts (102-07) will live alongside profile-seeder.ts."
  - "Boot-wire block placement convention: per-subsystem init goes BETWEEN StreamManager.start() and the Phase 100-08-01 Xvfb :1 fallback block — keeps lifecycle ordering visible and matches WebAppWindowManager's later wire-up site (~line 575)."

requirements-completed: [D-102-MASTER-PROFILE-SEED, D-102-SACRED]

# Metrics
duration: 18min
completed: 2026-05-11
---

# Phase 102-03: MasterProfileSeeder Summary

**MasterProfileSeeder ships the `cp -r /opt/livos/data/chrome-master → /tmp/livos-chrome-app-<uuid>` primitive with A1 reflink fallback, A7 SingletonLock cleanup, T-102-03 RFC 4122 v4 path-traversal hardening, and livinityd boot-time master-dir + orphan-sweep wiring — Wave 2 (plan 102-04 window-manager rewrite) now has the per-app profile seed step it needs.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-11T09:29Z (worktree base reset to a6f98b9d)
- **Completed:** 2026-05-11T09:47Z
- **Tasks:** 4 / 4
- **Files modified:** 4 (3 created, 1 modified) + VALIDATION.md row update

## Accomplishments

- 10 vitest specs cover every locked behavior: seed happy-path, A1 reflink fallback, A7 Singleton cleanup, MasterProfileMissingError, T-102-03 path-traversal rejects (2 cases), ensureMasterExists create + no-op, cleanup idempotency, sweepOrphans.
- All 10 tests pass against the GREEN implementation (verified twice — once mid-Task-2, once at Task-3 build gate).
- Boot wire is non-fatal: ensureMasterExists + sweepOrphans both wrapped in try/catch; livinityd boot continues even if /opt/livos/data/chrome-master/ creation fails.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 4 commits (verified pre + post via `git hash-object`).
- VALIDATION.md rows 102-03-01 + 102-03-02 flipped from `❌ create / ⬜ pending` to `✅ created / ✅ green` so the autonomous orchestrator can read green status from disk.

## Task Commits

1. **Task 1 (RED — test stubs):** `686f249f` (test) — 274 LOC test file. Verified failure: "Failed to load url ./profile-seeder.js".
2. **Task 2 (GREEN — implementation):** `06589846` (feat) — 237 LOC seeder. 10/10 tests pass.
3. **Task 3 (barrel + boot wire):** `43590871` (feat) — index.ts re-export, livinityd boot wire, VALIDATION.md flip, plus a small test mock typing fix (makeOkMkdir parameter signature) so tsc --noEmit accepts `mock.calls[0][0]`.
4. **Task 4 (Sacred SHA verify):** `0efea16e` (chore, --allow-empty) — gate commit.

_Per parallel-worktree mode: all commits used `--no-verify`. The pre-commit Sacred SHA hook is reapplied at orchestrator merge time._

## Files Created/Modified

- **CREATED** `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` (237 LOC) — exports `createProfileSeeder`, `MasterProfileMissingError`, `ProfileSeederInputError`, `MASTER_PROFILE_DIR`, `APP_PROFILE_PREFIX`, types.
- **CREATED** `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts` (276 LOC) — 10 vitest specs.
- **CREATED** `livos/packages/livinityd/source/modules/chrome-master/index.ts` — barrel re-export.
- **MODIFIED** `livos/packages/livinityd/source/index.ts` — `+24 LOC` (import + class field + boot-wire block). NO existing logic touched; insertion sits between StreamManager construction (line ~444) and the Phase 100-08-01 Xvfb :1 fallback (line ~452 in the pre-edit file).
- **MODIFIED** `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` — 2 rows status update.

## Empirical Risk Mitigation Status

| Risk | Mitigation Site | Test Coverage |
|------|----------------|---------------|
| **A1 (reflink)** — `cp -r --reflink=auto` rejects on ext4 / non-CoW filesystems | profile-seeder.ts:160-168 `try { cp --reflink=auto } catch { cp -r }` | Test 2 — first cp call rejected with "cp: reflink unsupported", retry argv asserted has NO --reflink flag, second call succeeds. |
| **A7 (SingletonLock)** — master profile's `Singleton{Lock,Cookie,Socket}` point at master Chrome's PID; per-app Chrome refuses to start | profile-seeder.ts:172-181 `execP('rm', ['-f', .../SingletonLock, .../SingletonCookie, .../SingletonSocket])` after cp | Test 3 — asserts the exact rm argv after happy-path cp. |
| **T-102-03 (path traversal)** — caller-supplied uuid interpolating into a filesystem path | profile-seeder.ts:142-148 `UUID_RE.test(uuid)` BEFORE any access/exec | Tests 5+6 — `'../../etc'` and `'NOTAUUID'` both throw ProfileSeederInputError with code `PROFILE_INVALID_UUID`; execFileFn never invoked. |
| **T-102-03c (DoS via orphan /tmp dirs)** — crashed livinityd leaves /tmp/livos-chrome-app-* dirs filling disk | profile-seeder.ts:212-220 `sweepOrphans()` invokes `sh -c "rm -rf <prefix>*"`; wired at livinityd boot (source/index.ts) | Test 10 — argv assertion; live-deploy verification deferred to Wave 4 plan 102-10 UAT. |

## Sacred SHA Verification

| Gate | SHA | Status |
|------|-----|--------|
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ matches D-102-SACRED |
| After Task 1 (RED) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ untouched |
| After Task 2 (GREEN) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ untouched |
| After Task 3 (boot wire) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ untouched |
| After Task 4 (verify commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ untouched — gate recorded |

Plan 102-03 modifies only files under `livos/packages/livinityd/source/modules/chrome-master/`, `livos/packages/livinityd/source/index.ts`, and `.planning/`. The `liv/` subtree (where sdk-agent-runner.ts lives) was never touched.

## Test Result Summary

```
pnpm --filter @livos/livinityd test:run chrome-master/profile-seeder.test.ts
  RUN  v2.1.9
  ✓ source/modules/chrome-master/profile-seeder.test.ts (10 tests) 9ms
  Test Files  1 passed (1)
       Tests  10 passed (10)
```

Typecheck delta (full livinityd suite): `tsc --noEmit` reported 399 pre-existing errors before my changes, 397 after. NO new errors introduced — the count dropped by 2 because typing `makeOkMkdir` properly cleared two `[0][0]` / `[0][1]` tuple-access errors. Pre-existing errors live in `webapps/trpc-router.ts`, `widgets/routes.ts`, `webapps/trpc-streams.test.ts` (per SCOPE BOUNDARY rule, out of scope for 102-03 — logged here for transparency).

## Decisions Made

- **Inject `execFileFn` as `typeof execFile` (callback shape) rather than a promisified function.** The production code calls `promisify(execFn)`. Tests pass plain `vi.fn((cmd, args, cb) => cb(...))` and the promisify wrapper does the right thing. This keeps the public `ExecFileFn` type stable and easy to consume from other modules.
- **Adapter-shape logger** ({info, warn, error, verbose}) inside the seeder so it composes with livinityd's createChildLogger() pattern WITHOUT exposing logger.ts's internal type back into the chrome-master module. Boot-wire site builds the adapter inline (5 lines, matches the chrome-cdp + webapps adapters that are already established at ~lines 488-505 of livinityd/source/index.ts).
- **sweep via `sh -c "rm -rf <prefix>*"`** rather than `fs.readdir` + per-entry unlink — matches Risk #3 mitigation language in 102-CONTEXT.md verbatim and is one subprocess vs. up-to-90 syscalls.
- **Deferred plumbing `this.profileSeeder` into WebAppWindowManager ctor to plan 102-04.** That ctor signature change is intentionally part of 102-04's RED-phase tests (window-manager rewrite). Wiring it here would bleed scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Typed `makeOkMkdir` mock parameter signature**
- **Found during:** Task 3 typecheck gate
- **Issue:** Initial test scaffolding used `vi.fn(async () => undefined)` which inferred zero-parameter tuple type; `mock.calls[0][0]` and `[0][1]` then failed tsc with `TS2493: Tuple type '[]' of length '0' has no element at index '0'`.
- **Fix:** Changed signature to `vi.fn(async (_path: string, _opts: {recursive: boolean}) => undefined)` so vitest infers the parameter tuple and indexed access typechecks.
- **Files modified:** `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts` (3 LOC)
- **Verification:** `pnpm typecheck` error count dropped 399 → 397 (the two `[0][0]`/`[0][1]` errors disappeared); 10/10 tests still pass.
- **Committed in:** `43590871` (rolled into Task 3 commit since it's a test-side fix, not a separate behavior change).

**2. [Rule 3 — Blocking] Ran `pnpm install` in the worktree before first test**
- **Found during:** Task 1 verification
- **Issue:** Fresh worktree had no `node_modules/`; `pnpm test:run` failed with `'vitest' is not recognized`. Worktree base was reset to orchestrator HEAD `a6f98b9d` (executor preamble step) but install state didn't transfer.
- **Fix:** Ran `pnpm install --filter @livos/livinityd --filter livinityd` from `livos/`. Pre-existing peer-dep warnings (`react 19`, `zod 4`, `typescript 5` mismatches) surfaced but did not block. `pnpm-lock.yaml` was NOT modified by the install (no file delta in `git status`).
- **Files modified:** none — install was a no-source-change operation.
- **Verification:** subsequent `pnpm test:run` succeeded.
- **Committed in:** N/A — no source change.

---

**Total deviations:** 2 auto-fixed (1 bug — test mock typing; 1 blocking — install).
**Impact on plan:** Both auto-fixes essential to reach acceptance criteria. No scope creep; no public API changed. The mock fix DECREASED total typecheck errors in the suite.

## Issues Encountered

- **Worktree base was at `abdfe9f6`** (pre-Phase-102 commit). Per worktree protocol, reset to orchestrator HEAD `a6f98b9d` (which has the 10 PLAN.md files) via `git reset --hard a6f98b9d`. Verified the 102 directory contents matched expectation before reading any plan file.
- **No `build` script on livinityd** — Task 3 acceptance lists `pnpm --filter @livos/livinityd build` but the package only exposes `typecheck` (the daemon runs via tsx — no compile step). Used `pnpm typecheck` as the closest analog. Documented in commit message.

## User Setup Required

None — plan 102-03 produces pure code + tests + boot-wire. Live behavior depends on `/opt/livos/data/chrome-master/` being populated (Wave 3 plan 102-07 ships the UI that lets the user run the Master Chrome Login flow). Until 102-07 ships, `ensureMasterExists()` creates the empty dir and any seed call from a future 102-04 spawn would throw `MasterProfileMissingError` until login completes — exactly the design from D-102-MASTER-PROFILE-SEED.

## Next Phase Readiness

- **Wave 2 plan 102-04 (window-manager rewrite)** now has its dependency satisfied: `livinityd.profileSeeder` is a non-null `ProfileSeederHandle` after start() returns. 102-04 will consume `seed(opts)` between `XvfbSpawner.start()` and `ChromeProcessSpawner.start()` to copy master → per-app dir before launching Chrome with `--user-data-dir=/tmp/livos-chrome-app-<uuid>`.
- **Wave 3 plan 102-07 (Master Chrome Login UI)** will trigger `MasterProfileMissingError` removal by running Chrome with `--user-data-dir=/opt/livos/data/chrome-master` on bruce's :0 display.
- **Wave 3 plan 102-08 (close lifecycle)** will call `profileSeeder.cleanup(uuid)` from `WebAppWindowManager.close()`.

## Self-Check: PASSED

- ✅ `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` exists.
- ✅ `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts` exists.
- ✅ `livos/packages/livinityd/source/modules/chrome-master/index.ts` exists.
- ✅ `livos/packages/livinityd/source/index.ts` modified (import, field, boot-wire).
- ✅ `.planning/phases/102-per-app-display-pivot/102-VALIDATION.md` rows 102-03-01 + 102-03-02 = ✅ green.
- ✅ Commit `686f249f` (test/RED) exists in `git log`.
- ✅ Commit `06589846` (feat/GREEN) exists in `git log`.
- ✅ Commit `43590871` (feat/barrel + boot wire) exists in `git log`.
- ✅ Commit `0efea16e` (chore/sacred SHA verify) exists in `git log`.
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

---
*Phase: 102-per-app-display-pivot*
*Plan: 03*
*Completed: 2026-05-11*
