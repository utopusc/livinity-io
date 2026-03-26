# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v18.0 Remote Desktop Streaming -- deploy a browser-based remote desktop viewer at `pc.{username}.livinity.io`, letting users see and control their server's GUI through any browser with zero client software.

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
- [x] **v17.0 Precision Computer Use** - Phases 1-3 (shipped 2026-03-25)
- [ ] **v18.0 Remote Desktop Streaming** - Phases 4-6 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)
- v18.0 continues from v17.0 Phase 3 (starts at Phase 4)

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

<details>
<summary>v17.0 Precision Computer Use (Phases 1-3) - SHIPPED 2026-03-25</summary>

**Milestone Goal:** Fix Computer Use coordinate mismatch (DPI scaling) and implement accessibility tree integration for precise element targeting. Screenshots resized to logical pixels, Windows UIA tree exposed as a tool, AI prompted to prefer element coordinates over pixel-guessing.

- [x] **Phase 1: DPI Fix & Screenshot Pipeline** (completed 2026-03-25)
- [x] **Phase 2: Windows UIA Accessibility Tree** (completed 2026-03-25)
- [x] **Phase 3: AI Prompt Optimization & Hybrid Mode** (completed 2026-03-25)

</details>

### v18.0 Remote Desktop Streaming

**Milestone Goal:** Deploy a browser-based remote desktop streaming service via install.sh, letting users see and control their server's GUI through `pc.{username}.livinity.io` in any browser -- zero-client VNC alternative with JWT auth, auto-reconnect, and dynamic resolution.

- [ ] **Phase 4: Server Infrastructure** - Install x11vnc via install.sh with GUI detection, register as NativeApp, configure Caddy subdomain
- [ ] **Phase 5: WebSocket Proxy & Auth** - Bridge browser WebSocket to VNC TCP socket with JWT validation and Caddy stream resilience
- [ ] **Phase 6: Browser Viewer & Integration** - noVNC React viewer with full input, connection management, and tunnel subdomain routing

## Phase Details

### Phase 4: Server Infrastructure
**Goal**: Server has a running VNC capture service that can be tested with any standard VNC client, installed automatically by install.sh with GUI detection
**Depends on**: Nothing (first phase of v18.0)
**Requirements**: INST-01, INST-02, INST-03, STRM-03
**Success Criteria** (what must be TRUE):
  1. Running install.sh on a headless server (no X11/Wayland) skips desktop streaming setup entirely without errors
  2. Running install.sh on a GUI server installs x11vnc, creates a systemd service bound to localhost only, and the service starts successfully
  3. x11vnc appears as a NativeApp in livinityd with working start/stop lifecycle and port health-checking
  4. Caddy generates a `pc.{domain}` subdomain block with `stream_close_delay` and JWT cookie gating in the Caddyfile
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- install.sh GUI detection + x11vnc installation + systemd service
- [x] 04-02-PLAN.md -- NativeApp registration + Caddy subdomain with stream_close_delay

### Phase 5: WebSocket Proxy & Auth
**Goal**: Browser can establish an authenticated WebSocket connection to the VNC stream through livinityd, with JWT validation on upgrade and Origin header protection
**Depends on**: Phase 4 (VNC server and Caddy subdomain must exist)
**Requirements**: STRM-01, STRM-02, INTG-02
**Success Criteria** (what must be TRUE):
  1. A WebSocket connection to `/ws/desktop` successfully bridges to the x11vnc TCP socket and streams VNC data bidirectionally
  2. Connecting to `/ws/desktop` without a valid JWT token is rejected at the WebSocket upgrade step (HTTP 401)
  3. Connecting to `/ws/desktop` with a mismatched Origin header is rejected (HTTP 403)
  4. Closing the browser tab does not kill the x11vnc process -- the VNC session persists for reconnection
**Plans**: 1 plan

Plans:
- [ ] 05-01-PLAN.md -- /ws/desktop WebSocket-to-TCP bridge with JWT auth, Origin validation, and NativeApp auto-start

### Phase 6: Browser Viewer & Integration
**Goal**: Users can see and control their server desktop in real-time through `pc.{username}.livinity.io` with full mouse/keyboard input, connection resilience, and proper viewport scaling
**Depends on**: Phase 5 (authenticated WebSocket bridge must work)
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06, INTG-01, INTG-03
**Success Criteria** (what must be TRUE):
  1. User navigates to `pc.{username}.livinity.io` in a browser and sees their server desktop rendered in real-time via noVNC
  2. User can click, drag, scroll, and type (including special characters) on the remote desktop with correct coordinate scaling at any viewport size
  3. User can enter fullscreen mode and the remote desktop resizes to fill the browser viewport via server-side xrandr
  4. Connection status indicator shows connected/reconnecting/disconnected states with latency, and the viewer auto-reconnects on network interruption with exponential backoff
  5. Desktop viewer is accessible through the tunnel relay at `pc.{username}.livinity.io` (not just local network)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 -> 5 -> 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 4. Server Infrastructure | v18.0 | 0/2 | Not started | - |
| 5. WebSocket Proxy & Auth | v18.0 | 0/1 | Not started | - |
| 6. Browser Viewer & Integration | v18.0 | 0/2 | Not started | - |
