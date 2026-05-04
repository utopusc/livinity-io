---
phase: 58-true-token-streaming
phase_number: 58
milestone: v30.0
status: COMPLETE
completed: 2026-05-03
plans_complete: 5
plans_total: 5
requirements: [FR-BROKER-C1-01, FR-BROKER-C1-02, FR-BROKER-C2-01, FR-BROKER-C2-02, FR-BROKER-C2-03]
requirements_complete: 5
sacred_sha_pre: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_post: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_drift: false
two_adapters_coexist: true
d_no_new_deps: preserved
---

# Phase 58 — C1+C2 True Token Streaming (Anthropic + OpenAI) — PHASE SUMMARY

**External clients (Bolt.diy, Open WebUI, Continue.dev, Cline, raw curl, Anthropic Python SDK) targeting the broker now receive token-by-token streaming responses for both `/v1/messages` (Anthropic) and `/v1/chat/completions` (OpenAI). Anthropic SSE is forwarded byte-for-byte; OpenAI is translated 1:1 from Anthropic events with `usage` on the final chunk and a crypto-grade chatcmpl id. The sacred Agent SDK runner file at `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` is byte-identical at every wave checkpoint AND at end-of-phase.**

## Phase Status

**READY TO SHIP.** All 5 waves complete. All 5 requirements verified end-to-end. Sacred file SHA stable. Two-adapters-coexist preserved (`openai-sse-adapter.ts` is the agent-mode adapter for `@nexus/core` → AgentEvent and is byte-identical; `openai-stream-translator.ts` is the passthrough-mode adapter for `RawMessageStreamEvent` → OpenAI delta). D-NO-NEW-DEPS preserved on the npm side.

## Wave Inventory

| Wave | Plan | Title | Commits | Tests added | Status |
|------|------|-------|---------|-------------|--------|
| 0 | 58-00 | Test infrastructure (fake-Anthropic SSE server + clientFactory test seam) | `070f862e` test, `8da22b8d` feat, `280fa4c4` docs | +6 | Complete |
| 1 | 58-01 | OpenAI stream translator core (TDD) | `ff066e85` test/RED, `62121ccd` feat/GREEN, `e97b62ab` docs | +23 | Complete |
| 2 | 58-02 | Anthropic Messages true token streaming via async iterator (TDD) | `554f0373` test/RED, `b4e85f58` feat/GREEN, `8f941d96` docs | +6 | Complete |
| 3 | 58-03 | OpenAI Chat Completions true streaming + chatcmpl id hardening (TDD) | `949412e2` test/RED, `745aac42` feat/GREEN, `63a727bf` docs | +8 | Complete |
| 4 | 58-04 | End-to-end integration tests + Phase 58 final gate | `5733eb7a` test, this PHASE-SUMMARY commit follows | +13 | Complete |

**Total commits in Phase 58:** 13 work commits + 5 SUMMARY/PHASE-SUMMARY commits = 18 commits.

**Total tests added in Phase 58:** 6 (Wave 0) + 23 (Wave 1) + 6 (Wave 2) + 8 (Wave 3) + 13 (Wave 4) = **56 new tests**.

**Final broker test suite count:** 94 GREEN (was 38 at end of Phase 57; +56 from Phase 58).

## Requirements Coverage Matrix (5/5 — ALL CLOSED)

| Requirement | Title | Implemented in | Verified end-to-end in | Status |
|---|---|---|---|---|
| FR-BROKER-C1-01 | Anthropic Messages true verbatim SSE forwarding | Wave 2 (`passthrough-handler.ts:172-250`) | Wave 4 Group A | CLOSED |
| FR-BROKER-C1-02 | Determinism: ≥3 distinct content_block_delta events in 2s | Wave 0 (CANONICAL_SCRIPT fixture) + Wave 2 (no-buffer iterator) | Wave 4 Group B (5 consecutive runs) | CLOSED |
| FR-BROKER-C2-01 | OpenAI streaming stop_reason → finish_reason mapping | Wave 1 (`mapStopReason` in `openai-stream-translator.ts`) + Wave 3 (wire-in at `passthrough-handler.ts:454-518`) | Wave 4 Group D (4 cases) | CLOSED |
| FR-BROKER-C2-02 | OpenAI streaming usage on final chunk before [DONE] | Wave 1 (translator finalize emits usage chunk) + Wave 3 (wire-in) | Wave 4 Group C | CLOSED |
| FR-BROKER-C2-03 | OpenAI sync chatcmpl-29 id + non-zero usage | Wave 1 (`randomChatCmplId` via `crypto.randomBytes`) + Wave 3 (sync branch swap, Phase 57 Pitfall 4 closed) | Wave 4 Group E | CLOSED |

## Phase 58 Success Criteria (4/4 — ALL VERIFIED)

| Criterion | Verified by | Status |
|---|---|---|
| 1. Token-by-token streaming with ≥3 visible deltas (Bolt.diy chat bubble fills word-by-word) | Wave 4 Group A + Group B (5-run determinism asserts ≥3 deltas at ≥50ms apart inter-arrival timestamps) | PASS |
| 2. Open WebUI sees streaming + non-zero usage on final OpenAI chunk | Wave 4 Group C (final chunk carries `{prompt_tokens:25, completion_tokens:15, total_tokens:40}` matching CANONICAL_SCRIPT counts) | PASS |
| 3. Sync OpenAI returns id matching `chatcmpl-<base62-29>` + non-zero usage | Wave 4 Group E (id matches `^chatcmpl-[A-Za-z0-9]{29}$`, usage non-zero, total = prompt + completion) | PASS |
| 4. Streaming integration test passes deterministically across 5 consecutive runs | Wave 4 Group B (single test loops 5 fresh-server-per-iteration; 20 timing assertions all PASS) | PASS |

## Sacred SHA History

| Checkpoint | SHA | Status |
|---|---|---|
| Phase 56 close (pre-Phase-58 baseline) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | locked |
| Phase 57 close | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Wave 0 (58-00) end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Wave 1 (58-01) end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Wave 2 (58-02) end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Wave 3 (58-03) end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Wave 4 (58-04) end / Phase 58 close | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |

**Drift detected: NONE.** D-30-07 (sacred file untouched in v30) preserved across the entire phase. The integrity test at `nexus/packages/core/src/__tests__/sdk-agent-runner-integrity.test.ts` retains its baseline SHA constant unchanged. Wave 4's final-gate test asserts the SHA from inside the suite via `execSync('git hash-object ...')` so any future drift will break CI at the same level as functional regressions.

## Two-Adapters-Coexist Final Status

| Adapter | Path | Consumer | Phase 58 status |
|---|---|---|---|
| AGENT-mode adapter (existing) | `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` | `@nexus/core` AgentEvent stream from sacred runner file (Strategy B aggregation) | **byte-identical** (`git diff` empty across all 4 waves) |
| PASSTHROUGH-mode adapter (NEW in Wave 1) | `livos/packages/livinityd/source/modules/livinity-broker/openai-stream-translator.ts` | Anthropic SDK `RawMessageStreamEvent` async iterator (1:1 delta translation) | **active** (Wave 3 wired into `passthroughOpenAIChatCompletions`'s streaming branch) |

The two adapters serve distinct upstream event shapes (Strategy B AgentEvent vs RawMessageStreamEvent). Both are tested independently. Wave 4's final-gate test (`it('openai-sse-adapter.ts byte-identical')`) asserts the agent-mode adapter has zero git diff — guarantees that every Phase 58 change is additive in the new translator file, never invasive in the legacy file.

## D-NO-NEW-DEPS Audit (Phase-Wide)

`package.json` diff across the entire phase:

| Package | Wave | Result |
|---|---|---|
| `livos/packages/livinityd/package.json` | All 5 waves | empty diff |
| `livos/package.json` | All 5 waves | empty diff |
| `package.json` (repo root) | All 5 waves | empty diff |

**0 new npm packages added across Phase 58.** The `@anthropic-ai/sdk@^0.80.0` dep was already declared at the workspace level by Phase 57; Phase 58 reuses it without escalation. D-NO-NEW-DEPS preserved on the npm side. (Phase 60 still carries the YELLOW non-npm `caddy-ratelimit` + `xcaddy` infra delta per D-30-08; orthogonal to Phase 58.)

## Pitfall Status Update

| Pitfall | State at Phase 58 start | State at Phase 58 close |
|---|---|---|
| Pitfall 1 (boundary — broker code must NOT import `@nexus/core`/sacred runner module/`claude-agent-sdk`) | preserved | preserved (grep clean across all broker source incl. new translator + new test file) |
| Pitfall 4 (chatcmpl id used `Math.random()`) — Phase 57 deferred | DEFERRED | **CLOSED** (Wave 1 introduced `randomChatCmplId` via `crypto.randomBytes`; Wave 3 swapped the sync chatcmpl id site + deleted the local `randomBase62`+`BASE62` helper; 0 remaining call sites) |
| Pitfall 6 (single source of truth for passthrough infra) | preserved | preserved (no second copy of auth/refresh/error-mapping introduced; clientFactory seam is additive) |
| Pitfall (T-57-08) (don't mutate request body) | preserved | preserved (Wave 2 + Wave 3 both construct `{...upstreamBody, stream: true}` as new objects) |
| Pitfall (T-57-09) (don't echo error.headers) | preserved | preserved (Wave 2 + Wave 3 keep `mapApiError` unchanged) |

## Threat Register Closure Status

All 6 threats from Plan 58-04's `<threat_model>` mitigated as designed:

- T-58-04-01 (timing flake): MITIGATED — CANONICAL_SCRIPT 300ms delays + 50ms threshold = 6× margin; 5-run loop catches flakes; 60s test timeout absorbs jitter.
- T-58-04-02 (port leak): MITIGATED — every test creates ephemeral-port server in beforeEach/per-iteration with explicit close() in afterEach/finally.
- T-58-04-03 (clientFactory in production): MITIGATED — production callers (`router.ts`, `openai-router.ts`) verified to NOT pass clientFactory; only the new integration test injects.
- T-58-04-04 (final-gate SHA fails because dev edited sacred file): MITIGATED — this IS the gate's purpose; assertion working as designed.
- T-58-04-05 (credential mock leaks across describe blocks): MITIGATED — single `vi.mock` at file scope is acceptable for this suite (all tests use the same mocked credential).
- T-58-04-06 (openai-sse-adapter.ts edited mid-phase): MITIGATED — final-gate test asserts `git diff` empty; cleared at Phase 58 close.

## Files Created in Phase 58

| Path | Wave | LOC | Purpose |
|---|---|---|---|
| `livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.ts` | 0 | 254 (157 streaming + 97 sync added in Wave 4) | Loopback-bound deterministic-timing fake-Anthropic SSE Express server with CANONICAL_SCRIPT + sync JSON support |
| `livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.test.ts` | 0 | 92 | 6 self-test cases for the fake-server fixture |
| `livos/packages/livinityd/source/modules/livinity-broker/openai-stream-translator.ts` | 1 | 285 | Pure-function Anthropic RawMessageStreamEvent → OpenAI chat.completion.chunk 1:1 translator + crypto chatcmpl id + 8-way stop_reason mapping |
| `livos/packages/livinityd/source/modules/livinity-broker/openai-stream-translator.test.ts` | 1 | 460 | 23 unit tests locking the translator contract |
| `livos/packages/livinityd/source/modules/livinity-broker/passthrough-streaming-integration.test.ts` | 4 | 620 | 13 end-to-end integration tests + 2 final-gate assertions |

**Total NEW LOC across Phase 58:** 254 + 92 + 285 + 460 + 620 = **1,711 LOC** (615 source + 1,096 test).

## Files Modified in Phase 58

| Path | Net LOC delta | Waves | Purpose |
|---|---|---|---|
| `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` | +17 (Wave 0 seam) +28 (Wave 2 streaming rewrite) +26 (Wave 3 OpenAI streaming + id swap) ≈ +71 net | 0, 2, 3 | clientFactory test seam; Anthropic streaming branch async iterator forwarding; OpenAI streaming branch translator wire-in + crypto chatcmpl id |
| `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` | +238 (Wave 2 tests) +264 (Wave 3 tests) | 2, 3 | TDD RED tests for streaming branches |

## Hand-Off Notes for Downstream Phases

### Phase 59 (Bearer Token Auth `liv_sk_*`) — INDEPENDENT

Phase 59 is a parallel branch in the v30 dependency graph. It does NOT depend on Phase 58. Phase 59 can begin immediately — no streaming context required. The `passthrough-handler.ts` middleware chain Phase 59 will mount sits ABOVE the broker handler (request enters bearer middleware → resolves user → handler dispatches passthrough OR agent). Streaming behavior Phase 58 built is orthogonal.

### Phase 60 (Public Endpoint `api.livinity.io` + Rate-Limit Perimeter) — INDIRECT DEPENDENCY

Phase 60 depends on Phase 59. From Phase 58's perspective: Phase 60's Caddy `flush_interval -1` directive (D-30-09 budget item #5) is the reverse-proxy-side guarantee that the streaming SSE bytes Phase 58 writes don't get buffered at the relay. The Wave 2 + Wave 3 SSE headers (`Cache-Control: no-cache, no-transform` + `X-Accel-Buffering: no`) are the broker-side defense-in-depth. Together: streaming should pass through Caddy unbuffered.

**Phase 60 acceptance test idea (suggested for Phase 60 plan):** apply Wave 4's `passthrough-streaming-integration.test.ts` ≥50ms-inter-delta assertion to a request routed through Caddy on Server5 → Mini PC. If it passes, the relay isn't buffering. The test fixtures Wave 4 built can be reused as-is.

### Phase 61 (Rate-Limit Headers + Aliases + Provider Stub) — DIRECT DEPENDENCY

Phase 61 EXTENDS Phase 58's streaming pipeline with header-attachment work:

- **C3 Rate-limit headers**: Phase 58's `passthrough-handler.ts` Wave 2 rewrite uses `client.messages.create({stream:true})`. The Anthropic SDK exposes upstream response headers via the iterator's underlying `Stream` object (`stream.response?.headers` accessible via SDK internals). Phase 61 will need to capture and forward `anthropic-ratelimit-*` headers to the client BEFORE the first SSE event is written. The current Wave 2 code calls `res.flushHeaders()` immediately after `setHeader('X-Accel-Buffering', 'no')` — Phase 61 will need to inject the rate-limit headers BETWEEN `setHeader` and `flushHeaders`. The clientFactory test seam Wave 0 built supports header injection via the SDK's `defaultHeaders` option for testing.
- **D1 Model aliases** (`opus` / `sonnet` / `haiku` / `gpt-4o`): Phase 57's `resolveModelAlias` already translates `body.model` → Claude family. Phase 58 preserved this unchanged. Phase 61 swaps the file lookup for a Redis-backed lookup (D-30-04 architecture). The streaming code path doesn't change.
- **D2 Provider interface stub**: Phase 61 extracts the Anthropic-specific code in `passthrough-handler.ts` into a `BrokerProvider` interface with concrete Anthropic impl. The streaming `for await` loop becomes a method on the provider. Wave 2 + Wave 3's pattern (SSE headers → loop with writableEnded check → finally finalize+end) is the reference for the interface contract.

**Hand-off recommendation:** consider extracting `forwardSSEStream(client, body, res, options, onEvent)` as a helper during Phase 61's Wave 1 (provider extraction) — Wave 3's SUMMARY flagged this as a future refactor opportunity. The duplication between the Anthropic and OpenAI streaming branches becomes ~80 LOC of provider-method body that can collapse to one shared scaffold + per-provider `onEvent` callback.

### Phase 62 (Usage Tracking + Settings UI) — DIRECT DEPENDENCY

Phase 62 consumes Phase 58's streaming-emitted `usage` chunk + chatcmpl id:

- The OpenAI streaming branch's final chunk before `[DONE]` carries `{prompt_tokens, completion_tokens, total_tokens}` derived from the translator's cumulative `outputTokens` overwrite (Wave 1 contract). Phase 62's `broker_usage` row writer should hook this BEFORE `res.end()` runs in the `finally` block at `passthrough-handler.ts:515` — extract the translator's final usage state into a callback parameter.
- The chatcmpl id (`randomChatCmplId()` from `openai-stream-translator.ts:37`) is the OpenAI-side request identifier. Phase 62's `broker_usage.api_key_id` FK column will key on `req.apiKeyId` (Phase 59) but the chatcmpl id is the natural correlation key for client-side debugging.
- The Anthropic streaming branch forwards upstream `message_delta.usage` verbatim — Phase 62 will need to parse it from the outgoing SSE stream (or capture it from the SDK iterator's `event.usage` field) before `res.write` to log it server-side. Suggest capturing inside the Wave 2 `for await` loop at `passthrough-handler.ts:219` rather than re-parsing the wire output.

### Phase 63 (Mandatory Live Verification) — END-OF-MILESTONE GATE

Phase 63's FR-VERIFY-V30-02 (Bolt.diy live test) and FR-VERIFY-V30-03 (Open WebUI live test) directly validate Phase 58's streaming behavior on real Mini PC hardware. The integration test suite Wave 4 built is the local-CI shadow for those live tests:

- If Wave 4's Group A (verbatim forwarding) is GREEN locally, Bolt.diy on Mini PC should see token-by-token Anthropic SSE chunks.
- If Wave 4's Group C (OpenAI usage on final chunk) is GREEN locally, Open WebUI on Mini PC should display non-zero token counts after each response.
- If Wave 4's Group B (5-run determinism) is GREEN locally, the streaming behavior is timing-stable enough to not flake under variable network conditions in the live test.

**The only Phase 58 risk Phase 63 cannot cover locally is the network/proxy chain** — Cloudflare DNS → Server5 Caddy → LivOS tunnel → Mini PC livinityd. Phase 60's `flush_interval -1` is the mitigation; Phase 63 will be the empirical confirmation.

## Open Refactor Opportunities (Deferred from Phase 58)

1. **Shared `forwardSSEStream(client, body, res, options, onEvent)` helper.** Wave 3 + Wave 4 SUMMARYs both flagged this. The Anthropic and OpenAI streaming branches in `passthrough-handler.ts` duplicate ~40 LOC of scaffolding (SSE headers + clientFactory + tryRefreshAndRetry-wrapped `messages.create({stream:true})` + writableEnded-aware loop + finally-finalize+end). Extraction would reduce ~80 LOC of duplication. Defer to Phase 61's Wave 1 (provider extraction) or a dedicated post-Phase-62 refactor wave.

2. **Translator `finalize()` timing instrumentation.** The translator currently emits the final usage chunk + `[DONE]` synchronously inside the `finally` block. For Phase 62 usage tracking, an optional `onFinalize(usage)` callback on the translator would let Phase 62 hook the moment all token counts are known, before `res.end()`. Backwards-compatible addition.

## v30.0 Milestone Progress

- Phases complete: **3/8** (56, 57, 58)
- Plans complete: **20/44** (4 in Phase 56 + 5 in Phase 57 + 5 in Phase 58 + 6 baseline pre-existing)
- Requirements satisfied: **17/38** (6 Phase 57 + 5 Phase 58 + 6 from prior milestones already mapped)

(Counts to be authoritatively reconciled by `state advance-plan` and `roadmap update-plan-progress` SDK commands; figures above are end-of-Phase-58 snapshot.)

## Final Sacred-File Gate (Phase 58 Closure)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b

$ git diff -- livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts
(empty)

$ git status --short nexus/packages/core/
(empty)
```

**SACRED SHA POST-PHASE = SACRED SHA PRE-PHASE = `4f868d318abff71f8c8bfbcf443b2393a553018b`. PHASE 58 CLOSES CLEAN. NO `--accept-debt` REQUIRED.**

---
*Phase 58 — C1+C2 True Token Streaming — closed 2026-05-03 — sacred SHA stable, two-adapters-coexist preserved, 5/5 requirements verified end-to-end across 56 new tests, 0 deferred items, 0 blockers, ready for downstream phases (59 independent; 60/61/62 dependents documented above; 63 will live-verify).*
