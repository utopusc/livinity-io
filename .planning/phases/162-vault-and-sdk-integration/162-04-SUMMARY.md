---
phase: 162-vault-and-sdk-integration
plan: 04
plan_number: 162-04
phase_number: 162
type: summary
wave: 2
subsystem: cc-integration
tags:
  - agent-session
  - multi-instance
  - session-key
  - phase-162
  - v34
requires:
  - phase: 162-02
    provides: "vaultModeConfig opt threaded through ws-agent factory + AiModule init-once fields"
provides:
  - "AgentSessionManager.sessions Map JSDoc declares composite sessionKey shape (Phase 162-04)"
  - "JSDoc on getSession() + cleanup() pointing to sessions-field shape spec"
  - "ws-agent buildSessionKey closure: composite ${userId}:${surfaceKind}:${surfaceId}:${connectionId} in vault mode, legacy ${userId}:${connectionId} fallback"
  - "ws-agent start-envelope recompute branch — raw.surface upgrades sessionKey when URL params absent"
  - "agent-session.multi-instance.test.ts — 6/6 invariants (2 source-text + 4 runtime)"
affects:
  - "Phase 164 autonomous scheduler can spawn sessions with surfaceKind='autonomous' without canceling user's Main Chat"
  - "Phase 163 surface-aware vault contexts can key per-surface state"
  - "Same-user parallel sessions across Main Chat + WebApp Chat + NativeApp Chat now safe"
tech-stack:
  added: []
  patterns:
    - "Composite sessionKey via closure-derived buildSessionKey reading opts.vaultModeConfig (no local alias — preserves source-text invariant)"
    - "Surface hint resolution order: URL params → start-envelope body (only fires when URL absent)"
    - "sessionKey as `let` (not `const`) so start-envelope recompute observable to handleMessage/cleanup"
    - "Test winston-silent + process.exit listener strip — suppress SDK abort-listener teardown noise (Windows ChildProcess.kill EINVAL artifact when no child spawned)"
key-files:
  created:
    - liv/packages/core/src/agent-session.multi-instance.test.ts
  modified:
    - liv/packages/core/src/agent-session.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
key-decisions:
  - "Map<string, ActiveSession> type signature UNCHANGED — Phase 162-04 only documents the richer string format; behavioral Map ops (get/set/delete) work the same"
  - "Public method parameter `userId: string` NOT renamed — would cascade across Phase 161 test files; JSDoc clarifies the param is actually a sessionKey"
  - "buildSessionKey reads opts.vaultModeConfig directly (no `const vaultModeConfig = opts.vaultModeConfig` alias) per plan's source-text invariant — keeps grep guard `opts.vaultModeConfig === undefined` literal"
  - "sessionKey upgraded from const → let so the start-envelope recompute branch can replace it before downstream cleanup/handleMessage call sites observe it"
  - "Test process-exit listener strip required on Windows — Anthropic SDK exit hook tries to kill a stale child handle even when no subprocess spawned; assertions land before this, so teardown noise gets explicitly suppressed"
patterns-established:
  - "Closure-derived buildSessionKey: composite-key construction stays a pure function over opts + WS handshake state, no class-level surface needed"
  - "No-alias source-text invariant: the test asserts `opts.vaultModeConfig === undefined` as a literal grep — refactors that introduce a local alias would break that lock"
  - "Process-listener strip pattern: tests that import SDK code on Windows should strip 'exit'/SIGINT/SIGTERM listeners before process.exit() to dodge ChildProcess.kill teardown noise"
requirements-completed: []

metrics:
  duration_minutes: ~15
  tasks_completed: 2
  commits: 3
  files_created: 1
  files_modified: 2
  tests_added: 6
  tests_passing: 6
  completed_at: 2026-05-19T17:10:00Z
---

# Phase 162 Plan 04: Multi-Instance sessionKey Refactor Summary

`AgentSessionManager.sessions` Map keys upgraded to a surface-aware composite shape (`${userId}:${surfaceKind}:${surfaceId}:${connectionId}`) when vault mode is active, with byte-identical Phase 161 fallback (`${userId}:${connectionId}`) when `opts.vaultModeConfig === undefined`. The Map type itself is unchanged — only the format of the string keys callers construct becomes richer. Two parallel sessions for the same userId on different surfaces (Main Chat + WebApp Chat + Autonomous) now coexist without canceling each other.

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-19T16:55:00Z
- **Completed:** 2026-05-19T17:10:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created + 2 modified)

## Accomplishments

- Documented the post-162-04 composite sessionKey shape on the `sessions` Map field with JSDoc that also explains the legacy `userId:connectionId` fallback. Method JSDoc on `getSession()` + `cleanup()` points to the shape spec.
- ws-agent.ts now builds sessionKey via a `buildSessionKey(surfaceKind?, surfaceId?)` closure that branches on `opts.vaultModeConfig === undefined`. Vault branch defaults to `'main'` / `'default'` for callers that don't yet emit a surface hint. Start-envelope `raw.surface` recompute fires only when URL params were absent.
- Per-tab isolation via `connectionId` is preserved in BOTH legacy and vault modes — Phase 161's "multiple tabs don't cancel each other's sessions" contract still holds. Vault mode adds the surface dimension on top.
- New test file `agent-session.multi-instance.test.ts` with 6 invariants — 2 source-text + 4 runtime — locks the composite shape, the type stability, the parallel-coexist contract, the per-key replace contract (Phase 161 preserved), legacy-mode byte-identical behavior, and cleanup atomicity.
- Phase 161 + 162-02 regression suites stay GREEN. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved. D-09 byte-identical. Zero package.json diff.

## Task Commits

Each task committed atomically:

1. **Task 1 RED: multi-instance test scaffold** — `0b6c211c` (test)
   - Creates `agent-session.multi-instance.test.ts` with 6 invariants (2 source-text + 4 runtime).
   - Silences winston BEFORE importing AgentSessionManager (suppresses detached `consumeAndRelay` rejection log noise).
   - RED state: JSDoc invariant `testJsdocReferencesComposite` fails because the Phase 162-04 JSDoc doesn't exist yet.

2. **Task 1 GREEN: JSDoc clarifications in agent-session.ts** — `43c76fd8` (feat)
   - Adds JSDoc block above `sessions` Map field declaring vault-mode composite shape + legacy fallback.
   - Adds JSDoc on `getSession()` + `cleanup()` pointing to the sessions-field spec.
   - Adds process-exit listener strip to the test runner — Windows-specific: Anthropic SDK exit hook calls `ChildProcess.kill` on stale handles after the test contract already passed, producing `EINVAL`. All 6 assertions pass before this teardown noise.

3. **Task 2: ws-agent.ts composite sessionKey** — `4828aa41` (feat)
   - Replaces the single-line `const sessionKey = \`${userId}:${connectionId}\`` with the buildSessionKey closure + URL-param surface hint + `let sessionKey = buildSessionKey(...)`.
   - Adds start-envelope recompute branch inside `ws.on('message')`: when `raw.type === 'start' && raw.surface && !surfaceKindFromUrl`, sessionKey gets rebuilt with the body hint.
   - Reads `opts.vaultModeConfig === undefined` directly inside buildSessionKey — no local alias — preserves the source-text invariant grep guard.

## Files Created/Modified

### Created (1)

- `liv/packages/core/src/agent-session.multi-instance.test.ts` — 6 invariants (2 source-text + 4 runtime). Tests use a minimal mock `toolRegistry` and assert sessions Map state only; SDK calls are detached internally and aborted via cleanup. Test exit is force-clean via `process.removeAllListeners('exit')` before `process.exit(0)`.

### Modified (2)

- `liv/packages/core/src/agent-session.ts` — JSDoc above `sessions` Map field declares Phase 162-04 composite shape + legacy fallback. JSDoc on `getSession()` + `cleanup()` references the shape spec. NO behavioral changes to Map operations.
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` — buildSessionKey closure, URL-param surface hints, start-envelope recompute. The AgentSessionManager construction + Phase 161-02 `computerUseSystemPromptBuilder` closure + `vaultModeConfig: opts.vaultModeConfig` pass-through are UNCHANGED.

## Verification Results

### Test Suites

```
1. agent-session.multi-instance.test.ts → OK: 6/6 multi-instance invariants passed (EXIT=0)
2. agent-session.computer-use.test.ts → All Phase 161-01 + 161-02 tests passed (EXIT=0)
3. agent-session.vault-mode.test.ts → OK: 13/13 vault-mode invariants passed (EXIT=0)
4. agent-session.test.ts → All tests passed (baseline, EXIT=0)
5. liv/packages/core tsc build → clean, 0 errors
6. livinityd tsc --noEmit on ws-agent.ts → 0 new errors (pre-existing errors in webapps/widgets/user/file-store/pipewire-portal out-of-scope per executor scope boundary, same as 162-02-SUMMARY)
```

### Hard Guardrails (post-commit)

| Constraint                                                              | Status   | Evidence                                                                       |
| ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Sacred SHA `sdk-agent-runner.ts`                                        | **PASS** | `git ls-tree HEAD` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`                |
| D-09 verbatim (`luse-system-prompt.ts`)                                 | **PASS** | `git diff HEAD~3 HEAD -- ...luse-system-prompt.ts` returns 0 lines             |
| D-NO-NEW-DEPS                                                           | **PASS** | `git diff HEAD~3 HEAD -- '**/package.json'` returns 0 lines                    |
| Phase 161 chat-path-untouched                                           | **PASS** | computer-use.test.ts → all Phase 161 invariants pass, exit 0                   |
| Phase 162-02 vault-mode contract                                        | **PASS** | vault-mode.test.ts → 13/13 invariants pass, exit 0                             |
| `surfaceKind` in agent-session.ts                                       | **PASS** | grep -c → 1                                                                    |
| `Phase 162-04 — sessionKey shape:` in agent-session.ts                  | **PASS** | grep -c → 1                                                                    |
| `Map<string, ActiveSession>` type unchanged                             | **PASS** | grep -cE → 1                                                                   |
| `buildSessionKey` in ws-agent.ts                                        | **PASS** | grep -c → 3 (declaration + 2 call sites, meets ≥3)                            |
| `opts.vaultModeConfig === undefined` in ws-agent.ts                     | **PASS** | grep -cF → 1 (literal match for source-text invariant)                         |
| Legacy `${userId}:${connectionId}` shape literal preserved              | **PASS** | grep -cF → 1                                                                   |
| Composite `${userId}:${sk}:${sid}:${connectionId}` shape literal        | **PASS** | grep -cE → 1                                                                   |
| `(raw as any).surface` start-envelope branch                            | **PASS** | grep -cF → 2 (condition + recompute call)                                      |
| No `const vaultModeConfig =` alias in ws-agent.ts                       | **PASS** | grep -cF → 0 (invariant enforced)                                              |
| Phase 161 DI hook unchanged                                             | **PASS** | grep -c "buildLuseSystemPromptWithOverlayResolved" → 2 (import + usage)        |
| `_winstonLogger.silent = true` in multi-instance.test.ts                | **PASS** | grep -c → 1                                                                    |

### TypeScript Health

- `cd liv && npm run build --workspace=packages/core` → clean, 0 errors.
- `cd livos && pnpm --filter livinityd exec tsc --noEmit` → 0 new errors introduced by ws-agent.ts edits. Pre-existing errors in `webapps/*`, `widgets/*`, `user/*`, `file-store.ts`, `pipewire-portal.test.ts` are out-of-scope per the executor's Scope Boundary rule (same pattern documented in 162-01-SUMMARY + 162-02-SUMMARY).

## Decisions Made

- **No-alias for opts.vaultModeConfig**: buildSessionKey reads `opts.vaultModeConfig === undefined` directly inside its body. The plan-mandated source-text invariant `grep -F "opts.vaultModeConfig === undefined"` must match once — introducing a local alias `const vaultModeConfig = opts.vaultModeConfig` would break that lock. The closure pattern is clean enough that the alias adds no readability win.
- **sessionKey upgraded const → let**: The start-envelope recompute path needs to mutate sessionKey before downstream `handleMessage(sessionKey, ...)` / `cleanup(sessionKey)` observe it. `let` is the minimal change. The recompute only fires when URL params were absent AND the envelope carries a surface hint — strict ordering keeps URL-first resolution as the canonical path.
- **JSDoc-only changes to agent-session.ts**: The plan correctly identified that the Map operations themselves (get/set/delete on `Map<string, ActiveSession>`) work exact-string-match and need ZERO behavioral changes. The composite shape is purely a caller-side concern. JSDoc + the new test file is enough to lock the contract; renaming the `userId: string` parameter would cascade into all Phase 161 test files for no semantic gain.
- **Test process-exit listener strip**: The Anthropic SDK registers `process.on('exit')` handlers that call `ChildProcess.kill()` on every tracked child — even if those children never actually spawned (test env). On Windows this surfaces as `Error: kill EINVAL` AFTER the test contract has already passed. `process.removeAllListeners('exit')` before `process.exit(0)` is the cleanest suppression that keeps the test runner deterministic. Alternative considered: registering an `uncaughtException` handler that swallows EINVAL — REJECTED because the error fires inside `process.emit('exit')`, which propagates back through the catch path of `main()` and shows as `FAIL:` despite the actual contract being satisfied.

## Deviations from Plan

**Auto-fixed during Task 1 (Rule 3 — blocking issue):**

- **Process exit listener strip in test runner**: The plan's test skeleton ended with a plain `main().catch(err => process.exit(1))`. On Windows, the Anthropic SDK's `process.on('exit')` hook fires `ChildProcess.kill` on stale handles AFTER all 6 test assertions pass, producing `Error: kill EINVAL` that crashes the runner with EXIT=1. Auto-fixed by adding `process.removeAllListeners('exit'|'SIGINT'|'SIGTERM')` before `process.exit(0)` in the `.then()` branch. This is a pure teardown concern — the actual test contract still asserts only Map state, not SDK output. Documented inline in the test file with a `Phase 162-04` comment block.

No other deviations — the plan's interface specifications, default values, recompute condition, and acceptance criteria were specified precisely enough that both tasks landed without further auto-fixes.

## Issues Encountered

- Windows-specific SDK teardown noise (documented under Deviations). Resolved by listener strip + force-exit pattern.

## TDD Gate Compliance

- `test(162-04): add multi-instance session key invariants (RED)` — RED gate (`0b6c211c`).
- `feat(162-04): document composite sessionKey shape in agent-session JSDoc` — GREEN gate (`43c76fd8`) — closes the RED state for the JSDoc invariant.
- `feat(162-04): refactor ws-agent sessionKey to composite shape (vault mode)` — supporting commit for Task 2 (`4828aa41`).

The RED→GREEN→supporting-feat sequence matches the plan's task ordering. Task 2 had no test gates (the multi-instance test scaffold from Task 1 covers the Map-state contract; Task 2's contract is source-text-only and was effectively gated by the existing Phase 161/162-02 invariants that test ws-agent.ts shape).

## Self-Check: PASSED

- Files created exist:
  - `liv/packages/core/src/agent-session.multi-instance.test.ts` ✓
- Commits exist in `git log --oneline`:
  - `0b6c211c` ✓
  - `43c76fd8` ✓
  - `4828aa41` ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved at HEAD ✓
- D-09 luse-system-prompt.ts unchanged ✓
- D-NO-NEW-DEPS: zero package.json diff ✓
- multi-instance.test.ts: 6/6 PASS, exit 0 ✓
- computer-use.test.ts: all Phase 161 invariants PASS, exit 0 ✓
- vault-mode.test.ts: 13/13 PASS, exit 0 ✓
- agent-session.test.ts: baseline PASS, exit 0 ✓
- liv core tsc: clean ✓
- ws-agent.ts tsc: 0 new errors ✓
- No-alias invariant: grep `const vaultModeConfig =` → 0 ✓
- Phase 161 DI hook count: 2 (import + usage) ✓

## Next Phase Readiness

With Plan 162-04 complete, the AgentSessionManager `sessions` map can now hold concurrent sessions for the same userId across different surfaces:

- Phase 164 autonomous scheduler can spawn a session with sessionKey `admin:autonomous:nightly-backup:scheduler-uuid` without colliding with the user's active Main Chat session keyed `admin:main:default:browser-conn`.
- Phase 163 surface-aware vault contexts (per-surface `cwd` + `settingSources` projection) can read the surfaceKind segment from the sessionKey to thread the right vault subtree per surface.
- Per-tab isolation via connectionId remains a Phase 161 guarantee — vault mode adds surfaceKind/surfaceId on top, never removes connectionId.

Wave 2 of Phase 162 closes here. Plan 162-05 (Mini PC deploy + live runtime probe) is the next gate.

---
*Phase: 162-vault-and-sdk-integration*
*Plan: 04*
*Completed: 2026-05-19*
