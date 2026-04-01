# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- ✅ **v23.0 Mobile PWA** — Phases 37-40 (shipped 2026-04-01)
- [ ] **v24.0 Mobile Responsive UI** — Phases 1-5 (in progress)

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

### v24.0 Mobile Responsive UI (In Progress)

**Milestone Goal:** Make every system app (AI Chat, Settings, Server Control, Files, Terminal) fully usable on mobile -- proper responsive layouts, touch-friendly controls, no overflow/scroll issues. Each phase delivers one complete app's mobile experience.

**CRITICAL CONSTRAINT:** Desktop UI must NOT be modified -- all mobile changes gated on `useIsMobile()` or CSS breakpoints.

- [x] **Phase 1: AI Chat Mobile** - Responsive sidebar drawer, compact messages, touch-friendly input (completed 2026-04-01)
- [x] **Phase 2: Settings Mobile** - Single-column layout, proper scrolling, touch-sized controls (completed 2026-04-01)
- [ ] **Phase 3: Server Control Mobile** - Stackable dashboard cards, mobile-friendly tables and actions
- [ ] **Phase 4: Files Mobile** - Drawer-based folder navigation, adaptive file grid, compact toolbar
- [ ] **Phase 5: Terminal Mobile** - Viewport-fitted xterm.js, readable font, landscape support

## Phase Details

### Phase 1: AI Chat Mobile
**Goal**: Users can have full AI conversations on mobile with the same functionality as desktop
**Depends on**: Nothing (first phase)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04
**Success Criteria** (what must be TRUE):
  1. User can open and close the conversation/agents sidebar on mobile via a hamburger button, and it renders as an overlay drawer that does not push content off-screen
  2. Long messages with code blocks render within the viewport width -- no horizontal scrolling on the chat area
  3. Tool call cards display a compact summary on mobile with a tap target to expand full details
  4. The chat input area including file upload button stays anchored at the bottom, is not occluded by the mobile keyboard, and has touch-friendly sizing
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md -- Mobile sidebar drawer + navigation headers + touch-friendly chat input (CHAT-01, CHAT-04)
- [x] 01-02-PLAN.md -- Message width constraints + compact tool cards (CHAT-02, CHAT-03)

### Phase 2: Settings Mobile
**Goal**: Users can navigate and modify all settings on mobile without layout issues
**Depends on**: Nothing (independent)
**Requirements**: SET-01, SET-02, SET-03, SET-04
**Success Criteria** (what must be TRUE):
  1. Settings page uses a single-column stacked layout on mobile -- no side navigation panel visible; sections are accessed via a top-level list or back-navigation pattern
  2. Every settings section (Users, Domains, AI, About) scrolls vertically without horizontal overflow or content clipping
  3. All interactive controls (inputs, selects, toggles, buttons) have a minimum 44px touch target and adequate spacing
  4. Modal dialogs (invite user, add domain, etc.) render full-width on mobile without clipping or overflowing the viewport
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md -- Mobile single-column drill-down layout + overflow protection (SET-01, SET-02)
- [x] 02-02-PLAN.md -- Touch-friendly controls + full-width mobile dialogs (SET-03, SET-04)

### Phase 3: Server Control Mobile
**Goal**: Users can monitor and manage Docker containers on mobile with full visibility
**Depends on**: Nothing (independent)
**Requirements**: SRV-01, SRV-02, SRV-03, SRV-04
**Success Criteria** (what must be TRUE):
  1. Dashboard overview cards (CPU, memory, containers, etc.) stack vertically on mobile instead of overflowing horizontally
  2. The container list renders with compact rows that fit mobile width, with horizontal scroll only inside individual data cells if needed
  3. Container action buttons (start, stop, restart, remove) are accessible with touch-friendly sizing and not hidden behind unresponsive overflow menus
  4. Server stats and charts resize to fill mobile viewport width without cropping or overflow
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md -- Responsive dashboard cards, scrollable tab bar, mobile overview layout (SRV-01, SRV-04)
- [ ] 03-02-PLAN.md -- Mobile container list cards, 44px touch actions, responsive detail sheet and create form (SRV-02, SRV-03)

### Phase 4: Files Mobile
**Goal**: Users can browse, navigate, and manage files on mobile with proper touch controls
**Depends on**: Nothing (independent)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04
**Success Criteria** (what must be TRUE):
  1. The folder sidebar renders as a slide-in drawer on mobile with a toggle button, not permanently visible alongside the file list
  2. File list and grid views adapt to mobile width -- items are properly sized and tappable without accidental selection of adjacent items
  3. Toolbar actions (upload, new folder, delete, etc.) are accessible on mobile via a compact toolbar or overflow menu with touch-friendly targets
  4. File preview and details panels render within the viewport on mobile without overlapping the file list or causing horizontal overflow
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Terminal Mobile
**Goal**: Users can use the terminal on mobile for basic server commands
**Depends on**: Nothing (independent)
**Requirements**: TERM-01, TERM-02, TERM-03
**Success Criteria** (what must be TRUE):
  1. The xterm.js terminal fills the mobile viewport width without horizontal scrollbar -- terminal cols match the available screen width
  2. Terminal font is at least 12px, rendering readable text on mobile screens without pinch-to-zoom
  3. Rotating to landscape mode triggers proper terminal resize (cols/rows recalculate) and the terminal remains fully functional
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. AI Chat Mobile | v24.0 | 0/2 | Complete    | 2026-04-01 |
| 2. Settings Mobile | v24.0 | 0/2 | Complete    | 2026-04-01 |
| 3. Server Control Mobile | v24.0 | 0/2 | Not started | - |
| 4. Files Mobile | v24.0 | 0/0 | Not started | - |
| 5. Terminal Mobile | v24.0 | 0/0 | Not started | - |

---

## Previous Milestones

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
