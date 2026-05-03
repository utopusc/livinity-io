---
phase: 57-passthrough-mode-agent-mode
plan: 04
subsystem: livinity-broker
tags: [broker, passthrough, openai, anthropic-sdk, mode-dispatch, sse, phase-57, wave-3]

requires:
  - phase: 57-passthrough-mode-agent-mode
    plan: 01
    provides: "RED test surface (Wave 0), credentials fixture, @anthropic-ai/sdk reachability"
  - phase: 57-passthrough-mode-agent-mode
    plan: 02
    provides: "resolveMode(req) header parser (Wave 1), readSubscriptionToken({livinityd, userId}) (Wave 1)"
  - phase: 57-passthrough-mode-agent-mode
    plan: 03
    provides: "passthroughAnthropicMessages handler + router.ts dispatch (Wave 2), token-refresh helper, makeClient/mapApiError/tryRefreshAndRetry file-level helpers reused by Wave 3"
provides:
  - "translateToolsToAnthropic(openaiTools[]): AnthropicToolShape[] — OpenAI {type:'function',function:{name,description,parameters}} → Anthropic {name,description,input_schema}"
  - "translateToolUseToOpenAI(anthropicContent[]): OpenAITranslatedMessage — Anthropic content[] (text + tool_use blocks) → OpenAI {role:'assistant',content,tool_calls?}"
  - "passthroughOpenAIChatCompletions({livinityd, userId, body, res}) handler — OpenAI ↔ Anthropic translation around the SDK-direct passthrough"
  - "openai-router.ts mode dispatch at lines 109-148 — passthrough is DEFAULT, agent is opt-in via X-Livinity-Mode: agent (mirrors Wave 2 router.ts pattern)"
  - "Transitional aggregate-then-emit OpenAI SSE chunk + [DONE] terminator — Phase 58 swaps for true 1:1 delta translation"
affects:
  - 57-05 (Wave 4 — fixes integration.test.ts AND openai-integration.test.ts to inject X-Livinity-Mode: agent header so existing assertions still hit the agent code path)
  - 58 (Phase 58 — replaces transitional aggregate OpenAI chunk with true 1:1 OpenAI delta translation per FR-BROKER-C2-01)
  - 63 (Phase 63 — live verification of OpenAI passthrough end-to-end via Bolt.diy or curl against api.anthropic.com)

tech-stack:
  added: []
  patterns:
    - "Sibling-handler addition (Pitfall 6) — passthroughOpenAIChatCompletions added to passthrough-handler.ts as a sibling to passthroughAnthropicMessages, sharing the file-level makeClient / tryRefreshAndRetry / mapApiError / refreshAccessToken / readSubscriptionToken helpers. No infra duplicated."
    - "Append-only translator extension (Pitfall 6) — translateToolsToAnthropic + translateToolUseToOpenAI APPENDED to openai-translator.ts. Existing exports (translateOpenAIChatToSdkArgs, buildSyncOpenAIResponse, resolveModelAlias) BYTE-IDENTICAL — agent-mode regression-proof."
    - "Hybrid test-file pattern — openai-translator.test.ts holds both the legacy node-script style runTests() suite (16 cases, runs as import side-effect) and the new vitest describe/it blocks (11 cases). Both report PASS during vitest invocation."
    - "Mirror-Wave-2 dispatch pattern — openai-router.ts dispatch at lines 109-148 is structurally identical to router.ts dispatch from Wave 2 (resolveMode → if passthrough → handler → sibling try/catch funnels errors through OpenAI-shape envelope). Single source of truth for the dispatch shape."

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts (+109 LOC) — APPEND 2 new exports: translateToolsToAnthropic + translateToolUseToOpenAI"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-translator.test.ts (+155 LOC) — APPEND 11 vitest describe/it blocks (5 tool-shape variants + 2 throw cases + 4 tool_use variants)"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (+232 LOC) — APPEND passthroughOpenAIChatCompletions handler + buildAnthropicBodyFromOpenAI + buildOpenAIChatCompletionResponse + randomBase62 + mapStopReasonToFinishReason + emitOpenAIAuthErrorResponse helpers"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts (+44 LOC, 0 removals) — 2 imports + 42-line dispatch block at line 109"

key-decisions:
  - "Sibling handler in passthrough-handler.ts (NOT new file) — passthroughOpenAIChatCompletions reuses makeClient / tryRefreshAndRetry / mapApiError / refreshAccessToken / readSubscriptionToken from the same module. A separate file would duplicate auth + error-mapping boilerplate. Sibling preserves single source of truth for passthrough infrastructure."
  - "Translator helpers append-only (Pitfall 6 — strict). Existing translateOpenAIChatToSdkArgs is for AGENT mode (collapses to task + contextPrefix); the new translateToolsToAnthropic + translateToolUseToOpenAI are for PASSTHROUGH mode (preserves messages[] structure, forwards tools verbatim, translates Anthropic content[] back to OpenAI tool_calls[]). Distinct call sites, distinct semantics."
  - "OpenAI 401 envelope on /v1/chat/completions auth failure (NOT Anthropic envelope). Clients that hit /v1/chat/completions expect OpenAI error shape: {error: {message, type: 'invalid_request_error', code: 'subscription_not_configured'}}. The Anthropic-envelope shape used by passthroughAnthropicMessages would confuse OpenAI-compat clients."
  - "OpenAITool input typed as `unknown[]` rather than a strict OpenAIToolFunctionShape[]. The existing OpenAIChatCompletionsRequest types body.tools as `unknown[]` (D-42-12 ignored them, so they were never typed). translateToolsToAnthropic does runtime validation (throws on bad type/missing name) which surfaces as an OpenAI invalid_request_error 400 — matches OpenAI client expectations on bad tool shapes."
  - "Model alias resolution applied to upstream Anthropic call (NOT echoed in response.model). buildAnthropicBodyFromOpenAI calls resolveModelAlias() so 'gpt-4' is forwarded to api.anthropic.com as 'claude-sonnet-4-6'. The OpenAI response.model field still echoes the CALLER'S requested model ('gpt-4'), preserving caller expectation per existing buildSyncOpenAIResponse pattern."
  - "Transitional single-chunk OpenAI stream — same shape as Wave 2 Anthropic transitional. Phase 57 awaits client.messages.stream(...).finalMessage(), then emits one chat.completion.chunk + [DONE]. Phase 58 will iterate Anthropic's SSE events and translate each to OpenAI delta format."
  - "Total translator vitest-block count = 11, exceeds the 11+ floor in acceptance criteria. Plus the existing 16 node-script tests still pass in the same file via runTests() import side-effect — full coverage retained."

patterns-established:
  - "Pattern: Append-only PR for translator extensions. When a new mode/protocol needs translation helpers, APPEND new exports to the existing translator module (do not modify or refactor existing exports). The Pitfall 6 acceptance test (`git diff | grep '^-export' | wc -l == 0`) becomes a structural check enforceable by acceptance criteria."
  - "Pattern: Sibling-handler reuse. New protocol passthrough handlers belong in the same module as the original passthrough handler when they share auth/error/refresh infrastructure. Co-location keeps Pitfall 1 enforcement (no nexus imports) trivial — one grep covers both handlers."
  - "Pattern: Hybrid test-file evolution. When extending a node-script-style test file with vitest blocks, append at the bottom — vitest finds the new describe/it suite, the legacy runTests() runs as import side-effect (and prints PASS lines via stdout). Both invocation styles continue to work."

requirements-completed:
  - FR-BROKER-A1-01
  - FR-BROKER-A1-02
  - FR-BROKER-A1-03
  - FR-BROKER-A1-04
  - FR-BROKER-A2-01

duration: 8min
completed: 2026-05-02
---

# Phase 57 Plan 04: Wave 3 — OpenAI Chat Completions Passthrough Handler + Router Dispatch Summary

**OpenAI ↔ Anthropic translation helpers + passthroughOpenAIChatCompletions handler (232 LOC) + 44-line openai-router.ts dispatch flip the broker's default OpenAI behavior to passthrough — `gpt-4` requests now translate to Claude via api.anthropic.com with system + tools forwarded verbatim, sacred file SHA byte-identical, all 38 Wave 0+1+2+3 unit tests GREEN.**

## Performance

- **Duration:** ~8 min wall-clock execution
- **Started:** 2026-05-02T18:46Z
- **Completed:** 2026-05-02T18:54Z
- **Tasks:** 2 (both completed)
- **Files modified:** 4 (translator + translator test + handler + router)
- **Files created:** 0

## Accomplishments

- **openai-translator.ts (+109 LOC)** — `translateToolsToAnthropic(openaiTools)` maps OpenAI `{type:'function', function:{name, description, parameters}}` → Anthropic `{name, description, input_schema}`. Throws on `type !== 'function'` (`unsupported tool type`) and on missing `function.name`. Defaults parameters to `{type:'object', properties:{}}` when omitted (Anthropic requires `input_schema` even for no-arg tools). `translateToolUseToOpenAI(anthropicContent)` maps Anthropic content blocks → OpenAI `{role:'assistant', content, tool_calls?}`: text blocks aggregated into `content`, tool_use blocks become `tool_calls` with JSON-stringified `arguments`, content is `null` when only tool_use blocks present. Append-only — existing translateOpenAIChatToSdkArgs / buildSyncOpenAIResponse / resolveModelAlias byte-identical (Pitfall 6 enforced).
- **openai-translator.test.ts (+155 LOC)** — 11 new vitest `describe`/`it` blocks: 5 tool-shape variants (no-params, simple-params, enum-params, nested-object-params, array-params), 2 throw cases (unsupported tool type, missing function.name), 4 tool_use variants (text-only, multi-text, tool_use only, mixed text + tool_use). Co-exists with the legacy node-script `runTests()` IIFE at the bottom; vitest finds the new suite (11 PASS) AND the legacy script runs as import side-effect (16 PASS via stdout).
- **passthrough-handler.ts (+232 LOC)** — `passthroughOpenAIChatCompletions({livinityd, userId, body, res})` exported. Sibling helpers: `buildAnthropicBodyFromOpenAI` (extracts system from messages[role='system'] → top-level Anthropic field; conversation messages preserved; tool/function role messages skipped; tools translated via translateToolsToAnthropic; max_tokens defaults to 4096; model resolved via existing resolveModelAlias). `buildOpenAIChatCompletionResponse` (chatcmpl-`<base62-29>` id, object='chat.completion', choices[0].message via translateToolUseToOpenAI, finish_reason mapped from Anthropic stop_reason, usage from input_tokens + output_tokens). `randomBase62(29)` for chatcmpl id format. `mapStopReasonToFinishReason` (tool_use→tool_calls, end_turn→stop, max_tokens→length, default→stop). `emitOpenAIAuthErrorResponse` (OpenAI invalid_request_error 401 with subscription_not_configured code). Reuses module-level makeClient / tryRefreshAndRetry / mapApiError / readSubscriptionToken — single-source-of-truth passthrough infra. Pitfall 1 enforced: zero `@nexus/core` / `sdk-agent-runner` / `claude-agent-sdk` imports.
- **openai-router.ts (+44 LOC, 0 removals)** — 2 imports (`resolveMode` + `passthroughOpenAIChatCompletions`) + 42-line dispatch block at line 109 (after body validation, before D-42-12 warn-and-ignore). Default behavior FLIPS to passthrough; agent path requires `X-Livinity-Mode: agent`. Sibling try/catch funnels passthrough errors through OpenAI-shaped envelope (`rate_limit_exceeded` for 429, `invalid_request_error` for 401, `api_error` otherwise; Retry-After preserved verbatim on 429). Existing D-42-12 warn-and-ignore (lines 153-168 currently) preserved unchanged for agent mode. Existing listModels (Phase 42.1) untouched.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical pre-flight, after Task 1, after Task 2, end-of-plan. `git status nexus/` shows zero modifications throughout.
- **Wave 0+1+2+3 unit tests: 38/38 GREEN** — mode-dispatch.test.ts (11) + credential-extractor.test.ts (8) + passthrough-handler.test.ts (8) + openai-translator.test.ts (11 vitest blocks). Plus legacy openai-translator runTests() 16 PASS via stdout. Plus Wave 1's smoke gate Risk-A1 still green via passthrough-handler.test.ts construction-time assertion.

## Task Commits

| Task | Subject                                                                       | Commit     |
| ---- | ----------------------------------------------------------------------------- | ---------- |
| 1    | feat(57-04): add OpenAI passthrough translation helpers + handler (Wave 3 — Task 1) | `a563672d` |
| 2    | feat(57-04): wire mode dispatch into openai-router.ts (Wave 3 — Task 2)              | `5fccc0e6` |

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` — MODIFIED (+109 LOC). Append-only: 2 new exports + 2 new interface types (OpenAIToolFunctionShape, AnthropicToolShape, OpenAIToolCall, OpenAITranslatedMessage). Existing exports byte-identical.
- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.test.ts` — MODIFIED (+155 LOC). Append 11 vitest blocks. Legacy node-script runTests() unchanged.
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` — MODIFIED (+232 LOC). Append passthroughOpenAIChatCompletions + 6 helpers. Existing passthroughAnthropicMessages + module-level helpers byte-identical.
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — MODIFIED (+44 LOC, 0 removals). 2 imports + 42-line dispatch block at line 109. All existing code below dispatch (D-42-12 warn-and-ignore, translator call, agent runner streaming + sync paths) byte-identical.

## RED→GREEN Test Transitions

| Test File                       | Before Wave 3                                  | After Wave 3                                                          |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `mode-dispatch.test.ts`         | 11/11 GREEN                                    | 11/11 GREEN                                                           |
| `credential-extractor.test.ts`  | 8/8 GREEN                                      | 8/8 GREEN                                                             |
| `passthrough-handler.test.ts`   | 8/8 GREEN                                      | 8/8 GREEN                                                             |
| `openai-translator.test.ts`     | "No test suite found" (vitest); 16 PASS (node) | **11/11 GREEN (vitest)** + 16 PASS (legacy runTests via stdout)       |

**Total Wave 0+1+2+3 vitest GREEN: 38/38.** New OpenAI translator vitest cases that turned GREEN this wave:

1. ✅ `translateToolsToAnthropic > translates no-params tool`
2. ✅ `translateToolsToAnthropic > translates simple-params tool`
3. ✅ `translateToolsToAnthropic > translates enum-params tool`
4. ✅ `translateToolsToAnthropic > translates nested-object-params tool`
5. ✅ `translateToolsToAnthropic > translates array-params tool`
6. ✅ `translateToolsToAnthropic > throws on unsupported tool type`
7. ✅ `translateToolsToAnthropic > throws when function.name is missing`
8. ✅ `translateToolUseToOpenAI > translates text-only response to content with no tool_calls`
9. ✅ `translateToolUseToOpenAI > aggregates multi-text blocks into single content string`
10. ✅ `translateToolUseToOpenAI > translates tool_use block to tool_calls with JSON-stringified arguments`
11. ✅ `translateToolUseToOpenAI > translates mixed text + tool_use response`

## Tools Translation Behavior Verified

OpenAI `function` shape `{type:'function', function:{name, description?, parameters}}` is **shape-translated** (not stripped, not forwarded byte-identical) to Anthropic `{name, description?, input_schema}`. The `parameters` JSON Schema is preserved verbatim (covered by 5 vitest cases: no-params, simple-params, enum-params, nested-object-params, array-params). Unsupported tool types throw `'unsupported tool type'` which the handler catches and surfaces as OpenAI invalid_request_error 400. This satisfies Q2 (verbatim forwarding via shape conversion) per the planner's clarification.

## Streaming Translation (Anthropic SSE → OpenAI SSE)

Phase 57 emits **transitional aggregate-then-translate** for OpenAI streams (matches Wave 2 transitional pattern for Anthropic streams):

- Handler awaits `client.messages.stream(anthropicBody).finalMessage()` (SDK consumes upstream SSE internally).
- Synthesizes ONE `chat.completion.chunk` SSE event with the complete message wrapped as a `delta`, then `data: [DONE]\n\n`.
- Includes `usage` in the chunk (prompt_tokens, completion_tokens, total_tokens).

Phase 58 will swap this for true 1:1 delta translation: iterate Anthropic SSE events and emit one OpenAI chunk per event. The transitional pattern keeps Wave 3 minimal while shipping a working stream that satisfies basic OpenAI-compat clients.

## openai-router.ts Dispatch Site

- **File:** `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts`
- **Imports added:** lines 15-16 (`resolveMode` + `passthroughOpenAIChatCompletions`)
- **Dispatch block:** lines 109-148 (42 lines including blank-line separators)
- **Insertion point:** immediately after the `messages` array validation closing `}` (line 107), immediately before the `// 3. Per D-42-12: client-provided tools / tool_choice / function_call IGNORED with warn log` comment (now at line 151)
- **Total file LOC:** 328 (was 284; +44 net, 0 removals)

## Sacred File Integrity

| Checkpoint                  | SHA                                          | Status   |
| --------------------------- | -------------------------------------------- | -------- |
| Pre-flight (start of plan)  | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | BASELINE |
| After Task 1 commit `a563672d` | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | MATCH    |
| After Task 2 commit `5fccc0e6` | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | MATCH    |
| End-of-plan                 | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | MATCH    |

`git status nexus/` clean throughout. `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty (0 lines). Pitfall 1 (no `@nexus/core` / `sdk-agent-runner` / `claude-agent-sdk` imports in passthrough-handler.ts) verified by grep — zero matches. Pitfall 6 (no removed exports from openai-translator.ts) verified by `git diff openai-translator.ts | grep -E "^-export" | wc -l` = 0.

## D-NO-NEW-DEPS Audit

**STILL GREEN.** Wave 3 added no new npm dependencies. The new code in openai-translator.ts imports nothing new (just adds local types + functions). The new code in passthrough-handler.ts imports:

- `translateToolsToAnthropic, translateToolUseToOpenAI, resolveModelAlias, type OpenAITranslatedMessage` from `./openai-translator.js` (Wave 3 sibling, same package)
- `type {OpenAIChatCompletionsRequest}` from `./openai-types.js` (existing, type-only)

The new code in openai-router.ts imports:

- `resolveMode` from `./mode-dispatch.js` (Wave 1)
- `passthroughOpenAIChatCompletions` from `./passthrough-handler.js` (Wave 3 sibling)

`pnpm-lock.yaml` unchanged this wave.

## Decisions Made

- **Sibling handler in passthrough-handler.ts** (not a new openai-passthrough-handler.ts file). Reuses `makeClient`, `tryRefreshAndRetry`, `mapApiError`, `refreshAccessToken`, `readSubscriptionToken` — all module-level. Separate file would duplicate the auth + error-mapping boilerplate.
- **Translator helpers append-only.** `translateToolsToAnthropic` + `translateToolUseToOpenAI` are NEW exports, distinct semantics from the existing `translateOpenAIChatToSdkArgs` (which is for AGENT mode). Pitfall 6 enforced.
- **OpenAI 401 envelope on auth failure** (NOT Anthropic envelope). OpenAI-compat clients hitting `/v1/chat/completions` expect `{error: {message, type: 'invalid_request_error', code: 'subscription_not_configured'}}`.
- **Model alias resolution applied to upstream Anthropic call.** `buildAnthropicBodyFromOpenAI` calls `resolveModelAlias()` so `gpt-4` becomes `claude-sonnet-4-6` for the actual upstream call. The OpenAI response.model still echoes the caller's requested model (existing buildSyncOpenAIResponse pattern).
- **Tool input typed as `unknown[]`.** The existing `OpenAIChatCompletionsRequest.tools` is typed `unknown[]` (D-42-12 ignored). `translateToolsToAnthropic` does runtime validation (throws on bad type or missing name). The handler catches and surfaces OpenAI invalid_request_error 400.
- **Transitional single-chunk stream pattern.** Mirrors Wave 2's Anthropic transitional pattern (awaits `stream.finalMessage()`, synthesizes one chunk + `[DONE]`). Phase 58 swaps for true 1:1 delta translation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] OpenAITool type strict shape — relaxed to `unknown[]` to match existing OpenAIChatCompletionsRequest typing**

- **Found during:** Task 1, Step 2 (writing translateToolsToAnthropic signature).
- **Issue:** The plan template defined `translateToolsToAnthropic(openaiTools: OpenAITool[])` and imported `OpenAITool` from `./openai-types.js`. But `OpenAITool` does not exist in openai-types.ts — the existing `OpenAIChatCompletionsRequest.tools` is typed `unknown[]` (because D-42-12 ignored them, the field was never strict-typed). Importing `OpenAITool` would fail with TS2305 (Module has no exported member).
- **Fix:** Defined `OpenAIToolFunctionShape` interface inline in openai-translator.ts (the new home for OpenAI-passthrough translation types). Changed function signature to `translateToolsToAnthropic(openaiTools: unknown[]): AnthropicToolShape[]` with runtime validation inside (throws on bad type/missing name). Export the `OpenAIToolFunctionShape` interface alongside so future callers can import it for documentation purposes if they need to construct test fixtures.
- **Files modified:** `openai-translator.ts` (signature + interface added; behavior unchanged from plan spec — runtime checks still surface the same throws).
- **Verification:** All 7 vitest cases for `translateToolsToAnthropic` GREEN, including both `throws on unsupported tool type` and `throws when function.name is missing`. TS compiles clean.
- **Committed in:** `a563672d` (Task 1 commit).
- **Why this is a Rule 3 (blocker) auto-fix:** Without this adaptation, Task 1 would not compile. The plan template treated `OpenAITool` as if it existed; correcting to `unknown[]` + inline interface preserves the contract (same throws, same shape conversion) without inventing a brand-new export.

**2. [Rule 3 — Blocker] resolveModelAlias signature is `{actualModel, warn}` not bare string — destructure in buildAnthropicBodyFromOpenAI**

- **Found during:** Task 1, Step 4 (writing buildAnthropicBodyFromOpenAI).
- **Issue:** The plan template wrote `model: resolveModelAlias(body.model)` as if `resolveModelAlias` returned a string. Actual signature: `resolveModelAlias(requested: string): {actualModel: string; warn: boolean}`. Direct assignment would set `model` to an object, not a string — upstream Anthropic API would reject the request shape.
- **Fix:** Destructured: `const {actualModel} = resolveModelAlias(body.model)` then `model: actualModel`. Behavior matches the existing OpenAI router agent path which uses the same destructure.
- **Files modified:** `passthrough-handler.ts` (one line — destructure inside buildAnthropicBodyFromOpenAI).
- **Verification:** TS compiles clean. (No vitest case directly asserts upstream `model` is a string, but the type system enforces it via Anthropic SDK's MessageCreateParams.)
- **Committed in:** `a563672d` (Task 1 commit).
- **Why this is a Rule 3 (blocker) auto-fix:** Plan template ignored the destructure that the existing translator already does. Without the fix, the upstream call would 400.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blockers caused by plan template assuming type signatures that don't exist in the codebase). **Impact on plan:** Zero scope creep. Both fixes are mechanical type-correctness adaptations; the plan's behavioral contract (translate OpenAI tools verbatim, resolve model alias to actual Claude name) is preserved exactly.

## Issues Encountered

- **`openai-translator.test.ts` was a node-script-style file (uses `node:assert/strict` + `runTests()` IIFE), not vitest.** Before Wave 3, vitest reported "No test suite found in file" when targeting it directly — it never ran via vitest, only as a standalone node script. The plan instructed appending vitest `describe`/`it` blocks. After append: vitest finds and runs the 11 new blocks (all GREEN); the legacy `runTests()` runs as an import side-effect, prints its 16 PASS lines via stdout, and resolves successfully. Both invocation styles continue to work. Documented as the "Hybrid test-file evolution" pattern.
- **`openai-integration.test.ts` continues to report "No test suite found" under vitest.** Same root cause as above (node-script style). The plan's Step 6 anticipated regression: the file's existing assertions send no `X-Livinity-Mode: agent` header, so post-Wave 3 the requests route to passthrough mode and would fail in node-script execution because the test fixture lacks per-user `~/.claude/<userId>/.credentials.json`. **Wave 4 fix:** inject `X-Livinity-Mode: agent` header in every test request so existing assertions exercise the agent path. (Note: vitest cannot even reach this regression because it can't find the suite — but the regression is still real for any direct `node` execution of the file.)
- **Pre-existing TS error in `openai-router.ts:3` (`AgentResult` from `@nexus/core` has no exported member).** Same pre-existing error noted in Wave 2's SUMMARY. Out of Wave 3 scope. New Wave 3 code introduces zero new TS errors (`tsc --noEmit | grep -E "error TS.*(passthrough-handler|openai-translator|openai-router)\.ts"` returns no matches).

## Wave 2 Regression Flag Status (from prompt)

The user's prompt asked: "did this plan address it for openai-integration.test.ts?"

**No, this plan did NOT inject `X-Livinity-Mode: agent` header into openai-integration.test.ts.** Per the plan's `<acceptance_criteria>` and Step 6: "**Expected regression** in openai-integration.test.ts (defaults to passthrough; no agent header): documented in SUMMARY for Wave 4 fix." The plan explicitly defers the test-fixture header injection to Wave 4. This Wave 3 establishes the dispatch + handler; Wave 4 is the dedicated test-fixture migration plan that updates BOTH `integration.test.ts` (Anthropic) AND `openai-integration.test.ts` (OpenAI) to set the header.

## Self-Check: PASSED

- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan
- [x] `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty (0 lines)
- [x] No edits to any file under `nexus/packages/core/src/`
- [x] openai-translator.ts contains new export `translateToolsToAnthropic` (grep matches)
- [x] openai-translator.ts contains new export `translateToolUseToOpenAI` (grep matches)
- [x] Pitfall 6 enforced — no removed exports from openai-translator.ts
- [x] Existing exports still present unchanged in openai-translator.ts: translateOpenAIChatToSdkArgs, buildSyncOpenAIResponse, resolveModelAlias
- [x] openai-translator.test.ts has 12 `it(` matches (11 vitest blocks; the existing node-script test file had 0 `it(` matches → +12 increase, well above ≥11 floor — actually the floor was ≥11 and we delivered 11, so 11/11 GREEN)
- [x] passthrough-handler.ts contains `passthroughOpenAIChatCompletions` export (grep matches)
- [x] passthrough-handler.ts contains `chatcmpl-` (grep matches)
- [x] passthrough-handler.ts uses `translateToolsToAnthropic` (grep matches)
- [x] passthrough-handler.ts uses `translateToolUseToOpenAI` (grep matches)
- [x] passthrough-handler.ts uses `resolveModelAlias` (grep matches)
- [x] passthrough-handler.ts handles system message extraction (`m.role === 'system'` matches)
- [x] **Pitfall 1 enforced:** `grep -E '@nexus/core|sdk-agent-runner|claude-agent-sdk' passthrough-handler.ts` → 0 matches
- [x] TypeScript compiles clean for Wave 3 files: zero new TS errors in passthrough-handler.ts / openai-translator.ts / openai-router.ts
- [x] openai-translator.test.ts vitest run: 11/11 GREEN
- [x] Wave 0+1+2 unit tests still GREEN (regression check): mode-dispatch 11 + credential-extractor 8 + passthrough-handler 8 = 27/27
- [x] Total Wave 0+1+2+3: 38/38 GREEN
- [x] openai-router.ts contains imports: `import {resolveMode}` + `import {passthroughOpenAIChatCompletions}`
- [x] openai-router.ts contains dispatch: `const mode = resolveMode(req)` + `if (mode === 'passthrough')`
- [x] openai-router.ts calls `passthroughOpenAIChatCompletions({...})` with `userId: auth.userId`
- [x] openai-router.ts existing `Per D-42-12` comment preserved (agent path unchanged)
- [x] openai-router.ts existing `function listModels` preserved (Phase 42.1)
- [x] openai-router.ts diff: +44 / -0 (within 30-45 expected range — strictly less than 45, so passes acceptance)
- [x] No new TS errors in Wave 3 files (router.ts AgentResult error is pre-existing from Phase 45)
- [x] Both task commits exist: `a563672d` (Task 1), `5fccc0e6` (Task 2)
- [x] **Expected regression** in openai-integration.test.ts documented for Wave 4 fix

## Next Phase Readiness

- **Wave 4 (Plan 57-05) UNBLOCKED.** Wave 4 is the dedicated test-fixture migration plan. Wave 4 author should:
  - Update `integration.test.ts` (Anthropic Messages route) to inject `X-Livinity-Mode: agent` header in every test request — restores Wave 2's expected agent-path behavior.
  - Update `openai-integration.test.ts` (OpenAI Chat Completions route) to inject `X-Livinity-Mode: agent` header in every test request — restores Wave 3's expected agent-path behavior.
  - Add new passthrough-mode integration tests (separate test files OR new describe blocks) that exercise the passthrough path with mocked api.anthropic.com responses + fixture credentials.
  - Optional: convert openai-integration.test.ts and integration.test.ts to vitest `describe`/`it` style so vitest can discover them (currently they only run as node scripts).
- **Phase 58 hand-off:** OpenAI streaming is **transitional aggregate-then-emit single chunk** in Wave 3. Phase 58 should iterate Anthropic SSE events from `client.messages.stream(...)` and translate each to an OpenAI `chat.completion.chunk` per FR-BROKER-C2-01 (true 1:1 delta translation).
- **Phase 63 hand-off:** OpenAI passthrough is wired but not live-tested. Phase 63 should issue a real Bolt.diy or curl request via `/u/<userId>/v1/chat/completions` (no header → passthrough) to verify end-to-end against api.anthropic.com.

## Threat Flags

None — Wave 3 introduces no new network endpoints beyond api.anthropic.com (already authorized in Wave 2's threat model) and no new auth surfaces. The threat surface scan confirms:

- `passthrough-handler.ts`: NEW handler `passthroughOpenAIChatCompletions` reuses Wave 2's network surface (api.anthropic.com via SDK + platform.claude.com/v1/oauth/token via fetch).
- `openai-router.ts`: dispatch branches existing route handler based on header parser; no new routes, no new middleware.
- `openai-translator.ts`: pure functions, no I/O.

All threats T-57-13 / T-57-14 / T-57-15 / T-57-16 from the plan's `<threat_model>` are mitigated as specified:

- **T-57-13 (Malformed `tools[]` translation crashes handler):** Mitigated. `translateToolsToAnthropic` throws on unsupported type or missing name; handler catches in try/catch and returns OpenAI-shape `invalid_request_error` 400. Acceptance test `throws on unsupported tool type` passes.
- **T-57-14 (JSON.stringify of tool input leaks unintended fields):** Accepted as documented. Tests cover round-trip for `{a:2, b:3}` only.
- **T-57-15 (Pitfall 6 — modifying existing openai-translator exports breaks agent mode):** Mitigated. `git diff openai-translator.ts | grep -E "^-export" | wc -l` = 0. All 5 existing exports byte-identical (translateOpenAIChatToSdkArgs, buildSyncOpenAIResponse, resolveModelAlias).
- **T-57-16 (chatcmpl-* id collision):** Accepted. `Math.random()` base62 over 29 chars = ~10^51 entropy.

---
*Phase: 57-passthrough-mode-agent-mode*
*Completed: 2026-05-02*
