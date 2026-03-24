# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v14.1 Agent Installer & Setup UX -- replace CLI-only agent setup with polished native installers (Windows .exe, macOS .dmg, Linux .deb), a web-based setup wizard that opens in the browser for OAuth, a system tray icon for background status, and a livinity.io download page with platform detection.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [x] **v11.0 Nexus Agent Fixes** - Phases 26-34 (shipped 2026-03-22)
- [x] **v12.0 Server Management Dashboard** - Phases 35-40 (shipped 2026-03-22)
- [x] **v13.0 Portainer-Level Server Management** - Phases 41-46 (shipped 2026-03-23)
- [x] **v14.0 Remote PC Control Agent** - Phases 47-53 (shipped 2026-03-24)
- [ ] **v14.1 Agent Installer & Setup UX** - Phases 1-4 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work (reset for v14.1)
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

### v14.1 Agent Installer & Setup UX

**Milestone Goal:** Replace CLI-only agent setup with polished native installers (Windows .exe, macOS .dmg, Linux .deb) and a web-based setup wizard that opens in the browser. Users double-click to install, the agent opens a beautiful setup page for OAuth, then runs silently in the background with auto-start on boot.

- [x] **Phase 1: Web Setup Wizard** - Local HTTP server serves a React UI for OAuth device flow, replacing CLI setup (completed 2026-03-24)
- [ ] **Phase 2: System Tray Icon** - Cross-platform tray icon with connection status and context menu
- [ ] **Phase 3: Platform Installers** - Native installers for Windows (.exe), macOS (.dmg), and Linux (.deb) with auto-start
- [ ] **Phase 4: Download Page** - livinity.io/download with platform detection and setup instructions

## Phase Details

### Phase 1: Web Setup Wizard
**Goal**: Users connect their account through a beautiful browser-based wizard instead of the terminal
**Depends on**: Nothing (first phase; builds on existing agent at agent/ with CLI OAuth flow)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05
**Success Criteria** (what must be TRUE):
  1. Running the agent for the first time opens a browser tab to a local setup page
  2. The setup page shows a polished UI with a clear "Connect Your Account" call-to-action
  3. Clicking connect displays a device code and a link to livinity.io for approval
  4. After approving on livinity.io, the setup page shows "Connected!" with the device name
  5. The setup page closes itself and the agent continues running silently in the background
**Plans**: 2 plans

Plans:
- [x] 01-01: Local HTTP server and React setup UI
- [x] 01-02: OAuth device flow integration and success state

### Phase 2: System Tray Icon
**Goal**: Users can see their agent's connection status at a glance and access controls from the system tray
**Depends on**: Phase 1
**Requirements**: TRAY-01, TRAY-02, TRAY-03
**Success Criteria** (what must be TRUE):
  1. A Livinity icon appears in the system tray when the agent is running on Windows, macOS, and Linux
  2. The tray icon color reflects connection status -- green for connected, yellow for connecting, red for disconnected
  3. Right-clicking the tray icon shows a menu with Status, Open Setup, Disconnect, and Quit options
**Plans**: 1 plan

Plans:
- [ ] 02-01: System tray integration with status icons and context menu

### Phase 3: Platform Installers
**Goal**: Users install the agent with a native installer and it auto-starts on boot without configuration
**Depends on**: Phase 1, Phase 2
**Requirements**: WIN-01, WIN-02, WIN-03, WIN-04, MAC-01, MAC-02, MAC-03, LIN-01, LIN-02, LIN-03
**Success Criteria** (what must be TRUE):
  1. On Windows, double-clicking the .exe runs an Inno Setup installer that places the agent in Program Files with Start Menu and optional Desktop shortcuts
  2. On Windows, after installation the agent auto-starts on boot and can be cleanly uninstalled removing files, shortcuts, and registry entries
  3. On macOS, opening the .dmg shows a drag-to-Applications window with a proper .app bundle containing icon and Info.plist, and the agent registers as a LaunchAgent for auto-start on login
  4. On Linux, installing the .deb places the binary and creates a systemd service that runs as the installing user and auto-starts on boot
**Plans**: TBD

Plans:
- [ ] 03-01: Windows installer (Inno Setup script, shortcuts, auto-start registry, uninstaller)
- [ ] 03-02: macOS installer (create-dmg, .app bundle with Info.plist and icon, LaunchAgent plist)
- [ ] 03-03: Linux installer (fpm .deb package, systemd service unit file)

### Phase 4: Download Page
**Goal**: Users find and download the correct installer from livinity.io without confusion
**Depends on**: Phase 3
**Requirements**: DL-01, DL-02, DL-03
**Success Criteria** (what must be TRUE):
  1. Visiting livinity.io/download auto-detects the user's OS and highlights the matching download button
  2. Download links for all three platforms (Windows, macOS, Linux) are visible with platform icons
  3. The page includes brief setup instructions covering download, install, and connect steps
**Plans**: TBD

Plans:
- [ ] 04-01: Download page with platform detection, download links, and setup instructions

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Web Setup Wizard | v14.1 | 2/2 | Complete    | 2026-03-24 |
| 2. System Tray Icon | v14.1 | 0/1 | Not started | - |
| 3. Platform Installers | v14.1 | 0/3 | Not started | - |
| 4. Download Page | v14.1 | 0/1 | Not started | - |
