---
phase: 162-vault-and-sdk-integration
plan: 02
plan_number: 162-02
phase_number: 162
type: summary
wave: 1
subsystem: cc-integration
tags:
  - agent-session
  - vault-mode
  - settingSources
  - cwd-injection
  - redis-flag
  - phase-162
  - v34
requires:
  - phase: 162-01
    provides: "/home/bruce/livinity-vault scaffolded at boot (CLAUDE.md + .claude/{settings,mcp,skills,commands}/ + memory/ + sessions/)"
provides:
  - "AgentSessionManagerOptions.vaultModeConfig field (vaultPath + defaultModel)"
  - "consumeAndRelay() vault-mode derivation: vaultMode / sessionCwd / sessionModelOverride locals"
  - "SDK query() options: cwd + settingSources: ['project'] + systemPrompt: undefined gated by vaultMode"
  - "Phase 161 dated-Haiku literal preserved in sessionModelOverride (precedence-locked)"
  - "AiModule.chatBackend + AiModule.defaultChatModel init-once Redis-resolved fields"
  - "createAgentWebSocketHandler accepts vaultModeConfig opts (factory stays SYNCHRONOUS)"
  - "server/index.ts /ws/agent mount builds vaultModeConfig synchronously from AiModule fields"
  - "Admin <5s rollback: redis-cli SET liv:config:chat_backend legacy + livinityd restart"
affects:
  - "Plan 162-03 can smoke-check CC against vault path through the SDK query path"
  - "Phase 163+ can rely on CC project-context loading (CLAUDE.md, skills, commands) per session"
  - "v34 master plan D-V34-D (vault dir) and D-V34-E (Redis flag) both lit by this plan"
tech-stack:
  added: []
  patterns:
    - "Init-once Redis pre-resolution at module start() + read-many synchronous field access in mount callbacks (avoids per-connection async cascade)"
    - "Factory-stays-sync invariant guarded by source-text assertion (no `export async function` in wss.on handlers)"
    - "Model-override cascade via local derivation block: computer-use (Phase 161) → vault model (Phase 162) → tierToModel(tier) fallback"
    - "Source-text invariants test pattern via cross-file reads (sibling and parent-tree relative paths from liv/packages/core/src)"
key-files:
  created:
    - liv/packages/core/src/agent-session.vault-mode.test.ts
  modified:
    - liv/packages/core/src/agent-session.ts
    - liv/packages/core/src/agent-session.computer-use.test.ts
    - livos/packages/livinityd/source/modules/ai/index.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
    - livos/packages/livinityd/source/modules/server/index.ts
key-decisions:
  - "Init-once Redis resolution at AiModule.start() (NOT per-connection in ws-agent factory) — preserves the sync factory contract required by wss.on('connection', handler)"
  - "Phase 161 model-field refactored from inline ternary to sessionModelOverride local — Phase 161 dated-Haiku literal moved to derivation block; computer-use.test.ts regex updated to lock both halves"
  - "Computer-use override runs FIRST (vaultMode = !computerUse && ...) so vault mode CANNOT downgrade computer-use sessions away from dated Haiku"
  - "Vault-mode test 11/12/13 RED-then-GREEN: committed in test(162-02) as RED then GREEN in feat(162-02) Task 3 source"
  - "Default chat_backend is 'vault' (any value other than literal 'legacy' resolves to 'vault') — opt-out semantics for v34 rollout"
patterns-established:
  - "Init-once + read-many: long-lived modules pre-resolve config at start() to keep mount callbacks synchronous"
  - "Derivation-block model overrides: collect model choice logic into a single typed local block, then `model: override ?? default` at the SDK boundary"
requirements-completed: []

metrics:
  duration_minutes: ~25
  tasks_completed: 3
  commits: 3
  files_created: 1
  files_modified: 5
  tests_added: 13
  tests_passing: 13
  completed_at: 2026-05-19T16:42:00Z
---

# Phase 162 Plan 02: AgentSessionManager Vault-Mode + Redis-Flag Gate Summary

Vault-mode wiring lit — `AgentSessionManager.consumeAndRelay()` now threads `cwd`, `settingSources: ['project']`, and an optional model override into the SDK `query()` call when `vaultModeConfig` is supplied, gated by Redis `liv:config:chat_backend` resolved ONCE at AiModule boot and read synchronously by the /ws/agent mount.

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-19T16:17:00Z (approx — checkout from 162-01-SUMMARY at 16:26)
- **Completed:** 2026-05-19T16:42:00Z
- **Tasks:** 3
- **Files modified:** 5 (1 created + 4 modified)

## Accomplishments

- AgentSessionManager now supports vault-mode SDK loading: `cwd: vaultPath` + `settingSources: ['project']` + `systemPrompt: undefined` for chat sessions when the flag is set; Phase 161 chat-path-untouched contract preserved byte-identical at runtime when the flag is off.
- Phase 161 dated-Haiku literal `'claude-haiku-4-5-20251001'` preserved AND given strict precedence in the new `sessionModelOverride` derivation — computer-use sessions still force Haiku regardless of vault mode.
- AiModule reads `liv:config:chat_backend` + `liv:config:default_chat_model` ONCE at start() into `chatBackend` and `defaultChatModel` instance fields — init-once, read-many pattern. No per-connection Redis reads in the ws-agent factory.
- `createAgentWebSocketHandler` factory stays **synchronous** (critical contract — `wss.on('connection', handler)` cannot await a Promise<handler>). Source-text invariant locked by test 10.
- Admin can hot-rollback to Phase 161 byte-identical behavior in <5s via `redis-cli SET liv:config:chat_backend legacy` + `systemctl restart livos`.

## Task Commits

Each task committed atomically:

1. **Task 1: AgentSessionManagerOptions + class field + vault-mode derivation** — `c6a3f483` (feat)
   - Adds `vaultModeConfig` to interface, class, constructor.
   - Inserts `vaultMode` / `sessionCwd` / `sessionModelOverride` derivation block immediately after Phase 161 tier override.
   - Rewrites SDK query() options block to thread the new locals: `systemPrompt: vaultMode ? undefined : systemPrompt`, `cwd: sessionCwd`, `settingSources: vaultMode ? ['project'] : undefined`, `model: sessionModelOverride ?? tierToModel(tier)`.

2. **Task 2: vault-mode invariants test + Phase 161 model-field regex update** — `5d317559` (test)
   - Adds `agent-session.vault-mode.test.ts` with 13 source-text invariants spanning agent-session.ts + ws-agent.ts + ai/index.ts + server/index.ts.
   - Updates `testSourceDoesNotUseUndatedHaikuAtCallSite` in computer-use.test.ts to match the refactored `sessionModelOverride ?? tierToModel(tier)` form — two assertions now lock both halves of the Phase 161 contract.
   - Committed in RED state for tests 11–13 (which reference Task 3 source changes); GREEN'd by `abda1fe5`.

3. **Task 3: AiModule init-once + sync factory + server mount wiring** — `abda1fe5` (feat)
   - AiModule.start() pre-resolves Redis flags into `chatBackend` + `defaultChatModel` instance fields.
   - `createAgentWebSocketHandler` opts extended with optional `vaultModeConfig?: {vaultPath: string; defaultModel?: string}`; threaded through to AgentSessionManager constructor. Factory stays `export function` (NOT async).
   - server/index.ts /ws/agent mount builds `vaultModeConfig` synchronously from `ai.chatBackend === 'vault'` gate; logs mount-time decision; passes into factory.

## Files Created/Modified

### Created (1)

- `liv/packages/core/src/agent-session.vault-mode.test.ts` — 13 source-text invariants covering vault-mode interface/derivation/call-site + ws-agent factory shape + AiModule fields + server mount wiring.

### Modified (5)

- `liv/packages/core/src/agent-session.ts` — `vaultModeConfig` option + private field + constructor + derivation block + SDK query() options rewrite.
- `liv/packages/core/src/agent-session.computer-use.test.ts` — `testSourceDoesNotUseUndatedHaikuAtCallSite` regex updated for refactored model field.
- `livos/packages/livinityd/source/modules/ai/index.ts` — `chatBackend` + `defaultChatModel` fields + init-once Redis read in `start()`.
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` — factory opts extended with `vaultModeConfig?`, threaded into AgentSessionManager. Factory STAYS sync.
- `livos/packages/livinityd/source/modules/server/index.ts` — /ws/agent mount computes `vaultModeConfig` synchronously from AiModule fields and passes into factory.

## Verification Results

### Test Suites

```
1. agent-session.vault-mode.test.ts → OK: 13/13 vault-mode invariants passed
2. agent-session.computer-use.test.ts → All Phase 161-01 + 161-02 tests passed (21 + helper tests)
3. agent-session.test.ts → All tests passed (baseline)
4. liv/packages/core tsc build → clean, 0 errors
```

### Hard Guardrails (post-commit)

| Constraint                                                              | Status   | Evidence                                                            |
| ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Sacred SHA `sdk-agent-runner.ts`                                        | **PASS** | `git ls-tree HEAD` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`     |
| D-09 verbatim (`luse-system-prompt.ts`)                                 | **PASS** | `git diff HEAD~3 HEAD -- ...luse-system-prompt.ts` returns 0 lines  |
| D-NO-NEW-DEPS                                                           | **PASS** | `git diff HEAD~3 HEAD -- '**/package.json'` returns 0 lines         |
| Phase 161 dated literal preserved (>= 2 occurrences in agent-session)   | **PASS** | `grep -c claude-haiku-4-5-20251001 agent-session.ts` → 3            |
| Factory stays sync (0 `export async function createAgentWebSocketHandler`) | **PASS** | `grep -cE "export\s+async\s+function..."` → 0                       |
| No per-connection Redis reads in ws-agent factory                       | **PASS** | `grep -cF "redis.get('liv:config:chat_backend')" ws-agent.ts` → 0   |

### TypeScript Health

- `cd liv && npm run build --workspace=packages/core` → clean, 0 errors.
- `cd livos && pnpm --filter livinityd exec tsc --noEmit` → my 3 modified files (ai/index.ts, server/ws-agent.ts, server/index.ts lines 1373–1404) introduce zero new errors. Pre-existing errors in `webapps/*`, `widgets/*`, `user/*`, `file-store.ts`, `pipewire-portal.test.ts` are out-of-scope per the executor's Scope Boundary rule (same pattern documented in 162-01-SUMMARY's TypeScript Health section).

## Decisions Made

- **Init-once Redis resolution** (D-NEW for this plan): Flag reads happen in `AiModule.start()` and expose results as instance fields. The /ws/agent mount reads `this.livinityd.ai.chatBackend` synchronously and builds `vaultModeConfig` before calling the factory. This preserves the sync factory contract required by `wss.on('connection', handler)`. Alternative considered: making the factory `async` — REJECTED because `wss.on('connection', handler)` cannot await a Promise<handler>. The cascade would have spread async into 4+ caller sites.
- **Phase 161 model-field refactor**: Moved the inline `computerUse ? haiku-literal : tierToModel(tier)` ternary out of the query() options into a `sessionModelOverride` local. Phase 161's dated literal still appears in source AND wins precedence over vault mode via the conjunction `!computerUse` in `vaultMode`. The Phase 161 test regex was updated in Task 2 to match the new form while still asserting the same semantic invariant.
- **Default = 'vault' (opt-out semantics)**: `chatBackend = backendRaw === 'legacy' ? 'legacy' : 'vault'`. Matches v34 rollout intent — new behavior ON, rollback path is an explicit opt-out. Empty Redis (key missing) → 'vault'. Empty string → 'vault'. Only the exact string `'legacy'` triggers Phase 161 path.

## Deviations from Plan

None — plan executed exactly as written. The plan was unusually well-specified (verbatim target shapes for every edit + exact insertion points), so all 3 tasks landed without requiring any auto-fixes.

The only nuance worth noting: Task 2's tests 11/12/13 are RED at the Task 2 commit (because they reference Task 3 source changes that hadn't landed). This is the standard cross-task TDD pattern — the RED-state commit is `test(162-02)`, the GREEN-state commit is `feat(162-02)` Task 3. The plan's `<verify>` block for Task 2 implicitly assumes both Task 2 and Task 3 are landed when run; running it after only Task 2 yields 10/13 PASS, which is the expected RED gate. The full 13/13 PASS state is verified after Task 3 lands and is the closing invariant.

## Issues Encountered

None.

## TDD Gate Compliance

- `test(162-02): add vault-mode invariants + update Phase 161 model-field regex` — RED gate (`5d317559`).
- `feat(162-02): wire init-once Redis flag + sync factory + server mount for vault mode` — GREEN gate (`abda1fe5`) — closes the RED state for tests 11–13.

Note: Task 1's `feat(162-02): add vaultModeConfig option ...` (`c6a3f483`) landed BEFORE the test commit because the agent-session.ts surface is the foundation that both the test file and the wiring code depend on. The order `feat-task1 → test-task2 → feat-task3` matches the plan's task ordering and produces a clean RED→GREEN pair for tests 11–13 across the test/feat boundary.

## Self-Check: PASSED

- Files created exist:
  - `liv/packages/core/src/agent-session.vault-mode.test.ts` ✓
- Commits exist in `git log --oneline`:
  - `c6a3f483` ✓
  - `5d317559` ✓
  - `abda1fe5` ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved at HEAD ✓
- D-09 luse-system-prompt.ts unchanged ✓
- D-NO-NEW-DEPS: zero package.json diff ✓
- vault-mode.test.ts: 13/13 PASS ✓
- computer-use.test.ts: all Phase 161 invariants PASS ✓
- agent-session.test.ts: baseline tests PASS ✓
- liv core tsc: clean ✓
- Factory sync: 0 async, 1 sync export ✓
- Init-once contract: 0 Redis reads in factory ✓

## Next Phase Readiness

Plan 162-03 (smoke check) can now exercise the full vault path:

- Redis set `liv:config:chat_backend=vault` (or leave unset — default is vault).
- livinityd boot:
  1. `scaffoldVault()` from Plan 162-01 materializes the vault dir.
  2. `AiModule.start()` reads Redis flags into `chatBackend='vault'` + `defaultChatModel='claude-opus-4-7'`.
  3. `/ws/agent` mount builds `vaultModeConfig = {vaultPath: '/home/bruce/livinity-vault', defaultModel: 'claude-opus-4-7'}` and threads into AgentSessionManager.
- First chat session (no `native:`/`webapp:` prefix) → SDK `query()` runs with `cwd: '/home/bruce/livinity-vault'`, `settingSources: ['project']`, `systemPrompt: undefined`, `model: 'claude-opus-4-7'`. CC loads CLAUDE.md + .claude/skills/* + .claude/commands/* from the vault.

The full v34 LivOS↔CC integration master plan D-V34-A through D-V34-E is now lit through wave 1 of Phase 162.

---
*Phase: 162-vault-and-sdk-integration*
*Plan: 02*
*Completed: 2026-05-19*
