# Phase 19: AI Chat Streaming Visibility - Research

**Researched:** 2026-03-28
**Domain:** Real-time UI streaming, WebSocket message handling, React state management
**Confidence:** HIGH

## Summary

Phase 19 adds real-time visibility of AI processing to the chat UI. The v20.0 milestone already built a robust WebSocket streaming infrastructure (`AgentSessionManager` -> `ws-agent.ts` -> `use-agent-socket.ts` -> React components) that streams tool calls, text deltas, and results live to the browser. However, v20.0 removed the old `StatusIndicator` component (visible in `index-v19.tsx`) that showed human-readable step descriptions, thinking state, and a terminal-style command log.

The current v20.0 UI shows raw tool call cards (collapsible with input/output) and streaming text as the assistant message. What is missing is: (a) a status overlay showing human-readable descriptions of what the agent is *doing* (the "steps" and "commands" from `chatStatus`), (b) a thinking indicator when the agent is reasoning between tool calls, and (c) a clear visual transition from streaming partial answer to finalized message.

**Primary recommendation:** Reintroduce a `StatusIndicator`-style component into the v20.0 architecture using WebSocket data rather than `getChatStatus` polling. The WebSocket already delivers all the raw events needed (tool calls, text deltas, result). Enrich the `use-agent-socket` hook to derive step descriptions, thinking state, and partial answer accumulation from the existing WebSocket message stream, then render a compact overlay above the streaming assistant message.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User can see partial AI response streaming live below StatusIndicator as markdown while agent is processing | WebSocket `content_block_delta` events with `text_delta` already stream to `use-agent-socket`. `StreamingMessage` component with `Streamdown` already renders streaming markdown. Need a status overlay above the streaming text. |
| CHAT-02 | User can see tool calls, thinking state, and work steps in real-time during agent processing | WebSocket delivers `content_block_start` (tool_use), `tool_progress`, `tool_use_summary` events. Need to derive human-readable step descriptions (like v19 `describeToolCall`) and a thinking indicator from these events in the hook or a new component. |
| CHAT-03 | When processing completes, partial answer is replaced by full response as a proper chat message | `FINALIZE_MESSAGE` reducer action already sets `isStreaming: false` on the assistant message. The `StreamingMessage` component already handles the animated -> static transition. Need to ensure the status overlay disappears when `isStreaming` flips to false. |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| streamdown | 2.5.0 | Streaming markdown renderer | Already used in `StreamingMessage` component for animated markdown |
| @streamdown/code | 1.1.1 | Code block syntax highlighting plugin | Already used with Shiki for code blocks in streaming markdown |
| framer-motion | (installed) | Animation for status transitions | Already used in `chat-messages.tsx` for tool call expand/collapse |
| @tabler/icons-react | (installed) | Icons for status indicators | Already used throughout the AI chat UI |

### Supporting (no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @trpc/react-query | (installed) | tRPC React hooks | Only if falling back to polling for non-WebSocket clients |
| ws | (installed) | WebSocket server | Already handles `/ws/agent` endpoint |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WebSocket-derived status | getChatStatus polling (v19 approach) | Polling adds 500ms latency and server load; WebSocket already delivers all needed events in real-time. Use WebSocket. |
| Custom markdown renderer | react-markdown + remark-gfm (v19 approach) | v20 already uses Streamdown which handles streaming animation natively. Stick with Streamdown. |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Current Component Hierarchy (v20.0)

```
AiChat (index.tsx)
  |-- ConversationSidebar
  |-- ChatInput
  |-- [displayMessages loop]
       |-- ChatMessageItem (chat-messages.tsx)
            |-- UserMessage
            |-- AssistantMessage
            |    |-- StreamingMessage (streaming-message.tsx)  <-- already renders streaming markdown
            |    |-- AgentToolCallDisplay[] (collapsible tool cards)
            |-- SystemMessage
            |-- ErrorMessage
```

### Current Data Flow (v20.0)

```
Browser                          livinityd (server)                   nexus-core
  |                                   |                                    |
  |-- WS: {type:'start', prompt} -->  |                                    |
  |                                   |-- ws-agent.ts ------------------>  |
  |                                   |   AgentSessionManager.startSession |
  |                                   |                                    |-- SDK query()
  |                                   |                                    |   for await (msg)
  |  <-- WS: {type:'sdk_message'} --  | <--- relay sdk_message ---------- |
  |      use-agent-socket.ts          |                                    |
  |      handleSdkMessage()           |                                    |
  |      dispatches reducer actions   |                                    |
  |      React re-renders             |                                    |
```

### Proposed Architecture Change

**Key insight:** The WebSocket already delivers ALL the raw data needed for CHAT-01, CHAT-02, CHAT-03. The problem is that `use-agent-socket.ts` only tracks messages + tool calls, not the higher-level "what is the agent doing" status. We need to add a lightweight status tracking layer.

```
use-agent-socket.ts (enhanced)
  |
  |-- messages[] (existing)           -- chat message list with tool calls
  |-- isStreaming (existing)          -- whether agent is active
  |-- agentStatus (NEW)              -- { thinking: bool, currentTool: string|null, steps: string[], phase: 'thinking'|'executing'|'responding' }
  |
  v
AiChat (index.tsx)
  |-- [displayMessages loop]
       |-- ChatMessageItem
            |-- AssistantMessage (streaming)
            |    |-- AgentStatusOverlay (NEW)    <-- shows steps, thinking, current tool
            |    |    |-- ThinkingIndicator      <-- pulsing brain icon when no tool running
            |    |    |-- StepsList              <-- human-readable descriptions of completed + active steps
            |    |    |-- CurrentToolBadge       <-- which tool is currently executing
            |    |-- StreamingMessage            <-- partial answer text (existing)
            |    |-- AgentToolCallDisplay[]      <-- detailed tool cards (existing)
```

### Recommended Implementation Approach

**Option A (recommended): Enhance `use-agent-socket` hook**

Add a derived `agentStatus` state to the hook that is computed from WebSocket events:

1. When `content_block_start` with `type: 'tool_use'` arrives -> set `phase: 'executing'`, `currentTool: name`
2. When `content_block_delta` with `text_delta` arrives -> set `phase: 'responding'`
3. When `tool_use_summary` arrives -> add step to `steps[]`, clear `currentTool`
4. When no tool running and no text streaming -> set `phase: 'thinking'`
5. When `result` arrives -> clear all status

Human-readable step descriptions can be generated client-side using the same `describeToolCall()` pattern from `index.ts` (the backend already has this function -- extract it to a shared utility or duplicate it in the UI).

**Option B (NOT recommended): Re-enable getChatStatus polling alongside WebSocket**

Would require the backend to populate `chatStatus` for WebSocket sessions (currently only populated for the legacy `ai.chat()` SSE path). Would add unnecessary server load and 500ms polling latency.

### Anti-Patterns to Avoid

- **Dual data sources**: Do NOT poll `getChatStatus` AND consume WebSocket events. Pick one (WebSocket). The `chatStatus` Map on the backend is only populated by the legacy SSE `ai.chat()` path, not by the `AgentSessionManager` WebSocket path.
- **Over-rendering**: Do NOT dispatch a React state update for every single `text_delta` chunk. The existing `requestAnimationFrame` batching in `use-agent-socket.ts` is correct -- follow the same pattern for status updates.
- **Breaking existing tool cards**: The `AgentToolCallDisplay` component already works well. The new status overlay should COMPLEMENT it, not replace it. Status shows "what the agent is doing at a high level" while tool cards show "the detailed input/output".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming markdown rendering | Custom chunk-by-chunk renderer | `Streamdown` component (already installed) | Handles incremental rendering, code highlighting, animation states |
| WebSocket reconnection | Manual reconnect logic | Existing `use-agent-socket.ts` exponential backoff | Already handles reconnection with 1s-30s backoff |
| Tool call description generation | Copy v19 backend `describeToolCall()` verbatim | Lightweight client-side version using tool name pattern matching | Only need tool name -> icon/label mapping, not full verbose descriptions |

**Key insight:** This phase is almost entirely a frontend presentation change. The WebSocket infrastructure and data pipeline are already complete from v20.0. No backend changes are needed for the core requirements.

## Common Pitfalls

### Pitfall 1: chatStatus Map is NOT populated for WebSocket sessions
**What goes wrong:** Developer tries to read `chatStatus` to get steps/thinking state for WebSocket sessions, gets null.
**Why it happens:** `chatStatus` Map is only written to by `AiModule.chat()` (the legacy SSE bridge path, used by `send` mutation and `ai-quick.tsx`). The `AgentSessionManager` WebSocket path does NOT write to `chatStatus` at all.
**How to avoid:** Derive all status information from the WebSocket `sdk_message` events on the client side. Do not try to poll `getChatStatus` for WebSocket sessions.
**Warning signs:** `getChatStatus` always returns `null` during WebSocket streaming.

### Pitfall 2: Status overlay not disappearing after streaming ends
**What goes wrong:** The status overlay (thinking/steps/current tool) stays visible after the agent finishes.
**Why it happens:** The `result` message sets `isStreaming = false` but if status state is stored separately, it may not reset.
**How to avoid:** Tie status overlay visibility to the `isStreaming` flag on the last assistant message. When `FINALIZE_MESSAGE` fires, status should clear automatically.
**Warning signs:** Status overlay persists after the final response appears.

### Pitfall 3: Thinking state flickers between tool calls
**What goes wrong:** Between each tool execution, a brief "Thinking..." flash appears and disappears.
**Why it happens:** After a tool result returns and before the next tool_use or text_delta arrives, there is a brief gap where no active event is in flight.
**How to avoid:** Add a short debounce (200-300ms) before showing "Thinking..." state. Only show it if no new event arrives within the debounce window. This prevents flicker during rapid tool-call chains.
**Warning signs:** "Thinking..." label rapidly appears and disappears during multi-tool sequences.

### Pitfall 4: Race between text streaming and status display
**What goes wrong:** Text starts streaming (partial answer) while tool status is still showing, creating visual confusion.
**Why it happens:** The SDK can interleave text blocks and tool_use blocks within a single turn.
**How to avoid:** When text deltas arrive, shift the phase to 'responding' and fade/minimize the tool status display. Show steps as a compact summary rather than a prominent overlay once text streaming begins.
**Warning signs:** Status overlay and streaming text compete for the same visual space.

### Pitfall 5: Duplicate step descriptions
**What goes wrong:** The same step description appears multiple times in the steps list.
**Why it happens:** The agent may call the same tool with different parameters, generating similar descriptions.
**How to avoid:** The v19 `index.ts` already handles this with `prevSteps.includes(desc) ? prevSteps : [...prevSteps, desc]`. Apply the same deduplication on the client side.
**Warning signs:** "Running shell command..." appearing 5 times in succession.

## Code Examples

### Example 1: Enhanced useAgentSocket status tracking

```typescript
// Source: Derived from existing use-agent-socket.ts patterns

// Add to the hook's state:
const [agentStatus, setAgentStatus] = useState<{
  phase: 'idle' | 'thinking' | 'executing' | 'responding'
  currentTool: string | null
  steps: Array<{tool: string; description: string; status: 'running' | 'complete'}>
}>({phase: 'idle', currentTool: null, steps: []})

// In handleSdkMessage, add status tracking:
case 'stream_event': {
  switch (data.event) {
    case 'content_block_start':
      if (data.content_block?.type === 'tool_use') {
        setAgentStatus(prev => ({
          ...prev,
          phase: 'executing',
          currentTool: data.content_block.name,
          steps: [...prev.steps, {
            tool: data.content_block.name,
            description: describeToolBrief(data.content_block.name),
            status: 'running'
          }]
        }))
      }
      break
    case 'content_block_delta':
      if (data.delta?.type === 'text_delta') {
        setAgentStatus(prev => ({...prev, phase: 'responding', currentTool: null}))
      }
      break
  }
  break
}

case 'tool_use_summary': {
  // Mark preceding tools as complete
  setAgentStatus(prev => ({
    ...prev,
    phase: 'thinking', // Back to thinking after tool completes
    currentTool: null,
    steps: prev.steps.map(s =>
      data.preceding_tool_use_ids?.includes(s.tool) ? {...s, status: 'complete'} : s
    )
  }))
  break
}

case 'result':
  setAgentStatus({phase: 'idle', currentTool: null, steps: []})
  break
```

### Example 2: AgentStatusOverlay component

```tsx
// Source: Pattern derived from v19 StatusIndicator and v20 tool cards

function AgentStatusOverlay({status}: {
  status: {phase: string; currentTool: string | null; steps: Array<{tool: string; description: string; status: string}>}
}) {
  if (status.phase === 'idle') return null

  return (
    <div className="mb-3 rounded-lg border border-border-default bg-surface-1 overflow-hidden">
      {/* Thinking indicator */}
      {status.phase === 'thinking' && (
        <div className="flex items-center gap-2 px-3 py-2 text-body-sm text-text-secondary">
          <IconBrain size={14} className="animate-pulse text-violet-400" />
          <span>Thinking...</span>
        </div>
      )}

      {/* Steps list */}
      {status.steps.length > 0 && (
        <div className="px-3 py-2 space-y-1.5">
          {status.steps.slice(-5).map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-body-sm">
              {step.status === 'running'
                ? <IconLoader2 size={14} className="animate-spin text-violet-400" />
                : <IconCheck size={14} className="text-green-400" />
              }
              <span className={step.status === 'running' ? 'text-text-primary' : 'text-text-tertiary'}>
                {step.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Example 3: Integration in AssistantMessage

```tsx
// Source: Pattern from existing chat-messages.tsx AssistantMessage

export function AssistantMessage({message, agentStatus}: {
  message: ChatMessage
  agentStatus?: {phase: string; currentTool: string | null; steps: Array<{tool: string; description: string; status: string}>}
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] border-l-2 border-violet-500/30 pl-4">
        {/* Status overlay -- only visible while streaming */}
        {message.isStreaming && agentStatus && agentStatus.phase !== 'idle' && (
          <AgentStatusOverlay status={agentStatus} />
        )}

        {/* Streaming/final markdown content */}
        <StreamingMessage content={message.content} isStreaming={message.isStreaming} />

        {/* Tool call detail cards */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <AgentToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

## State of the Art

| Old Approach (v19) | Current Approach (v20) | What Changed | Impact on Phase 19 |
|---------------------|------------------------|--------------|---------------------|
| `getChatStatus` polling every 500ms | WebSocket real-time streaming | v20.0 Phase 13 | Status data must be derived from WebSocket events, not polling |
| `ReactMarkdown` + `remark-gfm` | `Streamdown` with `@streamdown/code` plugin | v20.0 Phase 14 | Use `Streamdown` for any markdown rendering in status overlay |
| `StatusIndicator` component with steps/commands/partialAnswer | Removed -- only inline tool cards exist | v20.0 Phase 14 | Need to reintroduce status visibility, adapted for WebSocket data |
| `partialAnswer` field in `chatStatus` Map (server-side) | Text deltas via WebSocket to `bufferRef` | v20.0 Phase 13 | Partial answer is already rendering via `StreamingMessage` -- no backend change needed |
| `ai.chat()` SSE bridge (livinityd -> nexus) | `AgentSessionManager` + SDK `query()` direct | v20.0 Phase 11 | All real-time events flow through WebSocket, not SSE |

## Exact Files That Need Changes

### Frontend (livos/packages/ui)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/hooks/use-agent-socket.ts` | Modify | Add `agentStatus` state tracking (phase, currentTool, steps) derived from existing WebSocket events |
| `src/routes/ai-chat/chat-messages.tsx` | Modify | `AssistantMessage` gets an `agentStatus` prop; render `AgentStatusOverlay` when `isStreaming` |
| `src/routes/ai-chat/agent-status-overlay.tsx` | Create | New component: compact status showing thinking, steps, current tool |
| `src/routes/ai-chat/index.tsx` | Modify | Pass `agent.agentStatus` to the message rendering loop |

### Backend (livos/packages/livinityd)

No backend changes required. The WebSocket infrastructure already delivers all needed events.

### Nexus (nexus/packages/core)

No nexus changes required. The `AgentSessionManager` already relays all SDK messages.

## WebSocket Message Types Used for Status Derivation

| SDK Message Type | Event | Status Derived |
|------------------|-------|----------------|
| `stream_event` | `content_block_start` (tool_use) | `phase: 'executing'`, `currentTool: name`, add step |
| `stream_event` | `content_block_delta` (text_delta) | `phase: 'responding'` |
| `stream_event` | `content_block_delta` (input_json_delta) | Tool input being streamed (no status change) |
| `stream_event` | `content_block_stop` | Tool input finalized (no status change -- tool execution starts) |
| `stream_event` | `message_stop` | End of one assistant turn |
| `tool_progress` | N/A | Update elapsed time on running tool |
| `tool_use_summary` | N/A | Mark tools complete, add step descriptions |
| `user` | (tool_result blocks) | Tool output available, status -> next action |
| `result` | N/A | Agent done -> clear all status |

## Open Questions

1. **Should the status overlay be inside or outside the assistant message bubble?**
   - What we know: The v19 `StatusIndicator` was a separate component rendered outside messages. The v20 tool cards are inside the `AssistantMessage`.
   - What's unclear: Whether the visual design should wrap the status and streaming text together, or separate them.
   - Recommendation: Inside the assistant message bubble (above `StreamingMessage`), since it represents the agent's work-in-progress. This keeps the visual flow: status overlay -> streaming text -> tool cards, all within the same message container.

2. **How to handle the `ai-quick.tsx` component (Cmd+L quick dialog)?**
   - What we know: `ai-quick.tsx` still uses the legacy `send` mutation + `getChatStatus` polling. It does NOT use WebSocket.
   - What's unclear: Whether Phase 19 should also update `ai-quick.tsx` to show streaming.
   - Recommendation: OUT OF SCOPE for Phase 19. The `ai-quick.tsx` component uses a completely different code path (tRPC mutation). Phase 19 focuses on the main AI Chat page only.

3. **Should `describeToolCall()` be shared between frontend and backend?**
   - What we know: The backend `index.ts` has a 200-line `describeToolCall()` function. The frontend needs similar functionality.
   - What's unclear: Whether to share it as a package or duplicate a simpler version.
   - Recommendation: Create a lightweight client-side version (~30 lines) that maps tool name patterns to brief descriptions. The verbose backend version is overkill for a status indicator. Tool name + category icon is sufficient for the UI overlay.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no UI test framework configured) |
| Config file | none |
| Quick run command | Manual browser testing |
| Full suite command | Manual browser testing |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | Partial answer streams as markdown below status | manual-only | Visual verification in browser | N/A |
| CHAT-02 | Tool calls, thinking, steps visible in real-time | manual-only | Visual verification in browser | N/A |
| CHAT-03 | Streaming -> finalized message transition | manual-only | Visual verification in browser | N/A |

**Justification for manual-only:** All three requirements are visual/UX behaviors requiring a live WebSocket connection to the agent backend. The UI has no test framework configured (no vitest, no jest, no playwright). The nexus `agent-session.test.ts` exists but tests the SDK integration, not the React UI. Setting up a UI test framework is out of scope for this phase.

### Sampling Rate
- **Per task commit:** Manual visual verification -- send a message, observe streaming behavior
- **Per wave merge:** Full interaction test: send message, observe thinking -> tool execution -> streaming text -> final message
- **Phase gate:** All 3 success criteria verified visually in the browser

### Wave 0 Gaps
None -- no automated test infrastructure to set up for this phase (manual verification only).

## Sources

### Primary (HIGH confidence)
- `livos/packages/ui/src/hooks/use-agent-socket.ts` -- WebSocket message handling, reducer pattern, buffer management
- `livos/packages/ui/src/routes/ai-chat/index.tsx` -- Current v20.0 chat page structure
- `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` -- Message rendering components
- `livos/packages/ui/src/routes/ai-chat/streaming-message.tsx` -- Streamdown integration
- `nexus/packages/core/src/agent-session.ts` -- AgentSessionManager WebSocket relay
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` -- WebSocket endpoint handler
- `livos/packages/livinityd/source/modules/ai/index.ts` -- Backend AiModule, chatStatus Map
- `livos/packages/livinityd/source/modules/ai/routes.ts` -- tRPC routes including getChatStatus

### Secondary (HIGH confidence)
- `livos/packages/ui/src/routes/ai-chat/index-v19.tsx` -- Previous StatusIndicator implementation (reference for v19 UX patterns)
- `livos/packages/livinityd/source/modules/ai/index-v19.ts` -- Previous partialAnswer + chatStatus implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use, versions verified against npm registry
- Architecture: HIGH -- full codebase read of all relevant files, data flow traced end-to-end
- Pitfalls: HIGH -- identified from direct comparison of v19 (polling) vs v20 (WebSocket) approaches and known `chatStatus` scoping behavior

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no dependency changes expected)
