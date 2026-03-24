# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v15.0 AI Computer Use -- enable the AI to see the screen, click, type, and navigate applications on connected devices via a screenshot-analyze-action loop, with live monitoring UI and security controls.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [x] **v11.0 Nexus Agent Fixes** - Phases 26-34 (shipped 2026-03-22)
- [x] **v12.0 Server Management Dashboard** - Phases 35-40 (shipped 2026-03-22)
- [x] **v13.0 Portainer-Level Server Management** - Phases 41-46 (shipped 2026-03-23)
- [x] **v14.0 Remote PC Control Agent** - Phases 47-53 (shipped 2026-03-24)
- [x] **v14.1 Agent Installer & Setup UX** - Phases 1-4 (shipped 2026-03-24)
- [ ] **v15.0 AI Computer Use** - Phases 5-9 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v10.0 App Store Platform (Phases 16-25) - SHIPPED 2026-03-21</summary>

### Phase 16: Install Script Docker Fix
**Status**: Complete

### Phase 17: Backend API Extensions
**Status**: Complete

### Phase 18: Store UI
**Status**: Complete

### Phase 19: postMessage Bridge Protocol
**Status**: Complete

### Phase 20: LivOS iframe Embedding
**Status**: Complete

### Phase 21: Install History & Profile
**Status**: Complete

### Phase 22: App Store Integration Fix
**Status**: Complete

### Phase 23: LivOS-Native App Compose System
**Status**: Complete

### Phase 24: App Store Expansion
**Status**: Complete

### Phase 25: Native Chrome Browser
**Status**: Complete

</details>

<details>
<summary>v11.0 Nexus Agent Fixes (Phases 26-34) - SHIPPED 2026-03-22</summary>

**Milestone Goal:** Fix 27 issues across the Nexus AI agent system -- sub-agent scheduling, cron persistence, tool profiles, session cleanup, multi-channel routing, naming consistency, system prompts, and dead code removal.

- [x] **Phase 26: Sub-agent Scheduler Coupling Fix** (completed 2026-03-22)
- [x] **Phase 27: Cron Tool BullMQ Migration** (completed 2026-03-22)
- [x] **Phase 28: Tool Profile Name Mismatch Fix** (completed 2026-03-22)
- [x] **Phase 29: MultiAgentManager Cleanup** (completed 2026-03-22)
- [x] **Phase 30: Multi-Channel Notification Routing** (completed 2026-03-22)
- [x] **Phase 31: Skills->Tools Naming Fix** (completed 2026-03-22)
- [x] **Phase 32: Native System Prompt Improvements** (completed 2026-03-22)
- [x] **Phase 33: progress_report Multi-Channel** (completed 2026-03-22)
- [x] **Phase 34: Miscellaneous Fixes** (completed 2026-03-22)

</details>

<details>
<summary>v12.0 Server Management Dashboard (Phases 35-40) - SHIPPED 2026-03-22</summary>

**Milestone Goal:** Build a comprehensive server management UI in LivOS -- full Docker container lifecycle, images/volumes/networks, PM2 process management, and enhanced system monitoring.

- [x] **Phase 35: Docker Backend + Container List/Actions UI** (completed 2026-03-22)
- [x] **Phase 36: Container Detail View + Logs + Stats** (completed 2026-03-22)
- [x] **Phase 37: Images, Volumes, Networks** (completed 2026-03-22)
- [x] **Phase 38: PM2 Process Management** (completed 2026-03-22)
- [x] **Phase 39: Enhanced System Monitoring + Overview Tab** (completed 2026-03-22)
- [x] **Phase 40: Polish, Edge Cases & Deployment** (completed 2026-03-22)

</details>

<details>
<summary>v13.0 Portainer-Level Server Management (Phases 41-46) - SHIPPED 2026-03-23</summary>

**Milestone Goal:** Match every Portainer feature -- container creation with full config, container edit + recreate, exec terminal, compose stack management, enhanced image/network/volume CRUD, bulk operations, Docker events, and engine info.

- [x] **Phase 41: Container Creation** (completed 2026-03-23)
- [x] **Phase 42: Container Edit & Recreate** (completed 2026-03-23)
- [x] **Phase 43: Exec Terminal + Enhanced Logs** (completed 2026-03-23)
- [x] **Phase 44: Bulk Ops + Enhanced Images + Networks + Volumes** (completed 2026-03-23)
- [x] **Phase 45: Docker Compose Stacks** (completed 2026-03-23)
- [x] **Phase 46: Events + Engine Info + Polish** (completed 2026-03-23)

</details>

<details>
<summary>v14.0 Remote PC Control Agent (Phases 47-53) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Build a cross-platform agent (Windows/Mac/Linux) that users install on their PCs, authenticates via livinity.io OAuth Device Authorization Grant, connects through the existing relay server, and exposes local PC capabilities as AI-callable tools in Nexus.

- [x] **Phase 47: Platform OAuth + Relay Device Infrastructure** (completed 2026-03-24)
- [x] **Phase 48: Agent Binary + Authentication** (completed 2026-03-24)
- [x] **Phase 49: Relay Message Routing + DeviceBridge** (completed 2026-03-24)
- [x] **Phase 50: Agent Core Tools -- Shell + Files** (completed 2026-03-24)
- [x] **Phase 51: Agent Extended Tools -- Processes + Screenshot + System Info** (completed 2026-03-24)
- [x] **Phase 52: My Devices UI** (completed 2026-03-24)
- [x] **Phase 53: Audit Logging + Security Hardening** (completed 2026-03-24)

</details>

<details>
<summary>v14.1 Agent Installer & Setup UX (Phases 1-4) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Replace CLI-only agent setup with polished native installers (Windows .exe, macOS .dmg, Linux .deb) and a web-based setup wizard that opens in the browser. Users double-click to install, the agent opens a beautiful setup page for OAuth, then runs silently in the background with auto-start on boot.

- [x] **Phase 1: Web Setup Wizard** (completed 2026-03-24)
- [x] **Phase 2: System Tray Icon** (completed 2026-03-24)
- [x] **Phase 3: Platform Installers** (completed 2026-03-24)
- [x] **Phase 4: Download Page** (completed 2026-03-24)

</details>

### v15.0 AI Computer Use

**Milestone Goal:** Enable the AI to see the screen, click, type, and navigate applications on connected devices -- Claude Computer Use style. The AI takes screenshots, analyzes them with multimodal vision, determines coordinates, and executes mouse/keyboard actions in a screenshot-analyze-action loop with live monitoring and security controls.

- [ ] **Phase 5: Agent Mouse & Keyboard Tools** - @jitsi/robotjs-powered mouse and keyboard automation tools in the agent
- [ ] **Phase 6: Screen Info & Screenshot Extensions** - Screen metadata and coordinate-aware screenshot output
- [ ] **Phase 7: Computer Use Loop** - Autonomous screenshot-analyze-action cycle in Nexus AI
- [ ] **Phase 8: Live Monitoring UI** - Real-time session viewer with action overlay and controls
- [ ] **Phase 9: Security & Permissions** - Consent flow, emergency stop, audit logging, auto-timeout

## Phase Details

### Phase 5: Agent Mouse & Keyboard Tools
**Goal**: AI can physically interact with a device's desktop -- clicking, typing, dragging, and scrolling -- through the existing agent tool system
**Depends on**: Nothing (builds on existing agent at agent/ with 9 tools and @jitsi/robotjs)
**Requirements**: MOUSE-01, MOUSE-02, MOUSE-03, MOUSE-04, MOUSE-05, MOUSE-06, KEY-01, KEY-02
**Success Criteria** (what must be TRUE):
  1. AI can instruct the agent to click at screen coordinates (x, y) with left, double, or right click, and the click visibly occurs on the device
  2. AI can instruct the agent to type a text string and the characters appear in the focused application on the device
  3. AI can instruct the agent to press key combinations (Ctrl+C, Alt+Tab, Enter, etc.) and the device responds to those keys
  4. AI can instruct the agent to drag from one coordinate to another (drag and drop) and scroll at a position
  5. All mouse/keyboard tools follow the existing tool dispatcher pattern (TOOL_NAMES + switch case) and route through DeviceBridge as proxy tools
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md -- Agent mouse/keyboard tool implementations with @jitsi/robotjs
- [x] 05-02-PLAN.md -- SEA build pipeline + DeviceBridge schema registration

### Phase 6: Screen Info & Screenshot Extensions
**Goal**: AI has full awareness of the device's display geometry and screenshots carry coordinate metadata for accurate targeting
**Depends on**: Phase 5 (mouse/keyboard tools need screen context to be useful)
**Requirements**: SCREEN-01, SCREEN-02
**Success Criteria** (what must be TRUE):
  1. AI can query a device's screen resolution, display count, and active window title/position
  2. Screenshot tool returns image dimensions and scaling factor alongside the JPEG data so the AI can map pixel coordinates to actual screen positions
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md -- screen_info tool + screenshot coordinate metadata + dispatcher/DeviceBridge registration

### Phase 7: Computer Use Loop
**Goal**: Users can give the AI a natural language task and it autonomously operates the device's desktop through a screenshot-vision-action cycle until the task is done
**Depends on**: Phase 5 (needs mouse/keyboard tools), Phase 6 (needs screen info/screenshot metadata)
**Requirements**: LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05
**Success Criteria** (what must be TRUE):
  1. User can say "Open Chrome and go to YouTube" and the AI enters computer use mode -- taking a screenshot, analyzing it with vision, clicking/typing, then repeating until the task is complete
  2. AI correctly identifies UI elements (buttons, text fields, icons) from screenshots and clicks at accurate coordinates
  3. Computer use sessions respect a configurable step limit (e.g., max 50 actions) and stop gracefully when reached
  4. AI reports back to the user when the task is complete or explains why it could not be completed
  5. The computer use loop is a distinct mode in Nexus that the AI enters when a task requires visual desktop interaction
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Vision enablement + tool result image flow fix in native tool calling path
- [ ] 07-02-PLAN.md -- Computer use system prompt guidance + step limits + completion detection

### Phase 8: Live Monitoring UI
**Goal**: Users can watch the AI operate their device in real time with a visual stream, action indicators, and session controls
**Depends on**: Phase 7 (needs the computer use loop to produce sessions and actions)
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. When a computer use session is active, the LivOS AI chat shows a live screenshot feed of the device updating after each action
  2. Visual indicators overlay each screenshot showing where the AI clicked or what it typed (crosshair on click point, text badge for typed text)
  3. A session timeline panel lists every action chronologically with type, coordinates/text, and timestamp
  4. User can pause, resume, or stop the session from the LivOS UI, and the AI responds immediately to those controls
**Plans**: TBD

### Phase 9: Security & Permissions
**Goal**: Users maintain full control over AI computer use with explicit consent, an emergency stop, per-action audit logging, and automatic session timeouts
**Depends on**: Phase 7 (needs the loop to gate with consent), Phase 8 (needs the UI to surface controls)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Before the AI takes mouse/keyboard control, the user sees a consent dialog in LivOS and must explicitly approve the session
  2. Pressing Escape three times rapidly on the device immediately terminates AI control regardless of session state
  3. Every mouse/keyboard action (click x,y / type "text" / press Ctrl+C) is recorded to the audit trail with coordinates, timestamp, and screenshot reference
  4. Computer use sessions that have no AI activity for a configurable period (default 60s) auto-terminate and notify the user
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 -> 6 -> 7 -> 8 -> 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 5. Agent Mouse & Keyboard Tools | v15.0 | 0/2 | In progress | - |
| 6. Screen Info & Screenshot Extensions | v15.0 | 0/1 | Not started | - |
| 7. Computer Use Loop | v15.0 | 0/2 | Not started | - |
| 8. Live Monitoring UI | v15.0 | 0/? | Not started | - |
| 9. Security & Permissions | v15.0 | 0/? | Not started | - |
