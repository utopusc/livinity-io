# Phase 58: C1+C2 True Token Streaming (Anthropic + OpenAI) - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); inherits Phase 57 architectural verdicts

<domain>
## Phase Boundary

Phase 58 makes the broker's streaming responses **token-by-token** instead of single aggregate chunks. Two paths:

- **Anthropic Messages (`/v1/messages` with `stream: true`):** Forward upstream Anthropic SSE event stream verbatim to the client (passthrough mode emits Anthropic's native `event: message_start` / `content_block_start` / `content_block_delta` / `content_block_stop` / `message_delta` / `message_stop` sequence).
- **OpenAI Chat Completions (`/v1/chat/completions` with `stream: true`):** Translate Anthropic SSE → OpenAI `chat.completion.chunk` events 1:1 as deltas arrive. Each Anthropic `content_block_delta` produces exactly one OpenAI delta chunk; final `message_delta` produces the `finish_reason` chunk; `message_stop` produces `data: [DONE]\n\n`.

What's IN scope for Phase 58:
- Replace existing `livinity-broker/openai-sse-adapter.ts` with a true-streaming translator that emits chunks AS deltas arrive (current implementation aggregates THEN restreams as one chunk).
- For Anthropic Messages passthrough: ensure SSE event stream is forwarded byte-for-byte (no buffering, no transformation).
- For OpenAI sync (`stream: false`) path: ensure single complete OpenAI response shape with `id`/`object`/`choices`/`usage` (this is a sync-mode finalization that builds on Phase 57's passthrough; no streaming needed but the JSON shape must be spec-compliant).
- `usage` object on FINAL OpenAI streaming chunk (continues v29.5 commit `2518cf91` plumbing — non-zero `prompt_tokens`/`completion_tokens`/`total_tokens` per FR-BROKER-C2-02).
- Streaming integration tests asserting ≥3 distinct `content_block_delta` events for a 2+ second prompt.

What's OUT of scope (deferred):
- Rate-limit headers (Phase 61).
- Bearer token auth (Phase 59 — Phase 58 keeps existing per-user URL-path identity for now).
- Public `api.livinity.io` (Phase 60).
- Per-API-key usage tracking column (Phase 62 adds `api_key_id` to `broker_usage`).
- Sacred file edits — UNTOUCHED. Agent mode keeps Strategy B aggregation behavior; Phase 58 only fixes passthrough mode streaming.

</domain>

<decisions>
## Implementation Decisions

### Inherits Phase 57 Architectural Verdicts (D-30-01..04)

- **D-30-01:** Q1 verdict = Anthropic SDK direct via `@anthropic-ai/sdk` with extracted `authToken` Bearer. Phase 58 streaming uses **`client.messages.stream()` async iterator** (the SDK's native streaming method).
- **D-30-02:** Q2 verdict = Forward client `tools[]` verbatim. Phase 58 inherits — streaming path doesn't change tool forwarding.
- **D-30-03:** Q3 verdict = Header-based opt-in (`X-Livinity-Mode: agent`). Phase 58 dispatch reuses Phase 57's `mode-dispatch.ts`. Streaming path branches inside the passthrough handler only.
- **D-30-04:** Q7 verdict = Agent mode keeps Strategy B aggregation (sacred file untouched). Phase 58 ONLY fixes passthrough streaming.

### Anthropic Messages Streaming = Pure Passthrough

The simplest correct implementation: **forward the SDK stream's raw SSE events byte-for-byte** to the client. The Anthropic SDK exposes:

```typescript
const stream = client.messages.stream({...});
for await (const event of stream) {
  // event has shape { type: 'message_start' | 'content_block_start' | ... , data: {...} }
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
```

Or use the SDK's lower-level `client.messages.create({...stream: true})` which returns an async iterator over raw SSE events.

**Decision:** Use whichever method preserves the upstream SSE event names verbatim (no SDK abstraction over event types). Phase 58 researcher confirms which is correct.

### OpenAI Streaming = 1:1 Translation Adapter

Rewrite `livinity-broker/openai-sse-adapter.ts` (or new `openai-stream-translator.ts`) as a stateful translator. Mapping:

| Anthropic event | OpenAI emission |
|---|---|
| `message_start` | First `chat.completion.chunk` with `delta: { role: "assistant" }`, no `content` |
| `content_block_start` | (no-op — wait for delta) |
| `content_block_delta` (text_delta) | `chat.completion.chunk` with `delta: { content: <text> }` |
| `content_block_stop` | (no-op) |
| `message_delta` (with stop_reason) | `chat.completion.chunk` with `finish_reason: <mapped>` and EMPTY `delta: {}` |
| `message_stop` | `data: [DONE]\n\n` line + close |

Plus: track `input_tokens` from `message_start.usage` and `output_tokens` from `message_delta.usage`. On the FINAL `chat.completion.chunk` BEFORE `[DONE]`, emit a chunk with `usage: { prompt_tokens, completion_tokens, total_tokens }` per FR-BROKER-C2-02.

### OpenAI Sync (Non-Streaming) Path

Phase 57 may have left this as transitional aggregate-then-translate. Phase 58 finalizes the OpenAI sync response shape with:
- `id: "chatcmpl-" + base62(29)` (29-char base62 random suffix)
- `object: "chat.completion"`
- `created: Math.floor(Date.now()/1000)`
- `model: <resolved-model-id>` (from D1 alias resolution — Phase 61 adds aliases; Phase 58 uses raw passthrough model)
- `choices: [{ index: 0, message: { role: "assistant", content: <text> }, finish_reason: <mapped> }]`
- `usage: { prompt_tokens, completion_tokens, total_tokens }` (non-zero per FR-BROKER-C2-03)

### Stop Reason Mapping (Anthropic → OpenAI)

Standard mapping:
| Anthropic `stop_reason` | OpenAI `finish_reason` |
|---|---|
| `end_turn` | `stop` |
| `max_tokens` | `length` |
| `stop_sequence` | `stop` |
| `tool_use` | `tool_calls` |
| (null/missing) | `stop` (default) |

### chatcmpl-ID Format

`chatcmpl-` prefix + 29-character base62 random suffix. Cryptographically random (`crypto.randomBytes(22).toString('base64url').slice(0, 29)` or similar). Researcher confirms exact base62 charset OpenAI uses.

### Sacred File — UNTOUCHED

`nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` MUST be byte-identical at end of Phase 58. Phase 58 only touches `livinity-broker/` files. Every PLAN task with broker file mods has SHA verification acceptance criterion.

### Test Strategy: Mocked Anthropic SDK + Real Streams

Unit tests use a mocked Anthropic SDK that emits a scripted sequence of SSE events. Integration tests use:
- A "fake Anthropic" Express server that streams a known event sequence at controlled timing
- The full broker pipeline (`mode-dispatch.ts` → passthrough handler → SSE response)
- Assertions: ≥3 distinct `content_block_delta` events arrive at client AT distinct timestamps (delta ≥ 50ms apart) for a scripted 2-second response — proves no buffering

### Claude's Discretion

- File structure: split `passthrough-handler.ts` into separate sync/streaming handlers, OR keep single file with branching — choose what minimizes diff.
- Test fixture format for fake Anthropic event sequences (JSON file vs inline TypeScript).
- Logging detail level for SSE events (default off per request volume; opt-in flag for debugging).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 57's planned output)
- `livinity-broker/passthrough-handler.ts` — Phase 57 creates this with sync (non-streaming) handler. Phase 58 ADDS streaming branch.
- `livinity-broker/mode-dispatch.ts` — Phase 57 creates. Phase 58 reuses unchanged (no new modes).
- `livinity-broker/credential-extractor.ts` — Phase 57 creates. Phase 58 reuses unchanged.
- `livinity-broker/openai-translator.ts` — Phase 57 augments with sync helpers. Phase 58 ADDS streaming-specific helpers (or new `openai-stream-translator.ts`).
- `livinity-broker/openai-sse-adapter.ts` — current aggregate-then-restream implementation. Phase 58 either rewrites or replaces with new file.
- `livinity-broker/agent-runner-factory.ts` — existing usage chunk plumbing (v29.5 commit `2518cf91`). Phase 58 reuses for token counting.
- `@anthropic-ai/sdk@^0.80.0` — Phase 57 enables broker import; Phase 58 uses streaming methods (`client.messages.stream()` or `messages.create({stream:true})` returning AsyncIterable).

### Established Patterns
- v29.5 Phase 51 deploy-layer fix (`update.sh` rm -rf dist) — ensures fresh build catches Phase 58's new code on Mini PC deploy.
- v29.4 Phase 45 — broker 429 + Retry-After preservation. Phase 58 inherits via Phase 57's HTTP-error mapping.
- v29.3 Phase 42 OpenAI translation — Phase 58 supersedes the sync portion + adds streaming portion.

### Integration Points
- `livinity-broker/router.ts` `/v1/messages` handler — Phase 57 already dispatches to passthrough OR agent mode. Phase 58 streaming branch added INSIDE passthrough handler.
- `livinity-broker/openai-router.ts` `/v1/chat/completions` handler — same: Phase 57 dispatches; Phase 58 streaming branch inside passthrough.
- `nexus/packages/core/src/sdk-agent-runner.ts` lines 382-389 — block-aggregation site. UNTOUCHED in v30. Agent mode preserves; passthrough bypasses.

</code_context>

<specifics>
## Specific Ideas

- **Streaming determinism test:** Run the integration test 5 times consecutively; ALL must pass with ≥3 distinct deltas observed. Flaky timing → test fixture must use server-controlled timing (sleep N ms between event emissions).
- **Bolt.diy live test (Phase 63 verification):** "explain quantum computing in detail" prompt — should take 5-10 seconds — Bolt.diy chat bubble visibly fills word-by-word, not appears all-at-once.
- **Open WebUI usage display:** Open WebUI shows `usage.prompt_tokens` + `usage.completion_tokens` per response. Phase 58 emits `usage` chunk before `[DONE]` so OWUI displays non-zero counts.
- **chatcmpl-ID validation:** Spec requires `^chatcmpl-[A-Za-z0-9]{29}$`. Test asserts regex match.
- **Stop reason coverage:** Test all 4 Anthropic stop reasons map to correct OpenAI `finish_reason`.

</specifics>

<deferred>
## Deferred Ideas

- **Rate-limit headers (`x-ratelimit-*`)** — Phase 61.
- **Bearer auth + public endpoint** — Phases 59+60.
- **`api_key_id` column on `broker_usage`** — Phase 62.
- **Anthropic SDK streaming with thinking blocks (`extended-thinking`)** — out of scope for v30; if upstream emits `event: content_block_start` with `type: thinking`, broker forwards verbatim (passthrough) or includes in OpenAI delta as text (translation choice — Phase 61 D1 alias work may revisit).
- **Tool-use streaming** — if client `tools[]` invokes a tool mid-stream, Anthropic emits `content_block_start` with `type: tool_use`. Passthrough forwards verbatim. OpenAI translation maps to `tool_calls` delta — basic support in Phase 58; full tool-call streaming spec compliance is Phase 61.

</deferred>
