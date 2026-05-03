---
phase: 61
plan: 01
subsystem: livinity-broker/providers
tags:
  - broker
  - provider-interface
  - anthropic
  - phase-61
  - wave-1
dependency_graph:
  requires:
    - "Phase 57: passthrough-handler.ts (Anthropic + OpenAI handlers — refactor target)"
    - "Phase 58: clientFactory test seam + fake-anthropic-sse-server fixture (preserved verbatim)"
    - "@anthropic-ai/sdk@^0.80.0 (already in livinityd deps; .withResponse() accessor)"
  provides:
    - "BrokerProvider TypeScript interface (livinity-broker/providers/interface.ts)"
    - "AnthropicProvider concrete class implementing BrokerProvider (livinity-broker/providers/anthropic.ts)"
    - "providers/registry.ts — Map<string, BrokerProvider> + getProvider() helper (Anthropic only in Wave 1)"
    - "Phase 61 Wave 4 insertion-point markers in passthrough-handler.ts (sync + streaming, both routes — total 6 markers)"
  affects:
    - "livinity-broker/passthrough-handler.ts — both passthroughAnthropicMessages + passthroughOpenAIChatCompletions now dispatch through provider"
    - "livinity-broker/passthrough-handler.test.ts — vi.mock SDK wrapper updated to expose .withResponse() so existing tests work with new dispatch path"
tech_stack:
  added: []
  patterns:
    - "BrokerProvider interface — pluggable contract; LiteLLM-style per-provider class layout"
    - ".withResponse() pattern (Anthropic SDK v0.80+) — exposes upstream Web Fetch Headers for Wave 4 rate-limit forwarding"
    - "ProviderRequestOpts.clientOverride — type-erased opt-in for SDK client injection (preserves Phase 58 Wave 0 fake-server test seam without leaking SDK type into provider interface)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/interface.ts (113 LOC) — BrokerProvider + ProviderRequestParams + ProviderRequestOpts (with clientOverride) + ProviderResponse + ProviderStreamEvent + ProviderStreamResult + UsageRecord + NotImplementedError"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts (84 LOC) — AnthropicProvider implements BrokerProvider; request + streamRequest use .withResponse(); private makeClient with anthropic-version 2023-06-01 default header"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/registry.ts (27 LOC) — providers Map + getProvider helper"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/interface-compile.test.ts (88 LOC) — tsc --noEmit smoke gate scoped to providers/ files only"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/anthropic.test.ts (137 LOC) — 5 tests for request/streamRequest/translateUsage with mocked SDK"
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (+60 LOC, -38 LOC) — both handlers dispatch via getProvider('anthropic'); 6× Phase 61 Wave 4 placeholder comments at sync + streaming insertion points"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts (+45 LOC) — vi.mock('@anthropic-ai/sdk') wrapper now exposes .withResponse() returning {data, response: {headers}}; underlying mockResolvedValue auto-shaped"
decisions:
  - "BrokerProvider interface includes ProviderRequestOpts.clientOverride: unknown — preserves Phase 58 Wave 0 fake-server test seam without forcing the provider interface to import @anthropic-ai/sdk types (keeps interface.ts dependency-pure)"
  - "AnthropicProvider request/streamRequest skip second-arg request options when no AbortSignal present — preserves single-arg shape that existing passthrough-handler.test.ts assertions match against"
  - "interface-compile.test.ts scope-narrows to ONLY 3 providers/ files (not the full livinityd package) — Rule 3 scope boundary; livinityd has unrelated pre-existing tsc errors out of plan scope"
  - "Sacred file SHA 4f868d318abff71f8c8bfbcf443b2393a553018b byte-identical pre + post — D-30-07 strictly preserved"
  - "D-NO-NEW-DEPS preserved — zero new npm packages added; @anthropic-ai/sdk@^0.80.0 already in livinityd deps from Phase 57"
metrics:
  duration_minutes: 15
  completed: "2026-05-03"
  task_count: 3
  file_count_created: 5
  file_count_modified: 2
---

# Phase 61 Plan 01: BrokerProvider Interface + AnthropicProvider Concrete + passthrough-handler.ts Refactor Summary

**One-liner:** Extracted Phase 57 passthrough handler's inline `client.messages.create(...)` calls behind a pluggable `BrokerProvider` interface — Anthropic concrete impl uses `.withResponse()` to expose upstream Web Fetch Headers for Wave 4 rate-limit forwarding, and `passthrough-handler.ts` now dispatches via `getProvider('anthropic')` with byte-identical wire behavior (94 baseline broker tests still GREEN).

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Wave 0 RED tests for interface compile + AnthropicProvider unit (mocked SDK) | Y | `e753374c` |
| 2 | Define BrokerProvider interface + AnthropicProvider concrete + registry — turn Wave 0 GREEN | Y | `c79928d8` |
| 3 | Refactor Phase 57 passthrough-handler.ts to dispatch via getProvider('anthropic') — behavior-preserving | Y | `e87bbacd` |

## BrokerProvider Interface — Key Method Signatures

`livos/packages/livinityd/source/modules/livinity-broker/providers/interface.ts`

```typescript
export interface BrokerProvider {
  readonly name: string
  request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse>
  streamRequest(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderStreamResult>
  translateUsage(response: ProviderResponse): UsageRecord
}

export type ProviderResponse = { raw: unknown; upstreamHeaders: Headers }
export type ProviderStreamResult = { stream: AsyncIterable<ProviderStreamEvent>; upstreamHeaders: Headers }
export type ProviderRequestOpts = { authToken: string; signal?: AbortSignal; clientOverride?: unknown }
export type UsageRecord = { promptTokens: number; completionTokens: number; totalTokens: number }
export class NotImplementedError extends Error { /* Plan 02 stubs throw this */ }
```

## Anthropic Concrete Implementation

`livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts`

- `AnthropicProvider implements BrokerProvider`
- `request()` and `streamRequest()` both invoke `client.messages.create({...}).withResponse()` so `result.upstreamHeaders` is a Web Fetch `Headers` instance — Wave 4 reads `anthropic-ratelimit-*` from it.
- Private `makeClient(authToken)` constructs `new Anthropic({authToken, defaultHeaders: {'anthropic-version': '2023-06-01'}})` — matches Phase 57's `makeClient` byte-for-byte.
- Skips second-arg request options when no `AbortSignal` present — preserves single-arg `messagesCreate(body)` shape that existing passthrough tests assert.
- `translateUsage()` maps `usage.input_tokens` / `output_tokens` → canonical `{promptTokens, completionTokens, totalTokens}`; graceful zero-fallback on missing/partial usage.

## passthrough-handler.ts Refactor

`livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts`

| Branch | Lines | Before | After |
|--------|-------|--------|-------|
| `passthroughAnthropicMessages` sync | 173-202 | `await client.messages.create(upstreamBody as any)` → `res.json(response)` | `await provider.request(upstreamBody, {authToken, clientOverride})` → `res.json(result.raw)` |
| `passthroughAnthropicMessages` streaming | 217-260 | `await client.messages.create({...upstreamBody, stream: true})` → forward async iterator | `await provider.streamRequest(upstreamBody, {...})` → forward `result.stream` |
| `passthroughOpenAIChatCompletions` sync | 568-589 | `await client.messages.create(anthropicBody as any)` → `buildOpenAIChatCompletionResponse(response, ...)` | `await provider.request(anthropicBody, {...})` → `buildOpenAIChatCompletionResponse(result.raw, ...)` |
| `passthroughOpenAIChatCompletions` streaming | 504-540 | `await client.messages.create({...anthropicBody, stream: true})` → translator | `await provider.streamRequest(anthropicBody, {...})` → translator(result.stream) |

**Wave 4 insertion-point markers** (6 total):
- Sync Anthropic: line 219 (`forwardAnthropicHeaders(result.upstreamHeaders, res) before res.json below`)
- Streaming Anthropic: line 188 (`forwardAnthropicHeaders... — MUST precede flushHeaders below`) + line 213 (`Phase 61 Wave 4 read site` — `void result.upstreamHeaders`)
- Sync OpenAI: line 591 (`translateAnthropicToOpenAIHeaders(result.upstreamHeaders, res) before res.json below`)
- Streaming OpenAI: line 481 (`translateAnthropicToOpenAIHeaders... — MUST precede flushHeaders below`) + line 522 (`Phase 61 Wave 4 read site`)

**No-behavior-change confirmed by 100/100 broker tests still GREEN** (94 pre-Plan-01 baseline + 6 new Wave 0 tests from Tasks 1+2). The 13-test Phase 58 streaming integration suite (`passthrough-streaming-integration.test.ts`) runs over real TCP loopback against the fake-anthropic-sse-server with the REAL Anthropic SDK — it proves `.withResponse()` works wire-end-to-end including 5-run determinism.

## Sacred File Integrity

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # MATCH — byte-identical pre + post
```

D-30-07 strictly preserved.

## Commits Created

| SHA | Subject |
|-----|---------|
| `e753374c` | `test(61-01): wave 0 RED tests for BrokerProvider interface + AnthropicProvider` |
| `c79928d8` | `feat(61-01): BrokerProvider interface + AnthropicProvider concrete + registry` |
| `e87bbacd` | `refactor(61-01): dispatch passthrough-handler.ts via getProvider('anthropic')` |

## D-NO-NEW-DEPS Audit

GREEN. Zero new npm packages added. `@anthropic-ai/sdk@^0.80.0` already present in `livos/packages/livinityd/package.json:60` (added by Phase 57 Wave 1 as a workspace-level reachability declaration).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Scope-narrowed `interface-compile.test.ts` to only providers/ files**
- **Found during:** Task 1 → Task 2 verify
- **Issue:** Plan called for `tsc --noEmit` over the full livinityd package as the typecheck gate. livinityd has many pre-existing tsc errors (e.g., `agent-runner-factory.ts` referencing not-yet-exported nexus types, `user/routes.ts` ctx narrowing) unrelated to this plan. Running tsc whole-package would always fail and never give a useful signal about providers/ correctness.
- **Fix:** Test now invokes `tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --strict --esModuleInterop --skipLibCheck` over JUST the 3 providers/ files passed as positional args. Resolves the local `tsc.CMD` binary directly from `node_modules/.bin/` (npx probe failed inside vitest's child shell with "this is not the tsc command you are looking for"). Plan 02 will append openai/gemini/mistral stubs to the file list.
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/interface-compile.test.ts`
- **Commit:** `c79928d8`

**2. [Rule 3 - Behavior-preserving requirement] Preserved `clientFactory` test seam (Phase 58 Wave 0)**
- **Found during:** Task 3 (refactor)
- **Issue:** The plan said to delete `import Anthropic from '@anthropic-ai/sdk'` from `passthrough-handler.ts`. But `PassthroughOpts.clientFactory: (token) => Anthropic` and `OpenAIPassthroughOpts.clientFactory: (token) => Anthropic` are Phase 58 Wave 0 test seams used by `passthrough-streaming-integration.test.ts` to inject an Anthropic SDK instance pointing at the fake-anthropic-sse-server (via `baseURL`). Removing the import would force these tests to break, violating the plan's own "Phase 57 integration tests still pass without modification" mandate.
- **Fix:** Added `ProviderRequestOpts.clientOverride: unknown` (type-erased to keep the provider interface dependency-pure). Provider checks `opts.clientOverride` first before constructing its own client. `passthrough-handler.ts` calls `opts.clientFactory(token)` and forwards via `clientOverride`. Single `import Anthropic from '@anthropic-ai/sdk'` retained ONLY for the type signature of the test seam — production SDK construction is gone (now lives inside provider).
- **Files modified:** `providers/interface.ts`, `providers/anthropic.ts`, `passthrough-handler.ts`
- **Commit:** `e87bbacd`

**3. [Rule 3 - Test compatibility] Updated vi.mock wrapper in `passthrough-handler.test.ts` to expose `.withResponse()`**
- **Found during:** Task 3 (refactor)
- **Issue:** Existing test mock returned values directly from `messagesCreate(...)`. After refactor, the provider invokes `client.messages.create({...}).withResponse()` — the mock-returned object had no `.withResponse()` method, so all 22 passthrough-handler.test.ts tests started failing with `TypeError: ...withResponse is not a function`.
- **Fix:** vi.mock wrapper now returns an APIPromise-shaped object with `.withResponse() → {data, response: {headers}}` (per Anthropic SDK contract from RESEARCH.md §SDK .withResponse() Pattern). The existing `messagesCreate.mockResolvedValue(X)` calls keep working — wrapper auto-shapes X into the `{data, response}` envelope. Wrapper is also `.then`-able for any straggler bare-await. `messagesCreateHeaders` state lets future Wave 4 tests inject custom Headers (default empty).
- **Files modified:** `passthrough-handler.test.ts` (+45 LOC; ZERO test assertions changed — only the mock implementation)
- **Commit:** `e87bbacd`

**4. [Rule 3 - SDK arity preservation] Provider only passes second-arg request options when AbortSignal present**
- **Found during:** Task 3 (after mock fix)
- **Issue:** First refactor attempt always passed `requestOpts` (often `undefined`) as the second arg to `client.messages.create(body, requestOpts)`. Existing tests asserting `messagesCreate.toHaveBeenCalledWith(expect.objectContaining(...))` (single positional) failed with "expected 1 arg, got 2".
- **Fix:** Provider now ternary-splits — `opts.signal ? client.messages.create(body, {signal}) : client.messages.create(body)`. Preserves single-arg shape when no signal, two-arg when signal present.
- **Files modified:** `providers/anthropic.ts`
- **Commit:** `e87bbacd`

**5. [Rule 3 - Done-criteria deviation, justified] `import Anthropic from` count is 1, not 0 as plan said**
- **Found during:** Task 3 done-check
- **Issue:** Plan acceptance criteria said `grep -c "import Anthropic from" passthrough-handler.ts` returns 0. Actual: 1.
- **Reason:** Required for `PassthroughOpts.clientFactory: (token: SubscriptionToken) => Anthropic` and `OpenAIPassthroughOpts.clientFactory: (token: SubscriptionToken) => Anthropic` type signatures (Phase 58 Wave 0 test seam — see Deviation 2). Removing it would break 13 streaming integration tests, violating the plan's own primary success criterion (`Phase 57 integration tests still pass`). PRODUCTION SDK construction is gone — only type-level reference remains.
- **Files modified:** None (this is a meta-deviation about the import that Deviation 2 explicitly justifies retaining)

### Auth Gates

None encountered — all work was local code + tests, no SSH, no live API.

## Wave 0 → Wave 1 Test Trajectory

| Stage | Wave 0 tests | Baseline broker tests | Total |
|-------|--------------|----------------------|-------|
| Pre-plan baseline | 0/0 | 94/94 GREEN | 94 |
| After Task 1 (RED tests added) | 0/6 (all RED — no implementation) | 94/94 | 94 |
| After Task 2 (interface + anthropic + registry land) | 6/6 GREEN | 94/94 GREEN | 100 |
| After Task 3 (refactor + mock update) | 6/6 GREEN | 94/94 GREEN | **100/100** |

**Phase 58 streaming integration determinism gate:** 5 consecutive runs of `passthrough-streaming-integration.test.ts` Group B test all emit ≥3 distinct `content_block_delta` events at ≥50ms apart timestamps — preserved through the refactor.

## Hand-off

### To Plan 02 (Wave 2 — provider stubs)

- `providers/registry.ts` Map currently seeded with ONLY `'anthropic' → new AnthropicProvider()`. Plan 02 will append entries for `'openai'`, `'gemini'`, `'mistral'`.
- `providers/{openai-stub,gemini-stub,mistral-stub}.ts` stub classes — implement `BrokerProvider` interface with all methods throwing `NotImplementedError(name)` (already exported from `providers/interface.ts`).
- Plan 02 must add the new stub files to `providers/__tests__/interface-compile.test.ts`'s `files` array so they're typecheck-gated.
- Plan 02's grep-guard test: assert no production code (router.ts, handlers, etc.) calls `getProvider('openai'|'gemini'|'mistral')` — current grep already returns 0.

### To Plan 04 (Wave 4 — rate-limit header forwarding)

- `result.upstreamHeaders` is reachable from BOTH passthrough handlers at FOUR call sites (sync + streaming × Anthropic + OpenAI). Each call site has a `Phase 61 Wave 4` placeholder comment marking the exact insertion point.
- Streaming branches: `forwardAnthropicHeaders(result.upstreamHeaders, res)` MUST be inserted ABOVE `res.flushHeaders()` (already marked with explicit `MUST precede flushHeaders below` comment) — Pitfall 1 / Pitfall R9 protection.
- Sync branches: insert before `res.json(...)` — `setHeader` works any time before `res.json()` flushes.
- OpenAI route uses `translateAnthropicToOpenAIHeaders(...)` (Plan 04's translator); Anthropic route uses `forwardAnthropicHeaders(...)` (verbatim forward).
- Test-injection seam ready: `passthrough-handler.test.ts` mock now exposes `setMessagesCreateHeaders(headers)` so Wave 4 unit tests can inject `Headers({'anthropic-ratelimit-requests-remaining': '59', ...})` and assert downstream `res._headers` contains the forwarded values.

## Self-Check: PASSED

**Files exist:**
- `livos/packages/livinityd/source/modules/livinity-broker/providers/interface.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/registry.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/interface-compile.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/anthropic.test.ts` — FOUND

**Commits exist:**
- `e753374c` — FOUND
- `c79928d8` — FOUND
- `e87bbacd` — FOUND

**Sacred file SHA:**
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` — MATCH (byte-identical to pre-plan baseline)
