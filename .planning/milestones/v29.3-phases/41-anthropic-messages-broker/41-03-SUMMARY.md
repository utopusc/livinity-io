---
phase: 41-anthropic-messages-broker
plan: 41-03
status: complete-locally
completed: 2026-04-30
type: feature
strategy: B (HTTP proxy to /api/agent/stream)
---

# Plan 41-03 Summary — SSE Adapter + Sync Response + HTTP Proxy SdkAgentRunner Integration

## Files Created (3 new)

- `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts` — `AnthropicSseChunk` discriminated union, `writeSseChunk(res, chunk)` Anthropic-spec wire writer, `createSseAdapter({model, res, onComplete?})` stateful event-mapper
- `livos/packages/livinityd/source/modules/livinity-broker/sync-response.ts` — `buildSyncAnthropicResponse({model, bufferedText, result})` non-streaming JSON builder + `aggregateChunkText()` helper
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — `createSdkAgentRunnerForUser(opts)` async generator that proxies to `/api/agent/stream` with `X-LivOS-User-Id` header (Plan 41-04 wires nexus consumption)

## Files Modified (1 edit)

- `livos/packages/livinityd/source/modules/livinity-broker/router.ts`:
  - Replaced Plan 41-02 stub handler with real implementation (sync + SSE branches)
  - Added imports: `createSseAdapter`, `buildSyncAnthropicResponse`, `aggregateChunkText`, `createSdkAgentRunnerForUser`, plus `AgentResult` type
  - Stub language fully removed (`grep "Plan 41-03 will replace this stub" router.ts` → 0 matches)

## Strategy B Documented

The plan's `<interfaces>` block documented the choice between Strategy A (in-process SdkAgentRunner) and Strategy B (HTTP proxy to /api/agent/stream). Strategy B was chosen because:

1. SdkAgentRunner needs `brain` and `toolRegistry` from the running nexus daemon — livinityd does not have direct handles to these (the existing AI Chat path at `livos/.../ai/index.ts:470` already uses HTTP proxy for the same reason).
2. Strategy B lets the broker reuse the existing AI Chat HTTP boundary unchanged.
3. The `X-LivOS-User-Id` header forwarding pattern is identical to AI Chat's Plan 41-04 carry-forward — single mechanism for both code paths.
4. Sacred file (`sdk-agent-runner.ts`) untouched; the broker module imports types only.

The factory function name `createSdkAgentRunnerForUser` is preserved for symmetry with a future Strategy A migration if ever desired.

## Sacred File Verification

- Pre-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f`
- Post-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (unchanged)
- `git diff nexus/packages/core/src/sdk-agent-runner.ts` → empty

## Test Results

- `cd nexus/packages/core && npm run test:phase40` → 9/9 PASS (4 home-override + 5 chained Phase 39)
- `npx tsx --eval` import-load tests for all 4 modified files → all `ok`
- `buildSyncAnthropicResponse({...stoppedReason:'complete'})` → `{stop_reason: 'end_turn'}` (correct)

## Sample Curl Commands (post `pnpm --filter @livos/livinityd dev`)

Sync request:
```bash
curl -X POST http://127.0.0.1:8080/u/<admin-id>/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"hi"}]}'
```

Streaming request:
```bash
curl -N -X POST http://127.0.0.1:8080/u/<admin-id>/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Count to 5"}],"stream":true}'
```

Expected SSE wire (per Anthropic spec):
```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{...}}

event: ping
data: {"type":"ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
...
event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn",...},...}

event: message_stop
data: {"type":"message_stop"}
```

## Open Gap (closed by Plan 41-04)

`X-LivOS-User-Id` is already SENT by `agent-runner-factory.ts` in multi-user mode, but nexus's `/api/agent/stream` does NOT YET consume it (still uses `process.env.HOME` for the spawned `claude` CLI subprocess). Plan 41-04 adds the nexus-side header reader → `agentConfig.homeOverride` wiring — once landed, broker-initiated requests AND AI Chat requests both spawn with per-user HOME automatically.

## Pointer

Next plan: `41-04-PLAN.md` (AI Chat carry-forward — wire `X-LivOS-User-Id` → `homeOverride` on both livinityd and nexus sides).
