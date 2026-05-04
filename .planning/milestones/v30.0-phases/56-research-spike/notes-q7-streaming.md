# Q7 Research Notes — Agent Mode Block-Level Streaming Confirmation

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-01
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q7 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (carried from Q1+Q2)

## Sources Fetched

- https://docs.anthropic.com/en/api/messages-streaming (1481k bytes — canonical Anthropic SSE event sequence; same source consulted in Q1)
- https://github.com/anthropics/claude-agent-sdk-typescript (274k bytes — repo landing page; client-rendered)
- https://github.com/anthropics/claude-agent-sdk-python (392k bytes — sister SDK page)
- https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk (97k bytes — npm landing)
- https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/README.md (2.5k — README; minimal)
- https://api.github.com/repos/anthropics/claude-agent-sdk-typescript/contents (root listing — confirms `src/` is NOT exposed publicly; the repo only ships README, examples, scripts, CHANGELOG)
- https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.2.84 (npm metadata: `claudeCodeVersion: 2.1.84`, `unpackedSize: 61662229` ~62MB — confirms package is bundled Claude Code distribution)
- **Local node_modules: `nexus/packages/core/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`** (4110 lines — definitive public TypeScript surface for the Agent SDK; the .d.ts IS the source-of-truth API contract)
- In-repo: `nexus/packages/core/src/sdk-agent-runner.ts` lines 340-355 (`query({prompt, options:{...}})` invocation — READ ONLY; no edit) and lines 375-400 + 435-441 (assistant-message loop, READ ONLY)
- In-repo: `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` lines 89-177 (current adapter consuming aggregated `chunk` events)
- In-repo: `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md` (D-51-03 deferral rationale — Branch N reversal pending Phase 56 verdict)

## Key Findings

### F1 — Anthropic Messages SSE event sequence (canonical)

From `docs.anthropic.com/en/api/messages-streaming` and confirmed in `@anthropic-ai/sdk` `src/core/streaming.ts:60-95` (Q1 reading):

```
event: message_start         (carries the message metadata + initial usage tokens)
event: content_block_start   (one per content block — text, tool_use, etc.)
event: content_block_delta   (text_delta or input_json_delta; ONE PER TOKEN-GROUP)
event: content_block_delta   ...
event: content_block_stop
event: message_delta          (carries stop_reason + final output_tokens)
event: message_stop
```

Plus `event: ping` (no-op keepalive) and `event: error` (terminal error).

**All 6 named events VERIFIED present in the streaming spec.** [VERIFIED: docs.anthropic.com/en/api/messages-streaming + SDK src/core/streaming.ts:60-95]

### F2 — Agent SDK `query()` API surface (definitive)

From local `nexus/packages/core/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`:

```ts
// line 1671: query() function signature
export declare function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: { /* see below */ };
}): Query;

// line 1494: Query is an async generator of SDKMessage events
export declare interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  // ...
}

// line 2142: SDKMessage union — includes SDKPartialAssistantMessage
export declare type SDKMessage =
  | SDKAssistantMessage          // <-- the aggregated full-turn message
  | SDKUserMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage   // <-- per-token streaming events!
  | /* ... 18 more event types ... */;

// line 2144: SDKPartialAssistantMessage shape
export declare type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: BetaRawMessageStreamEvent;   // <-- the raw Anthropic SSE event
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};

// line 1003-1006: includePartialMessages option
/**
 * Include partial/streaming message events in the output.
 * When true, `SDKPartialAssistantMessage` events will be emitted during streaming.
 */
includePartialMessages?: boolean;   // default: false
```

**Decisive finding:** The Agent SDK DOES support token-level streaming events. They arrive as `type: 'stream_event'` messages carrying `BetaRawMessageStreamEvent` (the SAME Anthropic SSE event types: `message_start`, `content_block_delta`, etc.). Gating: the caller must opt in via `options.includePartialMessages: true`. Default is `false`. [VERIFIED: nexus/packages/core/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts lines 1003-1006, 1671, 1494, 2142, 2144]

### F3 — Sacred file currently does NOT opt in (READ-ONLY observation)

Read `nexus/packages/core/src/sdk-agent-runner.ts` lines 340-355:
```ts
const messages = query({
  prompt: task,
  options: {
    systemPrompt,
    mcpServers,
    tools: [],
    allowedTools,
    maxTurns,
    maxBudgetUsd,
    model: tierToModel(tier),
    permissionMode: 'dontAsk',
    persistSession: false,
    abortController,
    env: safeEnv,
  },
});
```

**`includePartialMessages: true` is NOT set** → SDK default of `false` applies → the SDK does NOT emit `SDKPartialAssistantMessage` events → only aggregated `SDKAssistantMessage` events (with full `content` arrays) reach the iterator.

Then read `nexus/packages/core/src/sdk-agent-runner.ts` lines 378-389:
```ts
if (message.type === 'assistant') {
  const betaMessage = (message as SDKAssistantMessage).message;
  if (betaMessage && Array.isArray(betaMessage.content)) {
    for (const block of betaMessage.content) {
      if (block.type === 'text' && block.text) {
        // ...
        this.emitEvent({ type: 'chunk', turn: turns, data: block.text });
        // ...
      }
    }
  }
}
```

The loop iterates the `assistant` message's `content` array (one entry per content block — typically ONE for a text-only response, more if tool_use mixed) and emits each `text` block's full `block.text` as a single `chunk` event. **This is the aggregation site** named at sacred file line 382-389 in CONTEXT.md.

Plus line 440 explicitly comments:
```ts
// Other message types (system, stream_event, tool_progress, etc.) are logged but not emitted
```

So even IF `includePartialMessages: true` were passed AND `stream_event` messages were arriving, this loop would IGNORE them per the explicit comment. Two doors closed: (a) the option isn't set, (b) the message-type handling doesn't process `stream_event`.

**Aggregation is therefore TWO separate things in v30 source:**
1. The SDK option `includePartialMessages: false` (default — no per-token events emitted).
2. The sacred-file loop's explicit narrowing to `'assistant'` type only (no `stream_event` handling).

To switch agent mode to token-level streaming, BOTH would need a sacred file edit. Per D-51-03 + the sacred-file boundary, this is OUT OF SCOPE for v30. It becomes a candidate D-30-XX deferred-decision row for v30.1+ if and only if user pain demands it.

[VERIFIED via READ-ONLY observation: sdk-agent-runner.ts lines 340-355 and 378-389 and 440. NO EDIT MADE. Sacred file SHA `git hash-object` re-confirmed at end of task.]

### F4 — Why passthrough mode (Q1's verdict) sidesteps all of this

Q1 chose Strategy A: HTTP-proxy direct to `api.anthropic.com/v1/messages` with raw byte-forward of `Response.body` to the broker's `res` socket. This means:

- Passthrough mode NEVER calls `query()` from the Agent SDK.
- Passthrough mode NEVER touches `sdk-agent-runner.ts`.
- The SSE event stream that reaches the external client (Bolt.diy / Open WebUI / Continue.dev) is the EXACT byte stream Anthropic emits — `message_start` → `content_block_delta` ×N → `message_stop` — with no aggregation in between.

Phase 57 implements passthrough as the new default for external broker traffic (FR-BROKER-A1-01). External clients see token-by-token streaming WITHOUT any sacred-file edit.

This is the D-51-03 ANSWER for the external-client use case: Branch N reversal NOT NEEDED in v30 because passthrough handles external traffic; agent mode (internal LivOS AI Chat) keeps current aggregation behavior, which is acceptable because the in-app UI already accommodates it (the existing Phase 51 deploy-layer fix addressed the visual streaming regression by ensuring fresh UI bundles, NOT by changing aggregation semantics).

[VERIFIED: cross-references Q1 verdict in `notes-q1-passthrough.md` and `SPIKE-FINDINGS.md` Q1 verdict block]

### F5 — Sacred file integration site for the deferred D-30-XX row

(For documentation only — NO edit recommended in v30. The plan instructs to surface this as a READ-ONLY reference + D-30-XX flag.)

If a future v30.1+ phase wants to enable token streaming in agent mode for parity with passthrough, the surgical edit would be:

- **File:** `nexus/packages/core/src/sdk-agent-runner.ts`
- **Line:** 342-354 (the `options:` block) → ADD `includePartialMessages: true,`
- **Line:** 378-440 (the message-handling loop) → ADD a new branch BEFORE the existing `if (message.type === 'assistant')`:
  ```ts
  if (message.type === 'stream_event') {
    const sse = (message as SDKPartialAssistantMessage).event;
    // Translate SSE event into existing 'chunk' event semantics
    if (sse.type === 'content_block_delta' && sse.delta?.type === 'text_delta') {
      this.emitEvent({ type: 'chunk', turn: turns, data: sse.delta.text });
    }
    continue;  // Skip the existing 'assistant' aggregation when partials are enabled
  }
  ```

But this requires:
- Sacred-file edit (D-40-01 ritual + integrity test BASELINE_SHA bump).
- Live verification of identity-line and agent-mode tool-call behavior unchanged.
- Live verification that token-stream cumulative output matches non-streamed output (round-trip equivalence).

Per D-51-03 + v30.0's sacred-file-untouched constraint, this is a v30.1+ candidate, not v30.0. The Q7 verdict is: **agent mode keeps current aggregation; passthrough delivers external-client streaming via direct Anthropic SSE; sacred file untouched in v30**.

This is candidate B from the plan's framework, refined: the SDK CAN stream, the sacred file's call-site CAN be modified, but neither is in v30.0 scope.

[VERIFIED via READ-ONLY observation; recommendation logged for v30.1 D-30-XX row]

## Sacred file lines 378-389 — read-only summary

(Per plan instruction: describe what the loop does WITHOUT proposing any edit.)

Lines 378-389 are inside an outer `for await (const message of messages)` loop. The conditional `if (message.type === 'assistant')` enters only for fully-formed assistant turn messages (the SDK emits these when `includePartialMessages: false` — the current default). The body iterates `betaMessage.content` (an array of content blocks: text, tool_use, server_tool_use, thinking, etc.) and for each `text` block, emits ONE `chunk` event carrying the entire `block.text` string. Tracking variables `firstContentReceived` (for TTFB measurement), `answer` (assignment of last text seen), `estimatedTokens` (rough budget tracker), and an optional `onAction` callback fire alongside.

**This is the block-level aggregation site.** It is correct for the SDK's default behavior (the SDK delivers complete content blocks per turn). It is NOT a bug to be fixed — it's a faithful consumer of the SDK's `SDKAssistantMessage` shape. The "block streaming" name comes from this aggregation: a turn that produces 200 tokens of text in 4 separate text content blocks would emit 4 chunks total (one per block, not one per token).

**No edit recommended in v30.** No edit made. Sacred SHA verified unchanged.

## Sacred file SHA after Q7 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made — only Read tool used at lines 260-300 (Q1) and 340-355 + 378-389 + 435-441 (Q7).

## D-51-03 implication

Per `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md`, D-51-03 deferred Branch N reversal pending Phase 56 spike findings. Phase 51's deploy-layer fix (`update.sh` `rm -rf dist + reordered verify_build`) addressed the visual UI streaming regression by ensuring fresh vite bundles deploy. Sacred file was untouched there.

Q7's verdict feeds directly into the D-51-03 sub-question:

> **D-51-03 sub-question:** Is Branch N reversal (sacred-file model identity preset switch) still needed in v30?

**Q7 answer:** NO — passthrough mode (Phase 57+) bypasses the sacred file entirely for external clients. External-client identity contamination is solved by Q1+Q2 (raw-byte forward of Anthropic responses preserves whatever the model says, with no Nexus identity prepend). External-client block-streaming is solved by the same mechanism (raw byte forward = native Anthropic SSE = token-by-token). Internal LivOS AI Chat (agent mode) keeps current aggregation behavior — acceptable per Phase 51's deploy-layer fix that ensured the UI handles aggregated chunks visually.

**Branch N reversal stays DEFERRED for v30 → routed to v30.1+ candidate D-30-XX row.** If a future user complaint surfaces about agent-mode internal-chat behavior (token streaming OR identity), THAT is when D-30-XX would be opened. v30.0's success criteria are satisfied without touching the sacred file.

## ASSUMED → VERIFIED transitions

| Assumption (RESEARCH.md / plan candidate) | Status | Source |
|--------------------------------------------|--------|--------|
| Q7 candidate A: "Agent SDK fundamentally aggregates" | **PARTIALLY FALSIFIED** | The SDK does NOT fundamentally aggregate. It supports `includePartialMessages: true` to emit `SDKPartialAssistantMessage` (`type: 'stream_event'`) events carrying raw Anthropic SSE deltas. The aggregation observed in agent mode is a CALL-SITE choice (sacred file does not opt in + does not handle `stream_event`), not an SDK design constraint. [VERIFIED: sdk.d.ts lines 1003-1006, 2144] |
| Q7 candidate B: "Agent SDK CAN stream token-by-token but sacred file's loop forces aggregation → recommend D-30-XX deferred sacred-edit" | **VERIFIED** as the actual situation | Sacred file `query({options:{...}})` does not pass `includePartialMessages: true`; loop ignores `'stream_event'` message type per line 440 comment. Both are fixable via a sacred-file edit. Per D-51-03 + v30.0 sacred-untouched constraint, deferred to v30.1+ as D-30-XX candidate. |
| Q7 candidate C: "Agent SDK streams natively and sacred file aggregation is incidental → triggers D-51-03 reversal re-eval" | **DISMISSED** | Aggregation is NOT incidental; it's an explicit narrowing in the sacred-file message-type-switch (line 440 comment is unambiguous). Reversal would still require a sacred-file edit, so D-51-03 stays deferred regardless. |
