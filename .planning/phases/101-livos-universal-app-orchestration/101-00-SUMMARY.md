---
phase: 101-livos-universal-app-orchestration
plan: 00
subsystem: testing
tags: [vitest, chrome-remote-interface, cdp, wave-0, scaffolding, tdd]

# Dependency graph
requires:
  - phase: 100-multi-stream-window-redesign
    provides: per-WebApp bytebot MCP infrastructure (100-08-04) + chat-surface scope filter (100-08-05) + action_log v2 (100-09-06) — all backwards-compat anchors that Phase 101 builds on
provides:
  - 10 vitest stub test files for Wave 1+ TDD RED phase
  - chrome-remote-interface@^0.34.0 + @types/chrome-remote-interface@^0.33.0 installed in livinityd workspace
  - test:run npm scripts in livinityd + ui packages (unblocks Wave 1+ verify commands)
  - VALIDATION.md wave_0_complete flag flipped → true
affects:
  - 101-01 (chrome-cdp/bootstrap.test.ts + chrome-cdp/client.test.ts stubs ready)
  - 101-02 (streaming/port-allocator.test.ts stub ready)
  - 101-03 (apps/native-app-spawner.test.ts stub ready)
  - 101-05 (apps/native-app-binder.test.ts stub ready)
  - 101-06 (ai/agent-prompt-builder.test.ts stub ready)
  - 101-07 (ui/dock/native-app-form.test.tsx + ui/dock/native-app-icon.test.tsx stubs ready)
  - 101-08 (ui/window/teach-popover.test.tsx + ui/window/app-contents/webapp-teach-popup-host.test.tsx stubs ready)

# Tech tracking
tech-stack:
  added:
    - chrome-remote-interface@^0.34.0 (Node.js CDP client — de-facto standard, used by Puppeteer + Playwright transitively)
    - "@types/chrome-remote-interface@^0.33.0 (DefinitelyTyped types)"
  patterns:
    - "Wave 0 stub-first TDD scaffold: each Wave 1+ TDD plan's RED-phase task opens a pre-existing stub file with `it.skip(...)` placeholders, so the test file exists on disk before the test logic is written. Removes the literal 'do I create or extend?' prerequisite from every TDD task in Phase 101."

key-files:
  created:
    - livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts
    - livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts
    - livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts
    - livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts
    - livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts
    - livos/packages/ui/src/modules/dock/native-app-form.test.tsx
    - livos/packages/ui/src/modules/dock/native-app-icon.test.tsx
    - livos/packages/ui/src/modules/window/teach-popover.test.tsx
    - livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.test.tsx
    - .planning/phases/101-livos-universal-app-orchestration/deferred-items.md
  modified:
    - livos/packages/livinityd/package.json (added chrome-remote-interface + @types + test:run script)
    - livos/packages/ui/package.json (added test:run script)
    - livos/pnpm-lock.yaml (chrome-remote-interface chain + reshuffled rollup peer)
    - .planning/phases/101-livos-universal-app-orchestration/101-VALIDATION.md (wave_0_complete: false → true; 10 Wave 0 items checked; webapp-teach-popup-host.test.tsx new entry added)

key-decisions:
  - "Stubs use min-passing `it.skip(...)` placeholder so `pnpm <pkg> test:run <stub-path>` exits 0 immediately after Wave 0 lands — vitest discovers them as skipped, no real test logic needed yet"
  - "TSX stubs use the per-file `// @vitest-environment jsdom` comment (consistent with webapp-stream-window.unit.test.tsx P95-08 precedent) — no global vitest config needed for ui package"
  - "agent-runner-factory.test.ts (line 77 of VALIDATION.md) NOT created here — deferred to 101-06 / 101-09 owning plans because 101-00's files_modified list does not include it"
  - "Added test:run npm scripts to livinityd + ui (Rule 3 — Wave 1+ plans rely on `pnpm --filter <pkg> test:run` which did not exist; this is missing critical infrastructure)"

patterns-established:
  - "Wave-0 scaffold: every TDD-heavy phase should pre-create stub test files so Wave 1+ TDD tasks can begin in RED phase with the file on disk. The 101-00 vitest skeleton (`describe('TODO — filled by Plan 101-NN Task M', () => { it.skip(...) })`) is the canonical form."
  - "Stub-file deferred ownership: the describe block name encodes the owning plan + task (e.g. 'TODO — filled by Plan 101-01 Task 2') so executor agents reading a stub know exactly which plan converts the placeholder into real tests."

requirements-completed: [D-101-CHROME-CDP, D-101-PORT-ALLOC, D-101-NATIVE-APPS, D-101-LUSE-CONTEXT, D-101-TEACH-V3]

# Metrics
duration: 56min
completed: 2026-05-11
---

# Phase 101 Plan 00: Wave 0 — Test Stub Scaffolding + Dependency Install Summary

**10 vitest stub test files + chrome-remote-interface installed + test:run scripts wired + VALIDATION.md wave_0_complete flag flipped — unblocks Phase 101 Wave 1+ TDD execution**

## Performance

- **Duration:** 56 min
- **Started:** 2026-05-10T23:11:00-07:00 (Task 1 staging)
- **Completed:** 2026-05-11T00:07:42-07:00 (Task 3 commit)
- **Tasks:** 3/3
- **Files created:** 11 (10 stubs + deferred-items.md)
- **Files modified:** 4 (livinityd/package.json, ui/package.json, pnpm-lock.yaml, 101-VALIDATION.md)
- **Total commits:** 3 (one per task, atomic)

## Accomplishments

- **chrome-remote-interface installed** — Node.js CDP client (0.34.0 + types 0.33.0) ready for Plan 101-01 Chrome bootstrap. `require.resolve` succeeds against livinityd workspace.
- **10 stub test files on disk** — every Wave 1+ TDD plan now has a pre-existing test file to extend in RED phase. Vitest discovers all 10 as `it.skip()` (no failures).
- **test:run scripts added to livinityd + ui packages** — Wave 1+ plans' `<verify>` commands (`pnpm --filter livinityd test:run <path>`) now resolve (previously the script did not exist, every downstream `<verify>` would have errored).
- **VALIDATION.md flipped to wave_0_complete: true** — 11 Wave 0 checkboxes ticked (10 Wave 0 deliverables + 1 install entry). Wave 1 dispatch unblocked.
- **Sacred SHA preserved** — `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified at start AND after each commit.

## Task Commits

Each task was committed atomically (no `--no-verify`; pre-commit sacred-SHA hook passed on all three):

1. **Task 1: Install chrome-remote-interface + @types in livinityd workspace** — `1cfafcfe` (chore)
2. **Task 2: Create 10 stub test files + add test:run scripts** — `0f87f687` (chore)
3. **Task 3: Flip VALIDATION.md wave_0_complete: true + check 10 Wave 0 items** — `39297f8c` (docs)

## Files Created/Modified

### Stub test files (created)

| Path | Owning Plan |
|------|-------------|
| `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts` | 101-01 Task 3 (Chrome CDP bootstrap) |
| `livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts` | 101-01 Task 2 (chrome-remote-interface wrapper) |
| `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts` | 101-02 Task 1 (per-app port allocator 15900-15999) |
| `livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts` | 101-03 Task 2 (Ubuntu native app spawner) |
| `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` | 101-05 (WM_CLASS poll + port bind) |
| `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` | 101-06 Task 2 (Active Window Context prompt snippet) |
| `livos/packages/ui/src/modules/dock/native-app-form.test.tsx` | 101-07 (dock native app form) |
| `livos/packages/ui/src/modules/dock/native-app-icon.test.tsx` | 101-07 (dock native app icon) |
| `livos/packages/ui/src/modules/window/teach-popover.test.tsx` | 101-08 Task 2 (Teach v3 click-anchored popover) |
| `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.test.tsx` | 101-08 Task 3 (rapid-click queueing, commit-clears-pending, mount-with-event — BLOCKER #4 fix) |

### Dependency + infrastructure changes (modified)

- `livos/packages/livinityd/package.json` — Added:
  - `dependencies.chrome-remote-interface: ^0.34.0`
  - `devDependencies.@types/chrome-remote-interface: ^0.33.0`
  - `scripts.test:run: vitest run --testTimeout 180000 --hookTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true`
- `livos/packages/ui/package.json` — Added `scripts.test:run: vitest run`
- `livos/pnpm-lock.yaml` — Task 1 commit `1cfafcfe` added 84 lines (chrome-remote-interface chain). Task 2 commit `0f87f687` added 14 lines / removed 22 (rollup peer reshuffle from pnpm re-link). Net diff ≈ +76 lines.
- `.planning/phases/101-livos-universal-app-orchestration/101-VALIDATION.md` — `wave_0_complete: false → true`; 10 of 11 Wave 0 checkboxes ticked + 1 new `webapp-teach-popup-host.test.tsx` entry added; `agent-runner-factory.test.ts` line kept unchecked with "DEFERRED to Plan 101-06 / 101-09" annotation (101-00 does not own that file).

### New tracking doc

- `.planning/phases/101-livos-universal-app-orchestration/deferred-items.md` — Pre-existing test failures discovered during `pnpm -r test:run` verify (10 ui tests missing jsdom env, 3 livinityd integration tests requiring Linux dbus). Out of Wave 0 scope per scope-boundary rule.

## Decisions Made

- **Test file shape:** Each stub uses an `it.skip(...)` placeholder so vitest discovers the file but reports zero failures. Future TDD tasks rewrite the describe block + add real `it(...)` cases. This is the cheapest possible "file on disk" guarantee.
- **JSX stubs use per-file vitest-environment comment** instead of a new `vitest.config.ts` for the ui package. Matches the precedent set by `webapp-stream-window.unit.test.tsx` (P95-08) which uses the same `// @vitest-environment jsdom` directive — no infrastructure churn.
- **Did NOT create agent-runner-factory.test.ts** despite it appearing on VALIDATION.md's Wave 0 list. The PLAN.md `files_modified` array explicitly omits it; its (extend if exists) clause defers to its owning plan (101-06 or 101-09). Marked DEFERRED in VALIDATION.md.
- **Added test:run scripts** as Wave-0 infrastructure (Rule 3 — blocking issue). Without these, every Wave 1+ `<verify>` clause in 101-01..101-08 would have errored out at executor time. Adding them now is the minimum-blast-radius fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `test:run` npm scripts in livinityd + ui packages**
- **Found during:** Task 2 verification (`pnpm -r test:run` exited non-zero with "None of the selected packages has a 'test:run' script")
- **Issue:** Wave 1+ plans use `pnpm --filter <pkg> test:run <path>` in their `<verify>` clauses, but neither `livos/packages/livinityd/package.json` nor `livos/packages/ui/package.json` had a `test:run` script. Without these, every downstream TDD verification would have errored at executor time.
- **Fix:** Added `"test:run": "vitest run …"` to both package.json files, mirroring each package's existing `test` script flag set.
- **Files modified:** `livos/packages/livinityd/package.json`, `livos/packages/ui/package.json`
- **Verification:** `pnpm --filter livinityd test:run <stub-path>` and direct `npx vitest run <stub-path>` both succeed and discover Wave 0 stubs as `skipped`.
- **Committed in:** `0f87f687` (Task 2 commit)

**2. [Out-of-Scope Documentation] Pre-existing test failures logged but NOT fixed**
- **Found during:** Task 2 verification (`pnpm -r test:run` reported 21 ui failures + 7 livinityd failures from OTHER files)
- **Issue:**
  - 10 ui tests under `src/routes/docker/{dashboard,palette}/*` (Phases 25/29 era) reference `localStorage.clear()` without declaring `// @vitest-environment jsdom` → `ReferenceError: localStorage is not defined`. These tests *never* ran via `pnpm test:run` before this commit because the script did not exist.
  - 3 livinityd integration tests (`apps/*.integration.test.ts`) try to `connect()` to `/var/run/dbus/system_bus_socket` (Linux-only IPC); Windows dev shell fails with `ENOENT`. Pre-existing OS dependency.
- **Decision:** Per scope-boundary rule ("Only auto-fix issues DIRECTLY caused by the current task's changes"), these are pre-existing latent failures, not Wave 0 regressions. Logged to `.planning/phases/101-livos-universal-app-orchestration/deferred-items.md` for future cleanup.
- **Files modified:** `.planning/phases/101-livos-universal-app-orchestration/deferred-items.md` (new tracking doc)
- **Verification:** Wave 0 stubs themselves all run cleanly as skipped (verified via `npx vitest run` on each stub path). The full-suite failures are in unrelated files.
- **Committed in:** `0f87f687` (Task 2 commit; deferred-items.md staged alongside stubs)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking) + 1 out-of-scope deferred (documentation only).
**Impact on plan:** Both deviations preserve forward-progress for Wave 1+. The test:run script add is essential infrastructure; the deferred items list is documentation that prevents future executor agents from re-investigating the same pre-existing failures.

## Issues Encountered

- **pnpm symlink staleness after `pnpm add`** — Adding chrome-remote-interface in livinityd workspace caused `vite-imagetools` symlink in ui to briefly point at a non-existent .pnpm hash (rollup peer dep version drift `2.80.0` → `4.57.0`). Resolved by running `pnpm install` at the livos workspace root to re-link. Caused one transient failure of `pnpm -r test:run` for ui (config-load error). Pre-commit symlinks restored.
- **Windows-only postinstall failure** — `ui` package's `postinstall: copy-tabler-icons` ran `mkdir -p` (POSIX syntax) under cmd.exe and emitted "The syntax of the command is incorrect." However, the icons directory already existed (`livos/packages/ui/public/generated-tabler-icons/` populated), so the missing copy was harmless. Pre-existing environment issue, not Wave 0.

## Threat Flags

None. Plan 101-00 introduces one supply-chain risk (`chrome-remote-interface@^0.34.0` from npm registry) which is already documented in the plan's `<threat_model>` as T-101-00 with disposition `accept` (semver-major locked; pnpm-lock.yaml records integrity hash). No new threat surface beyond what the plan declared.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 of Phase 101 is unblocked. The three parallel-executable plans (101-01 CDP bootstrap, 101-02 port allocator, 101-03 native app spawn) can all begin TDD RED phase immediately because:
- All required stub test files exist on disk (Nyquist contract honored)
- `chrome-remote-interface` is installed in livinityd workspace (require.resolve succeeds)
- `test:run` npm scripts exist in both target packages
- VALIDATION.md `wave_0_complete: true` signals dispatch readiness

**Recommended next action:** dispatch Wave 1 (101-01 + 101-02 + 101-03 in parallel worktrees per `workflow.use_worktrees: true`).

## Self-Check: PASSED

Verified post-creation:

- [x] `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts` exists
- [x] `livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts` exists
- [x] `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts` exists
- [x] `livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts` exists
- [x] `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` exists
- [x] `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` exists
- [x] `livos/packages/ui/src/modules/dock/native-app-form.test.tsx` exists
- [x] `livos/packages/ui/src/modules/dock/native-app-icon.test.tsx` exists
- [x] `livos/packages/ui/src/modules/window/teach-popover.test.tsx` exists
- [x] `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.test.tsx` exists
- [x] Commit `1cfafcfe` exists in `git log --all` (Task 1)
- [x] Commit `0f87f687` exists in `git log --all` (Task 2)
- [x] Commit `39297f8c` exists in `git log --all` (Task 3)
- [x] `grep -q "wave_0_complete: true" 101-VALIDATION.md` exits 0
- [x] `grep -q "chrome-remote-interface" livinityd/package.json` exits 0
- [x] `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved)

---
*Phase: 101-livos-universal-app-orchestration*
*Plan: 00 (Wave 0)*
*Completed: 2026-05-11*
