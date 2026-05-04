# Phase 58: C1+C2 True Token Streaming — Research

**Researched:** 2026-05-02
**Domain:** Anthropic SSE → OpenAI SSE 1:1 streaming translator + fake-Anthropic deterministic test fixture
**Confidence:** HIGH for SSE event shapes (Anthropic docs verified verbatim); HIGH for current code paths (Read-verified); HIGH for SDK method choice (helpers.md verified); MEDIUM for `chatcmpl-<base62-29>` claim (regex appears in CONTEXT.md as folklore — actual OpenAI spec only says "unique identifier"; treat as broker convention, not OpenAI spec).

## Summary

Phase 58 adds **true token streaming** to the broker's two passthrough paths (already created by Phase 57). Today, Phase 57 emits aggregate-then-restream as transitional behavior — Phase 58 swaps in 1:1 delta translation as Anthropic SSE events arrive.

**Foundation reused from Phase 57 (do not re-derive):** SDK-direct via `@anthropic-ai/sdk` with `authToken` Bearer (D-30-01); tools[] forwarded verbatim (D-30-02); header-based mode dispatch via `X-Livinity-Mode: agent` (D-30-03); agent mode keeps Strategy B aggregation, sacred file untouched (D-30-04); `passthrough-handler.ts` exists with `passthroughAnthropicMessages` + `passthroughOpenAIChatCompletions`; `openai-translator.ts` has `translateToolsToAnthropic` + `translateToolUseToOpenAI` + `resolveModelAlias` + `buildSyncOpenAIResponse`.

**What's NEW for Phase 58 (the only thing this research addresses):**
1. SDK streaming method choice for raw event forwarding (verdict below).
2. Anthropic SSE event reference table (sourced verbatim from docs).
3. OpenAI chunk shape reference (sourced from spec).
4. Anthropic→OpenAI translator state machine (1:1 delta, with usage-final-chunk plumbing).
5. Deterministic-timing fake-Anthropic Express test fixture pattern.

**Primary recommendation:** Use `client.messages.create({ stream: true, ... })` (raw async iterator yielding events with verbatim `type` field names like `'content_block_delta'`). NOT `client.messages.stream()` (which translates to friendly events like `'text'`/`'contentBlock'`). For Anthropic passthrough: forward each yielded event as `event: <type>\ndata: ${JSON.stringify(event)}\n\n`. For OpenAI translation: feed each yielded event into a stateful translator that emits `chat.completion.chunk` SSE lines.

---

<user_constraints>
## User Constraints (from 58-CONTEXT.md)

### Locked Decisions

- **Inherits Phase 57 D-30-01..04** — SDK-direct via `@anthropic-ai/sdk` with `authToken` Bearer; tools[] forwarded verbatim; header-based mode dispatch; agent mode aggregation preserved.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of Phase 58. Every PLAN task with broker-file mods has SHA verification acceptance criterion.
- **D-NO-NEW-DEPS preserved** — `@anthropic-ai/sdk@^0.80.0` already pulled in; no new packages.
- **D-NO-BYOK preserved** — broker never accepts user's raw API key.
- **Anthropic Messages = pure passthrough** — forward upstream SSE event names verbatim (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping`, `error`). No payload mutation.
- **OpenAI Chat Completions = 1:1 translation** — each Anthropic `content_block_delta(text_delta)` produces exactly one OpenAI `chat.completion.chunk`. Final `message_delta` produces `finish_reason` chunk. `message_stop` produces `data: [DONE]\n\n`.
- **OpenAI sync (`stream: false`)** — must produce `id` matching `chatcmpl-<base62-29>`, `object: "chat.completion"`, `choices`, non-zero `usage`.
- **`usage` chunk on FINAL OpenAI streaming chunk** — non-zero `prompt_tokens`/`completion_tokens`/`total_tokens` per FR-BROKER-C2-02. Continues v29.5 commit `2518cf91` plumbing.
- **Stop reason mapping** — `end_turn → stop`, `max_tokens → length`, `stop_sequence → stop`, `tool_use → tool_calls`, null/missing → `stop`.
- **Test strategy** — mocked Anthropic SDK for unit tests; fake-Anthropic Express server with controlled inter-event timing for integration tests; ≥3 distinct `content_block_delta` events at ≥50ms-apart timestamps for a scripted 2-second response.
- **Determinism** — 5 consecutive runs of integration test must ALL pass.

### Claude's Discretion

- File structure for new translator: separate `openai-stream-translator.ts` vs append to `openai-translator.ts` — recommendation: NEW file `openai-stream-translator.ts` (Phase 57 Pitfall 6 — append, don't modify; keeps stream logic isolated for testing).
- Single `passthrough-handler.ts` with branching vs split into sync/streaming handlers — recommendation: keep single file, add streaming branches inside existing `passthroughAnthropicMessages` and `passthroughOpenAIChatCompletions` (minimum diff).
- Test fixture format for fake-Anthropic event sequences — recommendation: inline TypeScript arrays of `{type, data, delayMs}` tuples (no JSON file roundtrip; explicit and grep-able).
- Logging detail level — default OFF (volume); opt-in flag `BROKER_LOG_SSE=true` for debugging.

### Deferred Ideas (OUT OF SCOPE)

- Rate-limit headers (Phase 61).
- Bearer auth (Phase 59).
- Public `api.livinity.io` endpoint (Phase 60).
- Per-API-key usage column on `broker_usage` (Phase 62).
- Extended thinking blocks (`signature_delta`, `thinking_delta`) — passthrough forwards verbatim; OpenAI translator treats as `delta.content` (basic) or skips (recommended). Full thinking-block streaming is Phase 61+.
- Tool-use streaming with `input_json_delta` accumulation — Phase 58 includes BASIC support (forward Anthropic tool_use blocks; emit OpenAI `tool_calls` deltas with `function.arguments` accumulated). Full spec compliance is Phase 61.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-C1-01 | Anthropic Messages broker emits full Anthropic SSE event sequence verbatim from upstream | Verdict A1 (use `messages.create({stream:true})` raw iterator) + Anthropic SSE Event Reference table below |
| FR-BROKER-C1-02 | Streaming integration test asserts ≥3 distinct `content_block_delta` events for 2+ second prompt | Test Fixture Pattern below — controlled-timing fake-Anthropic Express server emits scripted deltas at ≥50ms intervals |
| FR-BROKER-C2-01 | OpenAI route translates Anthropic SSE → OpenAI `chat.completion.chunk` 1:1 as deltas arrive | Translator State Machine below |
| FR-BROKER-C2-02 | OpenAI streaming emits `usage` on FINAL chunk before `[DONE]` with non-zero counts | Translator State Machine `emitFinalChunk()` step — uses `message_start.message.usage.input_tokens` + `message_delta.usage.output_tokens` (CUMULATIVE per Anthropic warning) |
| FR-BROKER-C2-03 | OpenAI sync (`stream: false`) returns spec-shaped JSON with `id: chatcmpl-<base62-29>`, `object: "chat.completion"`, non-zero `usage` | Already mostly satisfied by Phase 57's `buildOpenAIChatCompletionResponse()` in `passthrough-handler.ts:436-456` — Phase 58 verifies and locks the chatcmpl id format with cryptographic randomness (Phase 57 used `Math.random()` per Pitfall 4) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw Anthropic SSE forwarding (Anthropic route) | livinityd `passthrough-handler.ts` `passthroughAnthropicMessages` streaming branch | Anthropic SDK async iterator | SDK yields raw events; handler writes them via `writeSseChunk()` |
| 1:1 Anthropic→OpenAI delta translation (OpenAI route) | NEW `livinity-broker/openai-stream-translator.ts` | `passthroughOpenAIChatCompletions` calls translator | Translator is stateful and pure (testable in isolation); handler wires it to res stream |
| Usage accumulation across stream | NEW `openai-stream-translator.ts` (input_tokens captured at `message_start`, output_tokens captured at `message_delta` — CUMULATIVE) | — | OpenAI spec requires usage on FINAL chunk; Anthropic emits final usage at `message_delta` |
| chatcmpl-id generation | `openai-stream-translator.ts` (`crypto.randomBytes` base62) | — | Phase 57 used `Math.random()` (Pitfall 4 deferred) — Phase 58 hardens |
| SSE flush behavior | Existing `writeSseChunk()` / `writeOpenAISseChunk()` (already force-flush via `res.flush?.()`) | — | UNCHANGED |
| Test fixture (controlled timing) | NEW `__tests__/fake-anthropic-sse-server.ts` (Express app on ephemeral port) + `Anthropic({ baseURL: 'http://localhost:<port>', authToken: 'fake' })` | — | Deterministic timing requires server-controlled `setTimeout` between event writes |

---

## Anthropic SDK Streaming Method Choice — VERDICT

**Chosen:** `client.messages.create({ stream: true, ... })` — returns `Stream<RawMessageStreamEvent>` (raw async iterable yielding events whose `.type` field IS the verbatim Anthropic SSE event name).

**Rejected:** `client.messages.stream()` — returns the `MessageStream` helper class which emits friendly event names (`'text'`, `'message'`, `'contentBlock'`, `'streamEvent'`) via `.on()`. Useful for high-level apps but WRONG for byte-by-byte SSE forwarding (would require re-mapping helper events back to wire SSE names).

**Rationale (≥3 reasons) [VERIFIED: anthropic-sdk-typescript helpers.md]:**

1. **Raw events preserve Anthropic SSE event names verbatim.** Each iteration yields `{type: 'message_start', message: {...}}`, `{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: '...'}}`, etc. The `.type` field IS the SSE event name. Forwarding pattern: `res.write(\`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n\`)`.
2. **Lower memory overhead.** SDK helpers.md: "raw async iterable of SSE chunks with less memory overhead — it does not accumulate a message object." Critical because the broker may run hundreds of concurrent streams.
3. **Phase 58's translator can switch on `event.type`** without reaching for helper-specific accumulator state. The translator becomes a pure function over the event stream.

**Integration code sketch (Anthropic passthrough — `passthroughAnthropicMessages` streaming branch):**

```typescript
// passthrough-handler.ts streaming branch (replaces Phase 57's transitional aggregate-then-restream)
const stream = await client.messages.create({
  ...anthropicBody,
  stream: true,
})
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')
res.flushHeaders()

for await (const event of stream) {
  if (res.writableEnded) break
  // Forward upstream event verbatim — preserves SSE event names byte-for-byte
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
  const flushable = res as unknown as { flush?: () => void }
  if (typeof flushable.flush === 'function') flushable.flush()
}
res.end()
```

**Integration code sketch (OpenAI translation — `passthroughOpenAIChatCompletions` streaming branch):**

```typescript
import { createAnthropicToOpenAIStreamTranslator } from './openai-stream-translator.js'
// ...
const stream = await client.messages.create({ ...anthropicBody, stream: true })
const translator = createAnthropicToOpenAIStreamTranslator({
  requestedModel: body.model, // echo caller's model name
  res,
})
for await (const event of stream) {
  if (res.writableEnded) break
  translator.onAnthropicEvent(event)
}
translator.finalize() // ensures [DONE] even on early termination
```

---

## Anthropic SSE Event Reference

[VERIFIED: platform.claude.com/docs/en/api/messages-streaming, retrieved 2026-05-02]

### Event Sequence (canonical order)

```
1. message_start         (always first)
2. content_block_start   (per content block, has `index`)
3. ping                  (zero or more, anywhere)
4. content_block_delta   (one or more per block)
5. content_block_stop    (per content block)
   ↳ steps 2-5 repeat for each content block
6. message_delta         (one or more — top-level changes; carries final stop_reason + cumulative output_tokens)
7. message_stop          (always last; client closes stream)

[error]                  (may interleave; HTTP 529 overloaded shape)
```

### Event Type Reference Table

| SSE event name (in `event:` line AND `data.type` field) | Wire shape (literal field names) | When emitted |
|---|---|---|
| `message_start` | `{type:'message_start', message:{id,type:'message',role:'assistant',content:[],model,stop_reason:null,stop_sequence:null,usage:{input_tokens,output_tokens}}}` | First. **input_tokens captured here.** |
| `content_block_start` | `{type:'content_block_start', index, content_block:{type:'text', text:''} \| {type:'tool_use', id, name, input:{}} \| {type:'thinking', thinking:''}}` | Once per block (text or tool_use or thinking) |
| `ping` | `{type:'ping'}` | Zero+ times anywhere — keep-alive |
| `content_block_delta` (text) | `{type:'content_block_delta', index, delta:{type:'text_delta', text:'<chunk>'}}` | Token-level text delta |
| `content_block_delta` (tool input) | `{type:'content_block_delta', index, delta:{type:'input_json_delta', partial_json:'<json fragment>'}}` | Per-tool-arg-key partial JSON |
| `content_block_delta` (thinking) | `{type:'content_block_delta', index, delta:{type:'thinking_delta', thinking:'<chunk>'}}` | Extended thinking |
| `content_block_delta` (signature) | `{type:'content_block_delta', index, delta:{type:'signature_delta', signature:'<base64>'}}` | Just before content_block_stop on a thinking block |
| `content_block_stop` | `{type:'content_block_stop', index}` | Once per block |
| `message_delta` | `{type:'message_delta', delta:{stop_reason, stop_sequence}, usage:{output_tokens}}` | **CUMULATIVE output_tokens.** Final stop_reason here. |
| `message_stop` | `{type:'message_stop'}` | Last event |
| `error` | `{type:'error', error:{type:'overloaded_error'\|..., message}}` | Mid-stream errors (e.g., HTTP 529) |

### Critical Field Locations (for translator)

- **`input_tokens`** lives at `message_start.message.usage.input_tokens` (NOT in any later event).
- **`output_tokens`** lives at `message_delta.usage.output_tokens` and is **CUMULATIVE** ([VERIFIED: docs Warning box: "The token counts shown in the `usage` field of the `message_delta` event are *cumulative*"]). Translator must use the LAST seen value, not sum.
- **`stop_reason`** lives at `message_delta.delta.stop_reason`.
- **Content blocks have an `index`** — text block usually `index: 0`; tool_use block typically `index: 1+`. Translator must track per-index state.

### Anthropic `stop_reason` Values (current spec)

[VERIFIED: docs.anthropic.com/en/api/messages — Response object]

| stop_reason | Meaning | Frequency |
|---|---|---|
| `end_turn` | Model finished naturally | Most common |
| `max_tokens` | Hit max_tokens limit | Common |
| `stop_sequence` | Custom stop sequence matched | Uncommon |
| `tool_use` | Model paused to invoke tool | Common with tools |
| `pause_turn` | Long-running multi-turn pause (extended thinking continuation) | Rare |
| `refusal` | Safety refusal | Rare |
| `model_context_window_exceeded` | Input + max_tokens > context window | Rare |

**[ASSUMED]** — `pause_turn`, `refusal`, `model_context_window_exceeded` may have been added in 2025-2026; CONTEXT.md mapping table covers only the first 4. Phase 58 translator should map the new values defensively (`refusal → content_filter`, `pause_turn → stop`, `model_context_window_exceeded → length`) and log a warn for any unknown stop_reason. Confirmation needed from user during planning.

---

## OpenAI Chunk Shape Reference

[VERIFIED: developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events, retrieved 2026-05-02]

### `chat.completion.chunk` Top-Level Shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Same across ALL chunks in a stream |
| `object` | literal `"chat.completion.chunk"` | yes | |
| `created` | number (unix seconds) | yes | Same across all chunks |
| `model` | string | yes | Echo caller's request `model` (NOT resolved Claude model) |
| `choices` | array | yes | May be EMPTY on the usage-only final chunk |
| `usage` | `{prompt_tokens, completion_tokens, total_tokens}` | optional | Present ONLY on final chunk when `stream_options.include_usage=true`. Null/absent on earlier chunks. |
| `system_fingerprint` | string | optional, deprecated | Skip |
| `service_tier` | enum | optional | Skip |

### `choices[].delta` Field Reference

| Field | Type | Used by Phase 58 |
|---|---|---|
| `role` | `'assistant'` only on FIRST chunk | YES — translator emits role on first chunk synthesized from `message_start` |
| `content` | string (delta text) | YES — emitted per `content_block_delta(text_delta)` |
| `tool_calls` | array of `{index, id?, type:'function', function:{name?, arguments?}}` | YES — partial — emitted per `content_block_start(tool_use)` + `content_block_delta(input_json_delta)` |
| `refusal` | string | NO (out of scope; Phase 61) |
| `function_call` | deprecated legacy | NO |

### `finish_reason` Valid Values

`"stop" | "length" | "tool_calls" | "content_filter" | "function_call"`

(`function_call` is legacy; Phase 58 never emits it.)

### Example Chunk Sequence (what Phase 58 translator emits)

```
data: {"id":"chatcmpl-<29>","object":"chat.completion.chunk","created":1735660800,"model":"sonnet","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-<29>","object":"chat.completion.chunk","created":1735660800,"model":"sonnet","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-<29>","object":"chat.completion.chunk","created":1735660800,"model":"sonnet","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-<29>","object":"chat.completion.chunk","created":1735660800,"model":"sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":25,"completion_tokens":15,"total_tokens":40}}

data: [DONE]

```

**Wire format invariants:**
- Each chunk line is `data: <json>\n\n` (NO `event:` prefix — different from Anthropic).
- Terminator is the literal string `data: [DONE]\n\n` (the `openai` Python SDK looks for this exact byte sequence — never omit).
- `usage` chunk MUST come BEFORE `data: [DONE]\n\n` (Pitfall B-13 wire order from existing `openai-sse-adapter.ts:160-173`).
- All chunks share the SAME `id` (one chatcmpl-* per stream).

### `chatcmpl-<base62-29>` Format Claim

**[ASSUMED]** — CONTEXT.md and FR-BROKER-C2-03 specify `id: "chatcmpl-" + base62(29)` (29-char base62 random suffix). Verified OpenAI public spec only states "unique identifier" (no length/charset commitment). The 29-char base62 form IS what real OpenAI emits in observed traffic, so external clients (Open WebUI) often regex-validate `^chatcmpl-[A-Za-z0-9]{29}$`. Phase 58 implementation must match this convention even though it's not in the formal spec.

**Charset:** base62 = `[0-9A-Za-z]` (62 chars). Generation: `crypto.randomBytes(22).toString('base64url').replace(/[-_]/g, '').slice(0, 29).padEnd(29, '0')` OR a manual base62 loop. Phase 57's existing `randomBase62(29)` in `passthrough-handler.ts:458-463` uses `Math.random()` — Phase 58 should harden to `crypto.randomBytes` for collision safety.

---

## Translator State Machine — Anthropic→OpenAI (1:1 streaming)

NEW file: `livos/packages/livinityd/source/modules/livinity-broker/openai-stream-translator.ts`

### State

```typescript
interface TranslatorState {
  id: string                  // chatcmpl-<base62-29>, generated once at construction
  created: number             // Math.floor(Date.now()/1000), set once at construction
  model: string               // echoes caller's requested model
  roleEmitted: boolean        // ensures the first chunk carries delta.role='assistant'
  inputTokens: number         // captured at message_start
  outputTokens: number        // updated on EACH message_delta (cumulative — overwrite, do not sum)
  stopReason: string | null   // captured at message_delta
  finalized: boolean          // idempotency for [DONE] terminator
  blocks: Map<number, BlockState>  // per-index content block state (text vs tool_use)
  toolCallIndex: number       // monotonic index for OpenAI tool_calls[] (mirrors Anthropic content block index for tool_use blocks)
}

interface BlockState {
  type: 'text' | 'tool_use' | 'thinking' | 'unknown'
  toolUseId?: string          // for tool_use blocks
  toolName?: string           // for tool_use blocks
  openaiToolCallIndex?: number // index in OpenAI tool_calls[] (separate from Anthropic content block index)
}
```

### Transition Table

| Anthropic event | Translator action | OpenAI emission |
|---|---|---|
| `message_start` | Set `inputTokens = event.message.usage.input_tokens` | NONE (defer first chunk until first delta to maximize delta count) |
| `content_block_start` (text) | `blocks.set(index, {type:'text'})` | If `!roleEmitted`: emit chunk with `delta:{role:'assistant',content:''}`, set `roleEmitted=true`. ELSE: nothing. |
| `content_block_start` (tool_use) | `blocks.set(index, {type:'tool_use', toolUseId, toolName, openaiToolCallIndex})` | If `!roleEmitted`: emit role chunk. THEN emit chunk with `delta:{tool_calls:[{index:openaiToolCallIndex, id:toolUseId, type:'function', function:{name:toolName, arguments:''}}]}` |
| `content_block_start` (thinking) | `blocks.set(index, {type:'thinking'})` | NONE (drop thinking blocks from OpenAI shape per CONTEXT.md deferred ideas) |
| `ping` | NONE | NONE (drop) |
| `content_block_delta` (text_delta) | NONE | Emit chunk with `delta:{content: event.delta.text}` |
| `content_block_delta` (input_json_delta) | NONE | Emit chunk with `delta:{tool_calls:[{index:openaiToolCallIndex, function:{arguments: event.delta.partial_json}}]}` |
| `content_block_delta` (thinking_delta) | NONE | NONE (drop) |
| `content_block_delta` (signature_delta) | NONE | NONE (drop) |
| `content_block_stop` | NONE | NONE |
| `message_delta` | `outputTokens = event.usage.output_tokens` (CUMULATIVE — overwrite); `stopReason = event.delta.stop_reason` | NONE (defer to finalize) |
| `message_stop` | Trigger finalize() | finalize() emits final chunk + `[DONE]` |
| `error` | Set `stopReason = 'error'` | Best-effort: emit final chunk with `finish_reason:'stop'`, then `[DONE]` |

### `finalize()` (idempotent)

```typescript
finalize() {
  if (this.finalized) return
  if (!this.roleEmitted) {
    // Edge case: stream ended before any content. Emit role chunk for SDK compatibility.
    write({delta:{role:'assistant',content:''}, finish_reason:null})
    this.roleEmitted = true
  }
  // Emit final chunk: empty delta + finish_reason + usage
  const finishReason = mapStopReason(this.stopReason)
  const usage = {
    prompt_tokens: this.inputTokens,
    completion_tokens: this.outputTokens,
    total_tokens: this.inputTokens + this.outputTokens,
  }
  write({delta:{}, finish_reason: finishReason, usage})  // <-- usage on FINAL chunk before [DONE] (FR-BROKER-C2-02)
  res.write('data: [DONE]\n\n')
  res.end()
  this.finalized = true
}
```

### Stop Reason Mapping Table (verified against current spec)

| Anthropic `stop_reason` | OpenAI `finish_reason` | Verified? |
|---|---|---|
| `end_turn` | `stop` | ✓ CONTEXT.md + spec |
| `max_tokens` | `length` | ✓ |
| `stop_sequence` | `stop` | ✓ |
| `tool_use` | `tool_calls` | ✓ |
| `pause_turn` | `stop` | [ASSUMED] — defensive default |
| `refusal` | `content_filter` | [ASSUMED] — semantically closest |
| `model_context_window_exceeded` | `length` | [ASSUMED] — semantically closest |
| `null` / missing / `'error'` | `stop` | ✓ default |

**Translator implementation:**
```typescript
function mapStopReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
  if (reason === 'tool_use') return 'tool_calls'
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'length'
  if (reason === 'refusal') return 'content_filter'
  return 'stop'  // end_turn, stop_sequence, pause_turn, null, unknown
}
```

---

## Test Fixture Pattern — Deterministic-Timing Fake-Anthropic SSE Server

Goal: Integration test asserts ≥3 distinct `content_block_delta` events arrive at client at ≥50ms-apart timestamps, deterministically across 5 consecutive runs.

### Pattern: Express server on ephemeral port + scripted event sequence with controlled `setTimeout`

NEW file: `livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.ts`

```typescript
import express from 'express'
import type {Server} from 'http'

export interface ScriptedEvent {
  type: string                 // 'message_start' | 'content_block_delta' | etc.
  data: Record<string, unknown> // event payload (will be JSON.stringify'd)
  delayMs: number              // sleep BEFORE writing this event
}

export interface FakeAnthropicServerOpts {
  script: ScriptedEvent[]
  /** Optional: simulate upstream 429 with Retry-After before the script runs */
  preErrorStatus?: number
  preErrorRetryAfter?: string
}

export function createFakeAnthropicServer(opts: FakeAnthropicServerOpts): Promise<{
  baseURL: string
  close: () => Promise<void>
}> {
  const app = express()
  app.use(express.json())

  app.post('/v1/messages', async (req, res) => {
    if (opts.preErrorStatus) {
      if (opts.preErrorRetryAfter) res.setHeader('Retry-After', opts.preErrorRetryAfter)
      return res.status(opts.preErrorStatus).json({type:'error', error:{type:'rate_limit_error', message:'fake'}})
    }
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()
    for (const event of opts.script) {
      await new Promise((resolve) => setTimeout(resolve, event.delayMs))
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event.data)}\n\n`)
    }
    res.end()
  })

  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const port = (server.address() as {port: number}).port
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      })
    })
  })
}

/** Canonical 6-delta script for the FR-BROKER-C1-02 ≥3-deltas-in-2sec test. */
export const CANONICAL_SCRIPT: ScriptedEvent[] = [
  {type:'message_start', data:{type:'message_start', message:{id:'msg_test', type:'message', role:'assistant', content:[], model:'claude-sonnet-4-6', stop_reason:null, stop_sequence:null, usage:{input_tokens:25, output_tokens:1}}}, delayMs:10},
  {type:'content_block_start', data:{type:'content_block_start', index:0, content_block:{type:'text', text:''}}, delayMs:10},
  {type:'ping', data:{type:'ping'}, delayMs:50},
  {type:'content_block_delta', data:{type:'content_block_delta', index:0, delta:{type:'text_delta', text:'Hello'}}, delayMs:300},
  {type:'content_block_delta', data:{type:'content_block_delta', index:0, delta:{type:'text_delta', text:' world'}}, delayMs:300},
  {type:'content_block_delta', data:{type:'content_block_delta', index:0, delta:{type:'text_delta', text:'!'}}, delayMs:300},
  {type:'content_block_delta', data:{type:'content_block_delta', index:0, delta:{type:'text_delta', text:' How'}}, delayMs:300},
  {type:'content_block_delta', data:{type:'content_block_delta', index:0, delta:{type:'text_delta', text:' are you?'}}, delayMs:300},
  {type:'content_block_stop', data:{type:'content_block_stop', index:0}, delayMs:10},
  {type:'message_delta', data:{type:'message_delta', delta:{stop_reason:'end_turn', stop_sequence:null}, usage:{output_tokens:15}}, delayMs:10},
  {type:'message_stop', data:{type:'message_stop'}, delayMs:10},
]
// Total: 5 deltas spread across ~1.5s. Test asserts ≥3 at ≥50ms apart.
```

### Wiring the SDK to the fake server

The Anthropic SDK accepts a `baseURL` option. Tests construct the client as:

```typescript
const fake = await createFakeAnthropicServer({script: CANONICAL_SCRIPT})
const client = new Anthropic({ authToken: 'fake', baseURL: fake.baseURL })
// passthroughAnthropicMessages will use this client; events flow through real translator
```

For the broker integration test, `passthrough-handler.ts` must accept an injectable client factory (Phase 57's `makeClient(token)` helper). Phase 58 adds a test seam: `makeClient(token, {baseURL?})` so the test can override the upstream URL.

### Test Assertions

```typescript
test('passthrough emits ≥3 distinct content_block_delta events at ≥50ms apart', async () => {
  const captured: Array<{event: string; data: unknown; ts: number}> = []
  // ... wire SDK to fake server, capture SSE chunks from broker response ...
  for await (const chunk of brokerResponseStream) {
    captured.push({...parseChunk(chunk), ts: Date.now()})
  }
  const deltas = captured.filter((c) => c.event === 'content_block_delta')
  expect(deltas.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < deltas.length; i++) {
    expect(deltas[i].ts - deltas[i - 1].ts).toBeGreaterThanOrEqual(50)
  }
})
```

### Determinism Guarantees

- Server-side `setTimeout` is the ONLY source of timing. No reliance on real Anthropic API.
- Each `delayMs` is per-event (additive). Total scripted runtime ≈1.6s — well below the 2-second test threshold.
- Run-to-run variance: `setTimeout` jitter on Node.js typically <5ms. Test tolerances (50ms) are 10x jitter.
- 5-consecutive-runs requirement: tests should run with `--retry=0` and assert pass on first try; if any flakiness surfaces, raise `delayMs` to 200ms+ (still <2s total) and assertion threshold to 100ms.

---

## Existing `openai-sse-adapter.ts` — Current Behavior + Phase 58 Changes

**Current implementation (Phase 41/42, hardened in v29.4 Phase 45):**

`openai-sse-adapter.ts:89-177` — `createOpenAISseAdapter({requestedModel, res})`. Stateful adapter consuming `AgentEvent` (from sacred sdk-agent-runner via Strategy B). Maps:
- `chunk` (text delta from agent runner) → `chat.completion.chunk` with `delta.content` (and `delta.role='assistant'` on first chunk)
- `final_answer` → captures `stoppedReasonHint='complete'`, defers terminal emission to `finalize()`
- `error` → captures `stoppedReasonHint='error'`, defers terminal emission
- `finalize(stoppedReason?, usage?)` (idempotent) — emits terminal chunk with `delta:{}`, `finish_reason`, AND `usage` field, then `data: [DONE]\n\n` (wire-order pitfall B-13)

**ID format used today:** `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}` — only 24 hex chars (NOT base62, NOT 29 chars). Phase 58 must standardize to 29-char base62 to match FR-BROKER-C2-03 + Open WebUI regex expectations.

**This adapter consumes `AgentEvent`s from sacred file via Strategy B HTTP proxy.** It is the AGENT MODE adapter. Phase 58 LEAVES THIS FILE UNCHANGED for agent mode (sacred file boundary; Phase 58 only fixes passthrough mode).

**Phase 58 NEW file `openai-stream-translator.ts`:** consumes `RawMessageStreamEvent`s from `@anthropic-ai/sdk` (NOT `AgentEvent`s). This is the PASSTHROUGH MODE translator. Different shape, different source, different file. Both adapters can coexist.

**Comparison:**

| Aspect | `openai-sse-adapter.ts` (UNCHANGED) | `openai-stream-translator.ts` (NEW) |
|---|---|---|
| Mode | agent | passthrough |
| Input | `AgentEvent` from sacred file via Strategy B | `RawMessageStreamEvent` from `@anthropic-ai/sdk` |
| Granularity | Block-level (one chunk per assistant content block) | Token-level (one chunk per Anthropic text_delta) |
| Tool support | Drops tool calls | Forwards as OpenAI tool_calls deltas |
| Usage | From `result.totalInputTokens/totalOutputTokens` (final) | From `message_start.usage.input_tokens` + cumulative `message_delta.usage.output_tokens` |
| ID format | `chatcmpl-<24 hex>` | `chatcmpl-<29 base62>` |
| Phase 58 changes | NONE (sacred file boundary) | NEW FILE |

---

## Wave Structure Suggestion

Refine CONTEXT.md's proposed structure:

| Wave | Goal | Files | Depends on |
|------|------|-------|------------|
| **0 — Test Infrastructure** | Fake-Anthropic SSE server + canonical script + test seam in `passthrough-handler.ts` for injectable baseURL | `__tests__/fake-anthropic-sse-server.ts` (NEW); `passthrough-handler.ts` (add `clientFactory` opt) | — |
| **1 — Translator Core** | NEW `openai-stream-translator.ts` with state machine + crypto-safe chatcmpl id + stop_reason mapping; full unit test coverage (mocked event sequences) | `openai-stream-translator.ts` (NEW); `openai-stream-translator.test.ts` (NEW) | Wave 0 (uses fake server pattern for unit-level scripted events) |
| **2 — Anthropic Passthrough Streaming** | Replace transitional aggregate-then-restream in `passthroughAnthropicMessages` streaming branch with raw async iterator forwarding | `passthrough-handler.ts` (modify streaming branch only) | Wave 0 |
| **3 — OpenAI Passthrough Streaming Integration** | Replace transitional single-chunk emission in `passthroughOpenAIChatCompletions` streaming branch with translator + harden chatcmpl id format | `passthrough-handler.ts` (modify OpenAI streaming branch + replace `randomBase62` with crypto version); `openai-translator.ts` (export shared `randomChatCmplId`) | Waves 1 + 2 |
| **4 — Integration Tests** | End-to-end test: real broker pipeline + fake server → assert ≥3 deltas, distinct timestamps, usage on final chunk, stop_reason mapping correctness, OpenAI sync shape compliance | `passthrough-streaming-integration.test.ts` (NEW) | Waves 1–3 |

**Why this ordering:** Wave 0 unblocks deterministic testing without real upstream. Wave 1 is pure-function translator (highly testable; lowest risk). Wave 2 is the simpler passthrough (just forward events) and lets the user observe streaming working before the more complex translation. Wave 3 stitches translator into the OpenAI handler. Wave 4 closes FR-BROKER-C1-02 + FR-BROKER-C2-01..02 with real-pipeline assertions.

---

## Risk Inventory

### Buffering Hazards

| Hazard | Where it bites | Mitigation |
|---|---|---|
| Express `res.write()` Node http internal buffering | Server-side: `res.write()` queues until socket drain; default Node http does NOT auto-flush per write | Existing `writeSseChunk()` calls `res.flush?.()` (compression-middleware-provided method) — **continue using this pattern in translator**. Also `res.flushHeaders()` once before first write. |
| Express compression middleware buffers SSE | If `compression()` is mounted globally, it buffers responses until threshold | Verify in `livos/packages/livinityd/source/server/index.ts` mount order — broker routes must be mounted BEFORE compression OR compression must skip `text/event-stream` responses |
| Anthropic SDK internal SSE parser buffering | SDK reads upstream socket into internal buffer; events emitted only when newline boundaries land | UNFIXABLE at broker — but SDK is well-engineered; events emit as fast as upstream sends them. Verify with fake-server test: deltas at 300ms intervals → broker emits at ≤310ms intervals |
| Node.js Transform streams in middleware chain | Any Transform stream between `res.write` and socket bufers in 16KB chunks | UsageCaptureMiddleware (Phase 44) wraps `res.write` — verify it does NOT batch. Inspect `livinityd/source/modules/server/usage-tracking/capture-middleware.ts` |
| Browser/proxy intermediate buffering | Caddy/CF in front (Phase 60) may buffer SSE | Out of scope for Phase 58 (Phase 60 concern). For Phase 58 broker-internal tests, no proxy — direct connection. |

### Determinism Risks

| Risk | Mitigation |
|---|---|
| `setTimeout` jitter on Windows CI vs Linux Mini PC | Test tolerances (50ms) are 10x typical jitter; pad to 100ms if flakiness surfaces |
| Vitest test isolation — fake-server port reuse | Each test uses ephemeral port (`app.listen(0)`); explicit `await close()` in afterEach |
| Concurrent test runs sharing fake-server state | Use per-test fake server instance, not shared singleton |
| `crypto.randomBytes` synchronous vs async | Use sync version (`randomBytes(22)`) for predictable test behavior |
| Anthropic SDK retry behavior on fake-server 5xx | Set SDK `maxRetries: 0` in test client |

### Other Risks

| Risk | Mitigation |
|---|---|
| `usage` field absent from real upstream (degenerate stream) | `inputTokens=0, outputTokens=0` defaults — translator still emits `usage` field, just with zeros. Open WebUI displays "0 tokens" — visible bug but not crash |
| `message_delta.usage.output_tokens` is CUMULATIVE — accidentally summing breaks count | Translator OVERWRITES `outputTokens` on each `message_delta`, never sums (per Anthropic Warning box) |
| Tool-use `input_json_delta` partial JSON forwarded as OpenAI `function.arguments` — concatenating partial fragments is exactly what OpenAI SDKs expect | Translator just appends `partial_json` strings into delta `tool_calls[].function.arguments`. No JSON parsing. |
| Mid-stream client disconnect (`res.writableEnded`) — translator continues writing to dead socket | Each emit checks `if (res.writableEnded) return`; existing `writeSseChunk()` already does this |
| Sacred file SHA drift due to accidental edit | Every PLAN task includes `git hash-object` pre/post acceptance criterion |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing in `livos/packages/livinityd`) |
| Config file | `livos/packages/livinityd/vitest.config.ts` (existing) |
| Quick run command | `cd livos/packages/livinityd && npx vitest run source/modules/livinity-broker/openai-stream-translator.test.ts` |
| Full suite command | `cd livos/packages/livinityd && npx vitest run source/modules/livinity-broker/` |
| Phase gate | All broker unit tests + new integration test GREEN; sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-BROKER-C1-01 | Anthropic SSE forwarded verbatim | integration | `npx vitest run source/modules/livinity-broker/passthrough-streaming-integration.test.ts -t "anthropic verbatim"` | ❌ Wave 4 |
| FR-BROKER-C1-02 | ≥3 distinct deltas in 2-second prompt | integration | `npx vitest run source/modules/livinity-broker/passthrough-streaming-integration.test.ts -t "≥3 deltas"` | ❌ Wave 4 |
| FR-BROKER-C2-01 | OpenAI 1:1 delta translation | unit | `npx vitest run source/modules/livinity-broker/openai-stream-translator.test.ts -t "1:1 delta"` | ❌ Wave 1 |
| FR-BROKER-C2-02 | usage on final chunk before [DONE] | unit | `npx vitest run source/modules/livinity-broker/openai-stream-translator.test.ts -t "usage on final"` | ❌ Wave 1 |
| FR-BROKER-C2-03 | OpenAI sync shape — `chatcmpl-<29>`, `chat.completion`, non-zero usage | unit | `npx vitest run source/modules/livinity-broker/passthrough-handler.test.ts -t "sync shape"` | ⚠ exists from Phase 57; Phase 58 adds chatcmpl regex assertion |

### Sampling Rate
- **Per task commit:** `npx vitest run source/modules/livinity-broker/openai-stream-translator.test.ts`
- **Per wave merge:** `npx vitest run source/modules/livinity-broker/`
- **Phase gate:** Full suite GREEN + `git hash-object nexus/packages/core/src/sdk-agent-runner.ts == 4f868d318abff71f8c8bfbcf443b2393a553018b` + 5 consecutive runs of integration test all PASS.

### Wave 0 Gaps
- [ ] `__tests__/fake-anthropic-sse-server.ts` — controlled-timing Express server + CANONICAL_SCRIPT
- [ ] `passthrough-handler.ts` test seam — accept optional `clientFactory` for baseURL injection
- [ ] No new framework install needed (vitest already present)

---

## Code Examples (verified patterns)

### Forwarding Anthropic raw events verbatim (Wave 2)
```typescript
// Source: helpers.md verified pattern + existing sse-adapter.ts:62-69 flush pattern
import Anthropic from '@anthropic-ai/sdk'

async function streamPassthrough(client: Anthropic, body: any, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  const stream = await client.messages.create({ ...body, stream: true })
  for await (const event of stream) {
    if (res.writableEnded) break
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    const flushable = res as unknown as { flush?: () => void }
    if (typeof flushable.flush === 'function') flushable.flush()
  }
  if (!res.writableEnded) res.end()
}
```

### Translator skeleton (Wave 1)
```typescript
// Source: synthesized from openai-sse-adapter.ts:89-177 pattern + Anthropic event spec above
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export function randomChatCmplId(): string {
  const bytes = randomBytes(22)
  let out = 'chatcmpl-'
  for (let i = 0; i < 29; i++) out += BASE62[bytes[i % 22] % 62]
  return out
}

export function createAnthropicToOpenAIStreamTranslator(opts: {requestedModel: string; res: Response}) {
  const {requestedModel, res} = opts
  const id = randomChatCmplId()
  const created = Math.floor(Date.now() / 1000)
  let roleEmitted = false
  let inputTokens = 0
  let outputTokens = 0
  let stopReason: string | null = null
  let finalized = false

  function write(chunk: any) {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify({id, object:'chat.completion.chunk', created, model:requestedModel, ...chunk})}\n\n`)
    const f = res as unknown as {flush?: () => void}
    if (typeof f.flush === 'function') f.flush()
  }

  function ensureRole() {
    if (roleEmitted) return
    roleEmitted = true
    write({choices:[{index:0, delta:{role:'assistant', content:''}, finish_reason:null}]})
  }

  return {
    onAnthropicEvent(event: any) {
      if (finalized) return
      switch (event.type) {
        case 'message_start':
          inputTokens = event.message?.usage?.input_tokens ?? 0
          break
        case 'content_block_start':
          ensureRole()
          // (tool_use opening chunk emission — Wave 3 detail)
          break
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta') {
            ensureRole()
            write({choices:[{index:0, delta:{content:event.delta.text}, finish_reason:null}]})
          }
          // (input_json_delta handling — Wave 3 detail)
          break
        case 'message_delta':
          outputTokens = event.usage?.output_tokens ?? outputTokens  // CUMULATIVE — overwrite
          stopReason = event.delta?.stop_reason ?? stopReason
          break
        case 'message_stop':
          this.finalize()
          break
      }
    },
    finalize() {
      if (finalized) return
      ensureRole()
      const finishReason = mapStopReason(stopReason)
      write({
        choices:[{index:0, delta:{}, finish_reason:finishReason}],
        usage:{prompt_tokens:inputTokens, completion_tokens:outputTokens, total_tokens:inputTokens+outputTokens},
      })
      if (!res.writableEnded) res.write('data: [DONE]\n\n')
      if (!res.writableEnded) res.end()
      finalized = true
    },
  }
}

function mapStopReason(reason: string | null): 'stop'|'length'|'tool_calls'|'content_filter' {
  if (reason === 'tool_use') return 'tool_calls'
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'length'
  if (reason === 'refusal') return 'content_filter'
  return 'stop'
}
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chatcmpl-<base62-29>` format is enforced by external clients via regex | OpenAI Chunk Shape Reference | Low — even if clients accept arbitrary strings, the 29-char base62 form is observed in real OpenAI traffic and harmless to emit |
| A2 | New stop reasons `pause_turn`, `refusal`, `model_context_window_exceeded` exist in current Anthropic spec | Anthropic stop_reason values | Low — defensive mapping defaults to `stop`/`length`/`content_filter`; unknown values logged as warn |
| A3 | OpenAI Python SDK requires literal `data: [DONE]\n\n` byte sequence | OpenAI Chunk Shape Reference | Verified historically (existing `openai-sse-adapter.ts:41` `OPENAI_SSE_DONE` constant); already mitigated |
| A4 | Express `compression()` middleware is NOT mounted in front of broker routes | Buffering Hazards | If wrong, SSE silently buffers — verify in Wave 0 by inspecting server/index.ts mount order. If compression is mounted, broker route handler must call `res.flushHeaders()` and set `Cache-Control: no-transform` to disable compression for SSE responses |
| A5 | `setTimeout` jitter on Windows + Linux is <50ms in practice | Determinism Risks | If higher, raise test tolerance to 100ms (well below 2s threshold) |

## Open Questions

1. **Should Phase 58 expose extended thinking blocks (`thinking_delta`) on the OpenAI route?**
   - What we know: Anthropic emits `content_block_delta(thinking_delta)` when `thinking` enabled. OpenAI has no native thinking concept.
   - What's unclear: Open WebUI / Continue.dev support reasoning models and may parse `delta.content` containing thinking tokens.
   - Recommendation: **Drop thinking deltas** in Phase 58 (per CONTEXT.md deferred). Phase 61 may revisit if Bolt.diy users complain.

2. **Should the translator handle multiple text content blocks (e.g., model emits text → tool_use → text continuation)?**
   - What we know: Anthropic allows N content blocks per response; each has its own start/delta/stop sequence with distinct `index`.
   - What's unclear: OpenAI's `delta.content` is monotonic concat — interleaving with `delta.tool_calls` is fine, but what happens if text block index 0 stops, tool_use index 1 fires, then NEW text block index 2 opens? Current SDK behavior unverified.
   - Recommendation: Translator concatenates ALL text blocks into the single OpenAI `delta.content` stream (block boundaries invisible to OpenAI client). Test a multi-block fixture in Wave 4.

3. **Verify: does compression middleware exist in `livos/packages/livinityd/source/server/index.ts`?**
   - Wave 0 task: grep for `compression(` and document mount order. If yes, broker SSE responses need `Cache-Control: no-transform`.

## Sources

### Primary (HIGH confidence)
- `platform.claude.com/docs/en/api/messages-streaming` — Anthropic SSE event sequence + field shapes (full doc retrieved 2026-05-02; saved to tool-results)
- `github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md` — `messages.stream()` vs `messages.create({stream:true})` event types
- `developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events` — OpenAI chunk shape (retrieved 2026-05-02)
- Live broker source files (Read-verified):
  - `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` (lines 1-177) — current AGENT-MODE adapter, leave unchanged
  - `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts` (lines 1-173) — Anthropic SSE writer + Anthropic event type unions (reusable type definitions)
  - `livos/packages/livinityd/source/modules/livinity-broker/openai-types.ts` (lines 1-62) — OpenAI request/response wire types
  - `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` (lines 1-198) — Phase 57 helpers (resolveModelAlias, buildSyncOpenAIResponse, translateToolsToAnthropic, translateToolUseToOpenAI)
  - `livos/packages/livinityd/source/modules/livinity-broker/sync-response.ts` (lines 1-60) — Anthropic sync response shape
  - `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:18-27` — `UpstreamHttpError` class for 429/Retry-After preservation
- `.planning/phases/57-passthrough-mode-agent-mode/57-RESEARCH.md` — Phase 57 verdicts D-30-01..04 (architecture inherited verbatim)
- `.planning/phases/57-passthrough-mode-agent-mode/57-04-PLAN.md` — Phase 57 OpenAI translator plan (foundation for Phase 58)

### Secondary (MEDIUM confidence)
- `community.openai.com/t/usage-stats-now-available-when-using-streaming-...` — `stream_options.include_usage=true` semantics (verified by web search 2026-05-02)
- `.planning/phases/58-true-token-streaming/58-CONTEXT.md` — user's locked decisions (translator design, sacred file boundary, test strategy)

### Tertiary (LOW confidence — flagged for validation)
- `chatcmpl-<base62-29>` format claim — appears in CONTEXT.md as a hard requirement but OpenAI public spec only commits to "unique identifier"; treat as broker convention validated by Open WebUI client behavior

## Metadata

**Confidence breakdown:**
- Anthropic SSE event reference: HIGH — quoted verbatim from official docs
- OpenAI chunk shape: HIGH — sourced from developers.openai.com
- SDK method choice (`create({stream:true})` for raw forwarding): HIGH — confirmed via SDK helpers.md
- Translator state machine: HIGH — derived from event spec mappings; testable by Wave 1 unit tests
- Test fixture pattern: HIGH — Express ephemeral-port pattern is standard; SDK `baseURL` override is documented
- chatcmpl-29 format: MEDIUM — assumed convention; not in formal OpenAI spec
- Stop reason coverage: MEDIUM — 3 new reasons (`pause_turn`, `refusal`, `model_context_window_exceeded`) flagged ASSUMED

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days — Anthropic SSE spec stable; OpenAI chunk shape stable; SDK API surface stable)
