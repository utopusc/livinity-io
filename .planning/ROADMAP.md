# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- **v20.0 Live Agent UI** — Phases 11-18 (in progress)

## Phases

<details>
<summary>v19.0 Custom Domain Management (Phases 07-10.1) — SHIPPED 2026-03-27</summary>

- [x] Phase 07: Platform Domain CRUD + DNS Verification (2/2 plans) — completed 2026-03-26
- [x] Phase 08: Relay Integration + Custom Domain Routing (2/2 plans) — completed 2026-03-26
- [x] Phase 09: Tunnel Sync + LivOS Domain Receiver (3/3 plans) — completed 2026-03-26
- [x] Phase 10: LivOS Domains UI + Dashboard Polish (2/2 plans) — completed 2026-03-26
- [x] Phase 10.1: Settings My Domains (1/1 plan) — completed 2026-03-27

</details>

### v20.0 Live Agent UI (In Progress)

**Milestone Goal:** Replace the Nexus API-based AI chat with Claude Agent SDK, delivering a real-time Claude Code-like experience in the browser — live tool calls, streaming output, and mid-conversation interaction.

- [x] **Phase 11: Agent SDK Backend Integration** - Claude Agent SDK subprocess running server-side in livinityd, processing user messages (completed 2026-03-27)
- [ ] **Phase 12: MCP Tool Bridge** - Existing LivOS tools (shell, files, Docker, etc.) exposed as MCP tools the SDK can call autonomously
- [ ] **Phase 13: WebSocket Streaming Transport** - Real-time WebSocket bridge streaming SDK events from backend to browser
- [ ] **Phase 14: Chat UI Foundation** - Fresh chat interface built for agent interactions with streaming text, markdown, code blocks
- [ ] **Phase 15: Live Tool Call Visualization** - Tool calls rendered as expandable cards showing name, inputs, status, and output in real-time
- [ ] **Phase 16: Mid-Conversation Interaction** - Users can send messages and interrupt while the agent is working
- [ ] **Phase 17: Session Management + History** - Persistent conversations with resume capability and browsable history sidebar
- [ ] **Phase 18: Cost Control + Settings Cleanup** - Budget caps, real-time cost display, and removal of old Nexus AI settings

## Phase Details

### Phase 11: Agent SDK Backend Integration
**Goal**: Users can send a message and receive a response processed entirely by Claude Agent SDK running server-side
**Depends on**: Nothing (first phase of v20.0)
**Requirements**: SDK-01, SDK-NF-03
**Success Criteria** (what must be TRUE):
  1. User sends a message in AI Chat and receives a coherent response from Claude Agent SDK (not the old Nexus agent loop)
  2. The SDK subprocess starts, processes the message, and returns a result without crashing or hanging
  3. Existing ProviderManager and Kimi/Claude provider abstractions remain intact and functional alongside the new SDK path
**Plans:** 1/1 plans complete
Plans:
- [x] 11-01-PLAN.md — Make SdkAgentRunner default, add watchdog/budget/env safety

### Phase 12: MCP Tool Bridge
**Goal**: Claude Agent SDK can autonomously call existing LivOS tools (shell, files, Docker, screenshot, etc.) during its agent loop
**Depends on**: Phase 11
**Requirements**: SDK-02
**Success Criteria** (what must be TRUE):
  1. Claude can read files on the server by calling the file read MCP tool during a conversation
  2. Claude can execute shell commands via the shell MCP tool and receive stdout/stderr
  3. Claude can interact with Docker containers (list, inspect) via Docker MCP tools
  4. Tool execution results flow back into the SDK's autonomous loop for multi-step reasoning
**Plans**: TBD

### Phase 13: WebSocket Streaming Transport
**Goal**: SDK events stream from the backend to the browser in real-time over WebSocket with sub-500ms first-token latency
**Depends on**: Phase 11
**Requirements**: SDK-03, SDK-NF-01, SDK-NF-02
**Success Criteria** (what must be TRUE):
  1. Text from Claude appears in the browser word-by-word as the SDK generates it (no buffering delay)
  2. First token appears in the UI within 500ms of the SDK starting to stream
  3. WebSocket auto-reconnects on disconnect without losing the current conversation state
  4. Connection resilience: in-progress conversations resume gracefully after a brief network interruption
**Plans**: TBD

### Phase 14: Chat UI Foundation
**Goal**: A clean, professional chat interface purpose-built for agent interactions replaces the old AI Chat message rendering
**Depends on**: Phase 13
**Requirements**: SDK-10
**Success Criteria** (what must be TRUE):
  1. Messages render with proper markdown formatting and syntax-highlighted code blocks
  2. Streaming text appears smoothly without layout jumps or flicker
  3. The chat interface feels responsive and professional — no visual artifacts from the old chat system
  4. Error states (SDK failure, network error, rate limit) display clearly with actionable messages
**Plans**: TBD

### Phase 15: Live Tool Call Visualization
**Goal**: Users see exactly what the agent is doing — every tool call appears as an expandable card with name, inputs, status, and output
**Depends on**: Phase 14
**Requirements**: SDK-04
**Success Criteria** (what must be TRUE):
  1. When Claude reads a file, a "Read file.ts" card appears showing the file content
  2. Shell commands show the command being run and its output in an expandable card
  3. Tool cards show execution status in real-time (running spinner, complete checkmark, error indicator)
  4. Tool call cards are collapsible — users can expand for details or collapse to keep the chat compact
**Plans**: TBD

### Phase 16: Mid-Conversation Interaction
**Goal**: Users can type and send messages while the agent is actively working, with support for interrupting or redirecting the agent
**Depends on**: Phase 14
**Requirements**: SDK-05
**Success Criteria** (what must be TRUE):
  1. User can type and send a message while Claude is in the middle of a multi-step task
  2. User can type "stop" or click a stop button and the agent halts its current work
  3. User can send "also check the tests" mid-task and the agent incorporates the instruction in its next turn
**Plans**: TBD

### Phase 17: Session Management + History
**Goal**: Conversations persist across sessions and users can browse and resume past conversations from a sidebar
**Depends on**: Phase 14
**Requirements**: SDK-06, SDK-07
**Success Criteria** (what must be TRUE):
  1. User closes the chat window, reopens it, and can continue the same conversation where they left off
  2. Past conversations appear in a sidebar list with auto-generated title, timestamp, and message count
  3. User clicks a past conversation and sees the full message history
  4. User can start a new conversation from the sidebar without losing old ones
**Plans**: TBD

### Phase 18: Cost Control + Settings Cleanup
**Goal**: Users see real-time cost tracking per conversation and the old Nexus AI settings (token/tool limits) are removed
**Depends on**: Phase 14
**Requirements**: SDK-08, SDK-09
**Success Criteria** (what must be TRUE):
  1. Each conversation shows an estimated cost based on token usage
  2. System respects the maxBudgetUsd cap and stops gracefully when the budget is exceeded
  3. Settings no longer shows the "Nexus AI Settings" panel with token/tool limit sliders
  4. AI configuration is minimal — API key and model preference only
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

Note: Phases 13, 12 can execute in parallel after Phase 11. Phases 15, 16, 17, 18 can execute in parallel after Phase 14.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 11. Agent SDK Backend Integration | v20.0 | 1/1 | Complete    | 2026-03-27 |
| 12. MCP Tool Bridge | v20.0 | 0/? | Not started | - |
| 13. WebSocket Streaming Transport | v20.0 | 0/? | Not started | - |
| 14. Chat UI Foundation | v20.0 | 0/? | Not started | - |
| 15. Live Tool Call Visualization | v20.0 | 0/? | Not started | - |
| 16. Mid-Conversation Interaction | v20.0 | 0/? | Not started | - |
| 17. Session Management + History | v20.0 | 0/? | Not started | - |
| 18. Cost Control + Settings Cleanup | v20.0 | 0/? | Not started | - |

---

## Previous Milestones

- v19.0 Custom Domain Management (Phases 07-10.1, Shipped 2026-03-27)
- v18.0 Remote Desktop Streaming (Phases 04-06, Shipped 2026-03-26)
- v17.0 Precision Computer Use (Shipped 2026-03-25)
- v16.0 Multi-Provider AI (Shipped 2026-03-25)
- v15.0 AI Computer Use (Shipped 2026-03-24)
- v14.1 Agent Installer & Setup UX (Shipped 2026-03-24)
- v14.0 Remote PC Control Agent (Shipped 2026-03-24)
- v11.0 Nexus Agent Fixes (Shipped 2026-03-22)
- v10.0 App Store Platform (Shipped 2026-03-21)
- Earlier milestones: see MILESTONES.md
