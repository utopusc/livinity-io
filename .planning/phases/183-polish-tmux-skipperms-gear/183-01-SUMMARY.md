---
phase: 183-polish-tmux-skipperms-gear
plan: 01
subsystem: cc-pty
tags: [tmux, redis, cc-pty, shell-escape, vitest]

requires:
  - phase: 166-cc-pty-mvp
    provides: CcPtyManager createSession substrate + 23 vitest assertions

provides:
  - tmux status bar suppressed via set-option -g status off on every new session
  - --dangerously-skip-permissions injected into claude child command when liv:config:cc_pty_skip_perms is true (default)
  - Redis key read at createSession time; null defaults to true (D-V38-K)
  - Non-fatal set-option failure: logs warn, returns session successfully

affects: [185-cc-pty-deploy, 183-02, cc-pty-config-router, AiChatSettingsPanel]

tech-stack:
  added: []
  patterns:
    - "Phase 183 skip-perms pattern: Redis-keyed feature flag default-ON, read per-createSession, appended as shell flag"
    - "Non-fatal tmux subcommand: try/catch + logger.warn + continue — ensures tmux binary absence in dev never blocks session creation"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/cc-pty/manager.ts
    - livos/packages/livinityd/source/modules/cc-pty/manager.test.ts

key-decisions:
  - "Two separate execSync calls (new-session + set-option) to preserve Assertion 4 regex compat — NOT inlined into new-session string"
  - "Assertion 4 regex trailing quote removed (prefix match) so it stays valid for both skip-perms=true and false cases"
  - "makeManagerWithRedis helper added to tests to allow per-test Redis control without touching module-level redis binding"

requirements-completed:
  - V38-tmux-status-off
  - V38-dangerously-skip-default

duration: 15min
completed: 2026-05-20
---

# Phase 183 Plan 01: tmux status off + dangerously-skip injection Summary

**Redis-keyed --dangerously-skip-permissions injection (default ON) + non-fatal tmux set-option status off per CC PTY session spawn**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-20T11:35:00Z
- **Completed:** 2026-05-20T11:42:00Z
- **Tasks:** 2 (RED + GREEN TDD)
- **Files modified:** 2

## Accomplishments

- createSession() reads `liv:config:cc_pty_skip_perms` from Redis; null defaults to true per D-V38-K
- claude child command gets `--dangerously-skip-permissions` appended when flag is true (default on Mini PC)
- Separate `tmux set-option -g status off -t <name>` call after new-session suppresses the green status bar
- Non-fatal: set-option failure logs warn and does not prevent session creation (tmux may be absent in dev)
- All 33 manager.test.ts assertions pass (25 retained Phase 166 + 8 new Phase 183)

## Task Commits

1. **Task 1: RED** - `fc71dc66` (test): add failing tests for tmux status off + skip-perms injection
2. **Task 2: GREEN** - `8fd04f49` (feat): wire tmux status off + conditional --dangerously-skip-permissions

## Files Created/Modified

- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` - Added Phase 183 Redis read + skipPermsFlag + set-option block
- `livos/packages/livinityd/source/modules/cc-pty/manager.test.ts` - Added makeManagerWithRedis helper + Assertions 26-33 + updated Assertion 4 regex

## Decisions Made

- Used two separate execSync calls (not `; tmux set-option` in the new-session string) to preserve the existing Assertion 4 regex that tests the new-session command format
- Updated Assertion 4 regex to remove trailing `'` — now matches `'LANG=...claude` as a prefix, valid for both skip-perms true and false cases
- `makeManagerWithRedis` helper added at describe-block level (not global) to allow per-test Redis control

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS type annotation in new test destructuring patterns**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** `([c]: [string]) => string` did not match the mock's actual call signature `[cmd: string, _opts?: unknown][]`, causing TS errors in the new assertions
- **Fix:** Changed destructuring type to `([c]: [string, ...unknown[]]) => string` to satisfy TypeScript
- **Files modified:** manager.test.ts
- **Verification:** `pnpm --filter livinityd exec tsc --noEmit` shows no new cc-pty errors
- **Committed in:** `8fd04f49`

---

**Total deviations:** 1 auto-fixed (Rule 1 - type annotation mismatch)
**Impact on plan:** Minor fix required by TypeScript strictness; no behavior change.

## Issues Encountered

Pre-existing TS errors in webapps/trpc-router.ts, widgets/routes.ts, and cc-pty-config-router.ts (pre-183 state) — all out-of-scope and not introduced by this plan.

## Threat Flags

None — T-183-01 through T-183-04 addressed in plan threat model. nameEsc in set-option uses the same shellEscape defense as new-session.

## Known Stubs

None — implementation fully wired. Deferred: per-session override of skip-perms (v38.1) and global `~/.tmux.conf` (v38.x).

## Next Phase Readiness

- Plan 183-02 (sidebar gear) can proceed
- Mini PC deploy: Phase 183 manager.ts changes take effect on next CC PTY session creation
- Settings toggle in AiChatSettingsPanel (182-03) writes the Redis key; Phase 183 reads it

---
*Phase: 183-polish-tmux-skipperms-gear*
*Completed: 2026-05-20*
