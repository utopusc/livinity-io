# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- ✅ **v23.0 Mobile PWA** — Phases 37-40 (shipped 2026-04-01)
- ✅ **v24.0 Mobile Responsive UI** — Phases 1-5 (shipped 2026-04-01)
- [ ] **v25.0 Memory & WhatsApp Integration** — Phases 6-10 (in progress)

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

<details>
<summary>v22.0 Livinity AGI Platform (Phases 29-36) — SHIPPED 2026-03-29</summary>

- [x] Phase 29: Unified Capability Registry (2/2 plans) — completed 2026-03-29
- [x] Phase 30: Agents Panel Redesign (1/1 plans) — completed 2026-03-29
- [x] Phase 31: Intent Router v2 (1/1 plans) — completed 2026-03-29
- [x] Phase 32: Auto-Provisioning Engine (1/1 plans) — completed 2026-03-29
- [x] Phase 33: Livinity Marketplace MCP (1/1 plans) — completed 2026-03-29
- [x] Phase 34: AI Self-Modification (1/1 plans) — completed 2026-03-29
- [x] Phase 35: Marketplace UI & Auto-Install (2/2 plans) — completed 2026-03-29
- [x] Phase 36: Learning Loop (3/3 plans) — completed 2026-03-29

</details>

<details>
<summary>v23.0 Mobile PWA (Phases 37-40) — SHIPPED 2026-04-01</summary>

- [x] Phase 37: PWA Foundation (2/2 plans) — completed 2026-04-01
- [x] Phase 38: Mobile Navigation Infrastructure (2/2 plans) — completed 2026-04-01
- [x] Phase 39: Mobile Home Screen + App Access (2/2 plans) — completed 2026-04-01
- [x] Phase 40: Polish + iOS Hardening (2/2 plans) — completed 2026-04-01

</details>

<details>
<summary>v24.0 Mobile Responsive UI (Phases 1-5) — SHIPPED 2026-04-01</summary>

- [x] Phase 1: AI Chat Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 2: Settings Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 3: Server Control Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 4: Files Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 5: Terminal Mobile (1/1 plans) — completed 2026-04-01

</details>

### v25.0 Memory & WhatsApp Integration (In Progress)

**Milestone Goal:** Enable persistent cross-session AI memory across all channels, add WhatsApp as a messaging channel with QR code authentication, unify conversation storage, and provide a memory management UI.

- [ ] **Phase 6: WhatsApp Channel Foundation** - Baileys ChannelProvider with Redis-backed auth state and echo-loop guard
- [x] **Phase 7: WhatsApp QR Code & Settings UI** - QR code display, connection status, and disconnect in Settings > Integrations (completed 2026-04-03)
- [ ] **Phase 8: WhatsApp Message Routing & Safety** - End-to-end messaging, rate limiting, legacy daemon.ts cleanup
- [ ] **Phase 9: Cross-Session Conversation Persistence & Search** - FTS5 conversation store, archiver pipeline, AI search tool
- [x] **Phase 10: Unified Identity & Memory Management UI** - Cross-channel userId mapping, memory settings page with search/delete (completed 2026-04-03)

## Phase Details

### Phase 6: WhatsApp Channel Foundation
**Goal**: WhatsApp exists as a proper ChannelProvider with persistent authentication that survives server restarts
**Depends on**: Nothing (first phase of v25.0)
**Requirements**: WA-02, WA-04
**Success Criteria** (what must be TRUE):
  1. WhatsAppProvider implements the ChannelProvider interface and is registered in ChannelManager alongside Telegram/Discord/Slack/Matrix
  2. Baileys WebSocket connects to WhatsApp servers and emits connection lifecycle events (connecting, open, close, QR)
  3. Auth state (Signal protocol keys, session data) is persisted to Redis so that restarting livinityd does not require re-scanning the QR code
  4. Messages sent by the bot itself are filtered out (fromMe guard) preventing echo loops
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md -- Install Baileys+QRCode deps, extend ChannelId types, create Redis auth store + logger bridge
- [x] 06-02-PLAN.md -- Create WhatsAppProvider, register in ChannelManager, wire DmPairing+daemon

### Phase 7: WhatsApp QR Code & Settings UI
**Goal**: Users can connect their WhatsApp account by scanning a QR code in Settings and see live connection status
**Depends on**: Phase 6
**Requirements**: WA-01, WA-06
**Success Criteria** (what must be TRUE):
  1. User navigates to Settings > Integrations and sees a WhatsApp section with a "Connect" button
  2. Clicking Connect displays a QR code that auto-refreshes when it expires, and scanning it with WhatsApp links the account within seconds
  3. After successful connection, the UI shows "Connected" status with the linked phone number and a Disconnect button
  4. Clicking Disconnect terminates the Baileys session and clears auth state, returning the UI to the Connect state
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md -- Nexus REST endpoints + tRPC routes for WhatsApp QR, status, connect, disconnect
- [x] 07-02-PLAN.md -- WhatsApp tab and QR panel in Settings > Integrations UI

### Phase 8: WhatsApp Message Routing & Safety
**Goal**: Users can message the AI via WhatsApp and receive responses, with rate limiting to prevent account bans
**Depends on**: Phase 7
**Requirements**: WA-03, WA-05, MEM-04
**Success Criteria** (what must be TRUE):
  1. User sends a WhatsApp message to the connected number and receives an AI-generated response within the same WhatsApp conversation
  2. Outbound messages are rate-limited to a maximum of 10 per minute with randomized delays between sends
  3. The legacy ad-hoc WhatsApp code in daemon.ts (wa_outbox polling, getWhatsAppHistory, sendWhatsAppResponse) is removed and all WhatsApp routing goes through the ChannelManager
  4. If rate limit is exceeded, the AI queues responses rather than dropping them, and the user receives them with slight delay
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md -- WhatsApp rate limiter with Redis sliding window and randomized delays
- [x] 08-02-PLAN.md -- Consolidate all WhatsApp routing through ChannelManager, remove legacy daemon.ts code

### Phase 9: Cross-Session Conversation Persistence & Search
**Goal**: AI can recall and search all previous conversations across every channel using full-text search
**Depends on**: Nothing (independent of WhatsApp track -- can execute in parallel with Phases 6-8)
**Requirements**: MEM-01, MEM-02, MEM-03
**Success Criteria** (what must be TRUE):
  1. Every conversation turn (user message + AI response) from Web UI, Telegram, Discord, WhatsApp, and Slack is persisted to SQLite with channel and user metadata
  2. User asks AI "what did we discuss about Docker last week?" and receives a relevant answer synthesized from past conversation history
  3. The conversation_search tool appears in ToolRegistry and the AI autonomously invokes it when questions reference past interactions
  4. FTS5 full-text search returns results in under 50ms for typical keyword queries at self-hosted scale (thousands of conversations)
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md -- FTS5 conversation_turns table, /archive + /conversation-search endpoints, archival hooks in daemon + livinityd
- [x] 09-02-PLAN.md -- conversation_search tool in ToolRegistry, agent guidance update, nexus-core build

### Phase 10: Unified Identity & Memory Management UI
**Goal**: Same user is recognized across all channels, and users can browse, search, and delete their stored conversation memories
**Depends on**: Phase 8, Phase 9
**Requirements**: ID-01, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. A single userId maps across Telegram, WhatsApp, Web UI, and Discord so the AI knows "user X on Telegram" and "user X on WhatsApp" are the same person
  2. Settings > Memory page displays stored conversation history with a search bar that filters across all channels in real time
  3. User can select and delete individual conversation entries from the Memory page
  4. Conversation history view shows channel origin (Telegram/WhatsApp/Web/Discord icon or label) for each entry
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md -- Identity mapping table, memory service REST endpoints, tRPC proxy routes, daemon identity resolution
- [x] 10-02-PLAN.md -- Settings > Memory UI with Memories/Conversations tabs, search, delete, channel icons

## Progress

**Execution Order:**
Phases execute in numeric order: 6 -> 7 -> 8 -> 9 -> 10
Note: Phase 9 is independent of Phases 6-8 and could execute in parallel.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. WhatsApp Channel Foundation | v25.0 | 2/2 | Complete | - |
| 7. WhatsApp QR Code & Settings UI | v25.0 | 2/2 | Complete   | 2026-04-03 |
| 8. WhatsApp Message Routing & Safety | v25.0 | 0/2 | Not started | - |
| 9. Cross-Session Conversation Persistence & Search | v25.0 | 0/2 | Not started | - |
| 10. Unified Identity & Memory Management UI | v25.0 | 2/2 | Complete   | 2026-04-03 |

---

## Previous Milestones

- v24.0 Mobile Responsive UI (Phases 1-5, Shipped 2026-04-01)
- v23.0 Mobile PWA (Phases 37-40, Shipped 2026-04-01)
- v22.0 Livinity AGI Platform (Phases 29-36, Shipped 2026-03-29)
- v21.0 Autonomous Agent Platform (Phases 19-28, Shipped 2026-03-28)
- v20.0 Live Agent UI (Phases 11-18, Shipped 2026-03-27)
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
