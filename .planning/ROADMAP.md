# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- **v22.0 Livinity AGI Platform — Capability Orchestration & Marketplace** — Phases 29-36 (in progress)

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

<details>
<summary>v21.0 Autonomous Agent Platform (Phases 19-28) — SHIPPED 2026-03-28</summary>

- [x] Phase 19: AI Chat Streaming Visibility (1/1 plans) — completed 2026-03-28
- [x] Phase 20: Conversation Persistence & History (1/1 plans) — completed 2026-03-28
- [x] Phase 21: Sidebar Agents Tab (2/2 plans) — completed 2026-03-28
- [x] Phase 22: Agent Interaction & Management (2/2 plans) — completed 2026-03-28
- [x] Phase 23: Slash Command Menu (2/2 plans) — completed 2026-03-28
- [x] Phase 24: Tool Conditional Registration (1/1 plans) — completed 2026-03-28
- [x] Phase 25: Autonomous Skill & Tool Creation (1/1 plans) — completed 2026-03-28
- [x] Phase 26: Autonomous Schedule & Tier Management (1/1 plans) — completed 2026-03-28
- [x] Phase 27: Self-Evaluation & Improvement Loop (1/1 plans) — completed 2026-03-28
- [x] Phase 28: System Prompt Optimization (1/1 plans) — completed 2026-03-28

</details>

### v22.0 Livinity AGI Platform — Capability Orchestration & Marketplace (In Progress)

**Milestone Goal:** Transform Livinity into an AI Agent Marketplace + Orchestration Platform where the system auto-discovers, installs, and orchestrates capabilities based on user intent.

**CRITICAL CONSTRAINT:** Auth system (OAuth, JWT, API key, login flows) must NOT be modified. Streaming/block model/typewriter animation must NOT be broken. nexus-core runs compiled JS — MUST rebuild after source changes.

- [x] **Phase 29: Unified Capability Registry** - Single registry model for all capability types (skills, MCPs, tools, hooks, agents) with manifests and semantic search (completed 2026-03-29)
- [x] **Phase 30: Agents Panel Redesign** - Unified dashboard with tabbed capability views and detailed status cards (completed 2026-03-29)
- [ ] **Phase 31: Intent Router v2** - Semantic intent classification with confidence-scored capability matching and context budget management
- [ ] **Phase 32: Auto-Provisioning Engine** - Dynamic session capability loading based on intent with dependency resolution and system prompt composition
- [ ] **Phase 33: Livinity Marketplace MCP** - Single MCP server exposing marketplace search, install, and management with GitHub-backed registry
- [ ] **Phase 34: AI Self-Modification** - Autonomous creation of skills, hooks, and agent templates with self-testing and auto-correction
- [ ] **Phase 35: Marketplace UI & Auto-Install** - Auto-install dialog, system prompt editor with template library, and analytics dashboard
- [ ] **Phase 36: Learning Loop** - Tool call logging, pattern mining, auto-suggestions, and user feedback scoring

## Phase Details

### Phase 29: Unified Capability Registry
**Goal**: All capability types (skills, MCPs, tools, hooks, agents) are discoverable through a single unified registry with rich metadata and semantic search
**Depends on**: Phase 28 (v21.0 complete)
**Requirements**: REG-01, REG-02, REG-03, REG-04
**Success Criteria** (what must be TRUE):
  1. User can query a single API endpoint and get back a list containing skills, MCPs, tools, hooks, and agents in a uniform format
  2. Each capability entry includes a manifest with semantic tags, trigger conditions, estimated context cost, and dependency information
  3. On Nexus startup, the registry auto-populates by syncing from the existing ToolRegistry, SkillLoader, and McpClientManager without manual registration
  4. User can search capabilities by semantic tag, name substring, or type filter and get relevant results
**Plans:** 2/2 plans complete
Plans:
- [x] 29-01-PLAN.md — CapabilityManifest types + CapabilityRegistry class with sync engine
- [x] 29-02-PLAN.md — REST API endpoints + tRPC proxy + startup wiring

### Phase 30: Agents Panel Redesign
**Goal**: Users manage all capabilities from a unified dashboard that replaces the current agents-only panel with a tabbed view spanning skills, MCPs, hooks, and agents
**Depends on**: Phase 29
**Requirements**: UIP-01, UIP-02
**Success Criteria** (what must be TRUE):
  1. The sidebar panel shows tabs for Skills, MCPs, Hooks, and Agents -- all populated from the unified registry
  2. Each capability card displays its status (active/inactive), tier, provided tools, last used timestamp, and success rate
  3. Clicking a capability shows its full manifest details including dependencies, tags, and configuration
**Plans:** 1/1 plans complete
Plans:
- [x] 30-01-PLAN.md — Unified capabilities panel with tabbed views + sidebar wiring

### Phase 31: Intent Router v2
**Goal**: The system automatically selects the right capabilities for a user's message using semantic matching with confidence scoring, keeping context window usage efficient
**Depends on**: Phase 29
**Requirements**: RTR-01, RTR-02, RTR-03, RTR-04
**Success Criteria** (what must be TRUE):
  1. When a user sends a message, the system classifies intent and returns a ranked list of matching capabilities with confidence scores
  2. Only capabilities above a configurable confidence threshold are selected -- low-confidence matches are filtered out
  3. Tool definitions loaded into the agent's context never exceed 30% of the context window budget
  4. Repeated intents hit a Redis cache and resolve in under 100ms without re-computing matches
**Plans:** 1 plan
Plans:
- [ ] 31-01-PLAN.md — IntentRouter class with scoring/caching/budget + agent-session wiring

### Phase 32: Auto-Provisioning Engine
**Goal**: Agent sessions dynamically load only the capabilities relevant to the user's intent, with the AI able to discover and install missing capabilities mid-conversation
**Depends on**: Phase 29, Phase 31
**Requirements**: PRV-01, PRV-02, PRV-03, PRV-04
**Success Criteria** (what must be TRUE):
  1. When a user starts a conversation, only capabilities matching the analyzed intent are loaded into the session -- not the entire tool set
  2. If the AI needs a capability not currently loaded, it can discover and install it mid-conversation without the user restarting
  3. The system prompt is dynamically composed based on the loaded capabilities -- different conversations get different system prompts
  4. When a capability has prerequisites (e.g., an MCP depends on a skill), the system installs prerequisites first automatically
**Plans**: TBD

### Phase 33: Livinity Marketplace MCP
**Goal**: A single MCP server exposes the entire Livinity capability ecosystem with search, install, uninstall, and recommendation tools backed by a GitHub registry
**Depends on**: Phase 29
**Requirements**: MKT-01, MKT-02, MKT-03, MKT-04
**Success Criteria** (what must be TRUE):
  1. A single MCP server is running that exposes search, install, uninstall, recommend, and list as callable tools
  2. User (or AI) can install any marketplace capability with a single tool call and it becomes immediately available in the registry
  3. Before installation, the system validates the manifest and checks for conflicts with existing capabilities
  4. The marketplace registry is backed by a GitHub repository that accepts community contributions via pull requests
**Plans**: TBD

### Phase 34: AI Self-Modification
**Goal**: The AI autonomously creates new skills, hooks, and agent templates when it identifies capability gaps, with automatic testing and self-correction on failure
**Depends on**: Phase 29, Phase 32, Phase 33
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04
**Success Criteria** (what must be TRUE):
  1. When the AI identifies a capability it needs but does not have, it autonomously creates a new skill file with proper schema, registers it in the registry, and uses it in the same session
  2. The AI can create hooks (pre-commit, post-completion, file-change triggers) that fire on specified events
  3. The AI can create agent templates with a system prompt, tool set, and scheduling configuration that appear in the Agents panel
  4. Auto-created capabilities are tested immediately after creation -- if a test fails, the AI iterates up to 3 times to fix the issue before reporting failure
**Plans**: TBD

### Phase 35: Marketplace UI & Auto-Install
**Goal**: Users see auto-install recommendations when the AI discovers useful capabilities, can build custom system prompts from templates, and can view analytics on tool usage patterns
**Depends on**: Phase 30, Phase 33, Phase 36
**Requirements**: UIP-03, UIP-04, UIP-05
**Success Criteria** (what must be TRUE):
  1. When the AI recommends a new capability during conversation, an auto-install dialog appears in the chat UI letting the user approve or reject the installation
  2. A system prompt editor is available with a template library of pre-built prompts and a custom prompt builder for composing new prompts from capabilities
  3. An analytics view shows tool usage frequency, popular capability combinations, and per-tool success rates over time
**Plans**: TBD

### Phase 36: Learning Loop
**Goal**: The system continuously learns from tool usage patterns, identifies commonly co-used capabilities, auto-suggests relevant tools, and incorporates user feedback into capability scoring
**Depends on**: Phase 29, Phase 31
**Requirements**: LRN-01, LRN-02, LRN-03, LRN-04
**Success Criteria** (what must be TRUE):
  1. Every tool call execution is logged to a Redis stream with the tool name, input parameters, output status, duration, and success/failure outcome
  2. The system identifies commonly co-used capability combinations (e.g., "users who use tool A usually also need tool B") and surfaces these patterns
  3. Based on a user's intent history, the system proactively suggests capabilities the user has not yet installed but would likely benefit from
  4. Users can mark tasks as completed and optionally rate the AI's performance, which feeds back into capability confidence scores
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in priority order: 29 -> 30 -> 31 -> 32 -> 33 -> 34 -> 35 -> 36

Note: Phase 31 (Intent Router) and Phase 33 (Marketplace MCP) can execute in parallel after Phase 29 as they are independent. Phase 36 (Learning Loop) can begin after Phase 29 + Phase 31 are complete. Phase 35 depends on Phase 30, Phase 33, and Phase 36.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 29. Unified Capability Registry | v22.0 | 2/2 | Complete    | 2026-03-29 |
| 30. Agents Panel Redesign | v22.0 | 1/1 | Complete    | 2026-03-29 |
| 31. Intent Router v2 | v22.0 | 0/1 | In progress | - |
| 32. Auto-Provisioning Engine | v22.0 | 0/? | Not started | - |
| 33. Livinity Marketplace MCP | v22.0 | 0/? | Not started | - |
| 34. AI Self-Modification | v22.0 | 0/? | Not started | - |
| 35. Marketplace UI & Auto-Install | v22.0 | 0/? | Not started | - |
| 36. Learning Loop | v22.0 | 0/? | Not started | - |

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
