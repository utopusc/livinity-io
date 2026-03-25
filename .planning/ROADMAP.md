# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v17.0 Precision Computer Use -- fix the DPI-induced coordinate mismatch in the screenshot pipeline, integrate Windows UI Automation accessibility tree for precise element targeting, and optimize AI prompts for accessibility-first computer use with screenshot fallback.

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
- [x] **v15.0 AI Computer Use** - Phases 5-9 (shipped 2026-03-24)
- [x] **v16.0 Multi-Provider AI** - Phases 1-4 (shipped 2026-03-25)
- [ ] **v17.0 Precision Computer Use** - Phases 1-3 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)
- v17.0 uses reset phase numbering (starts at 1)

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

**Milestone Goal:** Replace CLI-only agent setup with polished native installers (Windows .exe, macOS .dmg, Linux .deb) and a web-based setup wizard that opens in the browser.

- [x] **Phase 1: Web Setup Wizard** (completed 2026-03-24)
- [x] **Phase 2: System Tray Icon** (completed 2026-03-24)
- [x] **Phase 3: Platform Installers** (completed 2026-03-24)
- [x] **Phase 4: Download Page** (completed 2026-03-24)

</details>

<details>
<summary>v15.0 AI Computer Use (Phases 5-9) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Enable the AI to see the screen, click, type, and navigate applications on connected devices -- Claude Computer Use style.

- [x] **Phase 5: Agent Mouse & Keyboard Tools** (completed 2026-03-24)
- [x] **Phase 6: Screen Info & Screenshot Extensions** (completed 2026-03-24)
- [x] **Phase 7: Computer Use Loop** (completed 2026-03-24)
- [x] **Phase 8: Live Monitoring UI** (completed 2026-03-24)
- [x] **Phase 9: Security & Permissions** (completed 2026-03-24)

</details>

<details>
<summary>v16.0 Multi-Provider AI (Phases 1-4) - SHIPPED 2026-03-25</summary>

**Milestone Goal:** Add Claude (Anthropic) as a second AI provider alongside Kimi, with full feature parity and a Settings UI toggle.

- [x] **Phase 1: Provider Restore & Registration** (completed 2026-03-25)
- [x] **Phase 2: Feature Parity** (completed 2026-03-25)
- [x] **Phase 3: Auth & Config** (completed 2026-03-25)
- [x] **Phase 4: Settings UI & Integration** (completed 2026-03-25)

</details>

### v17.0 Precision Computer Use

**Milestone Goal:** Fix Computer Use coordinate mismatch (DPI scaling) and implement accessibility tree integration for precise element targeting. Screenshots resized to logical pixels, Windows UIA tree exposed as a tool, AI prompted to prefer element coordinates over pixel-guessing.

- [ ] **Phase 1: DPI Fix & Screenshot Pipeline** - Fix screenshot resize + coordinate mapping so AI coordinates match screen coordinates
- [ ] **Phase 2: Windows UIA Accessibility Tree** - Expose interactive UI elements with coordinates via screen_elements tool
- [ ] **Phase 3: AI Prompt Optimization & Hybrid Mode** - Teach AI to prefer accessibility tree, fall back to screenshots

## Phase Details

### Phase 1: DPI Fix & Screenshot Pipeline
**Goal**: Screenshots sent to AI match the logical pixel coordinate space that robotjs uses for mouse control, eliminating the DPI mismatch that causes misclicks
**Depends on**: Nothing (first phase, prerequisite for all others)
**Requirements**: DPI-01, DPI-02, DPI-03, DPI-04
**Success Criteria** (what must be TRUE):
  1. On a 150% DPI Windows display, the AI receives a screenshot resized to logical pixel dimensions (not physical), and clicking the center of a visible button hits that button accurately
  2. Screenshot coordinate metadata returned to AI reports logical dimensions (e.g., 1707x960) not physical dimensions (e.g., 2560x1440)
  3. toScreenX/toScreenY in agent-core.ts converts AI coordinates to screen coordinates using 1:1 mapping (no broken scaling math)
  4. AI system prompt explicitly states the coordinate space is logical pixels and includes the screenshot dimensions
**Plans**: 1 plan
Plans:
- [x] 01-01-PLAN.md -- Install sharp, fix screenshot resize + coordinate mapping, update AI prompt

### Phase 2: Windows UIA Accessibility Tree
**Goal**: AI can query the Windows desktop for interactive UI elements and receive structured data with element names, types, and precise clickable coordinates
**Depends on**: Phase 1 (coordinate space must be correct before element coordinates are meaningful)
**Requirements**: UIA-01, UIA-02, UIA-03, UIA-04, UIA-05
**Success Criteria** (what must be TRUE):
  1. Agent process on Windows sets DPI awareness to PerMonitorAwareV2 at startup, verified by GetProcessDpiAwareness returning the correct value
  2. User asks AI to "click the Save button" and the screen_elements tool returns a JSON list of interactive elements including that button with its center coordinates
  3. Each element in the screen_elements response includes id, window title, control type, display name, and center (x, y) coordinates in a structured text format the AI can parse
  4. Element list contains only interactive elements (buttons, text fields, links, menu items, checkboxes) and is capped at 50-100 elements maximum to prevent token overflow
  5. Calling screen_elements responds within 500ms on average because the UIA backend uses a persistent subprocess rather than cold-starting PowerShell on every call
**Plans**: 1 plan
Plans:
- [x] 02-01-PLAN.md -- DPI awareness, persistent PowerShell subprocess, screen_elements tool

### Phase 3: AI Prompt Optimization & Hybrid Mode
**Goal**: AI uses accessibility tree element coordinates as its primary targeting method, only falling back to screenshot pixel analysis when no matching element exists
**Depends on**: Phase 1 (correct coordinates), Phase 2 (elements available)
**Requirements**: AIP-01, AIP-02, AIP-03
**Success Criteria** (what must be TRUE):
  1. Computer use system prompt instructs the AI to call screen_elements first and use element coordinates for clicking, with screenshots reserved for visual context and fallback
  2. When the AI needs to click a button that appears in the accessibility tree, it uses the element's center coordinates directly instead of analyzing the screenshot to guess pixel positions
  3. When the accessibility tree content has not changed since the last capture, the agent skips re-capturing a screenshot, reducing unnecessary vision API calls and latency
**Plans**: 1 plan
Plans:
- [ ] 03-01-PLAN.md -- Rewrite AI prompt for accessibility-first hybrid mode + screenshot caching

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. DPI Fix & Screenshot Pipeline | v17.0 | 1/1 | Complete | 2026-03-25 |
| 2. Windows UIA Accessibility Tree | v17.0 | 0/1 | Not started | - |
| 3. AI Prompt Optimization & Hybrid Mode | v17.0 | 0/1 | Not started | - |
