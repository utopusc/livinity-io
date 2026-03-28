# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- **v21.0 Autonomous Agent Platform** — Phases 19-28 (in progress)

## Phases

<details>
<summary>v19.0 Custom Domain Management (Phases 07-10.1) — SHIPPED 2026-03-27</summary>

- [x] Phase 07: Platform Domain CRUD + DNS Verification (2/2 plans) — completed 2026-03-26
- [x] Phase 08: Relay Integration + Custom Domain Routing (2/2 plans) — completed 2026-03-26
- [x] Phase 09: Tunnel Sync + LivOS Domain Receiver (3/3 plans) — completed 2026-03-26
- [x] Phase 10: LivOS Domains UI + Dashboard Polish (2/2 plans) — completed 2026-03-26
- [x] Phase 10.1: Settings My Domains (1/1 plan) — completed 2026-03-27

</details>

<details>
<summary>v20.0 Live Agent UI (Phases 11-18) — SHIPPED 2026-03-27</summary>

- [x] Phase 11: Agent SDK Backend Integration (1/1 plans) — completed 2026-03-27
- [x] Phase 12: MCP Tool Bridge (1/1 plans) — completed 2026-03-27
- [x] Phase 13: WebSocket Streaming Transport (2/2 plans) — completed 2026-03-27
- [x] Phase 14: Chat UI Foundation (2/2 plans) — completed 2026-03-27
- [x] Phase 15: Live Tool Call Visualization (3/3 plans) — completed 2026-03-27
- [x] Phase 16: Mid-Conversation Interaction (1/1 plans) — completed 2026-03-27
- [x] Phase 17: Session Management + History (2/2 plans) — completed 2026-03-27
- [x] Phase 18: Cost Control + Settings Cleanup (1/1 plans) — completed 2026-03-27

</details>

### v21.0 Autonomous Agent Platform (In Progress)

**Milestone Goal:** Transform AI Chat into a fully autonomous agent platform with real-time processing visibility, agent management, slash commands, self-improving AI capabilities, and optimized system prompts.

**CRITICAL CONSTRAINT:** Auth system (OAuth, JWT, API key, login flows) must NOT be modified in any phase.

- [x] **Phase 19: AI Chat Streaming Visibility** - Real-time partial answer streaming and tool/thinking state visibility during agent processing (completed 2026-03-28)
- [x] **Phase 20: Conversation Persistence & History** - Message history persistence across sessions with browsable conversation sidebar (completed 2026-03-28)
- [ ] **Phase 21: Sidebar Agents Tab** - Renamed LivHub to Agents with agent listing, status display, and detail views
- [ ] **Phase 22: Agent Interaction & Management** - Direct agent messaging, loop controls, and new agent creation
- [ ] **Phase 23: Slash Command Menu** - Dropdown command menu with built-in and dynamic commands, filtering, and selection
- [ ] **Phase 24: Tool Conditional Registration** - Conditional registration of messaging, email, and integration tools based on connection state
- [ ] **Phase 25: Autonomous Skill & Tool Creation** - AI autonomously creates skills and installs MCP tools when needed
- [ ] **Phase 26: Autonomous Schedule & Tier Management** - AI creates schedules/loops and selects model tier based on task complexity
- [ ] **Phase 27: Self-Evaluation & Improvement Loop** - AI evaluates its own performance and triggers self-improvement actions via meta-agent
- [ ] **Phase 28: System Prompt Optimization** - Concise system prompt, shortened tool descriptions, self-awareness instructions

## Phase Details

### Phase 19: AI Chat Streaming Visibility
**Goal**: Users see exactly what the AI is doing in real-time -- partial answer text streams live below the status indicator while tool calls, thinking, and work steps are visible during processing
**Depends on**: Phase 18 (v20.0 complete)
**Requirements**: CHAT-01, CHAT-02, CHAT-03
**Success Criteria** (what must be TRUE):
  1. User sees markdown-formatted partial text streaming below StatusIndicator as the agent generates its response
  2. User can see which tools are being called, whether the agent is thinking, and what work steps are in progress -- all updating in real-time
  3. When the agent finishes processing, the streaming partial answer disappears and is replaced by the complete response rendered as a proper chat message
**Plans**: 1 plan
Plans:
- [x] 19-01-PLAN.md — Enhance useAgentSocket with agentStatus tracking, create AgentStatusOverlay component, wire into chat message rendering

### Phase 20: Conversation Persistence & History
**Goal**: Users can close AI Chat, reopen it later, and pick up where they left off -- with a browsable list of past conversations
**Depends on**: Phase 19
**Requirements**: CHAT-04, CHAT-05, CHAT-06
**Success Criteria** (what must be TRUE):
  1. User closes the AI Chat tab, reopens it, and sees their previous messages loaded from Redis (not a blank chat)
  2. User sees a list of past conversations in a sidebar panel with identifying information (title/timestamp)
  3. User clicks any past conversation and its full message history loads into the chat view
**Plans**: 1 plan
Plans:
- [x] 20-01-PLAN.md — Fix mount auto-load logic, add localStorage persistence, fix missing await in getConversation route

### Phase 21: Sidebar Agents Tab
**Goal**: Users can discover and inspect all agents from a dedicated Agents tab that replaces the old LivHub section in the AI Chat sidebar
**Depends on**: Phase 20
**Requirements**: AGNT-01, AGNT-02, AGNT-03
**Success Criteria** (what must be TRUE):
  1. The sidebar shows an "Agents" tab where "LivHub" used to be
  2. User sees a list of all agents with their current status (active/paused/stopped), last run time, and total run count
  3. User clicks an agent and sees its chat history, last result, and configuration details in a detail view
**Plans**: 2 plans
Plans:
- [ ] 21-01-PLAN.md — Add history REST endpoint in Nexus, enhance list() with description/tier, add getSubagent and getSubagentHistory tRPC queries
- [ ] 21-02-PLAN.md — Rename LivHub tab to Agents, create AgentsPanel with list/detail views

### Phase 22: Agent Interaction & Management
**Goal**: Users can interact with agents directly -- sending messages, controlling loops, and creating new agents -- all from the Agents tab
**Depends on**: Phase 21
**Requirements**: AGNT-04, AGNT-05, AGNT-06
**Success Criteria** (what must be TRUE):
  1. User can send a message to any agent directly from the Agents tab and see the response
  2. User can view loop agent details (current iteration, last state) and use stop/start controls to manage the loop
  3. User can create a new agent from a compact form in the Agents tab without leaving the sidebar
**Plans**: TBD

### Phase 23: Slash Command Menu
**Goal**: Users can type `/` in the chat input to get a searchable dropdown of built-in and dynamic commands for quick actions
**Depends on**: Phase 19
**Requirements**: SLSH-01, SLSH-02, SLSH-03, SLSH-04, SLSH-05
**Success Criteria** (what must be TRUE):
  1. Typing `/` in the chat input shows a dropdown menu above the input field
  2. Dropdown lists built-in commands (/usage, /new, /help, /agents, /loops, /skills) and dynamic commands fetched from the backend via listSlashCommands tRPC query
  3. Typing after `/` filters the visible commands in real-time (e.g., `/us` shows only `/usage`)
  4. Selecting a command inserts it into the input field and sends it
**Plans**: TBD

### Phase 24: Tool Conditional Registration
**Goal**: Tools for disconnected integrations (WhatsApp, Telegram, Discord, Slack, Gmail) are not registered in daemon.ts, keeping the tool list clean and relevant
**Depends on**: Phase 18 (v20.0 complete, independent of other v21.0 phases)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):
  1. whatsapp_send tool only appears in the tool registry when WHATSAPP_ENABLED is true
  2. channel_send tool only appears when at least one messaging integration (Telegram/Discord/Slack) is connected
  3. gmail_* tools only appear when Gmail OAuth is connected
  4. Tool implementations (the actual handler code) are unchanged -- only the registration gate logic is new
**Plans**: TBD

### Phase 25: Autonomous Skill & Tool Creation
**Goal**: The AI can identify capability gaps and fill them by creating new skills or installing MCP tools without human intervention
**Depends on**: Phase 24
**Requirements**: AGI-01, AGI-02
**Success Criteria** (what must be TRUE):
  1. When the AI determines it needs a capability it does not have, it autonomously creates a new skill file in nexus/skills/ with appropriate schema and logic
  2. When the AI needs an external tool, it searches the MCP registry via mcp_registry_search and installs the tool via mcp_install without user prompting
  3. Newly created skills and installed tools are immediately usable in subsequent agent turns
**Plans**: TBD

### Phase 26: Autonomous Schedule & Tier Management
**Goal**: The AI can manage its own execution patterns -- creating recurring schedules for repetitive tasks and selecting the right model tier for each task's complexity
**Depends on**: Phase 25
**Requirements**: AGI-03, AGI-04
**Success Criteria** (what must be TRUE):
  1. When the AI identifies a task that should recur (e.g., daily backup check), it autonomously creates a schedule or loop using ScheduleManager/LoopRunner
  2. The AI selects the appropriate model tier based on task complexity: flash/haiku for simple lookups, sonnet for reasoning, opus for architecture decisions
  3. Tier selection rules are configurable in nexus/config/tiers.json and the AI's selectTier() function reads them at runtime
**Plans**: TBD

### Phase 27: Self-Evaluation & Improvement Loop
**Goal**: The AI evaluates its own performance after tasks and continuously identifies capability gaps to fill -- creating a self-improving feedback loop
**Depends on**: Phase 25, Phase 26
**Requirements**: AGI-05, AGI-06
**Success Criteria** (what must be TRUE):
  1. After completing a task, the AI evaluates its own performance and identifies areas for improvement (e.g., missing skills, slow patterns, repeated failures)
  2. Self-evaluation triggers concrete improvement actions: creating new skills, updating existing skills, installing tools, or setting schedules
  3. A Self-Improvement Agent runs as a meta-agent loop, continuously scanning for and filling capability gaps across the system
**Plans**: TBD

### Phase 28: System Prompt Optimization
**Goal**: The agent system prompt is concise, context-window efficient, and gives the AI clear self-awareness of its capabilities and limits
**Depends on**: Phase 27
**Requirements**: SPRT-01, SPRT-02, SPRT-03
**Success Criteria** (what must be TRUE):
  1. The system prompt in agent.ts is measurably shorter (fewer tokens) while retaining all essential behavioral instructions
  2. Tool descriptions are shortened to essential information only -- no redundant explanations or verbose parameter docs
  3. The AI demonstrates self-awareness: it knows what it can do, what it cannot do, and when to escalate to the user rather than attempting tasks beyond its capabilities
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in priority order: 19 -> 20 -> 21 -> 22 -> 23 -> 24 -> 25 -> 26 -> 27 -> 28

Note: Phase 23 (Slash Commands) and Phase 24 (Tool Cleanup) can execute in parallel with Phase 21-22 (Agents) as they are independent feature branches. Phase 27 depends on both Phase 25 and Phase 26.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 19. AI Chat Streaming Visibility | v21.0 | 1/1 | Complete    | 2026-03-28 |
| 20. Conversation Persistence & History | v21.0 | 1/1 | Complete    | 2026-03-28 |
| 21. Sidebar Agents Tab | v21.0 | 0/2 | Not started | - |
| 22. Agent Interaction & Management | v21.0 | 0/TBD | Not started | - |
| 23. Slash Command Menu | v21.0 | 0/TBD | Not started | - |
| 24. Tool Conditional Registration | v21.0 | 0/TBD | Not started | - |
| 25. Autonomous Skill & Tool Creation | v21.0 | 0/TBD | Not started | - |
| 26. Autonomous Schedule & Tier Management | v21.0 | 0/TBD | Not started | - |
| 27. Self-Evaluation & Improvement Loop | v21.0 | 0/TBD | Not started | - |
| 28. System Prompt Optimization | v21.0 | 0/TBD | Not started | - |

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
