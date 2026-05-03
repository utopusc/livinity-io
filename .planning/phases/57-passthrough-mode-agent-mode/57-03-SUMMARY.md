---
phase: 57-passthrough-mode-agent-mode
plan: 03
subsystem: livinity-broker
tags: [broker, passthrough, anthropic-sdk, mode-dispatch, sse, retry-after, phase-57, wave-2]

requires:
  - phase: 57-passthrough-mode-agent-mode
    plan: 01
    provides: "RED test surface for passthroughAnthropicMessages (8 cases), credentials fixture, @anthropic-ai/sdk reachability"
  - phase: 57-passthrough-mode-agent-mode
    plan: 02
    provides: "resolveMode(req) header parser (Wave 1), readSubscriptionToken({livinityd, userId}) per-user OAuth reader (Wave 1), Risk-A1 GREEN verdict at mock level"
  - phase: 56-research-spike
    provides: "D-30-01 (HTTP-proxy direct via Node 22 fetch + SDK direct as decided), D-30-02 (forward client tools verbatim), D-30-03 (header opt-in default=passthrough), D-30-07 (sacred file untouched)"
provides:
  - "passthroughAnthropicMessages({livinityd, userId, body, res}) handler — SDK-direct Anthropic Messages forward with subscription Bearer auth"
  - "Mode-dispatch wiring in router.ts at line 67 — passthrough is DEFAULT, agent is opt-in via X-Livinity-Mode: agent"
  - "UpstreamHttpError funneling for passthrough errors — mirrors agent-mode 429 + Retry-After forwarding"
  - "Token-refresh-on-401 helper (production code path; live verification deferred to Phase 63)"
  - "Phase 57 transitional SSE (aggregate-then-restream as one fat content_block_delta)"
affects:
  - 57-04 (Wave 3 — wires same passthrough/agent dispatch into openai-router.ts)
  - 57-05 (Wave 4 — fixes integration.test.ts + openai-integration.test.ts to inject X-Livinity-Mode: agent header)
  - 58 (Phase 58 — replaces transitional aggregate SSE with true SDK token-streaming pass-through)
  - 63 (Phase 63 — live verification of subscription Bearer auth + token refresh against api.anthropic.com)

tech-stack:
  added: []
  patterns:
    - "SDK-direct passthrough — broker imports @anthropic-ai/sdk and instantiates new Anthropic({authToken}) for per-user subscription forward. NO HTTP-proxy hand-rolled — SDK handles auth header construction (Risk-A1 verified)."
    - "Sibling error funnel — passthrough errors with err.status flow through a router-level try/catch that mirrors the existing agent-mode 429+Retry-After forwarder shape (router.ts:158-185 pattern). Single source of truth for upstream error shape."
    - "Body never mutated — handler builds upstreamBody as a new object literal from named fields. Pitfall T-57-08 mitigation enforced by explicit object construction."
    - "Token-refresh-on-401 retry helper — generic tryRefreshAndRetry<T>(err, token, makeClientFn, retryFn) pattern works for both sync (messages.create) and stream (messages.stream().finalMessage()) paths without code duplication."

key-files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (227 LOC) — SDK-direct passthrough handler"
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/router.ts (+39 LOC, 0 removals) — 2 imports + 35-line dispatch block"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts (Wave 0 mock fix) — restructured makeRes() so res.status()/res.json() actually mutate res._status / res._body"

key-decisions:
  - "SDK-direct over hand-rolled HTTP-proxy. Wave 1's Risk-A1 smoke gate VERIFIED that @anthropic-ai/sdk@0.80.0 constructs `Authorization: Bearer <token>` correctly when given `authToken` (not `apiKey`). The SDK also normalizes the `anthropic-version` header, JSON encoding, and error mapping. Hand-rolling fetch() to api.anthropic.com would duplicate these without benefit. The plan's <interfaces> block + Wave 1 smoke gate authorize SDK-direct."
  - "Aggregate-then-restream transitional SSE for Phase 57. The plan's <behavior> block specifies `await stream.finalMessage()` then synthesize a single fat `content_block_delta` SSE sequence. This ships a working stream this wave; Phase 58 swaps to true token streaming via SDK's event iterator (`for await (const event of stream)`)."
  - "Generic tryRefreshAndRetry<T> helper parameterizes both sync and stream retry paths. Both messages.create() and messages.stream().finalMessage() return promises; the helper accepts a retryFn closure and reuses the same 401-detect → refresh → makeClient(refreshedToken) → retry logic for both."
  - "mapApiError reads `err.message` + `err.status` + `err.headers['retry-after']` ONLY — never echoes the full err.headers object (T-57-09: those headers may carry the Authorization Bearer token in some failure modes). Defensive even though the SDK rarely surfaces request headers via Error.headers."
  - "Dispatch lives at router.ts line 67 — AFTER body validation, BEFORE the existing D-41-14 tools warn-and-ignore. This means: invalid request shapes still 400 uniformly for both modes; the warn-and-ignore now applies only on the agent path (correct behavior — passthrough forwards tools verbatim, agent ignores them)."

patterns-established:
  - "Pattern: Sibling-funnel error block — when adding a new mode branch with its own error semantics, mirror the existing catch's response shape so external callers see uniform error JSON regardless of which branch handled the request. Used here for passthrough's sibling try/catch matching the agent-mode 429 forwarder shape."
  - "Pattern: Wave 0 test mock fixup is a Wave N concern — Wave 0's RED test files may contain latent bugs that only surface once an implementation exists to actually exercise the mock paths. Auto-fix under Rule 1 when the test bug isn't load-bearing for the contract (the mock here was wrong, but the assertions are correct)."

requirements-completed:
  - FR-BROKER-A1-01
  - FR-BROKER-A1-02
  - FR-BROKER-A1-03
  - FR-BROKER-A1-04
  - FR-BROKER-A2-01

duration: 6min
completed: 2026-05-02
---

# Phase 57 Plan 03: Wave 2 — Anthropic Messages Passthrough Handler + Router Dispatch Summary

**SDK-direct passthrough handler (227 LOC) + 39-line router dispatch flip the broker's default behavior to forward `/v1/messages` straight to api.anthropic.com with the per-user subscription Bearer token, preserving system prompt and tools verbatim — Wave 0's 8 RED passthrough-handler tests turn GREEN, sacred file SHA byte-identical.**

## Performance

- **Duration:** ~6 min wall-clock execution
- **Started:** 2026-05-02T18:37Z
- **Completed:** 2026-05-02T18:43Z
- **Tasks:** 2 (both completed)
- **Files created:** 1 production source file
- **Files modified:** 2 (router.ts + passthrough-handler.test.ts mock fix)

## Accomplishments

- **passthrough-handler.ts (227 LOC)** — `passthroughAnthropicMessages({livinityd, userId, body, res})` exported. Reads per-user OAuth token via Wave 1's `readSubscriptionToken()`. Constructs `new Anthropic({authToken, defaultHeaders: {'anthropic-version': '2023-06-01'}})`. Forwards body.system + body.tools + body.messages verbatim to `client.messages.create()` (sync) or `client.messages.stream().finalMessage()` (stream). Returns 401 + Anthropic-spec `authentication_error` on missing subscription. Maps SDK APIError → `UpstreamHttpError(message, status, retry-after)` so the existing router.ts catch block can forward 429 + Retry-After uniformly.
- **router.ts dispatch wiring (+39 LOC)** — 2 imports (`resolveMode`, `passthroughAnthropicMessages`) + 35-line dispatch block at line 67 (after body validation, before D-41-14 tools warn). Default behavior FLIPS to passthrough; agent path requires `X-Livinity-Mode: agent`. Sibling try/catch funnels passthrough errors through the same response shape as the agent-mode 429 forwarder (router.ts:158-185 pattern).
- **Token-refresh-on-401 helper** — generic `tryRefreshAndRetry<T>` reusable across sync and stream paths. POSTs `https://platform.claude.com/v1/oauth/token` with `grant_type=refresh_token`. Live verification deferred to Phase 63 per plan.
- **Phase 57 transitional SSE** — aggregate-then-restream pattern: await SDK's `messages.stream().finalMessage()`, then synthesize one fat `content_block_delta` SSE sequence (message_start → content_block_start → content_block_delta → content_block_stop → message_delta → message_stop). Phase 58 will swap this for true token streaming via SDK's event iterator.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical pre-flight, after Task 1, after Task 2, end-of-plan.
- **Wave 0 RED→GREEN transitions: 8/8 GREEN** in passthrough-handler.test.ts. Wave 0+1+2 combined: **27/27 GREEN** (mode-dispatch 11, credential-extractor 8, passthrough-handler 8).

## Task Commits

| Task | Subject | Commit |
|------|---------|--------|
| 1 | feat(57-03): implement passthroughAnthropicMessages handler (Wave 2 — Task 1) | `364a723b` |
| 2 | feat(57-03): wire mode dispatch into broker router (Wave 2 — Task 2) | `f48f6827` |

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` — NEW, 227 LOC. SDK-direct passthrough handler with token-refresh-on-401, sync + stream paths, error mapping to UpstreamHttpError.
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — MODIFIED, +39 LOC / -0. Two imports + 35-line dispatch block at line 67. Agent-mode code below dispatch unchanged.
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` — MODIFIED (mock fixup). Restructured `makeRes()` so `res.status()` / `res.json()` actually mutate `res._status` / `res._body` — Wave 0's `Object.assign(res, captured)` snapshot-copied closure values once at construction.

## RED→GREEN Test Transitions

| Test File | Before Wave 2 | After Wave 2 |
|-----------|---------------|--------------|
| `mode-dispatch.test.ts` | 11/11 GREEN (Wave 1) | 11/11 GREEN |
| `credential-extractor.test.ts` | 8/8 GREEN (Wave 1) | 8/8 GREEN |
| `passthrough-handler.test.ts` | 0/8 (RED — no production file + Wave 0 mock bug) | **8/8 GREEN** |

**Total Wave 0+1+2 GREEN: 27/27.** All passthrough-handler.test.ts cases that turned GREEN this wave:

1. ✅ `passes body.system verbatim to Anthropic SDK messages.create` (FR-BROKER-A1-01)
2. ✅ `passes body.tools verbatim to Anthropic SDK messages.create` (FR-BROKER-A1-01 / Q2 verbatim forward)
3. ✅ `does NOT inject "powered by" or "Nexus" into request body` (FR-BROKER-A1-02)
4. ✅ `does NOT add tools other than what client provided` (FR-BROKER-A1-03)
5. ✅ `constructs Anthropic client with authToken (NOT apiKey) and anthropic-version header` (Risk-A1 mitigation)
6. ✅ `returns 401 with actionable Anthropic-spec error when readSubscriptionToken returns null`
7. ✅ `throws UpstreamHttpError with status 429 + retryAfter forwarded` (Retry-After preservation)
8. ✅ `returns upstream Messages response verbatim via res.json on stream:false` (sync forward)

## Q1, Q2, SSE Behavior Verification (Per Plan Final Report Checklist)

- **Q1 (HTTP-proxy direct vs SDK):** Implementation uses **SDK-direct** via `new Anthropic({authToken})`. Wave 1's Risk-A1 smoke gate verified the SDK's `bearerAuth()` path constructs `Authorization: Bearer` correctly. The plan's `<interfaces>` block + must_haves explicitly specify SDK-direct (`new Anthropic({ authToken })`); the Wave 0 RED test for "auth construction" asserts `expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({authToken: ...}))` and would fail if the implementation used HTTP-proxy with hand-rolled fetch instead. Note: the plan's <objective> mentions HTTP-proxy direct via Node 22 fetch as the Q1 verdict from Phase 56 — but the plan's own contract (must_haves + <interfaces>) and Wave 0's RED test require SDK-direct. The SDK uses fetch() under the hood, so the architectural intent (no extra dep, no HTTP-proxy framework) is honored either way.
- **Q2 (tools forwarding):** Tools forwarded **verbatim**. `upstreamBody.tools = body.tools` — no filtering, no MCP injection, no name validation. Wave 0 test #4 explicitly asserts `forwardedTools` length === client-provided length AND no `mcp__*` / `shell` / `files_read` names appear.
- **SSE byte-forward:** Phase 57 is **transitional aggregate-then-restream** — NOT byte-by-byte forward of upstream SSE. Plan `<behavior>` line: "Phase 57 (this wave): aggregate-then-restream (single fat content_block_delta) ... Phase 58 swaps for true token streaming." The handler awaits `stream.finalMessage()` (which the SDK builds by consuming the upstream SSE internally), then synthesizes a 6-event Anthropic SSE sequence to the client. True byte-forward awaits Phase 58's switch to `for await (const event of client.messages.stream(...))`.

## Sacred File Integrity

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Pre-flight (start of plan) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | BASELINE |
| After Task 1 commit `364a723b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| After Task 2 commit `f48f6827` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| End-of-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |

`git status nexus/packages/core/` clean throughout. `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty. Pitfall 1 (no `@nexus/core` / `sdk-agent-runner` / `claude-agent-sdk` imports in passthrough-handler.ts) verified by grep — zero matches.

## D-NO-NEW-DEPS Audit

**STILL GREEN.** Wave 2 added no new npm dependencies. The new passthrough-handler.ts imports only:
- `@anthropic-ai/sdk` (added in Wave 0 under same-version-hoist; existing dep of livinityd's package.json)
- `express` (already in livinityd deps)
- `./agent-runner-factory.js` (existing broker module — for `UpstreamHttpError`)
- `./credential-extractor.js` (Wave 1 deliverable)
- `./types.js` (existing broker module)
- `../../index.js` (livinityd self-import — type-only)

Token refresh uses Node 22 builtin `fetch()` — no new dep. router.ts adds two broker-internal imports.

`pnpm-lock.yaml` unchanged this wave.

## Decisions Made

- **SDK-direct over hand-rolled HTTP-proxy.** Wave 0's RED test asserts `expect(Anthropic).toHaveBeenCalledWith(...)`. The plan's `<interfaces>` block + must_haves specify `new Anthropic({authToken})`. Wave 1's smoke gate verified the SDK's auth header construction. SDK-direct is the contract.
- **Generic `tryRefreshAndRetry<T>` helper** parameterized over the retry function so sync (`messages.create`) and stream (`messages.stream().finalMessage()`) paths share one 401-handling code block.
- **Pre-existing TS warnings out of scope.** `tsc --noEmit` surfaces a pre-existing `@nexus/core` `AgentResult` import error in router.ts:2 / openai-router.ts:3 that was present in commit `cdd34445` (Phase 45) before any Wave 2 edits. Out of Wave 2 scope per scope boundary rule. New Wave 2 files (passthrough-handler.ts) generate ZERO new TS errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Wave 0 makeRes() mock did not propagate state mutations to res object**
- **Found during:** Task 1, first vitest run after creating passthrough-handler.ts
- **Issue:** Wave 0's `passthrough-handler.test.ts` `makeRes()` helper used `Object.assign(res, captured)` — this snapshot-copies `_status: 200`, `_body: undefined`, etc. as own properties on `res` AT CONSTRUCTION TIME. The `res.status()` and `res.json()` methods then write to the closure-bound `captured` object, NOT to `res`. So tests reading `res._status` and `res._body` always saw stale defaults. Two of 8 tests failed: "missing subscription" expected 401, got 200; "sync response forwarded verbatim" expected SAMPLE_MESSAGE, got undefined.
- **Fix:** Restructured `makeRes()` so `_status`, `_body`, `_headers`, `_writes`, `_ended` live ON `res` directly, and the methods write `res._status = code`, `res._body = body`, etc. Same shape, same fields, same assertions — just actually mutates `res`. Also added `res.set(headers)` for completeness (router.ts dispatch uses `.setHeader()` so it didn't trigger this path, but defensive).
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` (mock helper only — assertions unchanged)
- **Verification:** All 8 passthrough-handler.test.ts cases now consistently GREEN.
- **Committed in:** `364a723b` (Task 1 commit, alongside passthrough-handler.ts)
- **Security check:** Same posture as Wave 1's mock-restoration fix — the fix does NOT remove any vi.mock() guard, both `@anthropic-ai/sdk` and `./credential-extractor.js` remain mocked, no real network call or real credential read happens during tests. No real-credential-leak surface introduced.
- **D-NO-NEW-DEPS audit:** Still GREEN.

---

**Total deviations:** 1 auto-fixed (1 Wave 0 test bug). Both prior waves had similar Wave 0 mock-bug auto-fixes (Wave 1's `vi.restoreAllMocks()` issue) — pattern repeats: Wave 0 RED tests can't surface mock bugs because they fail at the import-load stage; the bugs only manifest when an implementation exists.

**Impact on plan:** Zero scope creep. Test mock fix is mechanical; the assertions remain authoritative.

## Issues Encountered

- **Pre-existing TS error in router.ts (`AgentResult` import).** `tsc --noEmit` flags `Module '"@nexus/core"' has no exported member 'AgentResult'` on router.ts:2 and openai-router.ts:3. Verified via `git show HEAD~2:livos/.../router.ts | head` that this import was present BEFORE any Wave 2 edits (introduced in commit `cdd34445`, Phase 45). Out of Wave 2 scope. Logged as deferred-item context for a future @nexus/core export audit. No new TS errors introduced by Wave 2.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` exists (227 LOC, ≥120 required)
- [x] Exports `passthroughAnthropicMessages` (grep matches)
- [x] Imports `Anthropic from '@anthropic-ai/sdk'` (grep matches)
- [x] Constructs client with `authToken: token.accessToken` (NOT `apiKey`) (grep matches)
- [x] Sets `'anthropic-version': '2023-06-01'` default header (grep matches)
- [x] Imports `readSubscriptionToken` from `./credential-extractor.js`
- [x] Imports `UpstreamHttpError` from `./agent-runner-factory.js`
- [x] Imports `AnthropicMessagesRequest` type from `./types.js`
- [x] **Pitfall 1 enforced:** `! grep -E '@nexus/core|sdk-agent-runner|claude-agent-sdk' passthrough-handler.ts` → zero matches
- [x] 401 + actionable error: `authentication_error` + `Settings > AI Configuration` substrings present
- [x] 429 forwarding: `retry-after` present in mapApiError
- [x] SSE event sequence: `message_start`, `content_block_delta`, `message_stop` all present
- [x] Token-refresh helper present: `refresh_token` POST to platform.claude.com/v1/oauth/token
- [x] Wave 0 passthrough-handler.test.ts: 8/8 GREEN
- [x] Wave 1 mode-dispatch.test.ts + credential-extractor.test.ts: 19/19 GREEN (regression check)
- [x] router.ts contains `import {resolveMode}` + `import {passthroughAnthropicMessages}`
- [x] router.ts contains `const mode = resolveMode(req)` + `if (mode === 'passthrough')` + `passthroughAnthropicMessages({...userId: auth.userId...})`
- [x] router.ts existing `Per D-41-14` warn comment preserved (agent path unchanged)
- [x] router.ts diff: +39 / -0 (within 25-40 expected range, 0 deletions)
- [x] No new TS errors in Wave 2 files (router.ts AgentResult error is pre-existing; passthrough-handler.ts compiles clean)
- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan
- [x] `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` is empty
- [x] No edits to any file under `nexus/packages/core/src/`
- [x] Both task commits exist: `364a723b` (Task 1), `f48f6827` (Task 2)

## Next Phase Readiness

- **Wave 3 (Plan 57-04) UNBLOCKED.** OpenAI route gets the same dispatch treatment. Wave 3 author should:
  - Either reuse `resolveMode(req)` + add a sibling `passthroughOpenAIChatCompletions({...})` handler in `passthrough-handler.ts` (or a sibling `openai-passthrough-handler.ts`) following the same Pattern as Wave 2.
  - Or wire openai-router.ts's `/:userId/v1/chat/completions` POST to translate Anthropic→OpenAI body and call the existing `passthroughAnthropicMessages` then translate response back. Plan 57-04 will pick.
  - Insert mode dispatch into `openai-router.ts` mirroring Wave 2's router.ts edit.
- **Wave 4 (Plan 57-05) — REGRESSION FLAG:** `integration.test.ts` and `openai-integration.test.ts` use bare `node:assert/strict` (not vitest) and currently send no `X-Livinity-Mode` header — they will route to passthrough mode and likely fail because the test fixture doesn't have a per-user `~/.claude/.credentials.json` (passthrough returns 401). **Wave 4 fix:** inject `X-Livinity-Mode: agent` header in every test request so the existing assertions exercise the agent path. Do NOT change the assertions themselves.
- **Phase 58 hand-off:** SSE pass-through is **transitional aggregate-then-restream** in Wave 2. Phase 58 should swap the `await stream.finalMessage()` block in `passthrough-handler.ts` for `for await (const event of client.messages.stream(...)) { res.write(`event: ${event.type}\\ndata: ${JSON.stringify(event)}\\n\\n`) }` with proper backpressure handling.
- **Phase 63 hand-off:** Token-refresh path is wired but not live-tested. Phase 63 should issue a real expired-token request to verify the refresh POST to platform.claude.com works against the real OAuth server.

## Threat Flags

None — Wave 2 introduces no new network endpoints beyond the planned api.anthropic.com forward (which IS the entire purpose of the wave) and no new auth surfaces. The threat surface scan confirms:
- `passthrough-handler.ts`: forwards body to api.anthropic.com via SDK (planned) + POSTs to platform.claude.com/v1/oauth/token on refresh (planned, in `<threat_model>`).
- `router.ts`: branches existing handler based on header parser; no new routes, no new middleware.

All threats T-57-08 / T-57-09 / T-57-10 / T-57-11 / T-57-12 from the plan's `<threat_model>` are mitigated as specified:
- **T-57-08 (body mutation):** Mitigated. `upstreamBody = {model, max_tokens, system, messages, tools}` is a NEW object literal; `body` argument never mutated.
- **T-57-09 (token leak in error log):** Mitigated. `mapApiError` reads `err.message` + `err.status` + `err.headers['retry-after']` only — never echoes full `err.headers`.
- **T-57-10 (sacred file edit via accidental import):** Mitigated. Grep audit clean.
- **T-57-11 (per-user identity bleed):** Mitigated. `auth.userId` from existing `resolveAndAuthorizeUserId()` flows to `readSubscriptionToken({userId})`; no cross-user state.
- **T-57-12 (header injection):** Accepted. `resolveMode()` accepts only literal "agent" (case-insensitive trim); any other value → passthrough default.

---
*Phase: 57-passthrough-mode-agent-mode*
*Completed: 2026-05-02*
