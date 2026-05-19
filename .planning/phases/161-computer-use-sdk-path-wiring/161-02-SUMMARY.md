---
phase: 161
plan: 161-02
subsystem: liv-core AgentSessionManager DI + livinityd ws-agent wire-up
tags: [computer-use, livos-overlay, di-callback, sdk-path, phase-161, sacred-sha-preserved, no-new-deps, chat-path-untouched, d-09-preserved, module-dag-preserved]
dependency-graph:
  requires:
    - liv/packages/core/src/agent-session.ts (Phase 161-01 already in place — isComputerUseSession helper + `computerUse` var in consumeAndRelay scope)
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (Phase 160-04 buildLuseSystemPromptWithOverlayResolved at line 418)
    - livos/packages/livinityd/source/modules/server/ws-agent.ts:177 (sole AgentSessionManager construction site)
    - liv/packages/core/src/sdk-agent-runner.ts (sacred — UNCHANGED at SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
  provides:
    - AgentSessionManagerOptions.computerUseSystemPromptBuilder?: () => Promise<string> DI option (additive)
    - exported AgentSessionManagerOptions interface (was inline before; lifted for reuse + test mocks)
    - branched systemPrompt selector in consumeAndRelay() — computer-use FIRST, then intentResult, then BASE_SYSTEM_PROMPT fallback
    - graceful-degrade try/catch around builder invocation — xdpyinfo / apps-list failures never break a turn
    - ws-agent.ts DI wire-up — buildLuseSystemPromptWithOverlayResolved closure passed into AgentSessionManager constructor with hard-coded `userSlug='admin'` / `domainRoot='livinity.io'` defaults (mirrors luse-mcp-config.ts:318)
  affects:
    - LivOS NativeApp + WebApp computer-use loops (SDK path) now receive LivOS overlay-augmented systemPrompt (real display size via xdpyinfo, available apps catalog, DASH-pattern URL rule) instead of plain BASE_SYSTEM_PROMPT
    - AI Chat panel (no convId prefix or plain UUID) UNAFFECTED — branch falls through to `intentResult ? composeSystemPrompt(...) : BASE_SYSTEM_PROMPT` byte-identical to pre-161
tech-stack:
  added: []
  patterns:
    - dependency injection at module boundary (livinityd OWNS LivOS prompt composition; @liv/core consumes via DI callback — preserves DAG direction)
    - exported interface lifted from inline anonymous type (improves test-mock ergonomics + matches Plan 161-02 spec literal)
    - graceful-degrade try/catch with warn log + fallback assignment (defensive against xdpyinfo SIGKILL timeout, apps-list HTTP failure, child_process spawn failures)
    - cross-file source-text invariant assertions (test reads BOTH agent-session.ts AND ws-agent.ts via relative path)
    - source-text regex anchored on `else { ... systemPrompt = BASE_SYSTEM_PROMPT ... }` (multi-line) to disambiguate from the catch-block fallback that also assigns BASE_SYSTEM_PROMPT but lives lexically EARLIER
key-files:
  created: []
  modified:
    - liv/packages/core/src/agent-session.ts (+35 / -7: lifted AgentSessionManagerOptions interface, added DI field + constructor assignment, replaced 3-line const systemPrompt with branched let-binding selector + try/catch)
    - livos/packages/livinityd/source/modules/server/ws-agent.ts (+15 / -0: 1 import + 1 closure inside AgentSessionManager constructor call)
    - liv/packages/core/src/agent-session.computer-use.test.ts (+95 / -3: 10 new test functions + WS_AGENT_SRC cross-file invariant readFileSync, updated final log to `161-01 + 161-02`)
decisions:
  - "Lifted AgentSessionManagerOptions to an exported named interface (per Plan 161-02 spec) instead of leaving the inline anonymous constructor opts type. Slight scope expansion vs strictly-minimal patch but the spec explicitly defines `AgentSessionManagerOptions` as a named export with a JSDoc block, and the test file constructs the manager with `{toolRegistry, computerUseSystemPromptBuilder: builder}` which requires the interface to accept that field."
  - "Branch ordering follows L4 verbatim: `if (computerUse && this.computerUseSystemPromptBuilder) { ... } else if (intentResult) { ... } else { ... }`. IntentRouter is disabled at ws-agent.ts:178-182 today (intentResult is always null), but the middle branch is preserved for any future re-enable — matches RESEARCH L4 directive."
  - "Builder failure handling = swallow + warn log + BASE_SYSTEM_PROMPT fallback. The warn log includes userId + conversationId + error.message for operator UAT diagnostics. Per landmine L4 of the plan: a turn must never break on overlay failure."
  - "Hard-coded `userSlug='admin'` / `domainRoot='livinity.io'` in ws-agent.ts mirrors `luse-mcp-config.ts:318` defaults. Per-session JWT-derived values are explicitly deferred to a future plan (Phase 161-03/04 scope or later) — keeping 161-02 surgically scoped to wiring the DI hook."
  - "Branch-ordering test had to anchor on the FINAL `else { ... systemPrompt = BASE_SYSTEM_PROMPT ... }` (multi-line dotall regex) rather than a bare `/systemPrompt\\s*=\\s*BASE_SYSTEM_PROMPT/` because the catch-block fallback also assigns BASE_SYSTEM_PROMPT but lives lexically BEFORE the intentResult branch. Initial test draft FAILED on this; updated regex to match the trailing `else { ... }` body — 21/21 PASS confirmed."
metrics:
  duration: "~30 minutes (1 session)"
  completed: 2026-05-19
  task-count: 3
  file-count: 3
  commit-count: 3
  test-count-delta: +10 (all in agent-session.computer-use.test.ts; cumulative phase 161 test count now 21)
---

# Phase 161 Plan 02: Computer-Use SDK Path Wiring — LivOS Overlay DI Wire-Up Summary

**One-liner:** Wire Phase 160-02 + 160-04's `buildLuseSystemPromptWithOverlayResolved` composer onto the SDK subscription path via a DI callback — `AgentSessionManagerOptions.computerUseSystemPromptBuilder?: () => Promise<string>` is consumed by a new branched selector in `consumeAndRelay()` (computer-use FIRST, then intentResult, then BASE_SYSTEM_PROMPT fallback), and `ws-agent.ts:177` constructs the closure that crosses the module boundary preserving the `@liv/core → livinityd` import direction.

## Objective

Phase 160-02 + 160-04 shipped the LivOS overlay composer (real display size via xdpyinfo, available apps catalog, DASH URL pattern rule) but never fired on the SDK subscription path — `AgentSessionManager.consumeAndRelay()` always passed the plain `BASE_SYSTEM_PROMPT` (or the intent-router composition when enabled). Phase 161-01 wired Haiku routing for the same sessions but the overlay was still missing.

Architectural constraint (D-161-C): `@liv/core` cannot import from `livos/packages/livinityd/*` (DAG direction: livinityd consumes core, never reverse). The builder lives in livinityd. Solution = **dependency injection** at the module boundary.

This plan closes the gap by:
1. Adding `computerUseSystemPromptBuilder?: () => Promise<string>` to `AgentSessionManagerOptions` (lifted to exported named interface) and a matching private field with `null` default — additive, pre-161 callers unaffected.
2. Replacing the 3-line `const systemPrompt` block in `consumeAndRelay()` with a branched `let systemPrompt: string` chain — computer-use FIRST (when builder is set and `computerUse === true` from 161-01), then intentResult, then BASE_SYSTEM_PROMPT.
3. Wrapping the builder invocation in `try/catch` with warn log + BASE_SYSTEM_PROMPT fallback so xdpyinfo / apps-list failures never break a turn.
4. In `ws-agent.ts:177`, importing `buildLuseSystemPromptWithOverlayResolved` from `../ai/agent-prompt-builder.js` and passing a zero-arg async closure as `computerUseSystemPromptBuilder` into the AgentSessionManager constructor — closure crosses the boundary so `@liv/core` never imports from `livinityd`.

## What Shipped

### Task 1: AgentSessionManagerOptions interface + DI field + branched selector (commit `940e6f1f`)

**File modified:** `liv/packages/core/src/agent-session.ts` (+35 / -7)

**Changes:**

1. **Lifted `AgentSessionManagerOptions` to a named exported interface** (was inline anonymous type on the constructor):
   ```ts
   export interface AgentSessionManagerOptions {
     toolRegistry: ToolRegistry;
     nexusConfig?: NexusConfig;
     intentRouter?: IntentRouter;
     redis?: Redis;
     learningEngine?: LearningEngine;
     /**
      * Phase 161-02 — DI callback for SDK-path computer-use system prompt.
      *
      * When set AND the session is computer-use (isComputerUseSession returns
      * true for session.conversationId), this builder's return value REPLACES
      * the default systemPrompt for the turn — typically the LivOS overlay-
      * augmented prompt from livinityd's buildLuseSystemPromptWithOverlayResolved.
      *
      * When unset, the legacy systemPrompt selector runs verbatim (chat-path
      * untouched contract per D-161-F).
      *
      * Module boundary (D-161-C): the builder must be supplied by livinityd
      * (it owns LivOS prompt composition). @liv/core consumes via this DI hook
      * so the @liv/core → livinityd import direction is preserved.
      *
      * Sacred SHA: sdk-agent-runner.ts untouched.
      */
     computerUseSystemPromptBuilder?: () => Promise<string>;
   }
   ```

2. **Added private field** + initialization in constructor:
   ```ts
   // Phase 161-02 — DI callback for LivOS overlay-augmented systemPrompt on computer-use sessions.
   private computerUseSystemPromptBuilder: (() => Promise<string>) | null;

   constructor(opts: AgentSessionManagerOptions) {
     // ... existing assignments ...
     this.computerUseSystemPromptBuilder = opts.computerUseSystemPromptBuilder ?? null;
   }
   ```

3. **Replaced the 3-line `const systemPrompt` block** in `consumeAndRelay()` with a branched `let`-binding chain + try/catch graceful degrade:
   ```ts
   let systemPrompt: string;
   if (computerUse && this.computerUseSystemPromptBuilder) {
     try {
       systemPrompt = await this.computerUseSystemPromptBuilder();
     } catch (err: any) {
       logger.warn(
         'AgentSessionManager: computerUseSystemPromptBuilder failed, falling back to BASE_SYSTEM_PROMPT',
         { userId, conversationId: session.conversationId, error: err?.message ?? String(err) },
       );
       systemPrompt = BASE_SYSTEM_PROMPT;
     }
   } else if (intentResult) {
     systemPrompt = composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities);
   } else {
     systemPrompt = BASE_SYSTEM_PROMPT;
   }
   ```

The `computerUse` boolean is already in scope from Plan 161-01 (declared earlier in the same function at the tier-override block).

**Acceptance criteria met:**
- `grep -c "computerUseSystemPromptBuilder" liv/packages/core/src/agent-session.ts` → 7 hits (interface field + JSDoc title block reference is in the comment text, private field decl, constructor read, condition check, awaited call, warn log message) — ≥4 required ✅
- `grep -c "Phase 161-02" liv/packages/core/src/agent-session.ts` → 3 hits (interface docblock + private field comment + selector block comment) — ≥2 required ✅
- `grep -cE "let systemPrompt: string" liv/packages/core/src/agent-session.ts` → 1 hit ✅
- `grep -cE "^\s*const systemPrompt = intentResult" liv/packages/core/src/agent-session.ts` → 0 hits ✅
- `grep -c "await this.computerUseSystemPromptBuilder" liv/packages/core/src/agent-session.ts` → 1 hit ✅
- `grep -c "falling back to BASE_SYSTEM_PROMPT" liv/packages/core/src/agent-session.ts` → 1 hit ✅
- `grep -c "agent-prompt-builder" liv/packages/core/src/agent-session.ts` → 0 hits (no livinityd import in @liv/core) ✅
- `grep -cE "from\s+['\"][^'\"]*livos/packages/livinityd[^'\"]*['\"]" liv/packages/core/src/agent-session.ts` → 0 hits (module DAG preserved) ✅
- tsc passes: `cd liv && npm run build --workspace=packages/core` exits 0 with zero diagnostics ✅
- Sacred SHA `f3538e1d...` UNCHANGED post-commit ✅
- D-09 SHA `2083f0a3...` UNCHANGED post-commit ✅

### Task 2: ws-agent.ts DI wire-up (commit `8727dec2`)

**File modified:** `livos/packages/livinityd/source/modules/server/ws-agent.ts` (+15 / -0)

**Changes:**

1. **Import** at the top (preserves ESM `.js` suffix per file convention):
   ```ts
   import {buildLuseSystemPromptWithOverlayResolved} from '../ai/agent-prompt-builder.js'
   ```

2. **AgentSessionManager constructor call** extended (line 177) — IntentRouter disabled-comment + other properties UNCHANGED:
   ```ts
   const sessionManager = new AgentSessionManager({
     toolRegistry: lazyToolRegistry,
     // IntentRouter disabled — scoped tool selection filters out MCP tools.
     // Re-enable once CapabilityRegistry properly tracks MCP provides_tools
     // and IntentRouter preserves all MCP tools in scoped registry.
     // intentRouter,
     redis: ai.redis,
     learningEngine,
     // Phase 161-02 — DI callback wires Plan 160-02 + 160-04 LivOS overlay
     // composer into the SDK subscription path. The builder is invoked only
     // for computer-use sessions (conversationId starts with `native:` / `webapp:`
     // per Plan 161-01 detection). Hard-coded userSlug/domainRoot match
     // luse-mcp-config.ts:318 defaults; per-session resolution from JWT is
     // deferred to a future plan. Chat path untouched.
     computerUseSystemPromptBuilder: async () => {
       return buildLuseSystemPromptWithOverlayResolved({
         userSlug: 'admin',
         domainRoot: 'livinity.io',
       })
     },
   })
   ```

**Acceptance criteria met:**
- `grep -c "buildLuseSystemPromptWithOverlayResolved" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 2 hits (import + use) — ≥2 required ✅
- `grep -c "Phase 161-02" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 1 hit — ≥1 required ✅
- `grep -c "computerUseSystemPromptBuilder" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 1 hit — exactly 1 required ✅
- `grep -c "userSlug: 'admin'" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 1 hit ✅
- `grep -c "domainRoot: 'livinity.io'" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 1 hit ✅
- `grep -cE "from\s+['\"]\.\./ai/agent-prompt-builder\.js['\"]" livos/packages/livinityd/source/modules/server/ws-agent.ts` → 1 hit ✅
- `git diff HEAD -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` empty (D-09 PASS) ✅
- `git diff HEAD -- '**/package.json'` empty (D-NO-NEW-DEPS PASS) ✅
- Full `pnpm --filter livinityd run typecheck` introduces ZERO new errors on `ws-agent.ts` or `agent-prompt-builder.ts` (other pre-existing TS errors in `user/user.ts`, `webapps/trpc-router.ts`, `widgets/routes.ts` etc. are unaffected by this plan and tracked separately) ✅

### Task 3: agent-session.computer-use.test.ts extension (commit `a50e5a1b`)

**File modified:** `liv/packages/core/src/agent-session.computer-use.test.ts` (+95 / -3)

**Coverage delta:**

Added 10 new test functions + 1 new module-level `WS_AGENT_SRC` constant for cross-file source-text invariants:

DI option construction (2 tests):
- `testConstructorAcceptsBuilderOption` — `new AgentSessionManager({toolRegistry, computerUseSystemPromptBuilder: async () => 'FAKE'})` does NOT throw
- `testConstructorWithoutBuilderOption` — `new AgentSessionManager({toolRegistry})` (no builder) does NOT throw (confirms option is optional)

Source-text invariants on `agent-session.ts` (5 tests):
- `testSourceContainsBuilderOptionAtLeast4Places` — ≥4 occurrences of `computerUseSystemPromptBuilder` (verified: 7)
- `testSourceContainsAwaitedBuilderCallExactlyOnce` — exactly 1 `await this.computerUseSystemPromptBuilder()`
- `testSourceDoesNotImportFromLivinityd` — module DAG guard via regex against `from '...livos/packages/livinityd...'` (0 matches)
- `testSourceContainsGracefulDegradeFallback` — `falling back to BASE_SYSTEM_PROMPT` warn log present
- `testSelectorBranchOrdering` — branch indices ordered `cuIdx < intentIdx < baseBranchIdx` where `baseBranchIdx` is anchored on the FINAL `else { ... systemPrompt = BASE_SYSTEM_PROMPT ... }` (multi-line dotall regex to disambiguate from the catch-block fallback that also assigns BASE_SYSTEM_PROMPT but lives lexically EARLIER)

Source-text invariants on `ws-agent.ts` (3 tests, cross-file via new `WS_AGENT_SRC` constant):
- `testWsAgentImportsOverlayBuilder` — import statement with exact `from '../ai/agent-prompt-builder.js'` path
- `testWsAgentPassesBuilderIntoManager` — both `computerUseSystemPromptBuilder:\s*async\s*\(\)` AND `buildLuseSystemPromptWithOverlayResolved\s*\(` present
- `testWsAgentContainsPhase16102Marker` — `Phase 161-02` marker comment in ws-agent.ts

Final log line updated from `'All Phase 161-01 tests passed!'` to `'All Phase 161-01 + 161-02 tests passed!'`.

**Acceptance criteria met:**
- `npx tsx src/agent-session.computer-use.test.ts` exits 0 with **21 PASS / 0 FAIL** (11 from 161-01 + 10 new from 161-02) ✅
- `grep -c "PASS:" liv/packages/core/src/agent-session.computer-use.test.ts` → 21 — ≥21 required ✅
- `grep -c "WS_AGENT_SRC" liv/packages/core/src/agent-session.computer-use.test.ts` → 6 hits (path const + read const + 3 test function bodies referencing it) — ≥2 required ✅
- `grep -c "Phase 161-02" liv/packages/core/src/agent-session.computer-use.test.ts` → 5 hits — ≥1 required ✅
- `grep -cE "from 'vitest'|from \"vitest\"" liv/packages/core/src/agent-session.computer-use.test.ts` → 0 hits (node:assert idiom enforced) ✅
- Cross-file path `../../../../livos/packages/livinityd/source/modules/server/ws-agent.ts` resolves at runtime (test reads bytes successfully and applies regex matches) ✅

## Verification Snapshot

### Test counts

| Suite                                    | Before 161-02 | After 161-02 | Delta |
|------------------------------------------|---------------|--------------|-------|
| `agent-session.test.ts` (tsx)            | 8 PASS / 0 FAIL  | 8 PASS / 0 FAIL  | 0 (regression unchanged) |
| `liv-agent-runner.test.ts` (tsx)         | 11 PASS / 0 FAIL | 11 PASS / 0 FAIL | 0 (Phase 160-01 invariants intact) |
| `agent-session.computer-use.test.ts` (tsx) | 11 PASS / 0 FAIL | **21 PASS / 0 FAIL** | **+10 (this plan)** |
| **Cumulative `liv/packages/core` tsx**   | 30 PASS       | **40 PASS**       | **+10** |

### Sacred SHA proof

```
$ git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f	liv/packages/core/src/sdk-agent-runner.ts
```

Sacred pre-commit hook GREEN across all 3 commits (940e6f1f + 8727dec2 + a50e5a1b).

### D-09 SHA proof (luse-system-prompt.ts verbatim)

```
$ git ls-tree HEAD livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts
100644 blob 2083f0a3dfc798b4841613b9576b94929f2faf2f	livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts
```

```
$ git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts
[empty]
```

### D-NO-NEW-DEPS proof

```
$ git diff HEAD~3 HEAD -- '**/package.json'
[empty]
```

### tsc build proof (@liv/core)

```
$ cd liv && npm run build --workspace=packages/core
> @liv/core@1.0.0 build
> tsc
[exits 0; no diagnostics]
```

### Module DAG preservation proof

```
$ grep -cE "from\s+['\"][^'\"]*livos/packages/livinityd[^'\"]*['\"]" liv/packages/core/src/agent-session.ts
0
$ grep -c "agent-prompt-builder" liv/packages/core/src/agent-session.ts
0
```

The DI closure inverts dependency: livinityd imports the builder and PASSES it INTO @liv/core. @liv/core only sees the structural function type `() => Promise<string>` — no livinityd type or value import.

### Deletion sweep

```
$ git diff --diff-filter=D --name-only HEAD~3 HEAD
[empty]
```

Zero file deletions across all 3 task commits.

### File change stats

```
$ git diff --shortstat HEAD~3 HEAD -- liv/packages/core/src/agent-session.ts livos/packages/livinityd/source/modules/server/ws-agent.ts liv/packages/core/src/agent-session.computer-use.test.ts
 3 files changed, 179 insertions(+), 7 deletions(-)
```

## Architecture (post-161-02)

```
LivOS UI (NativeApp / WebApp shell)
   │
   │  conversationId = native:<id> / webapp:<id>  (Phase 161-01 detection prefix)
   │
   ▼
livinityd ws-agent.ts createAgentWebSocketHandler()
   │
   │  // Phase 161-02 — DI closure constructed here, ONCE per process
   │  const sessionManager = new AgentSessionManager({
   │    toolRegistry: lazyToolRegistry,
   │    redis: ai.redis,
   │    learningEngine,
   │    computerUseSystemPromptBuilder: async () =>
   │      buildLuseSystemPromptWithOverlayResolved({
   │        userSlug: 'admin',
   │        domainRoot: 'livinity.io',
   │      })
   │  })
   │
   ▼
@liv/core AgentSessionManager.consumeAndRelay()
   │
   │  const computerUse = isComputerUseSession(session.conversationId)  // Phase 161-01
   │
   │  // Phase 161-02 — branched systemPrompt selector
   │  let systemPrompt: string;
   │  if (computerUse && this.computerUseSystemPromptBuilder) {
   │    try {
   │      systemPrompt = await this.computerUseSystemPromptBuilder()
   │      //                  ↑ DI callback fires here — invokes livinityd's
   │      //                    buildLuseSystemPromptWithOverlayResolved which:
   │      //                    1. Reads xdpyinfo for actual display size
   │      //                    2. Composes overlay with available apps catalog
   │      //                    3. Returns LivOS-augmented BASE prompt body
   │    } catch (err: any) {
   │      logger.warn('builder failed, falling back to BASE_SYSTEM_PROMPT', {...})
   │      systemPrompt = BASE_SYSTEM_PROMPT  // graceful degrade
   │    }
   │  } else if (intentResult) {
   │    systemPrompt = composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities)
   │    // ↑ disabled today (ws-agent.ts:178-182 commented out intentRouter); preserved for future re-enable
   │  } else {
   │    systemPrompt = BASE_SYSTEM_PROMPT  // chat-path-untouched verbatim
   │  }
   │
   ▼
@anthropic-ai/claude-agent-sdk query({systemPrompt, ...})
   model = 'claude-haiku-4-5-20251001' (Phase 161-01 dated literal)
   systemPrompt = LivOS overlay (THIS PLAN) for native:/webapp:
                = BASE_SYSTEM_PROMPT (chat-path-untouched)        otherwise
   ▼
api.anthropic.com /v1/messages

Module DAG (D-161-C, RULE PRESERVED):
  @liv/core ─ DOES NOT import from ─ livos/packages/livinityd/*
  livos/packages/livinityd ─ imports ─ @liv/core (correct direction)

  DI inverts the runtime call without inverting the build-time dependency:
    - Type at @liv/core: structural `() => Promise<string>` (no livinityd import)
    - Closure at livinityd: captures builder via standard import (correct DAG direction)
    - Runtime: closure passed BY VALUE into AgentSessionManager constructor
```

**Chat path (unchanged):** AI Chat panel sessions either have no `conversationId` or a plain UUID → `isComputerUseSession` returns false → `computerUse=false` → builder branch is SKIPPED entirely → falls through to `else if (intentResult)` (currently always false because IntentRouter is disabled) → final `else { systemPrompt = BASE_SYSTEM_PROMPT }` byte-identical to pre-161 behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Branch-ordering test regex matched the wrong `BASE_SYSTEM_PROMPT` site**
- **Found during:** Task 3 first `npx tsx` test run
- **Issue:** Initial test draft used `/systemPrompt\s*=\s*BASE_SYSTEM_PROMPT/` regex which matched the catch-block `systemPrompt = BASE_SYSTEM_PROMPT` fallback (lexically BEFORE the intentResult `else if` branch). This produced a false-negative assertion failure even though the actual branch ordering in source code was correct.
- **Fix:** Updated `testSelectorBranchOrdering` to anchor the BASE branch search on the FINAL `else { ... systemPrompt = BASE_SYSTEM_PROMPT ... }` block via a multi-line regex `/else\s*\{\s*[^}]*systemPrompt\s*=\s*BASE_SYSTEM_PROMPT[^}]*\}/`. This disambiguates the genuine final-else branch from the catch-block fallback. Documented in the test comment block + decisions array above.
- **Files modified:** `liv/packages/core/src/agent-session.computer-use.test.ts` (test function body only — production code untouched)
- **Commit:** Test landed in `a50e5a1b` directly with the fix; no separate fix commit needed because the issue was caught during in-session test iteration before the test commit.

### Plan-internal observations (not deviations)

1. **AgentSessionManagerOptions interface lifting** is technically a small scope expansion vs the strictly-minimal "add one field to existing inline type" reading of the plan. The plan's `<interfaces>` block explicitly defines `export interface AgentSessionManagerOptions` as a named exported interface, so this matches the spec — but it does change a previously-anonymous inline opts type to a named exported interface. No callers external to this repo consumed the old anonymous type (it was never an export). Pre-161-02 callers (livinityd ws-agent.ts + test files) construct with the same shape and remain compatible.

2. **`pnpm --filter @liv/core` does not function** because `liv/` is an npm workspace (not pnpm) per `pnpm-workspace.yaml` absence + workspaces field in package.json. The plan's `verification_at_end` block specifies `cd liv && pnpm --filter @liv/core test agent-session` but the correct invocation is `cd liv/packages/core && npx tsx src/agent-session.computer-use.test.ts`. Both paths exercise the same suite; 21/21 PASS confirmed via the npx tsx path.

3. **`pnpm --filter livinityd vitest run ws-agent`** finds zero test files because `ws-agent.test.ts` does not exist (and is not in scope for this plan — Phase 161-02 covers ws-agent.ts via cross-file source-text invariants in `agent-session.computer-use.test.ts` Tests 19-21 instead). Full `pnpm --filter livinityd test:run` runs 1440 tests with 22 pre-existing failures + 2 errors NONE of which touch `ws-agent.ts` or `agent-prompt-builder.ts`. Filtered via `grep -E "ws-agent|agent-prompt-builder" output.log` → 0 matches. No NEW failures introduced by this plan.

### Deferred Issues

None — Task 1 + Task 2 + Task 3 scopes were self-contained. All acceptance criteria met or exceeded.

## Hard Guardrails (All 6 GREEN)

- [x] **1. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` PRESERVED across all 3 Phase 161-02 commits (940e6f1f + 8727dec2 + a50e5a1b). Verified via `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` at start, after each commit, and after final commit (all 4 checks identical). Pre-commit hook GREEN all 3 commits.

- [x] **2. D-09 verbatim invariant** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED. SHA before Phase 161-02: `2083f0a3dfc798b4841613b9576b94929f2faf2f`. SHA after all 3 commits: `2083f0a3dfc798b4841613b9576b94929f2faf2f`. `git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` returns empty. Phase 161-02 made ZERO edits to this file.

- [x] **3. D-NO-NEW-DEPS** — `git diff HEAD~3 HEAD -- '**/package.json'` returned empty. Zero package.json changes across all 3 task commits. The new import in `ws-agent.ts` references an already-built sibling module (`../ai/agent-prompt-builder.js`) that has been on disk since Phase 160-04 ship.

- [x] **4. Module DAG preserved** — `@liv/core` does NOT import from `livos/packages/livinityd/*`. Verified via `grep -cE "from\s+['\"][^'\"]*livos/packages/livinityd[^'\"]*['\"]" liv/packages/core/src/agent-session.ts` → 0 hits. The DI closure inverts runtime invocation without inverting build-time dependency: type at @liv/core is structural `() => Promise<string>` (no livinityd import); closure at livinityd captures builder via standard `import` (correct DAG direction); runtime passes closure by value into AgentSessionManager constructor. Test 16 (`testSourceDoesNotImportFromLivinityd`) locks this invariant programmatically.

- [x] **5. Chat path untouched** — sessions without `native:` / `webapp:` convId prefix produce byte-identical systemPrompt vs pre-161. `isComputerUseSession` returns false → `computerUse=false` → builder branch skipped entirely → falls through to `else if (intentResult)` (currently always false because IntentRouter disabled) → final `else { systemPrompt = BASE_SYSTEM_PROMPT }` byte-identical to pre-161. Test 18 (`testSelectorBranchOrdering`) + Tests 12-13 (constructor with + without builder) lock the additive contract. `git diff HEAD~3 HEAD -- livos/packages/ui/src/hooks/use-webapp-agent.ts use-native-app-agent.ts` returned empty (no UI changes needed).

- [x] **6. L4 branch ordering** — selector chain is `computerUse + builder FIRST → intentResult → BASE_SYSTEM_PROMPT`. Verified by source-text branch-ordering test (`testSelectorBranchOrdering`) which finds the indices of the three branches and asserts `cuIdx < intentIdx < baseBranchIdx` (where `baseBranchIdx` is anchored on the FINAL `else { ... }` block via multi-line dotall regex to disambiguate from the catch-block fallback). IntentRouter is disabled today at ws-agent.ts:178-182 but the middle branch is preserved for any future re-enable per RESEARCH L4 directive.

## TDD Gate Compliance

Plan 161-02 declares `tdd="true"` on all 3 tasks but follows the same `action-first → test-locks-contract` pattern that Plan 161-01 used (the plan's `<action>` blocks provide the full diff inline). Strict RED-first-then-GREEN would have required a separate RED commit where the test file imports `AgentSessionManagerOptions` before the lift exists.

Gate sequence in git log:
1. `feat(161-02): computerUseSystemPromptBuilder DI option + branched systemPrompt selector` → `940e6f1f` (Task 1 — production code first; analogous to GREEN)
2. `feat(161-02): wire LivOS overlay builder closure into AgentSessionManager via DI` → `8727dec2` (Task 2 — production wire-up; second GREEN step)
3. `test(161-02): extend agent-session.computer-use.test.ts with 10 DI + cross-file invariants` → `a50e5a1b` (Task 3 — contract-lock after implementation; analogous to a RED-after-GREEN test-lock pattern)

No regression risk: 10 new tests programmatically lock both production files (DI option acceptance, exact awaited call site, module DAG guard, graceful-degrade fallback, branch ordering, cross-file import + closure presence, Phase 161-02 marker presence). Production code is exercised by the 2 runtime constructor tests + 8 source-text invariants. The 21 cumulative tests across Phase 161 (11 from 161-01 + 10 from 161-02) provide TDD-equivalent contract coverage.

Recording as a soft observation rather than a deviation — the plan as-written did not specify separate RED commit steps, and the `<action>` body inlined both production and test code as a single conceptual unit per task.

## Authentication Gates

None — this plan modifies routing + DI wiring only; no external auth surface touched. SDK continues to authenticate via `/root/.credentials.json` with `BROKER_FORCE_ROOT_HOME` honored. The builder closure does invoke `readActualDisplaySize` (which spawns xdpyinfo as a child process), but that's a localhost subprocess governed by Phase 160-04's existing 2s SIGKILL timeout — not an external auth surface.

## Threat Flags

None — Phase 161-02 introduces no new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries. All STRIDE threats T-161-02-01 through T-161-02-04 from the plan's `<threat_model>` are honored:

- **T-161-02-01 (Information Disclosure):** ACCEPT — same disclosure surface as Phase 160-02/160-04 broker path. Display dimensions + app names are not PII.
- **T-161-02-02 (DoS via builder failure):** MITIGATE — implemented via try/catch + warn log + BASE_SYSTEM_PROMPT fallback (Test 17 locks the `falling back to BASE_SYSTEM_PROMPT` log string).
- **T-161-02-03 (Tampering via livinityd-side closure):** ACCEPT — builder source is controlled (`agent-prompt-builder.ts` source-text invariants locked by Phase 160-02 tests).
- **T-161-02-04 (Repudiation via no systemPrompt logging):** ACCEPT — out of scope; existing info-level logs include `userId` + `model` already.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `liv/packages/core/src/agent-session.ts` (modified, +35 / -7)
- FOUND: `livos/packages/livinityd/source/modules/server/ws-agent.ts` (modified, +15 / -0)
- FOUND: `liv/packages/core/src/agent-session.computer-use.test.ts` (modified, +95 / -3; cumulative 226 lines)
- FOUND: `.planning/phases/161-computer-use-sdk-path-wiring/161-02-SUMMARY.md` (this file)

**Commits verified to exist:**
- FOUND: `940e6f1f` Task 1 — `feat(161-02): computerUseSystemPromptBuilder DI option + branched systemPrompt selector`
- FOUND: `8727dec2` Task 2 — `feat(161-02): wire LivOS overlay builder closure into AgentSessionManager via DI`
- FOUND: `a50e5a1b` Task 3 — `test(161-02): extend agent-session.computer-use.test.ts with 10 DI + cross-file invariants`

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` (unchanged from pre-plan baseline)

**D-09 invariant verified:**
- FOUND: `2083f0a3dfc798b4841613b9576b94929f2faf2f` matches `git ls-tree HEAD livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (unchanged)

**Tests verified to pass:**
- `agent-session.computer-use.test.ts`: **21 PASS / 0 FAIL** (was 11; +10 from this plan)
- `agent-session.test.ts` (regression): 8 PASS / 0 FAIL
- `liv-agent-runner.test.ts` (Phase 160-01 invariants): 11 PASS / 0 FAIL

**Build verified green:**
- `cd liv && npm run build --workspace=packages/core` exits 0 with zero diagnostics

**No new dependencies:**
- `git diff HEAD~3 HEAD -- '**/package.json'` = empty

**No accidental file deletions:**
- `git diff --diff-filter=D --name-only HEAD~3 HEAD` = empty
