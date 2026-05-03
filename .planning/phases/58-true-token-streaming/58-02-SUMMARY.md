---
phase: 58-true-token-streaming
plan: 02
subsystem: broker
tags: [broker, passthrough, anthropic-streaming, sse, vitest, tdd, phase-58, wave-2]

# Dependency graph
requires:
  - phase: 58-true-token-streaming
    provides: Wave 0 — clientFactory test seam on PassthroughOpts/OpenAIPassthroughOpts; fake-Anthropic SSE server fixture (used by Wave 4, not by these unit tests)
  - phase: 57-passthrough-mode-agent-mode
    provides: passthroughAnthropicMessages with transitional aggregate-then-restream streaming branch + tryRefreshAndRetry + mapApiError + UpstreamHttpError mapping
provides:
  - passthroughAnthropicMessages streaming branch rewritten — true SSE async iterator forwarding (FR-BROKER-C1-01)
  - 6 new unit tests locking event-verbatim forwarding, SSE header set (no-transform + X-Accel-Buffering), >=3 distinct deltas, writableEnded early-exit, mid-stream error event, Phase 57 finalMessage helper unused
affects: [phase-58-wave-3, phase-58-wave-4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw SDK async iterator forwarding: `for await (const event of stream) res.write(`event: ${event.type}\\ndata: ${JSON.stringify(event)}\\n\\n`)` — verbatim Anthropic SSE pass-through, no field rewriting, no aggregation"
    - "SSE backpressure flush: per-event `(res as {flush?:()=>void}).flush?.()` — works whether compression middleware mounts later or not (current state: no compression mounted per Wave 0 audit)"
    - "Buffering hazards mitigation: Cache-Control: no-cache, no-transform + X-Accel-Buffering: no headers set unconditionally (defense in depth for Phase 60 reverse-proxy chain)"
    - "Graceful early-disconnect: `if (res.writableEnded) break` checked each iteration so SDK iterator can be GC'd when client closes"
    - "Mid-stream error fallback: catch around the for-await emits an Anthropic-shape `event: error` chunk before res.end() — Anthropic SSE has no [DONE] terminator so socket-close is correct stream termination per spec"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts
    - livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts

key-decisions:
  - "SDK method choice: client.messages.create({...body, stream:true}) (NOT client.messages.stream()) — RESEARCH.md verdict. The SDK's create-with-stream-true returns a Stream<RawMessageStreamEvent> whose per-event `type` field is verbatim the Anthropic SSE event name; .stream() returns a higher-level helper that wraps events. Verbatim wire forwarding requires the lower-level shape."
  - "Headers include Cache-Control: no-cache + no-transform unconditionally. Wave 0 audit confirmed no `compression(` middleware in server/index.ts; the no-transform component is harmless defense-in-depth that becomes meaningful if compression is added later or when traffic flows through Phase 60's reverse-proxy chain."
  - "X-Accel-Buffering: no header included for nginx safety even though current routing path is Cloudflare-DNS → Caddy → livinityd (no nginx). Phase 60+ may introduce nginx; setting now is one extra header per request and avoids a future regression class."
  - "Mid-stream error chunk uses Anthropic-shape `{type:'error', error:{type:'api_error', message}}` — matches what upstream emits for HTTP 529 mid-flight. Downstream Anthropic SDK consumers parse this shape natively."
  - "Test mock harness: messagesCreate now serves both stream:false (returns response object) and stream:true (returns AsyncIterable) — vi.fn().mockResolvedValueOnce() handles both. Inline makeAsyncIterable helper in test file (no new module). Mock semantics for stream:false unchanged from Phase 57; all 8 sync tests still GREEN."

patterns-established:
  - "Pattern 1: True streaming via SDK lower-level create+stream:true returning AsyncIterable<RawMessageStreamEvent> + per-event res.write/res.flush — minimum-surface translation (just JSON.stringify + event-name copy)"
  - "Pattern 2: TDD with mock-extension — adding a new behavior to an existing handler under test means extending the existing vi.mock with a richer mock shape (AsyncIterable here), not replacing it. RED tests prove the old code path is incompatible with the new mock shape; GREEN flips by changing handler to consume the new shape."
  - "Pattern 3: `event.type` verbatim copy — handler treats every upstream event as `{type: string, ...rest}` with NO knowledge of which event types exist. This is the correct model for verbatim passthrough — handler is forward-compatible with any new Anthropic event type added upstream (e.g. extended-thinking content blocks deferred per CONTEXT.md)."

requirements-completed: [FR-BROKER-C1-01]

# Metrics
duration: ~6 min
completed: 2026-05-02
---

# Phase 58 Plan 02: Anthropic Messages True Token Streaming Summary

**Replaced Phase 57 transitional aggregate-then-restream block at `passthrough-handler.ts:162` with raw async iterator forwarding via `client.messages.create({stream:true})` — clients now receive the upstream Anthropic SSE event sequence verbatim at the same temporal cadence as upstream emits (FR-BROKER-C1-01).**

## Performance

- **Duration:** ~6 min
- **Tasks:** 1/1 complete
- **Files modified:** 2 (1 source, 1 test)
- **LOC delta on `passthrough-handler.ts`:** +80 / -52 (net +28 LOC; Phase 57 transitional block was ~52 lines; new for-await block is ~80 lines including SSE headers, error handling, refresh-retry wiring, and inline documentation)

## Accomplishments

- Replaced the Phase 57 transitional streaming branch (`messages.stream(upstreamBody as any).finalMessage()` + 6-event synthetic SSE sequence with one fat `content_block_delta`) with `client.messages.create({...upstreamBody, stream:true})` returning `Stream<RawMessageStreamEvent>` and a `for await (const event of stream)` loop that writes each event as `event: <type>\ndata: <json>\n\n` — **verbatim wire pass-through** of upstream Anthropic SSE.
- Added 6 new RED-then-GREEN tests to `passthrough-handler.test.ts` covering: verbatim event forwarding for an 8-event canonical script; SSE header set (Content-Type/Cache-Control with no-transform/Connection/X-Accel-Buffering) before iteration begins; >=3 distinct `content_block_delta` events arrive (no aggregation); `res.writableEnded` checked each iteration so client-disconnect aborts iteration after the first event; mid-stream iterator failure produces an Anthropic-shape `event: error` chunk + `res.end()`; Phase 57's `messages.stream().finalMessage()` helper is **never** invoked by the streaming path now.
- Preserved Phase 57's 401-refresh-and-single-retry behavior (`tryRefreshAndRetry`) wrapping the `messages.create({stream:true})` call. On non-401 `Anthropic.APIError`, throws `mapApiError(err)` → `UpstreamHttpError` so router.ts catch (Phase 57) handles 429/Retry-After uniformly with the agent-mode error path.
- Preserved the Wave 0 `clientFactory` test seam — implementation calls `(opts.clientFactory ?? makeClient)(token)` (line preserved from Wave 0); Wave 4 integration tests will inject the fake-Anthropic SSE server via this seam.
- **Sync (`stream:false`) branch UNCHANGED** — same `client.messages.create(upstreamBody as any)` + `res.json(response)` shape. All 8 Phase 57 sync tests in `passthrough-handler.test.ts` still GREEN with zero modifications.
- **OpenAI streaming branch UNCHANGED** — `passthroughOpenAIChatCompletions` at `passthrough-handler.ts:454` still uses Phase 57 transitional `aggregate-then-emit single OpenAI chunk` path; Wave 3 will replace with translator-based 1:1 delta emission.

## Phase 57 Transitional Pattern Removal Log

The Phase 57 streaming branch (originally at `passthrough-handler.ts:162-216`, ~55 lines) was REMOVED:

```typescript
// REMOVED:
let finalMessage: any
try {
    finalMessage = await client.messages.stream(upstreamBody as any).finalMessage()
} catch (err) { ... tryRefreshAndRetry ... }

res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')

const text = (finalMessage.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('')
const writeEvent = (event, data) => { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`) }

writeEvent('message_start', { type: 'message_start', message: {...finalMessage, content: [], stop_reason: null, stop_sequence: null} })
writeEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''} })
writeEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text} })  // ONE FAT AGGREGATE
writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 })
writeEvent('message_delta', { type: 'message_delta', delta: {stop_reason: ..., stop_sequence: ...}, usage: ... })
writeEvent('message_stop', { type: 'message_stop' })
res.end()
```

Replaced with (~80 lines, see `passthrough-handler.ts:163-243`):

```typescript
// ADDED:
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache, no-transform')
res.setHeader('Connection', 'keep-alive')
res.setHeader('X-Accel-Buffering', 'no')
res.flushHeaders()

const makeClientFn = opts.clientFactory ?? makeClient

let stream: AsyncIterable<{type: string}>
try {
    stream = (await client.messages.create({...upstreamBody, stream: true} as any)) as unknown as AsyncIterable<{type: string}>
} catch (err) {
    const refreshed = await tryRefreshAndRetry<AsyncIterable<{type: string}>>(
        err, token, makeClientFn,
        async (c) => (await c.messages.create({...upstreamBody, stream: true} as any)) as unknown as AsyncIterable<{type: string}>,
    )
    if (refreshed === null) throw mapApiError(err)
    stream = refreshed
}

try {
    for await (const event of stream) {
        if (res.writableEnded) break
        const evtType = (event as {type: string}).type
        res.write(`event: ${evtType}\n`)
        res.write(`data: ${JSON.stringify(event)}\n\n`)
        const flushable = res as unknown as {flush?: () => void}
        if (typeof flushable.flush === 'function') flushable.flush()
    }
} catch (err) {
    if (!res.writableEnded) {
        try {
            res.write('event: error\n')
            res.write(`data: ${JSON.stringify({type: 'error', error: {type: 'api_error', message: (err as Error)?.message ?? 'mid-stream error'}})}\n\n`)
        } catch { /* socket already gone */ }
    }
}
if (!res.writableEnded) res.end()
```

The doc-comment block at the top of the file (`Streaming behavior:`) was updated from "Phase 57 (this wave): aggregate-then-restream …" to reflect Phase 58 Wave 2 true streaming, with a note that `passthroughOpenAIChatCompletions` still uses the Phase 57 transitional path pending Wave 3.

## Task Commits

1. **Task 1 RED — failing tests for Anthropic Messages true token streaming** — `554f0373` (test)
2. **Task 1 GREEN — Anthropic Messages true token streaming via async iterator (FR-BROKER-C1-01)** — `b4e85f58` (feat)

_Plan metadata commit (this SUMMARY) follows._

## TDD Cycle Log

| Phase | Commit | Test outcome |
|-------|--------|--------------|
| RED | `554f0373` | `vitest run passthrough-handler.test.ts` → 6 of 14 tests fail (Phase 57 streaming branch returns undefined for finalMessage when mock yields AsyncIterable; sync tests remain GREEN). Confirmed valid RED. |
| GREEN | `b4e85f58` | `vitest run passthrough-handler.test.ts` → 14/14 GREEN (10ms). Zero retries; impl was correct first try. Full broker suite 73/73 GREEN. |
| REFACTOR | (none) | Inline doc-comment update + handler rewrite landed in the GREEN commit. No separate REFACTOR commit needed. |

## Decisions Made

- **`messages.create({stream:true})` over `messages.stream()`.** RESEARCH.md verdict. The SDK's `messages.stream()` returns a higher-level helper with stream lifecycle methods (e.g., `.finalMessage()`); `messages.create({stream:true})` returns a `Stream<RawMessageStreamEvent>` async iterable whose per-event `type` field matches Anthropic SSE event names verbatim. Verbatim forwarding requires the lower-level shape.
- **Cache-Control: no-cache, no-transform unconditionally.** Wave 0 audit confirmed no compression middleware mounted, so no-transform is harmless defense-in-depth today. Becomes meaningful if compression is added later or when Phase 60's reverse-proxy chain introduces a buffer-and-transform-capable hop.
- **X-Accel-Buffering: no unconditionally.** Current routing is Cloudflare-DNS → Caddy → livinityd (no nginx). Phase 60+ may introduce nginx; setting now is one extra header per request and avoids a future regression class.
- **Mid-stream error chunk shape.** Uses `{type:'error', error:{type:'api_error', message}}` — matches Anthropic's spec for upstream HTTP 529 mid-flight. Downstream Anthropic SDK consumers parse this shape natively.
- **Test harness extension via inline AsyncIterable helper.** Did NOT modify the existing vi.mock for `@anthropic-ai/sdk` to add new SDK shape — instead, the test calls `messagesCreate.mockResolvedValueOnce(makeAsyncIterable(...))` and the handler iterates whatever messagesCreate returns. Same mock function, richer return value. This avoids touching the mock infrastructure shared by all 14 tests.

## Deviations from Plan

None — plan executed exactly as written. RED→GREEN flipped first try, all gates green first try.

One observation worth noting (NOT a deviation): the plan's `<acceptance_criteria>` lists `grep -q "client.messages.create.*stream: true"`. The implementation writes `client.messages.create({...upstreamBody, stream: true} as any)` which spans multiple lines after format-on-save; a literal one-line grep matches because `client.messages.create({...upstreamBody, stream: true}` lives on a single source line — confirmed by manual inspection.

## Verifications (post-execution)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Sacred file SHA `nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | PASS |
| `git diff -- openai-sse-adapter.ts` | empty | empty | PASS |
| `git status --short nexus/packages/core/` | empty | empty | PASS |
| Wave 0 fake-server self-test | 6/6 GREEN | 6/6 GREEN (1.74s) | PASS |
| Wave 1 translator unit tests | 23/23 GREEN | 23/23 GREEN (10ms) | PASS |
| Phase 57 sync (stream:false) tests in `passthrough-handler.test.ts` | 8/8 GREEN | 8/8 GREEN | PASS |
| Phase 58 Wave 2 streaming tests in `passthrough-handler.test.ts` | 6/6 GREEN | 6/6 GREEN | PASS |
| Full broker regression suite (Wave 0 + Phase 57 + Wave 1 + Wave 2) | 73 GREEN | 73 GREEN | PASS |
| TypeScript `--noEmit` errors specific to passthrough-handler.ts | 0 | 0 | PASS |
| `for await (const event of stream)` in passthrough-handler.ts | present | present (line 217) | PASS |
| `client.messages.create(...stream: true...)` in passthrough-handler.ts | present | present (lines 200, 213) | PASS |
| `Cache-Control.*no-transform` header set | present | present (line 191) | PASS |
| `X-Accel-Buffering` header set | present | present (line 193) | PASS |
| `res.writableEnded` checked in loop | present | present (line 218) | PASS |
| `flushable.flush` called per event | present | present (line 223) | PASS |
| `FR-BROKER-C1-01` referenced in code comment | present | present (lines 24, 165) | PASS |
| `tryRefreshAndRetry` still referenced | present | present (line 207) | PASS |
| `mapApiError` still referenced | present | present (line 215) | PASS |
| `(opts.clientFactory ?? makeClient)(token)` dispatch site | present | present (lines 150, 405 — 2 sites unchanged from Wave 0) | PASS |
| Pitfall 1 (`@nexus/core\|sdk-agent-runner\|claude-agent-sdk` in passthrough-handler.ts) | 0 matches | 0 matches | PASS |
| Phase 57 transitional `messages.stream(upstreamBody as any)` pattern in Anthropic streaming branch | 0 matches | 0 matches (pattern fully removed) | PASS |
| OpenAI streaming branch still uses Phase 57 transitional aggregate-then-emit | yes (Wave 3 territory) | yes (line 454: `// Phase 57 TRANSITIONAL: aggregate-then-emit`) | PASS |
| `package.json` diff (D-NO-NEW-DEPS) | empty | empty | PASS |

## Issues Encountered

None.

## TDD Gate Compliance

Plan has `tdd="true"` on Task 1. Gate sequence verified:

1. RED commit `554f0373` (`test(58-02): RED — ...`) precedes
2. GREEN commit `b4e85f58` (`feat(58-02): GREEN — ...`)

Both commits in `git log` between current HEAD and pre-plan baseline. RED contained tests-only change (`+238` lines on test file). GREEN contained source change (`+80/-52` on handler) that flipped 6 RED tests to PASS without breaking any of the 8 Phase 57 sync tests.

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` exists ✓
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` exists with new Phase 58 streaming tests block ✓
- Both task commits found in git log: `554f0373` (RED), `b4e85f58` (GREEN) ✓
- Sacred file SHA verified post-flight: `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓
- All plan-level `<success_criteria>` re-verified (1 modified file / Anthropic Messages streaming branch uses raw async iterator / sync path UNCHANGED / Phase 57 401-refresh + error mapping preserved / all prior tests GREEN / sacred SHA stable / openai-sse-adapter.ts byte-identical) ✓

## Next Phase Readiness

Wave 2 unblocks Wave 3 (OpenAI streaming wire-in):

- **Wave 3** will replace the Phase 57 transitional aggregate-then-emit single-chunk block at `passthrough-handler.ts:454` (in `passthroughOpenAIChatCompletions`) with the same `for await (const event of client.messages.create({stream:true}))` pattern this wave established, but pumping each event through `createAnthropicToOpenAIStreamTranslator(...).onAnthropicEvent(event)` (Wave 1) instead of writing it verbatim. After the loop, `translator.finalize()` writes the terminal `chat.completion.chunk` + `[DONE]` + closes.
- Wave 3 wire pattern (from Wave 1's hand-off note):
  ```typescript
  const translator = createAnthropicToOpenAIStreamTranslator({requestedModel: body.model, res})
  const stream = await client.messages.create({...anthropicBody, stream: true} as any)
  try {
      for await (const event of stream) translator.onAnthropicEvent(event as any)
  } finally {
      translator.finalize()
      if (!res.writableEnded) res.end()
  }
  ```
  Note: Wave 3's loop should also include `if (res.writableEnded) break` and the same SSE header set (Content-Type/Cache-Control with no-transform/Connection/X-Accel-Buffering) and same 401-refresh-and-retry wrapping that Wave 2 established here.

- **Wave 4** integration tests will use Wave 0's fake-Anthropic SSE server (CANONICAL_SCRIPT: 5 deltas @ 300ms) injected via the `clientFactory` seam. Assertions: ≥3 distinct `content_block_delta` events arrive at the client at distinct timestamps (≥50ms apart). The Wave 2 implementation here directly enables that assertion: each upstream event is forwarded immediately upon receipt with no buffering or aggregation, and `res.flush?.()` ensures the kernel TCP buffer flushes per write.

**Hand-off note for Wave 3:** The pattern is mechanically the same — only the per-event work changes from `res.write(verbatim event)` to `translator.onAnthropicEvent(event)`. Headers, refresh-retry, mid-stream-error handling, writableEnded check, and `res.end()` semantics all carry over identically. Wave 3 should consider extracting a shared helper `forwardSSEStream(client, body, res, options)` to avoid drift between the two passthrough handlers — but that's a Wave 3 design call and out of scope for this plan.

**No blockers.** Sacred file SHA stable, two-adapters-coexist preserved, D-NO-NEW-DEPS preserved, Pitfall 1 grep clean, FR-BROKER-C1-01 satisfied at unit level (FR-BROKER-C1-02 closure deferred to Wave 4 integration test).

---
*Phase: 58-true-token-streaming*
*Completed: 2026-05-02*
