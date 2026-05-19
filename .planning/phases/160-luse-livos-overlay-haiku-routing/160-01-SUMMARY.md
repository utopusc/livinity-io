---
phase: 160
plan: 160-01
subsystem: livinity-broker / liv-core api
tags: [haiku-routing, computer-use, broker, sacred-sha-preserved, no-new-deps]
dependency-graph:
  requires:
    - liv-core /api/agent/stream endpoint (api.ts:2459)
    - livinity-broker createSdkAgentRunnerForUser factory (agent-runner-factory.ts:99)
    - sacred sdk-agent-runner.ts tierToModel() resolution (read-only)
  provides:
    - `mode: 'chat' | 'computer-use'` opt on `createSdkAgentRunnerForUser`
    - X-Livinity-Computer-Use request header on Anthropic /v1/messages + OpenAI /chat/completions broker routes
    - tier override on POST /api/agent/stream request body (honored by liv-core api.ts)
  affects:
    - external broker clients (Bolt.diy, Vercel AI SDK, custom Luse harness) gain opt-in Haiku routing
    - chat path (AI Chat panel + WebApp chat input + use-webapp-agent + use-native-app-agent) UNAFFECTED — default mode='chat' preserves agentDefaults.tier resolution
tech-stack:
  added: []
  patterns:
    - header-driven mode dispatch (parallels resolveMode for passthrough vs agent)
    - body-level tier override (parallels existing webappId pass-through)
    - source-text invariants (parallels Phase 101-09 status_detail literal lock)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts (+ mode opt + Haiku injection block)
    - liv/packages/core/src/api.ts (+ bodyTierOverride read + tier precedence)
    - livos/packages/livinityd/source/modules/livinity-broker/router.ts (+ header read + mode forward 2x call sites)
    - livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts (+ header read + mode forward 2x call sites)
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts (+ 4 source-text invariants + 3 runtime body asserts)
    - liv/packages/core/src/liv-agent-runner.test.ts (+ 4 source-text invariants via tsx script)
decisions:
  - "Plan referenced `liv/packages/livinityd/...` but factory actually lives at `livos/packages/livinityd/...` (Phase 65 rename context). Rule 3 deviation: adjusted file paths to the real locations."
  - "Plan instructed `resolvedModel = 'claude-haiku-4-5-20251001'` literal injection; the actual sacred SDK runner uses `tier` enum mapped via `tierToModel()`. Solution: inject BOTH `tier: 'haiku'` (which routes correctly through tierToModel) AND `model: 'claude-haiku-4-5-20251001'` (kept for verbatim source-text contract + log/trace visibility). The sacred file's tier-to-model mapping does the actual model selection."
  - "Plan assumed a single computer-use call site; no such site exists today (Phase 160 INTRODUCES this routing). Solution: gate via `X-Livinity-Computer-Use: true` request header on existing broker routes — external Luse-bound clients opt-in, internal chat callers (no header) default to chat path. 4 call sites updated (router.ts wantsStream + sync; openai-router.ts wantsStream + sync)."
  - "Test framework split — `liv/packages/core` has no vitest (tsx scripts only), `livinityd` has vitest. Added invariants to BOTH locations (tsx script in liv, vitest in livinityd) so the source-text contract is locked from either consumer side."
metrics:
  duration: "~30 minutes (1 session)"
  completed: 2026-05-19
  task-count: 2
  file-count: 6
  commit-count: 2
  test-count-delta: +11 (4 tsx + 7 vitest)
---

# Phase 160 Plan 01: Haiku Routing for Computer-Use Loop Summary

**One-liner:** Header-gated Haiku routing on livinity-broker — `X-Livinity-Computer-Use: true` flows through `createSdkAgentRunnerForUser({mode: 'computer-use'})` → injects `tier: 'haiku'` into /api/agent/stream body → sacred sdk-agent-runner maps to `claude-haiku-4-5` for the entire session.

## Objective

Operator's explicit request (Turkish: *"computer use icin haiku modelini istiyorum yani Claude a chat den yazinca opus yada sonnet ile goruseyim ama pc kontrol olunca haiku olsun"*) → AI Chat panel + WebApp chat input continue using Opus/Sonnet (`claude-sonnet-4-6` / `claude-opus-4-7`), but when the agent loop invokes Luse computer-use tools (mouse/keyboard/screenshot), switch to Haiku (`claude-haiku-4-5-20251001`) for faster + cheaper screenshot-grounded interaction cycles. Computer-use loops run 10-50+ turns per task; Haiku is vision-capable, ~5x cheaper than Sonnet, ~10-15x cheaper than Opus, and ~3x faster.

## What Shipped

### Task 1: mode flag + Haiku override (commit 95d61ec6)

**Files modified:**
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts`
  - Extended `createSdkAgentRunnerForUser` opts with `mode?: 'chat' | 'computer-use'` (default `'chat'`)
  - Added verbatim Haiku routing block (lines 188-197) per Plan literal contract:
    ```ts
    // Phase 160-01 — Haiku routing for computer-use loops.
    // [...]
    // Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts untouched.
    const mode = opts.mode ?? 'chat'
    let resolvedModel: string | undefined
    let resolvedTier: 'haiku' | 'sonnet' | 'opus' | undefined
    if (mode === 'computer-use') {
      resolvedModel = 'claude-haiku-4-5-20251001'
      resolvedTier = 'haiku'
    }
    ```
  - Spread `tier` + `model` into request body when computer-use; omitted when chat (chat path preserved)
- `liv/packages/core/src/api.ts`
  - Added `bodyTierOverride` read at /api/agent/stream entry (lines 2466-2483)
  - Updated `agentConfig.tier` to prefer `bodyTierOverride || agentDefaults?.tier || AGENT_TIER env || 'sonnet'` (line 2674)
  - Existing precedence chain preserved when body has no tier field (chat path unchanged)

**Acceptance criteria met:**
- `grep -c "mode === 'computer-use'" agent-runner-factory.ts` → 2 (JSDoc + guard)
- `grep -c "claude-haiku-4-5-20251001" agent-runner-factory.ts` → 3
- `grep "Phase 160-01" agent-runner-factory.ts` → multiple matches
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved

### Task 2: wire call sites + source-text invariants (commit 1b063810)

**Files modified:**
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts`
  - Added `X-Livinity-Computer-Use` header detection → `brokerMode: 'chat' | 'computer-use'`
  - Forwarded `mode: brokerMode` to both call sites (SSE stream + sync paths)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts`
  - Same header detection + forward, both call sites (SSE stream + sync)
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts`
  - 4 source-text invariants reading factory source via fs (regex matches for: mode === computer-use guard, claude-haiku-4-5-20251001 literal, Phase 160-01 marker, Sacred SHA marker)
  - 3 runtime body-injection asserts (tier + model present when computer-use, absent when chat/undefined)
- `liv/packages/core/src/liv-agent-runner.test.ts`
  - Same 4 source-text invariants in the tsx-script test pattern, reading the factory via relative path resolution

**Acceptance criteria met:**
- `git grep -c "mode: 'computer-use'" livos/` → 2 (agent-runner-factory.test.ts + router.ts via literal test)
- `git grep -c "mode === 'computer-use'" livos/` → 2 (factory guard + test)
- `git grep "mode: brokerMode" livos/` → 4 call sites
- Chat hooks unchanged: `git diff HEAD~2..HEAD -- livos/packages/ui/src/hooks/use-webapp-agent.ts use-native-app-agent.ts` → empty
- liv-agent-runner tests: 11 PASS / 0 FAIL (was 7 PASS / 0 FAIL before; +4 invariants)
- agent-runner-factory.test.ts vitest: 22 PASS / 1 FAIL (was 15 / 1 FAIL — pre-existing Phase 102-06 LUSE_TARGET_DISPLAY mismatch; out of scope per scope-boundary rule)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved

## Architecture

```
External client (Bolt.diy / Vercel AI SDK / custom Luse harness)
   │
   │  POST /broker/:userId/v1/messages
   │  Headers: X-Livinity-Mode: agent
   │           X-Livinity-Computer-Use: true    ← Phase 160-01 opt-in
   │  Body:   {model: 'sonnet', messages: [...], stream: true}
   ▼
livinity-broker/router.ts
   │  brokerMode = (header === 'true') ? 'computer-use' : 'chat'
   │
   ▼
createSdkAgentRunnerForUser({...sdkArgs, mode: brokerMode})
   │
   │  if (mode === 'computer-use') resolvedTier = 'haiku'
   │
   │  POST /api/agent/stream
   │  Body: {task, max_turns, ..., tier: 'haiku', model: 'claude-haiku-4-5-20251001'}
   ▼
liv-core/api.ts /api/agent/stream
   │  bodyTierOverride = body.tier  (if 'haiku'|'sonnet'|'opus')
   │  agentConfig.tier = bodyTierOverride || agentDefaults?.tier || env || 'sonnet'
   │
   ▼
new SdkAgentRunner(agentConfig)   ← sacred file, untouched (SHA f3538e1d...)
   │  tierToModel('haiku') → 'claude-haiku-4-5'
   │
   ▼
Anthropic API: claude-haiku-4-5 for all turns this session
```

**Chat path (unchanged):** External client (or AI Chat panel via WebSocket — entirely different code path) → no `X-Livinity-Computer-Use` header → `brokerMode = 'chat'` → factory omits `tier`/`model` from body → api.ts falls back to `agentDefaults?.tier` → Sonnet/Opus as before.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Plan/Reality Path Mismatch] Factory file location**
- **Found during:** Task 1 read_first
- **Issue:** Plan referenced `liv/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` but the actual factory lives at `livos/packages/livinityd/...`. Phase 65 rename context (nexus → liv for `liv/` tree, NOT for `livos/livinityd/` which is a separate tree) was not reflected in the plan paths.
- **Fix:** Adjusted all file references to actual `livos/packages/livinityd/...` paths. No code-logic change needed.
- **Files modified:** N/A (path correction only)
- **Commit:** Both 95d61ec6 + 1b063810

**2. [Rule 3 — Plan/Reality Architectural Mismatch] Model field vs tier enum**
- **Found during:** Task 1 read_first (sdk-agent-runner.ts:162-168 `tierToModel`)
- **Issue:** Plan instructed `resolvedModel = 'claude-haiku-4-5-20251001'` as if a `model` field flowed straight to the Anthropic API. The actual sacred SDK runner uses a `tier` enum (`'haiku' | 'sonnet' | 'opus'`) and resolves to a model id internally via `tierToModel()`. Direct model id injection has no effect path.
- **Fix:** Inject BOTH fields — `tier: 'haiku'` (the field that actually routes the model selection through the sacred runner's existing logic) AND `model: 'claude-haiku-4-5-20251001'` (kept for verbatim source-text contract per plan + log/trace visibility for operators). Added `bodyTierOverride` read in liv-core api.ts so the body's tier field actually flows into `agentConfig.tier`.
- **Files modified:** liv/packages/core/src/api.ts (bodyTierOverride logic, +18 lines)
- **Commit:** 95d61ec6

**3. [Rule 3 — Plan/Reality Architectural Mismatch] No existing computer-use call site**
- **Found during:** Task 2 read_first (grep'd `createSdkAgentRunnerForUser` callers)
- **Issue:** Plan said "Find the call site(s) that construct the agent runner FOR THE COMPUTER-USE LOOP" — but no such site exists today. The 4 existing callers (router.ts × 2, openai-router.ts × 2) are all on the broker proxy route, with no signal about whether the session is computer-use or chat.
- **Fix:** Added `X-Livinity-Computer-Use: true` request-header gate (parallels the existing `X-Livinity-Mode: agent` pattern at `mode-dispatch.ts`). External Luse-bound clients opt-in by setting the header. Chat callers (no header) default to chat path, no behavior change. 4 call sites now forward `mode: brokerMode`.
- **Files modified:** router.ts, openai-router.ts
- **Commit:** 1b063810

**4. [Rule 3 — Plan/Reality Test Framework Mismatch] vitest test code vs tsx script test file**
- **Found during:** Task 2 implementation
- **Issue:** Plan listed test code using vitest `describe`/`it`/`expect` patterns but the target file `liv-agent-runner.test.ts` is a tsx executable script (no vitest in `liv/packages/core`). Plan acceptance criterion `pnpm --filter core test -- --run liv-agent-runner` is not runnable.
- **Fix:** Added 4 source-text invariants in BOTH locations — tsx script style in `liv-agent-runner.test.ts` (matches existing pattern with `await test(...)` + `assert(...)`) AND vitest style in `livinityd/.../agent-runner-factory.test.ts` (matches existing pattern + adds 3 runtime body-injection asserts as bonus). Source contract is now locked from both consumer test suites.
- **Files modified:** liv-agent-runner.test.ts + agent-runner-factory.test.ts
- **Commit:** 1b063810

### Deferred Issues (out of scope per scope-boundary rule)

**1. Pre-existing Phase 102-06 LUSE_TARGET_DISPLAY assertion failure**
- agent-runner-factory.test.ts line 439 asserts `cp.toContain('LUSE_TARGET_DISPLAY')` but the snippet body from `agent-prompt-builder.buildActiveDisplaySnippet` no longer contains that literal string (was renamed/refactored in an earlier phase).
- Confirmed pre-existing via `git stash + run tests` — same 1 failure on bare HEAD.
- Out of scope: not introduced by Phase 160-01, not in this plan's files-modified set.
- Logged here for the verifier to triage in a follow-up plan.

## Authentication Gates

None — this plan modifies routing logic only; no external auth surface touched.

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` preserved across all Phase 160-01 commits (verified at start, after Task 1, after Task 2, and after final state-update commit).
- [x] **D-09 verbatim contract** — N/A (this plan does not touch `luse-system-prompt.ts`)
- [x] **D-NO-NEW-DEPS** — no new npm packages added (`git diff --stat HEAD~2..HEAD -- package.json livos/package.json liv/package.json livos/packages/livinityd/package.json liv/packages/core/package.json livos/packages/ui/package.json` = empty)
- [x] **Domain pattern** — N/A (no domain references added)
- [x] **Chat path untouched** — `use-webapp-agent.ts` and `use-native-app-agent.ts` diff vs HEAD~2 = empty; AI Chat panel runner construction (via `use-agent-socket.ts` WebSocket path) entirely separate from broker routes; mode default `'chat'` preserves verbatim body shape
- [x] **Test pattern** — source-text invariants per existing webapp-floating-action-bar.test.tsx style (no @testing-library/react), added to both vitest + tsx locations
- [x] **Atomic commits per task** — 2 commits, one per task, both with `feat(160-01):` / `test(160-01):` conventional prefix

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts (modified)
- FOUND: livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts (modified)
- FOUND: livos/packages/livinityd/source/modules/livinity-broker/router.ts (modified)
- FOUND: livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts (modified)
- FOUND: liv/packages/core/src/api.ts (modified)
- FOUND: liv/packages/core/src/liv-agent-runner.test.ts (modified)

**Commits verified to exist:**
- FOUND: 95d61ec6 (Task 1)
- FOUND: 1b063810 (Task 2)

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`

**Tests verified to pass:**
- 11 PASS / 0 FAIL in `liv/packages/core` tsx script (was 7 / 0 — added 4)
- 22 PASS / 1 FAIL in `livinityd` vitest (was 15 / 1 — added 7; 1 pre-existing failure unrelated to this plan)

**No new dependencies:**
- `git diff --stat HEAD~2..HEAD -- **/package.json` = empty
