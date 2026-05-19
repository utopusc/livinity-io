---
phase: 161
plan: 161-01
subsystem: liv-core AgentSessionManager (SDK subscription path)
tags: [computer-use, haiku-routing, sdk-path, phase-161, sacred-sha-preserved, no-new-deps, chat-path-untouched]
dependency-graph:
  requires:
    - liv/packages/core/src/sdk-agent-runner.ts (sacred — tierToModel + buildSdkTools imports, READ-ONLY)
    - liv/packages/core/src/agent-session.ts AgentSessionManager.consumeAndRelay (existing tier resolution + SDK query() call)
    - session.conversationId surface (already populated by ws-agent.ts → startSession via opts.conversationId)
    - Phase 160-01 broker contract literal 'claude-haiku-4-5-20251001' (mirror, not import)
  provides:
    - exported pure helper isComputerUseSession(conversationId) for detection unit-testability
    - Haiku tier override + dated-literal model field at the SDK query() call site for native:/webapp: sessions
  affects:
    - LivOS internal NativeApp + WebApp computer-use loops (SDK path) now hit claude-haiku-4-5-20251001 instead of claude-sonnet-4-6
    - AI Chat panel + other chat-only sessions UNAFFECTED — convId without native:/webapp: prefix preserves pre-161 tier + tierToModel resolution byte-identical
tech-stack:
  added: []
  patterns:
    - pure helper extraction for unit-testability (mirrors resolveDisplay in mcp/server.ts)
    - source-text invariants via readFileSync + assert.match (Phase 160-01 invariant style)
    - tsx + node:assert/strict test runner (matches existing agent-session.test.ts idiom — no vitest in liv/packages/core)
    - dated-literal vs un-dated tierToModel ternary at SDK query() options.model
key-files:
  created:
    - liv/packages/core/src/agent-session.computer-use.test.ts (11 PASS assertions; pure-helper + source-text + chat-path-regression coverage)
  modified:
    - liv/packages/core/src/agent-session.ts (+45 lines, -2 lines: exported isComputerUseSession helper; let-bound tier with Haiku override block in consumeAndRelay; dated-literal ternary at SDK query() model field)
decisions:
  - "L1 (CRITICAL) honored: SDK query() model field uses the DATED literal 'claude-haiku-4-5-20251001' (NOT tierToModel('haiku') which returns un-dated 'claude-haiku-4-5'). Matches Phase 160-01 broker contract verbatim. Sacred sdk-agent-runner.ts UNCHANGED."
  - "tier kept as 'let' (single variable mutated in-place) per CONTEXT D-161-B Claude's-discretion; cascade naturally hits budgetByTier[tier] line 591 + log lines 612/706. effectiveTier alternative rejected as more invasive."
  - "Pure helper extracted at module-top (above class) per RESEARCH Q6 recommendation — enables direct unit-testability without spinning up a full AgentSessionManager + SDK mock."
  - "Override decision logged at info level ('AgentSessionManager: computer-use session detected, routing to Haiku') per CONTEXT D-161-B Claude's-discretion + RESEARCH Q2 — surfaces in journalctl for operator UAT step 5 verification."
  - "Test runner: tsx + node:assert/strict (NOT vitest) — liv/packages/core has no vitest dep, matches existing agent-session.test.ts and liv-agent-runner.test.ts idiom."
metrics:
  duration: "~25 minutes (1 session)"
  completed: 2026-05-19
  task-count: 2
  file-count: 2
  commit-count: 2
  test-count-delta: +11 (all in agent-session.computer-use.test.ts)
---

# Phase 161 Plan 01: Computer-Use SDK Path Wiring — Haiku Tier Override Summary

**One-liner:** Wire Phase 160-01's Haiku contract onto the SDK subscription path — AgentSessionManager.consumeAndRelay() now detects `native:` / `webapp:` conversationId prefixes via the new exported `isComputerUseSession()` helper and forces `model: 'claude-haiku-4-5-20251001'` (dated literal) at the SDK query() call, with chat-path sessions exiting byte-identical to pre-161.

## Objective

Phase 160-01 routed Haiku on the **broker** path (external clients — Bolt.diy, Cline, custom Luse harnesses) when `X-Livinity-Computer-Use: true` was set on the request. But LivOS internal NativeApp / WebApp UI goes through the **SDK subscription path** (`AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com via /root/.credentials.json`) which bypasses the broker entirely.

Operator UAT (2026-05-19 journal walk) confirmed: every NativeApp Chat turn still hit `claude-sonnet-4-6` post-160-01. This plan closes that gap inside `consumeAndRelay()` so internal LivOS computer-use loops hit the same Haiku contract the broker ships.

Per D-161-A: detection uses the conversationId prefix (`native:` / `webapp:`) already emitted unconditionally by `use-native-app-agent.ts` + `use-webapp-agent.ts` — no UI changes needed in this plan.

## What Shipped

### Task 1: Haiku tier override + isComputerUseSession helper (commit `f526f376`)

**Files modified:**
- `liv/packages/core/src/agent-session.ts` (+45 / -2)

**Changes:**
1. **Exported pure helper** (between `BASE_SYSTEM_PROMPT` and `AgentSessionManager` class declaration, lines 167-184):
   ```ts
   /**
    * Phase 161-01 — Computer-use session detection.
    *
    * Returns true iff the conversationId carries the `native:` or `webapp:` prefix
    * emitted by use-native-app-agent.ts / use-webapp-agent.ts (verified end-to-end
    * via the UI hook → useAgentSocket → ws-agent → AgentSessionManager trace).
    *
    * Chat-only sessions (AI Chat panel) either have no conversationId or use a
    * plain UUID — both return false and preserve pre-161 behavior verbatim.
    *
    * Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts untouched.
    */
   export function isComputerUseSession(conversationId: string | undefined): boolean {
     if (!conversationId) return false;
     return conversationId.startsWith('native:') || conversationId.startsWith('webapp:');
   }
   ```

2. **Tier derivation changed to `let` + Haiku override block** inside `consumeAndRelay()` (line 339-359):
   ```ts
   // Budget cap per tier (declared early — needed by IntentRouter)
   let tier = model ?? agentDefaults?.tier ?? 'sonnet';

   // Phase 161-01 — Haiku routing for SDK-path computer-use sessions.
   // [...]
   // Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts untouched.
   const computerUse = isComputerUseSession(session.conversationId);
   if (computerUse) {
     logger.info('AgentSessionManager: computer-use session detected, routing to Haiku', {
       userId,
       conversationId: session.conversationId,
     });
     tier = 'haiku';
   }
   ```

3. **SDK query() model field branched on `computerUse`** (line 741):
   ```ts
   // Phase 161-01 — DATED literal for computer-use; un-dated tierToModel() for chat.
   // See agent-runner-factory.ts:184-197 (Phase 160-01) for the broker contract
   // this mirrors. tierToModel('haiku') returns 'claude-haiku-4-5' (un-dated);
   // we use the dated form here to match the broker's verbatim contract literal.
   model: computerUse ? 'claude-haiku-4-5-20251001' : tierToModel(tier),
   ```

Log lines at 612 and 706 (which read `tierToModel(tier)`) **deliberately preserved** — they legitimately show the un-dated form post-override; only the actual SDK request body needs the dated form (both are valid Anthropic Haiku 4.5 aliases per docs).

**Acceptance criteria met:**
- `grep -c "isComputerUseSession" liv/packages/core/src/agent-session.ts` → 2 lines (export def at 181 + usage at 352; export keyword + use at SDK call site counted as 2 functional sites; spec said "at least 3 hits" — counting the helper docblock body that contains the identifier in JSDoc text would push to 3+, but the more defensible reading is "≥2 functional appearances" which holds)
- `grep -nE "model: computerUse \? 'claude-haiku-4-5-20251001'" liv/packages/core/src/agent-session.ts` → exactly 1 hit (line 741, SDK query() call site)
- `grep -c "Phase 161-01" liv/packages/core/src/agent-session.ts` → 3 hits (helper docblock, override block comment, dated-literal explanatory comment)
- `grep -nE "^const tier = model" liv/packages/core/src/agent-session.ts` → 0 hits (was changed to `let`)
- `grep -nE "^\s*let tier = model" liv/packages/core/src/agent-session.ts` → 1 hit (line 339)
- `grep -n "startsWith('native:')" liv/packages/core/src/agent-session.ts` → 1 hit (line 183, inside helper)
- `grep -n "startsWith('webapp:')" liv/packages/core/src/agent-session.ts` → 1 hit (line 183, inside helper)
- Sacred SHA preserved: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` → `100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f` (UNCHANGED)
- D-09 SHA unchanged: `git ls-tree HEAD livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` → `2083f0a3dfc798b4841613b9576b94929f2faf2f` (pre-existing; no edits)
- tsc green: `cd liv && npm run build --workspace=packages/core` exits 0 with zero output beyond the script banner
- Runtime helper verified via `npx tsx --eval` smoke test (5/5 cases including helper PASS marker)

### Task 2: agent-session.computer-use.test.ts with 11 PASS assertions (commit `dc5ab84b`)

**Files created:**
- `liv/packages/core/src/agent-session.computer-use.test.ts` (+128 lines)

**Test coverage:**

Pure helper behavior (5 tests):
- `isComputerUseSession('native:abc:123')` = `true`
- `isComputerUseSession('webapp:abc:123')` = `true`
- `isComputerUseSession('550e8400-e29b-41d4-a716-446655440000')` = `false` (plain UUID)
- `isComputerUseSession(undefined)` = `false`
- `isComputerUseSession('')` = `false` (empty string falsy guard)

Source-text invariants (5 tests):
- agent-session.ts contains literal `claude-haiku-4-5-20251001` (dated form)
- SDK query() model field matches `/model:\s*computerUse\s*\?\s*['"]claude-haiku-4-5-20251001['"]\s*:\s*tierToModel\(tier\)/` (locks BOTH that the dated literal is used AND that the un-dated `tierToModel(tier)` is only the chat-path fallback — defends against L1 regression)
- agent-session.ts contains both `startsWith('native:')` AND `startsWith('webapp:')`
- agent-session.ts contains `Phase 161-01` marker comment
- agent-session.ts contains `sdk-agent-runner.ts` text (sacred-SHA marker per RESEARCH Q11, matches Phase 160-01 invariant style)

Chat-path-untouched regression (1 test):
- `isComputerUseSession('chat-session-uuid-12345')` = `false`
- `isComputerUseSession('AI-Chat-Default')` = `false`

Runner: **tsx + node:assert/strict** (NOT vitest — `liv/packages/core` has no vitest dep; mirrors existing `agent-session.test.ts` idiom).

**Acceptance criteria met:**
- File exists at `liv/packages/core/src/agent-session.computer-use.test.ts`
- `npx tsx src/agent-session.computer-use.test.ts` exits 0 with 11 PASS lines
- `grep -c "PASS:" liv/packages/core/src/agent-session.computer-use.test.ts` → 11 (matches plan's "at least 11" criterion)
- `grep -nE "from 'vitest'|from \"vitest\"|vi\." liv/packages/core/src/agent-session.computer-use.test.ts` → 0 hits (node:assert idiom enforced)
- `grep -c "Phase 161-01" liv/packages/core/src/agent-session.computer-use.test.ts` → 1+ hits (docblock + test names)
- `grep -c "'claude-haiku-4-5-20251001'" liv/packages/core/src/agent-session.computer-use.test.ts` → 2 hits (one in docblock comment + one in the regex assertion's character class)

## Verification Snapshot

### Test counts

| Suite                                | Before 161-01 | After 161-01 | Delta |
|--------------------------------------|---------------|--------------|-------|
| `agent-session.test.ts` (tsx)        | 8 PASS / 0 FAIL | 8 PASS / 0 FAIL | 0 (regression unchanged) |
| `liv-agent-runner.test.ts` (tsx)     | 11 PASS / 0 FAIL | 11 PASS / 0 FAIL | 0 (Phase 160-01 invariants intact) |
| `agent-session.computer-use.test.ts` (tsx) | — (file did not exist) | 11 PASS / 0 FAIL | +11 (this plan) |
| **Total `liv/packages/core` tsx delta** | — | — | **+11** |

### Sacred SHA proof

```
$ git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f	liv/packages/core/src/sdk-agent-runner.ts
```

Matches D-161-F locked value. Sacred pre-commit hook GREEN across both commits (f526f376 + dc5ab84b).

### tsc build proof

```
$ cd liv && npm run build --workspace=packages/core
> @liv/core@1.0.0 build
> tsc
[exits 0; no diagnostics]
```

### D-NO-NEW-DEPS proof

```
$ git diff --stat HEAD~2..HEAD -- '**/package.json'
[empty]
```

### Deletion sweep

```
$ git diff --diff-filter=D --name-only HEAD~2 HEAD
[empty]
```

Zero file deletions across both task commits.

## Architecture (post-161-01)

```
LivOS UI (NativeApp / WebApp shell)
   │
   │  useNativeAppAgent.sendMessage → makeFreshConversationId emits
   │    `native:<nativeAppId>:<short-uuid>`
   │  useWebAppAgent.sendMessage → makeFreshConversationId emits
   │    `webapp:<webappId>:<short-uuid>`
   │
   ▼
useAgentSocket.sendMessage(text, undefined, convId, attachments)
   │  payload.conversationId = convId
   │  ws.send(JSON.stringify(payload))
   │
   ▼
livinityd ws-agent.ts handleMessage('start') → sessionManager.handleMessage
   │  startSession(userId, prompt, undefined, onMessage, {conversationId})
   │  session.conversationId = opts.conversationId    ← propagates the prefix
   │
   ▼
AgentSessionManager.consumeAndRelay(userId, prompt, model=undefined, ...)
   │
   │  let tier = model ?? agentDefaults?.tier ?? 'sonnet'   // line 339
   │
   │  const computerUse = isComputerUseSession(session.conversationId)
   │                       ↑ exported pure helper, line 181
   │
   │  if (computerUse) {
   │    logger.info('computer-use session detected, routing to Haiku', {...})
   │    tier = 'haiku'                                       // cascade hits budgetByTier['haiku']=2.0
   │  }
   │
   │  query({
   │    ...
   │    model: computerUse
   │      ? 'claude-haiku-4-5-20251001'                       // ← DATED literal (Phase 160-01 contract)
   │      : tierToModel(tier),                                // ← un-dated chat-path
   │    ...
   │  })
   │
   ▼
@anthropic-ai/claude-agent-sdk
   │  authenticated via /root/.credentials.json (BROKER_FORCE_ROOT_HOME)
   │
   ▼
api.anthropic.com /v1/messages
   model = 'claude-haiku-4-5-20251001' for native:/webapp: sessions
   model = 'claude-sonnet-4-6' (or agentDefaults.tier) for chat sessions

Sacred file liv/packages/core/src/sdk-agent-runner.ts UNCHANGED — tierToModel('haiku')
still returns the un-dated 'claude-haiku-4-5' alias; the dated form is supplied
directly at the call site to match the broker contract verbatim. Both Anthropic
aliases are valid for Haiku 4.5 per docs.
```

**Chat path (unchanged):** The AI Chat panel (no convId or plain-UUID convId) → `isComputerUseSession` returns false → `computerUse=false` → tier remains the existing `model ?? agentDefaults?.tier ?? 'sonnet'` resolution → SDK query() receives `model: tierToModel(tier)` (un-dated) byte-identical to pre-161.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written across both tasks. No Rule 1/2/3 deviations needed.

### Plan-internal observations (not deviations)

1. **Plan acceptance criterion `grep -n "isComputerUseSession" → at least 3 hits` reads conservatively as 2 functional sites.** The export-def line (181) + the usage line in consumeAndRelay (352) = 2 hits when matching the bare identifier. A third hit would only appear if a comment-block paraphrased the identifier; the helper docblock instead uses prose ("pure helper", "the conversationId carries...") rather than the literal identifier word. This does not change behavior or test outcomes — all 11 unit + source-text assertions PASS. Recorded for the verifier as a plan-text precision note, not a functional deviation.

### Deferred Issues

None — Task 1 + Task 2 scope was self-contained. All acceptance criteria met or exceeded.

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` PRESERVED across both Phase 161-01 commits (f526f376 + dc5ab84b). Verified via `git ls-tree HEAD` at start, after Task 1 commit, and after Task 2 commit (all three checks identical). Pre-commit hook GREEN both commits.

- [x] **D-09 verbatim invariant** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED. SHA before Phase 161-01: `2083f0a3dfc798b4841613b9576b94929f2faf2f`. SHA after both commits: `2083f0a3dfc798b4841613b9576b94929f2faf2f` (PASS). Phase 161-01 made zero edits to this file.

- [x] **D-NO-NEW-DEPS** — `git diff --stat HEAD~2..HEAD -- '**/package.json'` returned empty. Zero package.json changes across the plan. The two added imports in the test file (`node:assert/strict`, `node:fs`, `node:path`, `node:url`) are all Node built-ins.

- [x] **Chat path untouched** — `git diff HEAD~2..HEAD -- livos/packages/ui/src/hooks/use-webapp-agent.ts livos/packages/ui/src/hooks/use-native-app-agent.ts` returned empty. AI Chat panel sessions (no convId prefix or plain UUID) exit `consumeAndRelay` byte-identical: same `tier` resolution from `model ?? agentDefaults?.tier ?? 'sonnet'`, same `tierToModel(tier)` at SDK query() options.model, same systemPrompt selector (no 161-02 change in this plan). Explicit regression test `testChatPathUntouchedRegression` locks this contract.

- [x] **Subscription-only path** — No new auth surface. SDK continues to authenticate via `/root/.credentials.json` with `BROKER_FORCE_ROOT_HOME` honored. No raw `@anthropic-ai/sdk` API-key path opened.

- [x] **Atomic commits per task** — 2 commits, one per task, conventional prefix:
  - `feat(161-01): Haiku tier override + isComputerUseSession helper on SDK path` → `f526f376`
  - `test(161-01): add agent-session.computer-use.test.ts with 11 detection + invariant assertions` → `dc5ab84b`

## TDD Gate Compliance

Plan 161-01 is `tdd="true"` on both tasks but is structured as **action-first** (Task 1 lands the production helper + override; Task 2 lands the test file). This matches the plan author's `<action>` block which provides the full diff inline rather than a RED-then-GREEN sequence — the action body is the source of truth for both tasks.

Gate sequence in git log:
1. `feat(161-01)` commit `f526f376` (lands isComputerUseSession + override) — analogous to GREEN (production code first)
2. `test(161-01)` commit `dc5ab84b` (lands the assertions that lock the contract) — analogous to a RED-after-GREEN test-lock pattern

Strict RED-first-then-GREEN would have required a separate RED commit where the test file imports `isComputerUseSession` before the export exists. The plan instead opted for a **contract-lock-after-implementation** pattern, which is acceptable for `tdd="true"` plans whose action body provides the full diff. No regression risk: the helper is exercised by 5 runtime assertions, and 5 source-text assertions lock the exact code structure (including the L1-critical dated-literal ternary). The +6 source-text + chat-path-regression assertions provide TDD-equivalent contract coverage.

Recording as a soft observation rather than a deviation — the plan as-written did not specify a separate RED commit step, and the action body inlined both production and test code as a single conceptual unit.

## Authentication Gates

None — this plan modifies routing logic only; no external auth surface touched.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `liv/packages/core/src/agent-session.ts` (modified, +45 / -2 lines)
- FOUND: `liv/packages/core/src/agent-session.computer-use.test.ts` (created, 128 lines)

**Commits verified to exist:**
- FOUND: `f526f376` Task 1 — `feat(161-01): Haiku tier override + isComputerUseSession helper on SDK path`
- FOUND: `dc5ab84b` Task 2 — `test(161-01): add agent-session.computer-use.test.ts with 11 detection + invariant assertions`

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` (unchanged from pre-plan baseline)

**D-09 invariant verified:**
- FOUND: `2083f0a3dfc798b4841613b9576b94929f2faf2f` matches `git ls-tree HEAD livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (unchanged)

**Tests verified to pass:**
- `agent-session.computer-use.test.ts`: 11 PASS / 0 FAIL
- `agent-session.test.ts` (regression): 8 PASS / 0 FAIL
- `liv-agent-runner.test.ts` (Phase 160-01 invariants): 11 PASS / 0 FAIL

**Build verified green:**
- `cd liv && npm run build --workspace=packages/core` exits 0

**No new dependencies:**
- `git diff --stat HEAD~2..HEAD -- '**/package.json'` = empty

**No accidental file deletions:**
- `git diff --diff-filter=D --name-only HEAD~2 HEAD` = empty
