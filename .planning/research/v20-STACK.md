# Technology Stack: v20.0 Live Agent UI

**Project:** Livinity / LivOS
**Milestone:** v20.0 - Replace Nexus AI chat with Claude Agent SDK real-time browser UI
**Researched:** 2026-03-27

## Recommended Stack

### Core: Claude Agent SDK (Server-Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.85` (latest) | Agent loop, tool execution, streaming | Already a dependency in `@nexus/core`. Provides `query()` async generator that streams `SDKMessage` events. Eliminates need for custom agent loop, provider abstraction, and tool execution plumbing. The V2 preview API (`unstable_v2_createSession`) provides cleaner multi-turn with `send()`/`stream()` separation. |

**Key SDK API surface used:**

```typescript
// V1 API (stable, use this)
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, SDKAssistantMessage, SDKResultMessage, SDKPartialAssistantMessage, SDKSystemMessage } from "@anthropic-ai/claude-agent-sdk";

// V2 API (preview, monitor for stability — better for multi-turn)
import { unstable_v2_createSession, unstable_v2_resumeSession } from "@anthropic-ai/claude-agent-sdk";
```

**Decision: V1 `query()` for initial implementation.** V2 session API is cleaner for multi-turn but marked "unstable preview". Use V1 with streaming input (`AsyncGenerator<SDKUserMessage>`) for mid-conversation injection. Migrate to V2 when it stabilizes.

**Confidence:** HIGH (official docs + existing integration in `sdk-agent-runner.ts`)

### Streaming Transport: WebSocket (via existing `ws` package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ws` | `^8.18.0` | Server-side WebSocket | Already in `@nexus/core` dependencies. Bidirectional: server streams events, client sends new messages / interrupts / cancellations mid-conversation. |
| Native `WebSocket` | Browser API | Client-side WebSocket | No library needed. Built into all browsers. |

**Decision: WebSocket, NOT SSE.** Rationale:

1. **Bidirectional requirement**: v20.0 explicitly requires "mid-conversation interaction -- add messages while agent is working." SSE is unidirectional (server-to-client only). With SSE, you need a separate HTTP endpoint for client-to-server messages, which creates coordination complexity and race conditions.

2. **Existing infrastructure**: LivOS already has WebSocket infrastructure everywhere -- tRPC uses `wsLink`, the Nexus `WsGateway` uses JSON-RPC 2.0 over WebSocket, desktop streaming uses WebSocket. Adding another SSE endpoint would be an architectural inconsistency.

3. **Interrupt/cancel support**: The Claude Agent SDK `query()` object has an `interrupt()` method and `AbortController` support. These signals need to flow from browser to server instantly. WebSocket provides this natively; SSE requires a separate HTTP POST.

4. **Industry direction**: Vercel AI SDK deprecated SSE transport. The MCP protocol moved away from SSE. The `dzhng/claude-agent-server` reference implementation uses WebSocket relay.

**What NOT to use:**
- **tRPC subscriptions for agent streaming**: tRPC subscriptions work but have overhead (serialization, batching) unsuitable for high-frequency streaming events. Use a dedicated WebSocket endpoint alongside tRPC, similar to how `/ws/desktop` exists alongside tRPC for VNC.
- **SSE via Express**: Would require a separate POST endpoint for interrupts/new messages, and SSE has proxy/CDN reconnection quirks.

**Confidence:** HIGH (architectural consistency + bidirectional requirement + reference implementations)

### Streaming Markdown Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `streamdown` | `^1.0.x` | Streaming markdown for AI responses | Drop-in replacement for `react-markdown` optimized for token-by-token streaming. Handles unterminated blocks gracefully (open code fences, incomplete tables). Shiki syntax highlighting. Compatible with shadcn/ui design tokens. Used by ~2,200 projects. |

**Decision: Replace `react-markdown` with `streamdown` for the agent chat view.** Rationale:

1. **Streaming-first**: Regular `react-markdown` re-parses the entire document on every chunk, causing flicker. `streamdown` accumulates deltas incrementally.
2. **Code highlighting**: Built-in Shiki highlighting with copy/download buttons -- essential for a "Claude Code-like" experience.
3. **shadcn/ui compatible**: Uses CSS custom properties matching the existing design system.
4. **Same plugin API**: Accepts `remarkPlugins` and `rehypePlugins`, so existing remark-gfm usage migrates directly.

**Confidence:** MEDIUM (newer library, but from Vercel with active maintenance and significant adoption)

### React Patterns (No New Libraries Needed)

| Pattern | Implementation | Why |
|---------|---------------|-----|
| Streaming state management | `useReducer` + `useRef` for message accumulation | Avoids re-rendering entire message list on each token. `useRef` for mutable accumulation buffer, `useReducer` for batched state updates. No need for Zustand or external state management. |
| Tool call visualization | Custom React components with Framer Motion (already in project) | Collapsible tool call cards with status indicators. Reuse existing `ToolCallDisplay` component pattern from current `ai-chat/index.tsx`. |
| Auto-scroll | `useRef` + `IntersectionObserver` | Scroll-to-bottom with smart "user scrolled up" detection. Already a solved pattern in the current chat UI. |
| WebSocket hook | Custom `useAgentSocket` hook | Manages connection lifecycle, reconnection, message dispatch. Pattern already established with `wsClient` in `trpc.ts`. |

**What NOT to add:**
- **Vercel AI SDK (`ai` package)**: Overkill. It provides `useChat`/`streamText` but assumes its own backend protocol. LivOS already has Express + tRPC + WebSocket; adding a parallel Vercel transport layer creates unnecessary indirection. The Claude Agent SDK already handles the agent loop -- we just need to relay its messages.
- **Zustand/Jotai/Redux**: The chat state is local to the agent window. `useReducer` is sufficient. The project already avoids external state management for UI state.
- **xterm.js**: Terminal emulator is overkill for displaying tool output. The existing collapsible tool call cards are the right pattern.

**Confidence:** HIGH (existing patterns in codebase)

### Protocol: JSON Messages over WebSocket

| Aspect | Choice | Why |
|--------|--------|-----|
| Message format | JSON with `type` discriminator | Matches SDK's `SDKMessage` union type pattern. Easy to serialize/deserialize. |
| Auth | JWT token in WebSocket upgrade URL query param | Already established pattern in `trpc.ts` (`wsClient` appends `?token=`) |
| Session management | Server-side session map keyed by `sessionId` | SDK provides `session_id` on every message. Server tracks active sessions per user. |
| Reconnection | Exponential backoff (1s-30s) | Already established in desktop viewer and tRPC WS client |

**Wire protocol (server -> client):**

```typescript
// Server relays SDK messages with minimal wrapping
type AgentWsMessage =
  | { type: 'sdk_message'; data: SDKMessage }      // All SDK messages, forwarded directly
  | { type: 'error'; message: string }              // Server-side errors
  | { type: 'session_ready'; sessionId: string }    // Session initialized
```

**Wire protocol (client -> server):**

```typescript
type ClientWsMessage =
  | { type: 'start'; prompt: string; sessionId?: string; model?: string }  // Start or resume
  | { type: 'message'; text: string }               // Mid-conversation message
  | { type: 'interrupt' }                            // Stop current generation
  | { type: 'cancel' }                               // Abort entire session
```

**Confidence:** HIGH (follows existing WsGateway JSON-RPC patterns)

## What to Remove (Nexus AI Simplification)

Per PROJECT.md, v20.0 removes the Nexus API abstraction layer. These removals are stack decisions:

| Remove | Reason | Replacement |
|--------|--------|-------------|
| `AgentLoop` class (`agent.ts`) | Custom agent loop with manual tool dispatch | SDK `query()` handles this internally |
| `KimiAgentRunner` | Kimi-specific agent runner | Out of scope (Claude-only for v20.0) |
| Provider abstraction (`providers/manager.ts`) | Multi-provider switching | Direct Claude Agent SDK. Kimi support deferred. |
| SSE `/api/agent/stream` endpoint | Old streaming mechanism | WebSocket `/ws/agent` endpoint |
| Token/tool limit settings in Nexus config UI | User-facing knobs that are now handled by SDK | `maxTurns` and `maxBudgetUsd` set server-side |
| `nexus:config:*` Redis keys for AI settings | Old configuration mechanism | Simplified config: model choice + API key only |

**Keep:**
- `SdkAgentRunner` (refactor, don't delete) -- it already has the right pattern of consuming `query()` output. Refactor to emit WebSocket messages instead of EventEmitter events.
- `ToolRegistry` + MCP tool bridge -- the pattern of exposing Nexus tools via `createSdkMcpServer()` is correct and stays.
- `ClaudeProvider` auth code (API key + OAuth PKCE) -- auth flows stay, but move to a lighter auth-only module.

**Confidence:** HIGH (clear from PROJECT.md requirements)

## Full Dependency Changes

### Add to `@nexus/core` (or `livinityd`)

```bash
# No new packages needed for the backend
# @anthropic-ai/claude-agent-sdk already installed at ^0.2.84
# ws already installed at ^8.18.0
# Bump claude-agent-sdk to ^0.2.85 for latest fixes
```

### Add to `livos/packages/ui`

```bash
# Streaming markdown renderer (replaces react-markdown for agent chat)
pnpm add streamdown
```

### Remove from `@nexus/core` (deferred -- do during cleanup phase)

Nothing needs to be removed from package.json immediately. Dead code can be removed incrementally without affecting dependencies.

## Architecture Decision: Where Does the SDK Run?

**Decision: SDK runs inside livinityd (LivOS server), NOT in a separate Nexus process.**

Rationale:
1. The existing `SdkAgentRunner` already runs in the Nexus core process, which is started by livinityd.
2. The SDK spawns a Claude Code CLI subprocess internally -- this needs filesystem access to the LivOS data directory.
3. MCP tools (file operations, Docker, shell) need direct access to the server, which livinityd already has.
4. A WebSocket endpoint (`/ws/agent`) added to livinityd's Express server keeps auth consistent with existing JWT middleware.

The SDK's `query()` function is a long-running async generator. Each user session maps to one `query()` invocation. The WebSocket handler relays messages between the browser and this generator.

**Confidence:** HIGH (follows existing architectural pattern)

## Version Pinning Notes

| Package | Pin Strategy | Reason |
|---------|-------------|--------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.85` (caret) | Active development, semver-compliant, want latest patch fixes |
| `streamdown` | `^1.0.x` (caret) | Stable v1 API, shadcn/ui compatible |
| `ws` | `^8.18.0` (existing) | No change needed |
| `react-markdown` | Keep for non-agent views | Settings pages, help text, etc. still use it |

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) - Official docs, HIGH confidence
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - Full API types, HIGH confidence
- [Claude Agent SDK TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) - V2 session API, MEDIUM confidence (preview)
- [Streaming Output Docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) - `includePartialMessages`, stream event types, HIGH confidence
- [Agent Loop Architecture](https://platform.claude.com/docs/en/agent-sdk/agent-loop) - Internal loop mechanics, HIGH confidence
- [Hosting Guide](https://platform.claude.com/docs/en/agent-sdk/hosting) - Production deployment patterns, HIGH confidence
- [Migration Guide](https://platform.claude.com/docs/en/agent-sdk/migration-guide) - Breaking changes from Claude Code SDK, HIGH confidence
- [dzhng/claude-agent-server](https://github.com/dzhng/claude-agent-server) - WebSocket relay reference implementation, MEDIUM confidence
- [Streamdown](https://github.com/vercel/streamdown) - Streaming markdown renderer, MEDIUM confidence
- [claude-agent-sdk-typescript GitHub](https://github.com/anthropics/claude-agent-sdk-typescript) - Source repo, HIGH confidence
- Existing codebase: `nexus/packages/core/src/sdk-agent-runner.ts` - Working SDK integration, HIGH confidence
- Existing codebase: `livos/packages/ui/src/routes/ai-chat/index.tsx` - Current chat UI patterns, HIGH confidence
