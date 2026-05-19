---
phase: 163-surface-vault-contexts
plan: 02
plan_number: 163-02
phase_number: 163
type: summary
wave: 1
subsystem: cc-integration
tags:
  - ws-agent
  - surface-cwd
  - per-session-manager
  - vault-mode
  - phase-163
  - v34
requires:
  - phase: 162-02
    provides: "vaultModeConfig opt threaded through ws-agent factory + AiModule init-once fields"
  - phase: 162-04
    provides: "buildSessionKey closure + raw.surface recompute branch + composite sessionKey"
  - phase: 163-01
    provides: "writeSurfaceContext / removeSurfaceContext modules + apps.ts + native-installer.ts wiring (materializes vault/surfaces/<kind>/<id>/CLAUDE.md on install)"
provides:
  - "resolveSessionVaultPath(conversationId, baseVaultPath) — pure resolver (webapp:/native: -> subsurface, anything else -> base)"
  - "resolveSessionVaultPathWithFallback(conversationId, baseVaultPath) — async wrapper with fs.stat fallback to base when subsurface dir absent"
  - "buildSessionManager(resolvedVaultPath) factory closure inside createAgentWebSocketHandler — emits AgentSessionManager scoped to a vaultPath; preserves Phase 161-02 DI hook contract unchanged"
  - "defaultSessionManager (factory-level, vault root) + perSessionManagers Map<sessionKey, AgentSessionManager> per-connection cache"
  - "managerFor(sessionKey) accessor — replaces direct sessionManager.* delegation across injectSteer / handleMessage / cleanup"
  - "Surface-prefixed conversationIds now route to vault/surfaces/<kind>/<id>/ CWD for SDK query(); Main Chat (no prefix) byte-identical to Phase 162-02"
  - "ws-agent.surface-cwd.test.ts — 18-test suite (8 source-text + 7 resolver runtime + 3 fallback runtime)"
affects:
  - "Phase 163-03 LivOS overlay → vault file can rely on per-session cwd already being the subsurface dir"
  - "Phase 163-04 Mini PC deploy + synthetic probes — WS start with webapp:/native: convId now lands in subsurface vault"
  - "Surface-aware CLAUDE.md loading (Phase 163-01 materialized files) now consumed by CC SDK via settingSources: ['project'] from the resolved cwd"
tech-stack:
  added: []
  patterns:
    - "Per-resolved-vaultPath sessionManager via closure factory — keeps construction inside createAgentWebSocketHandler so opts + lazyToolRegistry + learningEngine close over cleanly with zero hoisting"
    - "Default + per-key Map cache pattern: factory-level defaultSessionManager handles Main Chat; lazily-built per-key managers handle surface-prefixed conversationIds; cleanup deletes the Map entry to bound memory"
    - "fs.stat fallback gate at session start: subsurface dir absence transparently downgrades to vault root cwd so chat never crashes on a not-yet-scaffolded surface"
    - "Pure resolver + async wrapper split: resolveSessionVaultPath is pure (testable in isolation), resolveSessionVaultPathWithFallback adds the I/O concern; mirrors 163-01 writeSurfaceContext discriminated-union pattern"
    - "Cross-plan test invariant widening (Rule 3 auto-fix): 162-02's test11 broadened to accept both single-line and per-session-closure forms of the same threading invariant"
key-files:
  created:
    - livos/packages/livinityd/source/modules/server/ws-agent.surface-cwd.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
    - liv/packages/core/src/agent-session.vault-mode.test.ts
key-decisions:
  - "Per-session-managers Map keyed by sessionKey (NOT by resolvedVaultPath) — same sessionKey is used by handleMessage AND cleanup, so keying the map on it gives the natural lifecycle binding. resolvedVaultPath is closed over inside the manager via buildSessionManager."
  - "fs.stat fallback fires BEFORE buildSessionManager — if subsurface dir absent, no per-session manager is constructed at all; the connection falls through to defaultSessionManager (vault root). This keeps the cache cold for Main-Chat-only connections."
  - "Per-session manager built lazily on the FIRST start envelope that resolves to a subsurface (not at connection-open). Connections that only ever do Main Chat never allocate a second AgentSessionManager."
  - "Test pattern uses `path.join(tmpdir())` for the base tmp dir BUT manually concatenates `${tmp}/surfaces/webapp/suna` (forward-slash) for the assertion — matches the resolver's exact output on all platforms (path.join would use backslashes on Windows and fail equality)"
  - "Rule 3 auto-fix for 162-02 test11: widened regex to accept either `opts.vaultModeConfig` (old) or `vaultModeConfigForSession` (new) — semantic invariant (factory threads opts.vaultModeConfig into AgentSessionManager constructor) unchanged; only the syntactic shape evolved with the buildSessionManager closure refactor"
patterns-established:
  - "Lazy-on-first-start per-session manager cache: cache is empty at connect, populated on the first surface-prefixed start envelope, evicted on close"
  - "Test invariant widening for cross-plan refactors: when downstream plans architecturally evolve an upstream invariant's syntax while preserving its semantics, broaden the upstream regex with an `OR` clause + an `assert.ok(either-form-holds)` rather than overwriting the test"
requirements-completed: []

metrics:
  duration_minutes: ~7
  tasks_completed: 2
  commits: 2
  files_created: 1
  files_modified: 2
  tests_added: 18
  tests_passing: 18
  completed_at: 2026-05-19T18:03:13Z
---

# Phase 163 Plan 02: isComputerUseSession → CWD Resolution Summary

One-liner: ws-agent.ts now resolves surface-prefixed `conversationId`s (`webapp:<id>:...` / `native:<id>:...`) into per-session vault subsurface CWDs via a lazy `perSessionManagers` Map keyed on sessionKey, with fs.stat fallback to vault root so chat never crashes on a not-yet-scaffolded surface; Phase 161 chat-path-untouched + Phase 161/162/162-04 invariants all preserved byte-identical; `liv/packages/core/src/agent-session.ts` untouched (163-02.5 territory).

## What Shipped

Before this plan, ws-agent constructed a single `AgentSessionManager` at factory time pointing at the vault root (`/home/bruce/livinity-vault`) — regardless of whether a session was Main Chat or a WebApp/NativeApp Chat. Every conversation loaded the same vault-root `CLAUDE.md`. Plan 163-01 materialized per-app `CLAUDE.md` files at `vault/surfaces/<kind>/<appId>/`, but nothing consumed them yet.

This plan lights the consumption:

- `resolveSessionVaultPath(convId, base)` (pure) inspects a conversationId. Surface-prefixed forms (`webapp:<id>:rest...` / `native:<id>:rest...`) map to `${base}/surfaces/<kind>/<id>`. Everything else falls through to `base`. No I/O.
- `resolveSessionVaultPathWithFallback(convId, base)` (async) wraps the resolver with a single `fs.stat`. If the subsurface dir doesn't exist on disk (e.g., a user opens WebApp chat *before* `installForUser`'s 163-01 hook materializes the surface), it falls back to `base` — chat still works, just with vault-root context instead of subsurface context.
- The singleton `sessionManager` is refactored into a `buildSessionManager(resolvedVaultPath)` closure factory. A `defaultSessionManager` (vault root) is constructed at factory time for Main Chat; per-connection, a `perSessionManagers: Map<sessionKey, AgentSessionManager>` cache holds per-surface managers built lazily on the first `start` envelope whose `conversationId` resolves to a subsurface vaultPath.
- `managerFor(sessionKey)` accessor replaces every direct `sessionManager.*` delegation site: `injectSteer`, `handleMessage`, `cleanup`. On WS close, the Map entry is `delete()`d alongside `cleanup()`.
- Phase 161 contract preserved: `isComputerUseSession(convId)` (unchanged in liv-core) still returns `true` for `native:` / `webapp:` prefixes — the tier override at agent-session.ts still fires; the dated Haiku literal `claude-haiku-4-5-20251001` still wins. Only the CWD differs per session.
- Phase 162-04 contract preserved: `buildSessionKey` closure + URL-param surface hints + `(raw as any).surface` recompute branch all untouched. The new `perSessionManagers` Map keys on the same `sessionKey` the rest of the file uses.

### Commits

| Hash       | Task | Subject                                                                       |
| ---------- | ---- | ----------------------------------------------------------------------------- |
| `2d7698d8` | 1    | feat(163-02): per-session surface vault path resolution in ws-agent           |
| `43eaf075` | 2    | test(163-02): surface CWD resolution invariants (18 tests)                    |

### Files Created (1)

- `livos/packages/livinityd/source/modules/server/ws-agent.surface-cwd.test.ts` (≈137 lines) — vitest suite with 18 tests total:
  - 8 source-text invariants
  - 7 pure-resolver runtime tests
  - 3 fallback-wrapper runtime tests

### Files Modified (2)

- `livos/packages/livinityd/source/modules/server/ws-agent.ts` — `+133 / -26` lines: added `stat` import, two exported helpers, `buildSessionManager` closure, `defaultSessionManager`, per-connection `perSessionManagers` Map + `managerFor` accessor, start-envelope per-session vault resolution branch, and routed all three delegation sites through `managerFor(sessionKey)`. Phase 161-02 DI hook, Phase 162-04 buildSessionKey closure, and 162-04 raw.surface recompute branch all untouched.
- `liv/packages/core/src/agent-session.vault-mode.test.ts` — `+22 / -2` lines: widened `test11_wsAgentOptsShapeAndPassthrough` to accept either `vaultModeConfig: opts.vaultModeConfig` (Phase 162-02 form) OR `vaultModeConfig: vaultModeConfigForSession` derived inside `buildSessionManager` (Phase 163-02 form). See Deviations.

## Test Results

```
$ cd livos && pnpm --filter livinityd exec vitest run source/modules/server/ws-agent.surface-cwd.test.ts
 ✓ source/modules/server/ws-agent.surface-cwd.test.ts (18 tests) 12ms
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

18/18 PASS for the new suite. Per-block breakdown:

**Source-text invariants (8):**
1. `export function resolveSessionVaultPath` exists
2. `resolveSessionVaultPathWithFallback` exported + used (≥2 occurrences)
3. `surfaces/${kind}/${id}` template literal appears exactly once
4. `claude-haiku-4-5-20251001` count = 0 (Phase 161 dated literal not introduced in ws-agent)
5. `opts.vaultModeConfig.defaultModel` or `?.defaultModel` threading preserved
6. `(raw as any).surface` Phase 162-04 recompute branch preserved
7. `buildSessionKey` ≥3 occurrences
8. No bare `sessionManager.handleMessage` / `defaultSessionManager.handleMessage|cleanup|injectSteer` — all delegations routed through `managerFor(sessionKey)`

**Pure resolver runtime (7):**
9. `webapp:suna:abc123` → `/v/surfaces/webapp/suna`
10. `native:blender:def456` → `/v/surfaces/native/blender`
11. `conv_xxxxx` → `/v` (Main Chat)
12. `undefined` → `/v`
13. `''` → `/v`
14. `webapp:` (empty id) → `/v`
15. `unknown:xyz:abc` → `/v`

**Fallback wrapper runtime (3):**
16. Subsurface dir absent → falls back to `tmp` base
17. Subsurface dir present (mkdir'd) → returns subsurface path
18. Main Chat (no prefix) → returns base without stat call

### Regression Tests

| Suite                                              | Status     | Evidence                                            |
| -------------------------------------------------- | ---------- | --------------------------------------------------- |
| 161 computer-use (`agent-session.computer-use`)    | ALL PASS   | 5 helper + 7 source-text + 1 chat-path + 10 161-02  |
| 162-02 vault-mode (`agent-session.vault-mode`)     | 13/13 PASS | including widened test11 (see Deviations)           |
| 162-04 multi-instance (`agent-session.multi-instance`) | 6/6 PASS   | 2 source-text + 4 runtime                           |
| baseline (`agent-session.test.ts`)                 | ALL PASS   | 3 createInputChannel + 5 AgentSessionManager        |

All upstream Phase 161/162-02/162-04 contracts green after 163-02 refactor.

## Sacred Constraint Verification

| Constraint                                                                | Status | Evidence                                                                                                  |
| ------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Sacred SHA (`liv/packages/core/src/sdk-agent-runner.ts`)                  | PASS   | `git ls-tree HEAD` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`                                           |
| D-09 verbatim (`luse-system-prompt.ts`)                                   | PASS   | `git diff HEAD~2 -- .../luse-system-prompt.ts \| wc -l` → 0                                               |
| Phase 161-02 helper (`agent-prompt-builder.ts`)                           | PASS   | `git diff HEAD~2 -- .../agent-prompt-builder.ts \| wc -l` → 0                                             |
| `liv/packages/core/src/agent-session.ts` UNCHANGED (163-02.5 territory)   | PASS   | `git diff HEAD~2 -- agent-session.ts \| wc -l` → 0                                                        |
| D-NO-NEW-DEPS                                                             | PASS   | `git diff HEAD~2 -- '**/package.json' \| wc -l` → 0                                                       |
| `opts.vaultModeConfig === undefined` literal (Phase 162-04 grep guard)    | PASS   | `grep -cF "opts.vaultModeConfig === undefined" ws-agent.ts` → 1                                           |
| Phase 161 dated literal NOT in ws-agent.ts                                | PASS   | `grep -cF "claude-haiku-4-5-20251001" ws-agent.ts` → 0                                                    |
| Phase 161-02 DI hook preserved (import + usage)                           | PASS   | `grep -cF "buildLuseSystemPromptWithOverlayResolved" ws-agent.ts` → 2                                     |
| Phase 162-04 buildSessionKey ≥3                                           | PASS   | `grep -cF "buildSessionKey" ws-agent.ts` → 3                                                              |

## Source-Text Invariants (Acceptance Lock)

| Invariant                                                       | Required | Actual | Status |
| --------------------------------------------------------------- | -------- | ------ | ------ |
| `export function resolveSessionVaultPath`                       | 1        | 1      | PASS   |
| `resolveSessionVaultPathWithFallback`                           | ≥2       | 2      | PASS   |
| `surfaces/${kind}` (template literal in resolver)               | 1        | 1      | PASS   |
| `buildSessionManager`                                           | ≥2       | 4      | PASS   |
| `perSessionManagers`                                            | ≥3       | 6      | PASS   |
| `managerFor(sessionKey)`                                        | ≥3       | 4      | PASS   |
| `buildSessionKey` (Phase 162-04 preservation)                   | ≥3       | 3      | PASS   |
| `opts.vaultModeConfig === undefined` (literal grep)             | 1        | 1      | PASS   |
| `buildLuseSystemPromptWithOverlayResolved` (Phase 161-02 hook)  | ≥2       | 2      | PASS   |
| `claude-haiku-4-5-20251001` in ws-agent.ts                      | 0        | 0      | PASS   |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Phase 161 dated Haiku literal accidentally introduced in JSDoc**

- **Found during:** Task 1, after writing `resolveSessionVaultPath` JSDoc
- **Issue:** The first draft of the resolver JSDoc referenced `'claude-haiku-4-5-20251001'` as a literal string in a doc comment explaining the Phase 161 tier-override invariant. This violates Task 1 acceptance criterion `grep -cF "claude-haiku-4-5-20251001" ws-agent.ts → 0` (the dated literal must live in agent-session.ts, NOT here). It is the same class of bug Plan 163-01 hit with `rm -rf` literals in doc comments.
- **Fix:** Rephrased the JSDoc to say "the dated Haiku literal (lives in agent-session.ts, NOT here) still wins" — semantically identical, syntactically dodges the grep guard.
- **Files modified:** `livos/packages/livinityd/source/modules/server/ws-agent.ts` (1 JSDoc line)
- **Committed in:** `2d7698d8` (Task 1, same commit — adjustment was made before the initial commit)

**2. [Rule 3 - Blocking issue] Phase 162-02 vault-mode test11 broke on 163-02 refactor**

- **Found during:** Running upstream regression suite after Task 1
- **Issue:** Phase 162-02's `agent-session.vault-mode.test.ts` test11 asserts `assert.match(WS_AGENT_SRC, /vaultModeConfig:\s*opts\.vaultModeConfig/)`. The Phase 162-02 form was a single-line construction `new AgentSessionManager({..., vaultModeConfig: opts.vaultModeConfig})`. Phase 163-02 refactors this into a `buildSessionManager(resolvedVaultPath)` closure that derives `const vaultModeConfigForSession = opts.vaultModeConfig ? {...} : undefined` and then passes `vaultModeConfig: vaultModeConfigForSession`. The semantic invariant — factory threads `opts.vaultModeConfig` into the AgentSessionManager constructor — still holds (via a two-line derivation), but the literal single-line form no longer matches. Without the fix, 162-02 regression goes 12/13.
- **Fix:** Widened test11's regex to accept either form: `/vaultModeConfig:\s*(opts\.vaultModeConfig|vaultModeConfigForSession)/`, and added a follow-up `assert.ok(hasLegacyDirect || hasPerSessionDerivation)` that requires *either* the Phase 162-02 direct form *or* a Phase 163-02 `const vaultModeConfigForSession = opts.vaultModeConfig` derivation. Semantic guarantee preserved; syntactic shape now accepts both.
- **Files modified:** `liv/packages/core/src/agent-session.vault-mode.test.ts` (test11 body widened)
- **Committed in:** `43eaf075` (Task 2, same commit as the new test file — they are inseparable since the test edit lit the new file's GREEN state through the upstream suite)

No other deviations.

### Plan Inconsistency Adjustments

**3. [Test pattern: tmpdir path separator]**

- **Found during:** Task 2, while writing fallback-runtime test 17 ("returns subsurface when dir exists")
- **Issue:** The plan literal said `const surfaceDir = path.join(tmp, 'surfaces', 'webapp', 'suna')`. On Windows, `path.join` produces backslashes, but `resolveSessionVaultPath` produces forward-slash output (`${base}/surfaces/${kind}/${id}` template literal). `fs.stat` accepts both on Windows, but the assertion `expect(r).toBe(surfaceDir)` would compare `tmp + '/surfaces/webapp/suna'` (returned) against `tmp + '\\surfaces\\webapp\\suna'` (expected) → mismatch.
- **Fix:** Switched the test's `surfaceDir` construction to manual template-literal form `\`${tmp}/surfaces/webapp/suna\`` so the equality holds platform-agnostically.
- **Files modified:** `livos/packages/livinityd/source/modules/server/ws-agent.surface-cwd.test.ts`
- **Committed in:** `43eaf075` (Task 2)

## TypeScript Health

`cd livos && pnpm --filter livinityd exec tsc --noEmit` on the livinityd workspace:

- **Zero NEW errors** in `ws-agent.ts` or `ws-agent.surface-cwd.test.ts`.
- Pre-existing errors persist in `webapps/*`, `widgets/*`, `user/*`, `file-store.ts`, `pipewire-portal.test.ts`, `trpc-router.ts`, `trpc-streams.test.ts` — all present BEFORE this plan's changes (same pattern as 162-01/162-02/162-04/163-01 SUMMARYs). Out-of-scope per executor Scope Boundary rule.

`cd liv && npm run build --workspace=packages/core` not invoked (test file is in livinityd workspace, not liv-core; the only liv-core diff is to the vault-mode TEST file, which runs via `tsx` and was directly executed).

## Authentication Gates

None. This plan touches no auth-bearing code paths.

## Plan Verification Block (from PLAN.md)

```bash
# 1. Source-text guards (Phase 163-02 contract)
grep -F "export function resolveSessionVaultPath" ws-agent.ts          # 1   ✓
grep -F "resolveSessionVaultPathWithFallback" ws-agent.ts              # ≥2  ✓ (2)
grep -F "surfaces/${kind}" ws-agent.ts                                 # 1   ✓
grep -F "perSessionManagers" ws-agent.ts                               # ≥3  ✓ (6)
grep -F "managerFor(sessionKey)" ws-agent.ts                           # ≥3  ✓ (4)

# 2. Phase 161/162/162-04 contracts (regression)
grep -F "buildSessionKey" ws-agent.ts                                  # ≥3  ✓ (3)
grep -F "opts.vaultModeConfig === undefined" ws-agent.ts               # 1   ✓
grep -F "buildLuseSystemPromptWithOverlayResolved" ws-agent.ts         # ≥2  ✓ (2)
grep -F "claude-haiku-4-5-20251001" ws-agent.ts                        # 0   ✓

# 3. liv/packages/core UNCHANGED
git diff HEAD~2 -- agent-session.ts | wc -l                            # 0   ✓

# 4. Test suites
ws-agent.surface-cwd.test.ts → 18/18 PASS                              # ≥17 ✓
agent-session.vault-mode.test.ts → 13/13 PASS                          # ✓
agent-session.multi-instance.test.ts → 6/6 PASS                        # ✓
agent-session.computer-use.test.ts → ALL PASS                          # ✓

# 5. Hard guardrails
sdk-agent-runner.ts SHA → f3538e1d811992b782a9bb057d1b7f0a0189f95f     # ✓
luse-system-prompt.ts diff vs HEAD~2 → 0                               # ✓
**/package.json diff vs HEAD~2 → 0                                     # ✓
```

All verification checks PASS.

## Self-Check: PASSED

- Files created exist: `ws-agent.surface-cwd.test.ts` ✓ (verified via vitest discovery)
- Files modified exist + contain expected greps: `ws-agent.ts` (10 invariants verified above) + `agent-session.vault-mode.test.ts` (widened test11) ✓
- Commits exist in `git log --oneline`: `2d7698d8` ✓, `43eaf075` ✓
- Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- D-09 zero-diff vs HEAD~2: confirmed ✓
- Phase 161-02 helper zero-diff vs HEAD~2: confirmed ✓
- `agent-session.ts` zero-diff vs HEAD~2: confirmed ✓
- D-NO-NEW-DEPS: zero package.json diff vs HEAD~2 ✓
- Tests: 18/18 PASS for new suite; 161/162-02/162-04/baseline all PASS for upstream regression

## TDD Gate Compliance

Plan structure: Task 1 (feat) → Task 2 (test, with `tdd="true"`). The plan-level type is `execute`, not `tdd`, so plan-level RED/GREEN/REFACTOR gate ordering does not apply. Per-task `tdd="true"` GREEN-only execution matches the plan's `<action>` instructions verbatim (the helpers + per-session-manager pattern were shipped first by Task 1's `feat` commit, then locked by Task 2's invariant suite). Same pattern as Plans 163-01 and 162-01.

## Next Steps (Plan 163-03)

Plan 163-03 (`LivOS Overlay → Vault File`) — Phase 161-02's `buildLuseSystemPromptWithOverlayResolved` currently returns a string and is passed as a `systemPrompt` option to the SDK. The Phase 163-03 Option A decision (per `163-CONTEXT.md`) is to KEEP that path for computer-use sessions while letting vault mode + computer-use coexist:

- `vaultMode=true` + `isComputerUseSession=true` → `systemPrompt: await computerUseSystemPromptBuilder()` overrides vault auto-load; cwd still = subsurface vault (from 163-02 here) so Edit tool targets are correct.
- `vaultMode=true` + `isComputerUseSession=false` → no systemPrompt; vault CLAUDE.md drives via `settingSources: ['project']` (from 162-02); cwd = vault root (from 163-02 default branch).

Plan 163-03 should be a near-zero diff plan since the existing Phase 161-02 DI hook + Phase 162-02 vault-mode + Phase 163-02 per-session cwd already compose correctly. The plan will likely consist of documentation + behavior assertions in a new test file rather than code changes.

163-02 unblocks 163-03 by providing the per-session cwd for surface-prefixed sessions while leaving the systemPrompt override path completely intact (Phase 161-02's `computerUseSystemPromptBuilder` DI hook is identical across `defaultSessionManager` and every per-session manager built by `buildSessionManager`).
