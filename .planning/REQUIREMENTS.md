# Requirements: Livinity v21.0 — Autonomous Agent Platform

**Defined:** 2026-03-28
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

**CRITICAL CONSTRAINT:** Auth system (OAuth, JWT, API key, login flows, ai-config.tsx auth section) MUST NOT be modified.

## v21.0 Requirements

Requirements for v21.0 milestone. Each maps to roadmap phases.

### AI Chat Visibility

- [x] **CHAT-01**: User can see partial AI response streaming live below StatusIndicator as markdown while agent is processing
- [x] **CHAT-02**: User can see tool calls, thinking state, and work steps in real-time during agent processing
- [x] **CHAT-03**: When processing completes, partial answer is replaced by full response as a proper chat message
- [ ] **CHAT-04**: User can close and reopen the AI Chat tab and see previous messages loaded from Redis
- [ ] **CHAT-05**: User can see a list of past conversations in a sidebar panel
- [ ] **CHAT-06**: User can click a past conversation to load its full message history

### Sidebar Agents

- [ ] **AGNT-01**: User sees "Agents" tab (renamed from "LivHub") in AI Chat sidebar
- [ ] **AGNT-02**: User can see a list of active agents with status (active/paused/stopped), last run time, and run count
- [ ] **AGNT-03**: User can click an agent to view its chat history, last result, and configuration
- [ ] **AGNT-04**: User can send a message to an agent directly from the Agents tab
- [ ] **AGNT-05**: User can see loop agent details: current iteration, last state, and stop/start controls
- [ ] **AGNT-06**: User can create a new agent from the Agents tab (compact form)

### Slash Commands

- [ ] **SLSH-01**: User sees a dropdown menu above the input field when typing `/`
- [ ] **SLSH-02**: User can see built-in commands (/usage, /new, /help, /agents, /loops, /skills) in the dropdown
- [ ] **SLSH-03**: User can see dynamic commands fetched from backend (tools + skill triggers) via listSlashCommands tRPC query
- [ ] **SLSH-04**: User can filter commands by typing after `/` (e.g., `/us` filters to `/usage`)
- [ ] **SLSH-05**: User can select a command to insert it into input and send

### AGI Mechanism

- [ ] **AGI-01**: AI can autonomously create new skills when it determines one is needed, writing to nexus/skills/
- [ ] **AGI-02**: AI can autonomously search and install MCP tools via mcp_registry_search + mcp_install
- [ ] **AGI-03**: AI can autonomously create and manage schedules and loops, analyzing tasks to determine recurrence needs
- [ ] **AGI-04**: AI selects appropriate model tier based on task complexity (flash/haiku for simple, sonnet for reasoning, opus for architecture) via enhanced selectTier() with configurable rules in nexus/config/tiers.json
- [ ] **AGI-05**: AI can evaluate its own performance after completing a task and trigger self-improvement actions (create skills, update skills, install tools, set schedules)
- [ ] **AGI-06**: Self-Improvement Agent runs as a meta-agent loop, continuously identifying and filling capability gaps

### Tool Cleanup

- [ ] **TOOL-01**: daemon.ts conditionally registers whatsapp_send only when WHATSAPP_ENABLED is true
- [ ] **TOOL-02**: daemon.ts conditionally registers channel_send only when at least one messaging integration (Telegram/Discord/Slack) is connected
- [ ] **TOOL-03**: daemon.ts conditionally registers gmail_* tools only when Gmail OAuth is connected
- [ ] **TOOL-04**: Tool implementations remain unchanged — only registration logic is modified

### System Prompt

- [ ] **SPRT-01**: Agent system prompt in agent.ts is optimized for conciseness and context window efficiency
- [ ] **SPRT-02**: Tool descriptions are shortened to essential information only
- [ ] **SPRT-03**: Agent has self-awareness instructions (capabilities, limits, when to escalate)

## v22.0+ Requirements (Future)

### Advanced Agent Features

- **AGNT-F01**: Agent marketplace for sharing custom agents between users
- **AGNT-F02**: Multi-agent collaboration (agents can delegate to other agents)
- **AGNT-F03**: Agent templates with pre-configured tool sets

### AI Capabilities

- **AGI-F01**: AI can modify its own system prompt based on user feedback
- **AGI-F02**: AI can create and manage webhooks for external event triggers
- **AGI-F03**: Cross-instance agent communication between LivOS servers

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auth system modifications | Critical constraint — OAuth, JWT, API key, login flows must not change |
| New AI providers | Claude + Kimi dual provider already working |
| Mobile app for agent management | Web-first approach |
| Agent billing/metering | Payment system deferred |
| Voice interaction with agents | Deferred, complex integration |
| Visual agent builder (drag-and-drop) | Too complex for v21.0, text-based creation sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 19 | Complete |
| CHAT-02 | Phase 19 | Complete |
| CHAT-03 | Phase 19 | Complete |
| CHAT-04 | Phase 20 | Pending |
| CHAT-05 | Phase 20 | Pending |
| CHAT-06 | Phase 20 | Pending |
| AGNT-01 | Phase 21 | Pending |
| AGNT-02 | Phase 21 | Pending |
| AGNT-03 | Phase 21 | Pending |
| AGNT-04 | Phase 22 | Pending |
| AGNT-05 | Phase 22 | Pending |
| AGNT-06 | Phase 22 | Pending |
| SLSH-01 | Phase 23 | Pending |
| SLSH-02 | Phase 23 | Pending |
| SLSH-03 | Phase 23 | Pending |
| SLSH-04 | Phase 23 | Pending |
| SLSH-05 | Phase 23 | Pending |
| TOOL-01 | Phase 24 | Pending |
| TOOL-02 | Phase 24 | Pending |
| TOOL-03 | Phase 24 | Pending |
| TOOL-04 | Phase 24 | Pending |
| AGI-01 | Phase 25 | Pending |
| AGI-02 | Phase 25 | Pending |
| AGI-03 | Phase 26 | Pending |
| AGI-04 | Phase 26 | Pending |
| AGI-05 | Phase 27 | Pending |
| AGI-06 | Phase 27 | Pending |
| SPRT-01 | Phase 28 | Pending |
| SPRT-02 | Phase 28 | Pending |
| SPRT-03 | Phase 28 | Pending |

**Coverage:**
- v21.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
