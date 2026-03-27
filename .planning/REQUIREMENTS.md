# Requirements: v20.0 Live Agent UI

**Defined:** 2026-03-27
**Core Value:** Real-time Claude Code-like AI experience in the browser — see everything the agent does, interact while it works.

**Research basis:** .planning/research/02-claude-agent-sdk.md

---

## Functional Requirements

### SDK-01: Agent SDK Backend Integration
Replace the Nexus agent loop with Claude Agent SDK `query()` running server-side in livinityd. The SDK subprocess handles the agent loop, tool execution, retries, and context management. Backend streams SDK events to the frontend via WebSocket.

**UAT:** User sends a message in AI Chat, Claude Agent SDK processes it server-side, response streams back in real-time.

### SDK-02: Custom MCP Tools from ToolRegistry
Wrap existing LivOS tools (shell, file operations, Docker, screenshot, etc.) as MCP tools using `tool()` + `createSdkMcpServer()`. The SDK can call these tools during its autonomous loop.

**UAT:** Claude autonomously reads files, runs shell commands, and manages Docker containers using existing LivOS tools during a conversation.

### SDK-03: Real-Time Streaming Chat
Stream Claude's text output character-by-character to the browser as it's generated. Use `includePartialMessages: true` with `stream_event` type `content_block_delta`. No buffering delays — text appears immediately.

**UAT:** User sees Claude's response appear word-by-word in the chat, similar to Claude Code CLI output speed.

### SDK-04: Live Tool Call Visualization
Display tool calls as expandable cards in the chat — showing tool name, input parameters, execution status (running/complete/error), and output. Tool calls appear in real-time as the agent works.

**UAT:** When Claude reads a file, user sees a "Read file.ts" card expand with the file content. Shell commands show the command and output.

### SDK-05: Mid-Conversation Interaction
Allow users to type and send messages while the agent is still working. Uses the SDK's async generator prompt pattern with `interrupt()` for stopping current work, or queuing the new message for the next turn.

**UAT:** While Claude is executing a multi-step task, user types "stop" or "also check the tests" and the agent responds appropriately.

### SDK-06: Session Management
Persist conversation sessions with `session_id`. Users can resume previous conversations. Sessions stored in Redis with metadata (title, timestamp, message count).

**UAT:** User closes the chat window, reopens it, and can continue the same conversation. Past conversations appear in a sidebar list.

### SDK-07: Conversation History
Browse past conversations in a sidebar. Each conversation shows title (auto-generated from first message), timestamp, and message count. Click to load and optionally resume.

**UAT:** User sees a list of past conversations, clicks one, sees the full message history, and can continue the conversation.

### SDK-08: Cost Control
Replace token/tool limit settings with `maxBudgetUsd` per session. Display real-time cost tracking in the UI (from SDK's `duration_api_ms` and token usage in result messages).

**UAT:** User sees estimated cost per conversation. System respects the budget cap and stops gracefully when exceeded.

### SDK-09: Remove Nexus AI Settings
Remove the Nexus AI Settings panel from LivOS Settings (token limits, tool limits, model tier selection). These are replaced by SDK-native controls (maxBudgetUsd, model selection via SDK).

**UAT:** Settings no longer shows "Nexus AI Settings" with token/tool limit sliders. AI configuration is minimal (API key, model preference).

### SDK-10: New Chat UI
Replace the entire AI Chat message rendering with a new component designed for agent interactions. Clean, professional design with support for streaming text, tool call cards, thinking indicators, and error states. Not a patch on the old chat — a fresh implementation.

**UAT:** AI Chat looks and feels like a professional AI agent interface. Messages render cleanly with markdown, code blocks are syntax-highlighted, tool calls are collapsible cards.

---

## Non-Functional Requirements

### SDK-NF-01: Streaming Latency
First token must appear in the UI within 500ms of the SDK starting to stream. WebSocket transport, not SSE polling.

### SDK-NF-02: Connection Resilience
WebSocket auto-reconnects on disconnect. In-progress conversations resume gracefully. No lost messages.

### SDK-NF-03: Provider Layer Preserved
Keep ProviderManager and Kimi/Claude provider abstraction intact. Agent SDK is a new path alongside (not replacing) the existing provider system. Future milestones may switch between providers.

---

## Out of Scope (v20.0)

| Feature | Reason |
|---------|--------|
| Kimi Agent SDK integration | Only Claude Agent SDK for now — Kimi has no equivalent |
| MCP server marketplace | Custom MCP servers are for internal tools only |
| Voice input in chat | Deferred — text-only for v20.0 |
| Multi-agent orchestration | Single agent per conversation for v20.0 |
| File upload in chat | Deferred to future — use file manager |
| Code execution sandbox | SDK handles its own sandboxing |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SDK-01 | Phase 11 | Complete |
| SDK-02 | Phase 12 | Complete |
| SDK-03 | Phase 13 | Complete |
| SDK-04 | Phase 15 | Pending |
| SDK-05 | Phase 16 | Pending |
| SDK-06 | Phase 17 | Pending |
| SDK-07 | Phase 17 | Pending |
| SDK-08 | Phase 18 | Pending |
| SDK-09 | Phase 18 | Pending |
| SDK-10 | Phase 14 | Pending |
| SDK-NF-01 | Phase 13 | Complete |
| SDK-NF-02 | Phase 13 | Pending |
| SDK-NF-03 | Phase 11 | Complete |

**Coverage:**
- v20.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
