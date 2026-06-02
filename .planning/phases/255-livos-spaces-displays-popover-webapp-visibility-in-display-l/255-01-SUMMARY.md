---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
plan: 01
subsystem: testing
tags: [vitest, tdd, red-test, trpc, displays, fluxbox, wmo, turkish-greeting]

# Dependency graph
requires:
  - phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
    provides: "displaysRouter (displays.list / displays.getVncUrl) + canAccessDisplay export + StreamManager/DisplayManager DI"
provides:
  - "RED test scaffold for displays.screenshot authz + dataUrl shape (255-02 GREEN gate)"
  - "RED test scaffold for branded-shell feh/tint2 boot argv + subprocess-scoped DISPLAY + non-fatal degrade (255-05 GREEN gate)"
  - "RED test scaffold for clock-helpers wmoGlyph WMO map + Turkish greeting bands (255-04 GREEN gate)"
affects: [255-02, 255-04, 255-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-extract-for-test: lock contracts of unbuilt pure modules (clock-helpers) / pure predicate (canAccessDisplay reuse) before implementation"
    - "tRPC internal-procedure probing: resolve _def.procedures.<name> to drive an unmounted handler into RED"
    - "Injected spawnFn + writeFileFn argv-shape assertion (fluxbox-wm.ts analog) for OS-integration boot helpers"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-screenshot.test.ts"
    - "livos/packages/livinityd/source/modules/shell/__tests__/branded-shell.test.ts"
    - "livos/packages/ui/src/modules/desktop/clock-helpers.test.ts"
  modified: []

key-decisions:
  - "displays.screenshot tests probe displaysRouter._def.procedures.screenshot (tRPC v10 internal map); undefined today → RED for the right reason (handler unimplemented)"
  - "Tests 1-3 of the screenshot file PASS today (they exercise the already-exported canAccessDisplay) — only the handler-shape Tests 4-6 are RED; this locks the auth contract the GREEN handler MUST reuse verbatim"
  - "Ran tests via package-correct invocations: `pnpm --filter livinityd test` (pkg name is `livinityd`, NOT `@livos/livinityd`) and UI via `vitest run` (the `ui` pkg has no `test` script — plan's `pnpm --filter ui test` does not exist; used `test:run` / `npx vitest run` equivalent)"

patterns-established:
  - "Wave 0 RED scaffold: each GREEN plan inherits a failing test whose failure message/unresolved-import names the exact missing module/handler"

requirements-completed: []  # Wave 0 RED scaffold — requirements GOAL-255-LIVE-THUMBS / GOAL-255-LIVOS-SHELL / GOAL-255-NAVBAR-GLOWUP are satisfied by the GREEN plans (02/04/05), not by this RED-only plan

# Metrics
duration: 16min
completed: 2026-06-02
---

# Phase 255 Plan 01: Wave 0 RED Test Scaffolds Summary

**Three failing (RED) Vitest files locking the observable contracts for Phase 255's testable seams — displays.screenshot authz + dataUrl shape, branded-shell feh/tint2 boot argv, and clock-helpers WMO glyph + Turkish greeting — each failing because its target module/handler is unimplemented.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-02T12:57:42Z
- **Completed:** 2026-06-02T13:13:14Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments
- **Task 1 RED** — `trpc-router-screenshot.test.ts`: 6 tests. Tests 1-3 (PURE) PASS — they lock the `canAccessDisplay` reuse contract (foreign member FORBIDDEN, 254-06 admin bypass, host/shared open). Tests 4-6 (HANDLER) FAIL because `displays.screenshot` is not mounted on `displaysRouter` — drives the UNAUTHORIZED / SERVICE_UNAVAILABLE guards + the `data:image/jpeg;base64,…` dataUrl wrap. GREEN gate for 255-02.
- **Task 2 RED** — `branded-shell.test.ts`: 5 tests, suite errors at collection because `shell/branded-shell.ts` is unresolved. Asserts feh `--bg-fill` + absolute wallpaperPath with subprocess-scoped `env.DISPLAY===':1'`, tint2 same DISPLAY, an idempotent fluxbox style-file write containing a LivOS token color, NO global `process.env.DISPLAY` mutation (Pitfall-1), and non-fatal degrade when a binary is missing. GREEN gate for 255-05.
- **Task 3 RED** — `clock-helpers.test.ts`: parametrized WMO map (15 codes incl. 200 fallback) + 4 Turkish greeting bands + bare no-name case; suite errors because `desktop/clock-helpers.ts` is unresolved. GREEN gate for 255-04.

## Task Commits

Each task was committed atomically (TDD RED only — no GREEN in this plan):

1. **Task 1: RED — displays.screenshot authz + dataUrl** - `c8cb9e36` (test)
2. **Task 2: RED — branded-shell boot argv** - `6d4cd48e` (test)
3. **Task 3: RED — clock-helpers wmoGlyph + greeting** - `3ce905cb` (test)

_Note: this is a RED-only Wave 0 plan; the GREEN (feat) commits land in plans 255-02, 255-04, 255-05._

## Files Created/Modified
- `livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-screenshot.test.ts` - RED auth-matrix (PASS) + handler-shape (RED) tests for the unbuilt `displays.screenshot` query
- `livos/packages/livinityd/source/modules/shell/__tests__/branded-shell.test.ts` - RED feh/tint2 argv + subprocess-scoped DISPLAY + non-fatal-degrade tests for the unbuilt `bootBrandedShell`
- `livos/packages/ui/src/modules/desktop/clock-helpers.test.ts` - RED WMO-glyph + Turkish-greeting tests for the unbuilt pure `clock-helpers` module

## Decisions Made
- **Screenshot handler driven via tRPC internals:** the test resolves `displaysRouter._def.procedures.screenshot._def.resolver`; it is `undefined` today, so a helper throws a named error ("procedure is not mounted on displaysRouter") — an unambiguous RED that becomes GREEN the moment 255-02 mounts the query.
- **Split PASS/RED in the screenshot file is intentional:** the 3 pure auth tests exercise the already-shipped `canAccessDisplay` (so they PASS and lock the contract the GREEN handler must reuse), while only the 3 handler-shape tests are RED. The suite as a whole exits non-zero, satisfying the RED acceptance criterion.
- **Test-runner invocation corrected (not a code deviation):** the plan's verify commands assumed `@livos/livinityd` and a `ui` `test` script; the actual package is named `livinityd` and the `ui` package exposes `test:run` (`vitest run`). Ran via `pnpm --filter livinityd test` and `npx vitest run` in the `ui` package — same tests, same RED outcome. No file content changed.

## Deviations from Plan

None affecting test content — plan executed exactly as written. The only adjustment was the test-runner command form (package name `livinityd` not `@livos/livinityd`; UI uses `test:run`/`vitest run` not `test`), documented above under Decisions. This is an invocation correction, not a code deviation, so no Rule-1/2/3 auto-fix was needed.

## Issues Encountered
- One `pnpm --filter livinityd test -- trpc-router-screenshot` invocation was auto-backgrounded by the harness and produced no flushed output; re-ran directly via `npx vitest run` inside the package dir, which produced the expected RED result. No impact on the committed tests.

## TDD Gate Compliance
This is a `type: tdd` plan executed as Wave 0 RED-only by design (per the plan's `<plan_specifics>`: "Do NOT implement production code to make them pass"). All three tasks produced `test(...)` RED commits with verified failing evidence:
- Task 1: vitest exit 1, 3/6 failing with "displays.screenshot procedure is not mounted on displaysRouter" (handler missing); 3 pure auth tests pass by design.
- Task 2: vitest exit 1, suite fails to collect — "Failed to load url ../branded-shell.js. Does the file exist?" (module missing).
- Task 3: vitest exit 1, suite fails to collect — "Failed to load url ./clock-helpers. Does the file exist?" (module missing).

The GREEN (`feat`) and any REFACTOR commits for these tests are owned by plans 255-02 (screenshot), 255-04 (clock-helpers), and 255-05 (branded-shell). No warning is warranted — RED-only is the explicit, plan-sanctioned scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **255-02 (screenshot GREEN):** has a failing test (Tests 4-6) that turns green once `displays.screenshot` is added to `displaysRouter` as a `query` returning `{dataUrl, width, height}` after the `canAccessDisplay` auth block, backed by `captureScreenshot({display})`.
- **255-04 (clock-helpers GREEN):** has a failing suite that turns green once `desktop/clock-helpers.ts` exports `wmoGlyph(code)` and `greeting(hour, name?)` per the asserted WMO map + Turkish bands.
- **255-05 (branded-shell GREEN):** has a failing suite that turns green once `shell/branded-shell.ts` exports `bootBrandedShell(...)` with injected spawnFn/writeFileFn, subprocess-scoped DISPLAY, idempotent style write, and non-fatal degrade.
- No production code was created (negative invariant verified: `clock-helpers.ts`, `displays-popover.tsx`, `branded-shell.ts` all absent; `screenshot:` 0 matches in trpc-router.ts).

## Self-Check: PASSED
- FOUND: `livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-screenshot.test.ts`
- FOUND: `livos/packages/livinityd/source/modules/shell/__tests__/branded-shell.test.ts`
- FOUND: `livos/packages/ui/src/modules/desktop/clock-helpers.test.ts`
- FOUND commit: `c8cb9e36` (Task 1 RED)
- FOUND commit: `6d4cd48e` (Task 2 RED)
- FOUND commit: `3ce905cb` (Task 3 RED)

---
*Phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l*
*Completed: 2026-06-02*
