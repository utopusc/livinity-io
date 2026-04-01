# Feature Landscape: v20.0 Live Agent UI

**Domain:** AI Agent Chat Interface with Real-Time Streaming
**Researched:** 2026-03-27

## Table Stakes

Features users expect from a "Claude Code-like" experience. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time text streaming | Users see ChatGPT, Claude.ai -- they expect character-by-character output | Medium | SDK `includePartialMessages: true` yields `stream_event` with `text_delta`. Accumulate in React ref, batch render. |
| Live tool call visualization | Claude Code shows "Using Read...", "Using Bash..." as they happen | Medium | `content_block_start` with `type: "tool_use"` yields tool name. `content_block_delta` with `input_json_delta` shows parameters streaming in. `content_block_stop` marks completion. |
| Tool result display | Users need to see what tools returned (file contents, command output) | Low | `UserMessage` after tool execution contains `tool_use_result`. Render in collapsible card. Existing `ToolCallDisplay` component is the pattern. |
| Code syntax highlighting | Agent outputs code constantly | Low | `streamdown` includes Shiki highlighting. Existing react-markdown has remark-gfm but no streaming optimization. |
| Message history persistence | Users expect conversations to survive page refresh | Medium | SDK provides `session_id`. Store message history in Redis (ephemeral) or PostgreSQL (persistent). Resume via `options.resume: sessionId`. |
| Send message while agent works | PROJECT.md explicitly requires "mid-conversation interaction" | High | Streaming input mode: `query({ prompt: asyncGenerator })`. Client sends `{ type: 'message' }` over WebSocket, server yields to the generator. SDK queues messages. |
| Stop/cancel generation | Every AI chat has a stop button | Low | Client sends `{ type: 'interrupt' }`. Server calls `query.interrupt()`. SDK handles AbortController internally. |
| Session cost display | Users need to know API spend | Low | `ResultMessage` includes `total_cost_usd` and `usage` (input/output tokens). Display in chat footer. |
| Model selection | Users expect to choose between Sonnet/Opus/Haiku | Low | SDK `options.model` accepts model strings. UI dropdown, server passes through. |
| Error handling & display | Rate limits, auth failures, network errors | Medium | `SDKAssistantMessage.error` field covers auth/billing/rate-limit. `ResultMessage.subtype` covers execution errors. Display as styled error cards. |

## Differentiators

Features that set LivOS apart from basic chat UIs. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live activity feed sidebar | See exactly what the agent is doing: files read, tools called, commands run -- like Claude Code's terminal output | High | Parse `stream_event` for `content_block_start` tool_use blocks. Maintain a sidebar timeline of all tool calls with timestamps, status (running/done/error), and collapsible details. |
| Tool progress indicators | Show "Reading auth.ts...", "Running npm test..." with spinners that resolve to results | Medium | `SDKToolProgressMessage` and `SDKStatusMessage` provide this. Map tool names to human-readable descriptions. |
| Session resume across page loads | Close browser, come back, pick up where you left off | Medium | SDK sessions persist to disk by default (`persistSession: true`). Store `sessionId` in localStorage. Resume with `options.resume`. |
| Agent cost tracking per session | Show cumulative cost across turns, not just final | Medium | `ResultMessage.modelUsage` breaks down per-model usage. Track cumulative across turns. |
| Context compaction notification | Show when the agent's memory was summarized | Low | `SDKCompactBoundaryMessage` (subtype `compact_boundary`) fires when compaction happens. Display as a subtle system message in the chat. |

## Anti-Features

Features to explicitly NOT build for v20.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-provider support (Kimi) | v20.0 is about Claude Agent SDK integration. Adding Kimi back complicates the architecture. | Single provider (Claude). Kimi can return in a future milestone. |
| Custom tool definitions in UI | Users don't need to define tools through the chat UI. Tools come from the ToolRegistry. | Tools are registered server-side via ToolRegistry + MCP. |
| File/image upload in chat | Streaming input mode supports images, but the UI complexity is significant. | Defer to v20.1 or later. Text-only input for v20.0. |
| Agent-to-agent orchestration | SDK supports subagents, but exposing this in the UI adds complexity without clear user value. | Single agent per conversation. Subagents can be used internally (server-side) but not exposed in UI. |
| Extended thinking visualization | SDK streaming is incompatible with `maxThinkingTokens`. When thinking is enabled, `StreamEvent` messages are not emitted. | Use default adaptive thinking. Don't expose thinking tokens in UI. |
| Permission approval prompts in browser | SDK `canUseTool` callback could surface approval dialogs to the browser. But for a self-hosted server, all tools should be pre-approved. | Use `permissionMode: 'bypassPermissions'` or pre-approve all tools via `allowedTools`. No interactive approval. |
| Structured output / JSON mode | SDK supports `outputFormat` for JSON schemas. Not needed for chat. | Plain text/markdown output only. |
| Voice input continuation | Existing voice button in ai-chat could be kept, but requires careful integration with the new WebSocket flow. | Defer. Text input only for v20.0. Voice can be re-added later. |

## Feature Dependencies

```
WebSocket endpoint (/ws/agent)
  -> SDK session management (server-side)
    -> Real-time text streaming
    -> Live tool call visualization
    -> Tool result display
    -> Send message while agent works
    -> Stop/cancel generation

Streaming markdown renderer (streamdown)
  -> Code syntax highlighting
  -> Real-time text streaming (rendering side)

Auth (JWT on WebSocket upgrade)
  -> Model selection (per-user settings)
  -> Session cost display (per-user tracking)
  -> Session resume (per-user sessions)

Remove old Nexus AI settings
  -> Simplify settings UI
  -> Remove dead code paths
```

## MVP Recommendation

**Phase 1: Core streaming (must have for v20.0)**
1. WebSocket `/ws/agent` endpoint with JWT auth
2. SDK `query()` integration with `includePartialMessages: true`
3. Real-time text streaming with `streamdown` rendering
4. Live tool call visualization (tool name + status indicator)
5. Stop/cancel button
6. Basic error handling

**Phase 2: Polish (should have for v20.0)**
7. Send message while agent works (streaming input mode)
8. Model selection dropdown
9. Session cost display
10. Tool result collapsible cards with formatted output

**Phase 3: Deferred (v20.1+)**
- Session resume across page loads
- Live activity feed sidebar
- Agent cost tracking per session
- Image upload in chat
- Voice input

## Sources

- [Claude Agent SDK Streaming Output](https://platform.claude.com/docs/en/agent-sdk/streaming-output) - StreamEvent types and message flow
- [Claude Agent SDK Streaming Input](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) - Streaming input mode for mid-conversation messages
- [Claude Agent SDK Agent Loop](https://platform.claude.com/docs/en/agent-sdk/agent-loop) - Message lifecycle and types
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - Full Options and SDKMessage types
- Existing codebase: `livos/packages/ui/src/routes/ai-chat/index.tsx` - Current UI patterns
- Existing codebase: `nexus/packages/core/src/sdk-agent-runner.ts` - Current SDK integration
