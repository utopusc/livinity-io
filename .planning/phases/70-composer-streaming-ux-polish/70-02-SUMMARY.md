---
phase: 70-composer-streaming-ux-polish
plan: 02
subsystem: ui
tags: [slash-menu, command-palette, p66-design-tokens, vitest, react]

# Dependency graph
requires:
  - phase: 66-liv-design-system-v1
    provides: P66 design tokens (--liv-bg-elevated, --liv-border-subtle, --liv-accent-cyan, --liv-text-*)
  - phase: 23-slash-commands-foundation
    provides: legacy slash-command-menu.tsx (94 LOC) — referenced verbatim, NOT modified
provides:
  - "LIV_BUILTIN_COMMANDS — 6-entry stable array (/clear, /agents, /help, /usage, /think, /computer)"
  - "filterSlashCommands(commands, filter) — pure case-insensitive substring helper"
  - "executeImmediateCommand(name) — boolean, true for /clear, /usage, /help"
  - "<LivSlashMenu /> — controlled (no internal selectedIndex), P66-styled, returns null on empty filter"
affects: [70-08-composer-integration, 70-01-liv-composer]

# Tech tracking
tech-stack:
  added: []  # D-NO-NEW-DEPS honored — zero new npm packages
  patterns:
    - "Pure-helper extraction (filterSlashCommands, executeImmediateCommand) testable without DOM"
    - "Parent-controlled selectedIndex (no internal state) — keyboard nav owned by composer in 70-08"
    - "Optional component-prop overrides (commands?, onFilteredCountChange?, filteredCommandsRef?) for ergonomic test isolation"

key-files:
  created:
    - "livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.tsx (99 LOC)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.unit.test.tsx (103 LOC)"
  modified: []

key-decisions:
  - "Pure-helper extraction (filterSlashCommands + executeImmediateCommand) — testable directly, no @testing-library/react needed (D-07 / D-NO-NEW-DEPS)."
  - "IMMEDIATE_COMMANDS as private Set (lookup O(1)) inside module; exposed only via the executeImmediateCommand boolean accessor — encapsulates the canonical list."
  - "Component renders nothing (returns null) when filtered list is empty — composer in 70-08 uses this signal to drop the popup overlay without managing visibility flag."

patterns-established:
  - "P66 token usage via Tailwind arbitrary-value syntax `border-[color:var(--liv-border-subtle)]` rather than utility classes. Future liv-* components in 70-XX inherit this pattern."
  - "Vitest test layout: 3 describe blocks (data-shape / pure-helper / immediate-command predicate) — establishes 70-XX test taxonomy."

requirements-completed: [COMPOSER-03]

# Metrics
duration: ~12min
completed: 2026-05-04
---

# Phase 70 Plan 02: LivSlashMenu Summary

**Slash command menu with 6 builtin commands (/clear, /agents, /help, /usage, /think, /computer), case-insensitive filter helper, and immediate-execute predicate — all under D-NO-NEW-DEPS and P66 design tokens.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-04T21:38:00Z
- **Completed:** 2026-05-04T21:51:31Z
- **Tasks:** 2 (both complete)
- **Files created:** 2

## Accomplishments

- `LIV_BUILTIN_COMMANDS` exported with exactly 6 commands per CONTEXT D-25, in stable display order (/clear, /agents, /help, /usage, /think, /computer).
- `filterSlashCommands(commands, filter)` — pure helper, case-insensitive substring match against name minus leading slash, empty filter returns full list.
- `executeImmediateCommand(name)` — predicate, true for /clear, /usage, /help (D-27); false for /think, /computer, /agents and unknown names.
- `<LivSlashMenu>` React component — P66 design tokens (`var(--liv-bg-elevated)`, `var(--liv-border-subtle)`, `var(--liv-accent-cyan)`), parent-controlled `selectedIndex`, optional props (`commands`, `onFilteredCountChange`, `filteredCommandsRef`) for ergonomic composer integration in 70-08.
- 15 vitest cases (target was ≥8) all pass in 1.05s — no @testing-library/react, no msw, pure-helper invariants.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement LivSlashMenu component + filter helper** — `68f3642b` (feat)
2. **Task 2: Vitest tests for filter + immediate-command helpers** — `4ecd635b` (test)

_Note: This plan is `type=execute` (not `type=tdd`), so RED-GREEN gating does not apply. Each `<task tdd="true">` flag here is a per-task test-companion convention, not a plan-level RGB cycle._

## Files Created/Modified

- `livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.tsx` (99 LOC) — exports `SlashCommand` type, `LIV_BUILTIN_COMMANDS`, `filterSlashCommands`, `executeImmediateCommand`, `LivSlashMenu` component
- `livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.unit.test.tsx` (103 LOC) — 15 vitest cases across 3 describe blocks

## Verification Results

- `node -e "...slash menu shape..."` → `slash menu shape OK` (all required exports + all 6 commands present)
- `node -e "...P66 tokens..."` → `P66 tokens OK` (`var(--liv-` substring present)
- `pnpm --filter ui build` → exit 0, vite built in 43.44s, 202 PWA precache entries
- `pnpm --filter ui exec vitest run --reporter=verbose src/routes/ai-chat/components/liv-slash-menu.unit.test.tsx` → **15/15 passed** in 1.05s (Test Files 1 passed)
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` (sacred SHA, unchanged at start AND end of every task)
- `git log -1 -- livos/packages/ui/src/routes/ai-chat/slash-command-menu.tsx` → last touched in `54e666ff` (Phase 23-02), CONFIRMED untouched by P70-02 (D-08 honored)
- `git diff HEAD~2..HEAD -- livos/packages/ui/package.json` → empty (D-07 honored, no new deps)

## Built-in Commands (CONTEXT D-25)

| Name        | Description                          | Category | Immediate (D-27) |
| ----------- | ------------------------------------ | -------- | ---------------- |
| `/clear`    | Reset conversation                   | builtin  | YES              |
| `/agents`   | Switch to agents tab                 | builtin  | no               |
| `/help`     | Show available commands              | builtin  | YES              |
| `/usage`    | Show token and cost usage            | builtin  | YES              |
| `/think`    | Force reasoning mode (P75)           | builtin  | no               |
| `/computer` | Start computer use task (P71)        | builtin  | no               |

## Decisions Made

- **Pure-helper extraction over RTL**: `filterSlashCommands` and `executeImmediateCommand` are top-level exports (not closure-encapsulated) so vitest can hammer them directly without rendering. This enabled 15 deterministic tests in 6ms test-time without adding `@testing-library/react` or `jsdom-config-bloat`. Aligns with P67-04 / P68-01 testing precedent.
- **IMMEDIATE_COMMANDS as private Set**: Named-Set lookup is O(1); kept private inside module; only the boolean accessor is exported. Encapsulates the canonical list — adding a new immediate command is a one-line edit at `IMMEDIATE_COMMANDS = new Set([...])`.
- **Optional component props**: `onFilteredCountChange?` and `filteredCommandsRef?` are optional (vs the legacy `slash-command-menu.tsx` where they were required). The composer (70-08) will pass them; smaller consumers (testing, future stand-alone use) can omit. Reduces wiring boilerplate.
- **No tRPC dynamic-command merge in this plan**: Legacy file fetches `trpcReact.ai.listSlashCommands.useQuery`. CONTEXT D-25 says "Plus dynamic commands from existing trpcReact.ai.listSlashCommands.useQuery (carry-over)" but the plan must-have spec only requires builtins. Dynamic merge deferred to 70-08 (composer integration) where the parent passes a merged `commands` array via the `commands?` prop. This plan ships the static surface; composer composes static + dynamic.

## Deviations from Plan

### Plan-spec deviations (documented, NOT auto-fixed code changes)

**1. [Rule 3-style — plan target overestimated] Component LOC is 99, not ≥130 as listed in must-haves**
- **Found during:** Task 1 verification (post-build)
- **Issue:** Plan must-haves table specified `min_lines: 130` for `liv-slash-menu.tsx`, but the canonical implementation provided in the `<action>` block produces exactly 99 LOC when written verbatim. The 130 was a planner-side over-estimate; no implementation gap.
- **Fix:** None required — implementation matches the action block's exact source verbatim. All behavioral must-haves (LIV_BUILTIN_COMMANDS shape, filter algorithm, immediate-command predicate, render component, P66 tokens, position class, returns null on empty) are satisfied. The line-count target was the only un-met must-have, and it represents plan-author over-estimation, not implementation thinness.
- **Files modified:** None (no code change needed)
- **Verification:** All other must-haves green: 6 commands present, P66 tokens used, build passes, 15 tests pass (≥8 target), legacy untouched, no new deps, sacred SHA unchanged.
- **Committed in:** Documented here (no separate commit)

**2. [Plan-style override — TDD task pair without RED gate]** 
- **Found during:** Task 2
- **Issue:** Both tasks are tagged `tdd="true"` but the plan is `type=execute` (not `type=tdd`), and Task 1 ships the implementation BEFORE Task 2 ships the tests. This is the legitimate pattern for `type=execute` plans; per `tdd_execution.md` "Plan-Level TDD Gate Enforcement" only applies to `type=tdd` plans.
- **Fix:** Followed plan-stated task order (Task 1 = component, Task 2 = tests). Tests pass on first run because they were written from the same spec (D-25/D-27) the implementation honored.
- **Verification:** Both commits present in correct order; gate compliance not applicable.
- **Committed in:** N/A

---

**Total deviations:** 2 documented (0 auto-fixed code changes; 1 plan-target accounting note; 1 task-order convention note)
**Impact on plan:** Zero scope creep, zero new code beyond plan action blocks. Plan executed exactly per `<action>` instructions. The only "deviation" is bookkeeping: must-haves' `min_lines: 130` is over-estimated relative to the canonical action source.

## TDD Gate Compliance

This plan is `type=execute`, not `type=tdd`. Per execute-plan.md "Plan-Level TDD Gate Enforcement", the RED→GREEN→REFACTOR gate sequence is enforced ONLY for `type=tdd` plans. This plan ships task-companion tests in the standard `feat → test` order:

1. `feat(70-02): add LivSlashMenu component with 6 builtin commands` — `68f3642b`
2. `test(70-02): add 15 vitest cases for LivSlashMenu helpers` — `4ecd635b`

Tests pass first run (15/15) because both tasks derive from the same locked spec (CONTEXT D-25/D-27).

## Issues Encountered

None. All verification gates passed first try; no Rule 1/2/3 auto-fixes needed.

## User Setup Required

None — no external service configuration, no env vars, no infra changes.

## Next Phase Readiness

- **70-08 (composer integration) can directly consume**: `LivSlashMenu`, `LIV_BUILTIN_COMMANDS`, `filterSlashCommands`, `executeImmediateCommand`. Pass merged builtin+dynamic commands via the `commands` prop; pass `selectedIndex` from composer's keyboard handler; route immediate commands via `executeImmediateCommand` predicate before deciding whether to fill textarea or fire `onSlashAction` directly.
- **No blockers** for 70-01..70-07 — this plan is wave 1 (depends_on: []) and ships independent of other 70-XX plans.
- **Legacy `slash-command-menu.tsx` (94 LOC)** stays in place per D-08 D-NO-DELETE; 70-08 will swap consumers from `SlashCommandMenu` → `LivSlashMenu`, leaving the legacy file orphaned for v32 cleanup.

## Self-Check

- `livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.tsx` — FOUND (verified via Read tool + git log)
- `livos/packages/ui/src/routes/ai-chat/components/liv-slash-menu.unit.test.tsx` — FOUND (verified via Read tool + git log)
- Commit `68f3642b` (feat) — FOUND in `git log --oneline`
- Commit `4ecd635b` (test) — FOUND in `git log --oneline`
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED (verified via `git hash-object`)
- Legacy `slash-command-menu.tsx` — UNTOUCHED (last commit `54e666ff` Phase 23-02)
- `pnpm --filter ui build` — PASSED (exit 0)
- `pnpm --filter ui exec vitest run` for the test file — 15/15 PASSED
- No new npm dependencies — VERIFIED (no diff in `livos/packages/ui/package.json`)

## Self-Check: PASSED

---
*Phase: 70-composer-streaming-ux-polish*
*Completed: 2026-05-04*
