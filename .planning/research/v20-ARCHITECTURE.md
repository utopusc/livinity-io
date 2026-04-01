# Architecture Patterns: v20.0 Live Agent UI

**Domain:** AI Agent Chat with Real-Time Streaming
**Researched:** 2026-03-27

## Recommended Architecture

### High-Level Data Flow

```
Browser (React)                    Server (livinityd/Nexus)              Claude API
     |                                      |                                |
     |-- WebSocket connect (/ws/agent) ---->|                                |
     |   (JWT auth on upgrade)              |                                |
     |                                      |                                |
     |-- { type: 'start', prompt } -------->|                                |
     |                                      |-- query({ prompt, options }) ->|
     |                                      |   (spawns Claude Code CLI)     |
     |                                      |                                |
     |<--- { sdk_message: SystemMessage } --|<-- init message ---------------|
     |<--- { sdk_message: StreamEvent } ----|<-- text_delta, tool_use -------|
     |<--- { sdk_message: StreamEvent } ----|<-- more deltas... -------------|
     |<--- { sdk_message: AssistantMsg } ---|<-- turn complete --------------|
     |                                      |   (SDK executes tools locally) |
     |<--- { sdk_message: StreamEvent } ----|<-- next turn deltas... --------|
     |<--- { sdk_message: ResultMessage } --|<-- final result ---------------|
     |                                      |                                |
     |-- { type: 'message', text } -------->|                                |
     |   (mid-conversation injection)       |-- yield to input generator --->|
     |                                      |                                |
     |-- { type: 'interrupt' } ------------>|                                |
     |                                      |-- query.interrupt() ---------->|
```

### Component Boundaries

| Component | Responsibility | Location | Communicates With |
|-----------|---------------|----------|-------------------|
| **AgentWebSocket** | WebSocket endpoint, auth, session lifecycle, message relay | `livinityd/source/modules/server/ws-agent.ts` | React UI (WebSocket), AgentSessionManager |
| **AgentSessionManager** | Maps user sessions to SDK `query()` instances, handles start/resume/interrupt | `nexus/packages/core/src/agent-session.ts` | AgentWebSocket, Claude Agent SDK |
| **SDK Bridge** | Configures `query()` options, builds MCP tools, relays SDK messages | Refactored `sdk-agent-runner.ts` | AgentSessionManager, ToolRegistry, MCP servers |
| **ToolRegistry + MCP Bridge** | Exposes Nexus tools to SDK via `createSdkMcpServer()` | Existing `tool-registry.ts` + `sdk-agent-runner.ts` | SDK Bridge |
| **AgentChatView** | React component: message list, input, tool visualization | `livos/packages/ui/src/routes/ai-chat/agent-chat.tsx` | useAgentSocket hook |
| **useAgentSocket** | React hook: WebSocket connection, message dispatch, state management | `livos/packages/ui/src/hooks/use-agent-socket.ts` | AgentChatView, WebSocket |
| **StreamingMessage** | React component: renders streaming markdown with tool cards | `livos/packages/ui/src/routes/ai-chat/streaming-message.tsx` | AgentChatView, streamdown |

### Server-Side Architecture

```
livinityd Express server
  |
  +-- /trpc (existing tRPC routes -- queries, mutations, subscriptions)
  |
  +-- /ws/desktop (existing VNC WebSocket bridge)
  |
  +-- /ws/agent (NEW -- agent streaming WebSocket)
  |     |
  |     +-- JWT auth on upgrade (reuse existing middleware)
  |     +-- AgentSessionManager
  |           |
  |           +-- Session Map: Map<userId, ActiveSession>
  |           |     |
  |           |     +-- ActiveSession {
  |           |           queryInstance: Query (async generator)
  |           |           inputGenerator: AsyncGenerator<SDKUserMessage>
  |           |           sessionId: string
  |           |           ws: WebSocket
  |           |         }
  |           |
  |           +-- on 'start' -> create query(), consume messages, relay to WS
  |           +-- on 'message' -> yield to inputGenerator
  |           +-- on 'interrupt' -> call queryInstance.interrupt()
  |           +-- on 'cancel' -> call queryInstance.close()
  |           +-- on disconnect -> cleanup, optionally persist session
```

### Client-Side Architecture

```
AgentChatView (React component)
  |
  +-- useAgentSocket() hook
  |     |
  |     +-- WebSocket connection management
  |     +-- Reconnection with exponential backoff
  |     +-- Message dispatch (start, message, interrupt)
  |     +-- Returns: { messages, isConnected, isStreaming, send, interrupt }
  |
  +-- Message List (virtualized if needed)
  |     |
  |     +-- UserMessage (simple text bubble)
  |     +-- AssistantMessage
  |     |     |
  |     |     +-- StreamingMessage (streamdown renderer)
  |     |     +-- ToolCallCard[] (collapsible, animated)
  |     |     +-- CostBadge (tokens + USD)
  |     |
  |     +-- SystemMessage (init, compaction boundary)
  |     +-- ErrorMessage (rate limit, auth, etc.)
  |
  +-- Input Area
  |     |
  |     +-- TextInput (auto-resize textarea)
  |     +-- Send / Stop button (toggles based on isStreaming)
  |     +-- Model selector dropdown
  |
  +-- Activity Sidebar (optional, Phase 2)
        |
        +-- Timeline of tool calls with status
```

## Patterns to Follow

### Pattern 1: Relay Architecture (Don't Transform SDK Messages)

**What:** Forward SDK messages to the browser with minimal transformation. Let the React client parse message types.

**When:** Always. The SDK's `SDKMessage` union type is well-structured with a `type` discriminator. Transforming on the server adds latency and creates maintenance burden when SDK types change.

**Example:**

```typescript
// Server: relay SDK messages directly
for await (const message of queryInstance) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'sdk_message', data: message }));
  }
}

// Client: type-switch on message.data.type
switch (msg.data.type) {
  case 'stream_event': handleStreamEvent(msg.data); break;
  case 'assistant': handleAssistantMessage(msg.data); break;
  case 'result': handleResult(msg.data); break;
  case 'system': handleSystemMessage(msg.data); break;
}
```

**Why:** The `dzhng/claude-agent-server` reference implementation follows this exact pattern. SDK message types are stable and well-documented. Transformation creates a mapping layer that must be maintained.

### Pattern 2: Streaming Input via AsyncGenerator for Mid-Conversation Messages

**What:** Use the SDK's streaming input mode (passing an `AsyncIterable<SDKUserMessage>` as `prompt`) to enable mid-conversation message injection.

**When:** Always for the agent WebSocket handler. Single-message mode cannot accept new inputs while the agent is working.

**Example:**

```typescript
// Server-side: create a controllable input stream
function createInputChannel() {
  const pending: SDKUserMessage[] = [];
  let resolve: (() => void) | null = null;

  async function* generator(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (pending.length === 0) {
        await new Promise<void>(r => { resolve = r; });
      }
      while (pending.length > 0) {
        yield pending.shift()!;
      }
    }
  }

  function push(msg: SDKUserMessage) {
    pending.push(msg);
    if (resolve) { resolve(); resolve = null; }
  }

  return { generator: generator(), push };
}

// Usage:
const input = createInputChannel();
const q = query({ prompt: input.generator, options: { ... } });

// When client sends a mid-conversation message:
input.push({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: userText }] },
  session_id: sessionId,
  parent_tool_use_id: null,
});
```

### Pattern 3: Batched React State Updates for Stream Events

**What:** Accumulate stream deltas in a mutable ref, flush to state on animation frames or at natural boundaries (content_block_stop, message_stop).

**When:** Always for streaming text rendering. Stream events arrive at ~50-100/second. Updating React state on every token causes excessive re-renders.

**Example:**

```typescript
function useStreamAccumulator() {
  const bufferRef = useRef('');
  const [displayText, setDisplayText] = useState('');
  const rafRef = useRef<number>();

  const appendDelta = useCallback((text: string) => {
    bufferRef.current += text;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        setDisplayText(bufferRef.current);
        rafRef.current = undefined;
      });
    }
  }, []);

  const flush = useCallback(() => {
    setDisplayText(bufferRef.current);
  }, []);

  return { displayText, appendDelta, flush };
}
```

### Pattern 4: Single Session Per User (Server-Side)

**What:** Enforce one active agent session per user. New `start` messages cancel any existing session before creating a new one.

**When:** For v20.0. The SDK runs a long-lived process per session, which consumes server resources (RAM, CPU for Claude Code CLI subprocess).

**Example:**

```typescript
class AgentSessionManager {
  private sessions = new Map<string, ActiveSession>();  // keyed by userId

  async startSession(userId: string, ws: WebSocket, prompt: string, options: SessionOptions) {
    // Cancel existing session for this user
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.queryInstance.close();
      this.sessions.delete(userId);
    }

    // Create new session
    const input = createInputChannel();
    const q = query({ prompt: input.generator, options: { ... } });
    this.sessions.set(userId, { queryInstance: q, inputChannel: input, ws, sessionId });

    // Start consuming and relaying
    this.consumeAndRelay(userId, q, ws);
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Transforming SDK Messages into Custom Types

**What:** Creating a LivOS-specific message format and mapping SDK messages to it.
**Why bad:** Creates a translation layer that breaks whenever the SDK adds new message types or fields. Doubles the type surface area. Makes debugging harder because messages in the browser don't match SDK docs.
**Instead:** Relay SDK messages directly. Add a thin wrapper (`{ type: 'sdk_message', data: SDKMessage }`) for envelope routing only.

### Anti-Pattern 2: Running SDK in Browser

**What:** Importing `@anthropic-ai/claude-agent-sdk` in client-side React code.
**Why bad:** The SDK spawns a Claude Code CLI subprocess. This requires Node.js, filesystem access, and an API key. It cannot run in a browser.
**Instead:** SDK runs server-side only. Browser connects via WebSocket relay.

### Anti-Pattern 3: Using tRPC Subscriptions for Agent Streaming

**What:** Adding an `agent.stream` tRPC subscription that wraps the SDK.
**Why bad:** tRPC subscriptions add serialization overhead, have reconnection semantics that don't match agent sessions, and can't handle bidirectional mid-conversation messages without a separate mutation. The tRPC WebSocket multiplexes all operations on one connection, so a long-running agent stream would starve other tRPC calls.
**Instead:** Dedicated `/ws/agent` WebSocket endpoint, similar to `/ws/desktop` for VNC.

### Anti-Pattern 4: Accumulating All Messages in React State Array

**What:** Pushing every `SDKMessage` into a `messages: SDKMessage[]` state array.
**Why bad:** `stream_event` messages are raw deltas (partial text, partial JSON). They're not useful for display directly. You'll have hundreds of stream events per assistant response. Storing them all wastes memory and complicates rendering.
**Instead:** Process stream events in the hook: accumulate text deltas into a buffer, track tool call state, and maintain a processed `ChatMessage[]` array with assembled content.

### Anti-Pattern 5: Re-implementing the Agent Loop

**What:** Using `@anthropic-ai/sdk` (the client SDK) and manually implementing tool dispatch, retry, context management.
**Why bad:** This is exactly what the existing `AgentLoop` class does, and it's being replaced because it's hard to maintain. The Claude Agent SDK handles tool execution, context window management, compaction, and retries internally.
**Instead:** Use `@anthropic-ai/claude-agent-sdk`'s `query()` function. It IS the agent loop.

## Scalability Considerations

| Concern | At 1 user | At 10 users | At 50 users |
|---------|-----------|-------------|-------------|
| **SDK processes** | 1 Claude Code CLI subprocess | 10 subprocesses (~100MB RAM each) | 50 subprocesses (~5GB RAM). May need process pooling or container limits. |
| **WebSocket connections** | 1 connection | 10 connections. Trivial for `ws`. | 50 connections. Still trivial for `ws`. |
| **API costs** | User's own API key | Each user's own key | Per-user key. No server-side cost pooling. |
| **Context window** | Single session, automatic compaction | Independent sessions, no cross-talk | Same. Each session compacts independently. |
| **Tool execution** | Sequential within session | Parallel across users, sequential within | May need to limit concurrent Bash executions to prevent fork bombs. |

**v20.0 target: 1-5 concurrent users** (single LivOS server). The SDK's per-session subprocess model is fine at this scale. At 50+ concurrent users, consider process pooling or queueing.

## Sources

- [Claude Agent SDK Hosting Guide](https://platform.claude.com/docs/en/agent-sdk/hosting) - Production patterns and resource requirements
- [Claude Agent SDK Agent Loop](https://platform.claude.com/docs/en/agent-sdk/agent-loop) - Internal loop mechanics
- [Claude Agent SDK Streaming Input](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) - AsyncGenerator input mode
- [dzhng/claude-agent-server](https://github.com/dzhng/claude-agent-server) - WebSocket relay reference implementation
- Existing codebase: `nexus/packages/core/src/ws-gateway.ts` - JSON-RPC WebSocket pattern
- Existing codebase: `livos/packages/livinityd/source/modules/server/index.ts` - Express server with WebSocket endpoints
- Existing codebase: `livos/packages/ui/src/trpc/trpc.ts` - Client-side WebSocket patterns
