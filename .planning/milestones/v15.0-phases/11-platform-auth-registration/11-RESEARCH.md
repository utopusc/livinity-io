# Phase 11 Research: Agent SDK Backend Integration

## Domain
Replace the Nexus agent loop with Claude Agent SDK `query()` running server-side in livinityd. The SDK subprocess handles the agent loop, tool execution, retries, and context management.

## Requirements
| ID | Requirement |
|----|-------------|
| SDK-01 | Agent SDK Backend Integration — Replace Nexus agent loop with Claude Agent SDK `query()` running server-side |
| SDK-NF-03 | Provider Layer Preserved — Keep ProviderManager and provider abstractions intact alongside the new SDK path |

## Existing Codebase Analysis

### SdkAgentRunner (Already Exists)
**File:** `nexus/packages/core/src/sdk-agent-runner.ts`
- Imports `query`, `tool`, `createSdkMcpServer` from `@anthropic-ai/claude-agent-sdk` (^0.2.84)
- Converts ToolRegistry to SDK MCP tools via `buildSdkTools()`
- Uses `query()` async generator to stream messages
- Handles assistant/result message types, emits AgentEvents
- Already uses `permissionMode: 'dontAsk'` and `allowedTools` whitelist
- Enforces turn limits and token budgets
- Auto-enables Chrome DevTools MCP if CDP is reachable

### Current Agent Selection Logic
**File:** `nexus/packages/core/src/api.ts` (line ~2060)
```typescript
const agent = authMethod === 'sdk-subscription'
  ? new SdkAgentRunner(agentConfig)
  : new AgentLoop(agentConfig);
```
Only used when auth is `sdk-subscription`. We need to make SDK the default.

### Current Streaming: SSE via POST /api/agent/stream
- Express SSE endpoint with `text/event-stream`
- 15s heartbeat, `X-Accel-Buffering: no`, `setNoDelay(true)`
- Events: thinking, chunk, tool_call, observation, final_answer, error, done
- Client polls `getChatStatus` for status updates (not true streaming)

### Current Chat UI
**File:** `livos/packages/ui/src/routes/ai-chat/index.tsx`
- Uses tRPC mutations (`send`) + polling (`getChatStatus`) — NOT true streaming
- Status indicator shows steps, commands, tool approvals
- Conversation sidebar with tabs (Chat/MCP/Skills)
- Canvas panel, computer use panel, voice button

### Nexus AI Settings (to be removed later in Phase 18)
**File:** `livos/packages/ui/src/routes/settings/nexus-config.tsx`
- Response tab: style, show steps, show reasoning, language, max length
- Agent tab: max turns, max tokens, timeout, model tier, max depth, stream enabled
- Retry, Heartbeat, Session, Advanced tabs

### Provider Architecture (to be preserved per SDK-NF-03)
- `ProviderManager` in `nexus/packages/core/src/providers/manager.ts`
- `AIProvider` interface in `types.ts` — `chat()`, `chatStream()`, `think()`, `isAvailable()`
- `ClaudeProvider` and `KimiProvider` implementations
- ~700 lines total, provides fallback resilience

## Architecture Decisions for Phase 11

### Decision 1: SDK Runs in livinityd (not separate Nexus process)
- SdkAgentRunner already runs in nexus-core which livinityd starts
- SDK needs filesystem access for MCP tools
- WebSocket endpoint in livinityd keeps auth consistent

### Decision 2: Make SDK the Default Agent Runner
- Remove the `authMethod === 'sdk-subscription'` gate
- SDK becomes the primary path for all agent requests
- Keep AgentLoop as fallback (can be removed later)

### Decision 3: Keep Provider Abstractions (SDK-NF-03)
- Keep AIProvider interface, ProviderManager, ClaudeProvider
- SDK is a new runner alongside, not a replacement of providers
- Providers still useful for non-agent chat, future multi-provider support

### Decision 4: Relay SDK Messages Directly
- Forward SDKMessage to client with minimal transformation
- Client handles type-switching: stream_event, assistant, result, system
- Reduces server-side complexity and maintenance burden

## Key Pitfalls (from v20-PITFALLS.md)

1. **12s query() startup overhead** — SDK spawns fresh subprocess per call. For Phase 11, accept this as a known limitation. Future phases may implement process pooling.
2. **Subprocess memory leaks** — SDK doesn't clean up subprocesses on error/abort. Need process lifecycle management.
3. **Tool execution security** — `permissionMode: 'dontAsk'` auto-approves all tools as root. Accept for Phase 11 (single user), address in later phases.
4. **Environment variable leakage** — SDK subprocess inherits all env vars. Use `options.env` for minimal env.

## Implementation Approach

### What Phase 11 Does
1. Refactor SdkAgentRunner to be the default agent runner (not gated behind auth method)
2. Wire it into the existing `/api/agent/stream` SSE endpoint
3. Ensure basic message flow: user sends message → SDK processes → response streams back
4. Add process cleanup on completion/error
5. Keep all existing providers intact

### What Phase 11 Does NOT Do
- No WebSocket transport (Phase 13)
- No new UI (Phase 14)
- No MCP tool bridge changes (Phase 12)
- No cost tracking changes (Phase 18)
- No settings removal (Phase 18)

## Sources
- v20-ARCHITECTURE.md — Component boundaries, relay pattern, session management
- v20-STACK.md — Technology decisions, SDK API surface, what to remove/keep
- v20-PITFALLS.md — 15 pitfalls with prevention strategies
- Existing codebase: sdk-agent-runner.ts, api.ts, agent.ts, providers/
