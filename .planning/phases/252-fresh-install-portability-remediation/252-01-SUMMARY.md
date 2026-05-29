---
phase: 252-fresh-install-portability-remediation
plan: 01
subsystem: infra
tags: [install, apt, luse, computer-use, xephyr, xterm, display-manager, vitest, mcp]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: REMEDIATION-BACKLOG (R1-R16) + 251-02/03 findings (missing apt packages + display-manager false-positive success)
provides:
  - Phase-252 apt block (xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl) in both installer scripts
  - Xephyr + xterm added to both install-time verify loops
  - Fail-closed display-manager create() — isError:true + no Redis key on spawn ENOENT
  - computer_create_display MCP wrapper surfaces isError:true on spawn failure
affects: [252-fresh-install-portability-remediation (later waves), luse display lifecycle, fresh-VPS install]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror-site apt edits kept byte-identical across deploy-livinityd.sh + update.sh (audit treats them as a pair)"
    - "Synchronous spawn-error latch + one-microtask yield to fail closed before committing Redis state"
    - "isError discriminant on result envelope plumbed from display-manager through MCP wrapper"

key-files:
  created: []
  modified:
    - scripts/install/deploy-livinityd.sh
    - update.sh
    - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts

key-decisions:
  - "Single commit for TDD Task 2 (test + impl entangled) rather than split RED/GREEN — tests and types changed together"
  - "Pre-existing 389 livinityd typecheck errors are out-of-scope baseline; success criterion is zero NEW errors (389 == 389), not a clean tree"
  - "Synchronous spawn-error latch via handle.on('error') + await Promise.resolve() microtask yield before HSET"

patterns-established:
  - "Mirror apt block + verify-loop additions across both installers stay byte-identical"
  - "Fail-closed lifecycle: latch ENOENT, return isError envelope, skip Redis write + pid report"

requirements-completed: [R1, R2, R3, R7, R16]

# Metrics
duration: ~50min
completed: 2026-05-29
---

# Phase 252 Plan 01: Wave-1 Install Blockers (Luse display/terminal apt + fail-closed create) Summary

**Both installer scripts now apt-install Xephyr/xterm/gnome-terminal/x11-utils/xclip/wmctrl and verify Xephyr+xterm, and display-manager `create()` fails closed (isError:true, no Redis key, pid -1) on a missing-X-binary ENOENT — surfaced through the computer_create_display MCP wrapper.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-29T15:46Z (approx)
- **Completed:** 2026-05-29T16:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Closed R1/R2/R7/R16: the 6 luse display + terminal binaries the v44/250-hotfix code hard-requires are now on both installer apt lists (`deploy-livinityd.sh` + `update.sh`), guarded `|| warn` non-fatal so a missing mirror package cannot abort a fresh install.
- Extended both install-time verify loops to fail loud (warn) if `Xephyr` or `xterm` is still absent after apt.
- Closed R3: `display-manager.create()` now latches a synchronous spawn `'error'` (ENOENT when Xephyr/Xvfb is missing) and returns `{isError:true, error, pid:-1}` WITHOUT writing the `luse:display:<id>` Redis key — no more false-positive success + stale key.
- The `computer_create_display` MCP wrapper branches on `result.isError` and returns an `isError:true` error envelope on that path.
- 17/17 display-manager vitest cases pass (15 existing + 2 new: fail-closed ENOENT with zero `luse:display:` keys, and a happy-path `isError:false` drift-lock).

## Task Commits

1. **Task 1: Phase-252 apt block + verify-loop entries in both installers** — `bc0210f6` (feat)
2. **Task 2: Fail-closed display-manager create() on spawn error (R3)** — `f272265b` (feat — TDD test+impl in one commit)

**Plan metadata:** _this commit_ (docs: complete plan)

## Files Created/Modified
- `scripts/install/deploy-livinityd.sh` — Phase-252 apt block after VAAPI block in `_dld_install_streaming_packages`; `Xephyr xterm` appended to the verify `for bin` loop.
- `update.sh` — byte-identical mirror of the same two changes.
- `livos/packages/livinityd/source/modules/computer-use/displays/types.ts` — `isError?`/`error?` on `CreateDisplayResult`; optional `on?(event,'error',listener)` on `SpawnHandle`.
- `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` — synchronous error latch + microtask yield in `create()`; fail-closed early return; `isError:false` on happy path.
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — `computer_create_display` branches on `result.isError`.
- `livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts` — `makeErrorSpawnFn` harness + 2 R3 cases.

## Decisions Made
- TDD Task 2 committed as a single `feat` (test + types + impl + wrapper are mutually dependent — a split RED commit would not have type-checked because the new `isError` field on the result type is referenced by both test and wrapper). Documented under TDD Gate Compliance below.
- Pre-existing typecheck baseline (389 errors across unrelated `webapps/`, `widgets/`, `xai-auth/`, and existing `computer-use/native/` + `tools.ts` spawn-`on` patterns) is out-of-scope per the SCOPE BOUNDARY rule. Verified my changes add ZERO new errors (389 before == 389 after via git-stash A/B comparison).

## Deviations from Plan

None of the Rule 1-4 deviation classes were triggered. The plan was executed as written, with two execution-mechanics notes:

1. **Acceptance-criterion adjustment (not a code deviation):** the plan states `pnpm --filter livinityd typecheck exits 0`. The livinityd package has a large pre-existing typecheck-error baseline (389 errors, none in the files this plan touches). Achieving a literally-zero exit is impossible without fixing ~389 unrelated errors, which is explicitly out of scope (SCOPE BOUNDARY). Substituted the correct equivalent gate: **zero NEW typecheck errors** (confirmed 389 == 389 via stash A/B).
2. **CRLF-aware edit for `tools.ts`:** the file uses CRLF line terminators, so the Edit tool's LF-normalized match failed. Applied the MCP-wrapper change via a CRLF-preserving Python edit. No behavioral difference — the same `if (result.isError)` branch was inserted.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None. All acceptance greps pass; both scripts pass `bash -n`; 17/17 tests green.

## TDD Gate Compliance

Task 2 is `tdd="true"`. The new tests and implementation were committed together in `f272265b` rather than as separate RED/GREEN commits, because the new `CreateDisplayResult.isError` field (a type-level change) is referenced by both the test assertions and the MCP wrapper — a tests-only RED commit would not type-check in isolation. The RED→GREEN intent was preserved in-session: the failing-test design (`makeErrorSpawnFn` emitting a synchronous `'error'`) was authored against the not-yet-implemented latch, then the latch was added and the full suite verified GREEN (17/17). Per the executor TDD gate guidance, this single-commit entanglement is noted here for traceability.

## Issues Encountered
- `pnpm --filter livinityd test` invokes vitest in **watch mode** (never exits) — early background runs produced no output and appeared to hang. Resolved by running `npm run test:run -- display-manager` (vitest **run** mode) directly in the livinityd package, which exits cleanly. (Future note: use `test:run`, not `test`, for non-interactive verification.)

## User Setup Required
None — no external service configuration required. The apt packages install automatically on the next fresh install or `update.sh` run.

## Next Phase Readiness
- Wave-1 P0/P1/P2 install blockers (R1/R2/R3/R7/R16) closed at the repo layer. Later Phase-252 waves (remaining R-items from the 251 backlog: get.livinity.io mapping, Path-B CHANGEME secrets, systemd EnvironmentFile, identity hardcodes, etc.) are independent and unblocked.
- Not yet deployed to Mini PC — these are repo-side script + source changes; they take effect on the next `update.sh`/fresh install. Sacred blob `f3538e1d…` preserved (sacred-sha PASS on both commits).

## Self-Check: PASSED

All 7 modified/created files verified present on disk; both task commits (`bc0210f6`, `f272265b`) verified in git log.

---
*Phase: 252-fresh-install-portability-remediation*
*Completed: 2026-05-29*
