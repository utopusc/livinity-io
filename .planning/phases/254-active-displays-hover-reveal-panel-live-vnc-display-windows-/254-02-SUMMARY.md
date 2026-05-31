---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 02
subsystem: infra
tags: [xvfb, display-manager, computer-use, livinityd, resolution-constant]

# Dependency graph
requires:
  - phase: 254-01
    provides: displayManager wiring on Livinityd + displays.* tRPC seam
provides:
  - Exported DEFAULT_DISPLAY_WIDTH/DEFAULT_DISPLAY_HEIGHT constants from display-manager.ts (re-exported via displays barrel)
  - Boot-time :1 Xvfb resolution sourced from the shared MCP display-creation default (decision #3), no independent 1920x1080 hardcode
affects: [254-04, future display-resolution changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source build-time resolution constant shared between livinityd boot (:1) and the MCP computer_create_display default"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/index.ts
    - livos/packages/livinityd/source/index.ts

key-decisions:
  - "Decision #3: :1 host display resolution derives from DEFAULT_DISPLAY_WIDTH/HEIGHT (the same constants MCP display-creation defaults to) rather than an independent 1920x1080 literal — values unchanged, single-sourced"

patterns-established:
  - "Resolution single-sourcing: livinityd boot and MCP create() both read DEFAULT_DISPLAY_WIDTH/HEIGHT so the two paths cannot drift"

requirements-completed: [GOAL-254-MAIN-DISPLAY-RES]

# Metrics
duration: 2min
completed: 2026-05-31
---

# Phase 254 Plan 02: Main Display :1 Resolution Single-Sourcing Summary

**The boot-time `:1` Xvfb resolution now derives from the same exported `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT` constants the MCP `computer_create_display` path defaults to, removing the divergent `1920x1080x24` hardcode in livinityd boot.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-31T17:23:15Z
- **Completed:** 2026-05-31T17:25:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Renamed module-private `DEFAULT_WIDTH`/`DEFAULT_HEIGHT` (1920/1080, values unchanged) to exported `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT` in `display-manager.ts`; updated `create()` and `list()` references.
- Re-exported both constants from the `displays` barrel (`displays/index.ts`).
- Replaced the hardcoded `resolution: '1920x1080x24'` for the boot `:1` Xvfb call in `index.ts` with a template literal built from the shared constants (decision #3).

## Task Commits

Each task was committed atomically:

1. **Task 1: Export the default display resolution constants** - `e6a06793` (refactor)
2. **Task 2: Source the :1 Xvfb creation resolution from the shared constants** - `dce7c874` (feat)

_Note: Task 1 was marked tdd=true but is a byte-identical export/rename refactor; the pre-existing `display-manager.test.ts` suite (geometry case 8, default 1920/1080) acts as the regression guard and stayed green (17/17), so no new RED test was warranted — the value is unchanged by design._

## Files Created/Modified
- `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` - Exported `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT`; updated in-file refs in `create()` and `list()`.
- `livos/packages/livinityd/source/modules/computer-use/displays/index.ts` - Re-exports the two constants from the barrel.
- `livos/packages/livinityd/source/index.ts` - Extended displays import; `:1` startXvfb resolution now `` `${DEFAULT_DISPLAY_WIDTH}x${DEFAULT_DISPLAY_HEIGHT}x24` ``.

## Decisions Made
- None beyond honoring locked decision #3. The MCP display-creation default IS 1920x1080, so `:1` continues to boot at 1920x1080 — now from one shared constant rather than two independent hardcodes.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Plan line-number hints were slightly stale (`:1` block at index.ts:935-939 not 892-894; `display-manager.ts` constants at 52-53 pre-edit). Located via Grep, no functional impact.

## Verification
- `rg "resolution: ?'1920x1080x24'" source/index.ts` → no matches (literal removed for `:1`).
- `rg "DEFAULT_DISPLAY_WIDTH" source/index.ts` → matches import (L57) AND resolution template (L940).
- `rg "DEFAULT_WIDTH|DEFAULT_HEIGHT" display-manager.ts` → no matches (all renamed).
- `display-manager.test.ts`: 17/17 passed (defaults intact at 1920/1080).
- `tsc --noEmit -p tsconfig.json`: total error count 389 — byte-identical to the Plan 254-01 documented baseline (389). Zero new errors; the only `*/index.ts` errors reside in unrelated `source/modules/server/index.ts` and `source/modules/server/trpc/index.ts`, not the edited root `source/index.ts`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Decision #3 satisfied. Remaining Phase-254 plan: 254-04 (hover panel — consumes `displays.list`).
- Change takes effect on next livinityd boot after deploy (`update.sh`); resolution stays 1920x1080.

## Self-Check: PASSED

All 3 modified files present on disk; both task commits (`e6a06793`, `dce7c874`) found in git log.

---
*Phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-*
*Completed: 2026-05-31*
