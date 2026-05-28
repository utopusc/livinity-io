---
phase: 246
plan: 01
subsystem: livos/packages/livinityd/pty-sessions
tags: [terminal, multi-session, backend, tdd]
provides:
  - SessionManager class (Map<sessionId, Session> ownership boundary)
  - Session, SessionSummary, SessionManagerDeps types
requires:
  - PtySession (Phase 243-01 — composed via factory, NOT modified)
  - uuidv7 (already in deps from 243-01)
affects:
  - livos/packages/livinityd/source/modules/pty-sessions/types.ts (extended)
  - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel extended)
tech-stack:
  added: []
  patterns:
    - composition over inheritance (SessionManager wraps PtySession)
    - DI seam via ptySessionFactory + nowFn (testability)
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/session-manager.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/session-manager.test.ts
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/types.ts
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts
decisions:
  - Composition (not extends) — Session record holds pty: PtySession; rename/touch mutate manager-owned fields without touching PtySession class
  - Counter via map.size+1 (NOT private monotonic) — keeps state internal-only; if create throws, no counter drift
  - list() strips `pty` via destructure — serialization-safe by construction
  - create() does NOT catch non-bruce throw (D-V44-NO-ROOT-PTY defense-in-depth)
metrics:
  duration: 4m
  tasks_completed: 3
  commits: 4
  tests_added: 12
  tests_total_module: 45
  files_created: 2
  files_modified: 2
  completed: 2026-05-28
---

# Phase 246 Plan 01: Backend SessionManager Summary

**One-liner:** Refactored v43 single-PtySession lifecycle into a `Map<sessionId, Session>` manager with create/get/list/kill/rename/touch + iterator surface for 246-02/03/05 consumers, composing the untouched 243-01 PtySession class via DI factory.

## Tasks Executed

| Task | Name                                                                         | Commit     |
| ---- | ---------------------------------------------------------------------------- | ---------- |
| 1    | Extend types.ts with Session + SessionSummary + SessionManagerDeps           | `9080228e` |
| 2a   | RED — SessionManager tests (12 cases failing, module-not-found)              | `48cea6b1` |
| 2b   | GREEN — SessionManager implementation (12/12 tests pass)                     | `945c4fc6` |
| 3    | Barrel re-exports SessionManager + Session types                             | `a17c8616` |

## Files Created (2)

- `livos/packages/livinityd/source/modules/pty-sessions/session-manager.ts` — 88 lines
- `livos/packages/livinityd/source/modules/pty-sessions/__tests__/session-manager.test.ts` — 212 lines (12 vitest cases)

## Files Modified (2)

- `livos/packages/livinityd/source/modules/pty-sessions/types.ts` — +28 lines (3 new exports + PtySession import)
- `livos/packages/livinityd/source/modules/pty-sessions/index.ts` — +4 lines (SessionManager + 3 type re-exports)

## Drift-Locks

- **Name format:** `terminal-${this.sessions.size + 1}` when `nameHint` is absent (Case 1 + Case 3 drift-lock)
- **list() strips pty field:** destructure `({pty: _pty, ...rest})` — Case 8 drift-lock asserts `not.toHaveProperty('pty')`
- **kill() returns boolean:** `false` for unknown id, `true` after pty.kill() + map.delete (Cases 9+10 drift-lock)
- **Non-bruce throw propagates verbatim:** create() does NOT wrap pty.start() in try/catch — Case 5 drift-lock asserts the throw bubbles AND mgr.size() remains 0
- **D-V44-SACRED:** `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged across all 4 commits
- **D-V43 baseline preserved:** PtySession class at `session.ts` UNTOUCHED (`git diff HEAD~3..HEAD -- session.ts` empty)

## Test Counts

| Module file                  | Cases  | Status |
| ---------------------------- | ------ | ------ |
| feature-flag.test.ts         | 4      | GREEN  |
| metadata.test.ts             | 6      | GREEN  |
| session.test.ts              | 10     | GREEN  |
| ws-handler.test.ts           | 13     | GREEN  |
| session-manager.test.ts (new)| **12** | GREEN  |
| **Total**                    | **45** | GREEN  |

(Plan text said "16 (243-01) + 4 (flag) + 13 (ws) = 33 baseline" but actual baseline counted on this checkout is 33 (= 10 + 6 + 4 + 13). Either way: 33 + 12 = 45, matching the plan's 45 target.)

## Sacred SHA Verify

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Preserved across all 4 commits — sacred-sha pre-commit hook fired clean on each (`[sacred-sha] PASS: 20 files verified`).

## Deviations from Plan

None — plan executed exactly as written.

Minor observation: two of the plan's `grep -c` acceptance criteria use patterns that don't quite match TypeScript class-field syntax (e.g. `this.sessions = new Map` vs. actual `private readonly sessions = new Map`, and `grep "SessionManager" = 1` while the plan itself instructs exporting `SessionManagerDeps` on the same line giving 2 hits). The structural intent — one Map field, one SessionManager class export — is satisfied. Not tracked as a deviation; flagging here for future-plan refinement.

## Success Criteria

- [x] **SC-01:** `pnpm vitest run source/modules/pty-sessions/__tests__/` → 45/45 green (verified twice)
- [x] **SC-02:** `pnpm tsc --noEmit` zero new errors in pty-sessions module (pre-existing errors in user/, webapps/, etc. are out of scope per Rule 4)
- [x] **SC-03:** `index.ts` adds 2 new export statements (`SessionManager` value + `Session/SessionSummary/SessionManagerDeps` type re-export) vs Phase 243 baseline
- [x] **SC-04:** `session.ts` UNTOUCHED — `git diff HEAD~3..HEAD -- session.ts` empty
- [x] **SC-05:** D-V44-SACRED — sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 4 commits

## Threat Surface

The plan's `<threat_model>` covers SessionManager surface. No new threat surface introduced beyond what the threat register already addresses (T-246-01-01 through 04). No `threat_flag:` entries needed.

## TDD Gate Compliance

- ✅ RED gate: `test(246-01): RED — SessionManager tests (12 cases failing, module-not-found)` — commit `48cea6b1`
- ✅ GREEN gate: `feat(246-01): GREEN — SessionManager (12/12 tests pass)` — commit `945c4fc6`
- REFACTOR gate skipped — no duplication observed in 88-line module

RED gate confirmed by running vitest before writing the implementation file (output: `Failed to load url ../session-manager.js`). No "test passing unexpectedly" risk encountered.

## Self-Check: PASSED

- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/session-manager.ts`
- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/__tests__/session-manager.test.ts`
- [x] types.ts contains: `Session`, `SessionSummary`, `SessionManagerDeps` exports (grep verified)
- [x] types.ts contains: `import {PtySession} from './session.js'` (exactly 1 occurrence)
- [x] types.ts pre-existing exports preserved: `PtySessionMetadata`, `PtySpawnOptions`, `SessionEventMap`, `PtyMetadataRedisClient` (1 each)
- [x] session-manager.ts contains: 1 Map field, 1 `pty.start()`, 1 `this.sessions.delete`
- [x] index.ts contains: `SessionManager` export + `Session/SessionSummary/SessionManagerDeps` type re-export
- [x] FOUND commit `9080228e` (Task 1 types extend)
- [x] FOUND commit `48cea6b1` (Task 2 RED)
- [x] FOUND commit `945c4fc6` (Task 2 GREEN)
- [x] FOUND commit `a17c8616` (Task 3 barrel)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- [x] `pnpm vitest run source/modules/pty-sessions/__tests__/` → 45/45 GREEN
- [x] `pnpm tsc --noEmit` → zero new errors in `pty-sessions/`
