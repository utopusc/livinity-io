# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v14.0 Remote PC Control Agent -- build a cross-platform agent that runs on users' PCs, authenticates via livinity.io OAuth, connects through the existing relay, and exposes local PC capabilities (shell, files, processes, screenshots) as AI-callable tools in the Nexus ToolRegistry.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [x] **v11.0 Nexus Agent Fixes** - Phases 26-34 (shipped 2026-03-22)
- [x] **v12.0 Server Management Dashboard** - Phases 35-40 (shipped 2026-03-22)
- [x] **v13.0 Portainer-Level Server Management** - Phases 41-46 (shipped 2026-03-23)
- [ ] **v14.0 Remote PC Control Agent** - Phases 47-53 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (47, 48, 49...): Planned milestone work
- Decimal phases (47.1, 47.2): Urgent insertions (marked with INSERTED)

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

- [x] **Phase 26: Sub-agent Scheduler Coupling Fix** -- Validate schedule+scheduled_task coupling, error on missing scheduled_task (completed 2026-03-22)
- [x] **Phase 27: Cron Tool BullMQ Migration** -- Replace setTimeout with BullMQ cronQueue for restart-persistent scheduled tasks (completed 2026-03-22)
- [x] **Phase 28: Tool Profile Name Mismatch Fix** -- Align TOOL_PROFILES names with actual registered tool names in daemon.ts (completed 2026-03-22)
- [x] **Phase 29: MultiAgentManager Cleanup** -- Wire cleanup() into periodic call, convert sequential Redis exists to pipeline (completed 2026-03-22)
- [x] **Phase 30: Multi-Channel Notification Routing** -- Add createdVia field, route scheduled/loop results to correct channel (completed 2026-03-22)
- [x] **Phase 31: Skills->Tools Naming Fix** -- Rename SubagentConfig.skills to tools, update all references (completed 2026-03-22)
- [x] **Phase 32: Native System Prompt Improvements** -- Add tool awareness, sub-agent guidance, consolidate WhatsApp rules (completed 2026-03-22)
- [x] **Phase 33: progress_report Multi-Channel** -- Route progress reports to correct channel based on context (completed 2026-03-22)
- [x] **Phase 34: Miscellaneous Fixes** -- JSON parse safety, dead code removal, atomic recordRun, parentSessionId fix, complexity limit (completed 2026-03-22)

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

### v14.0 Remote PC Control Agent

**Milestone Goal:** Build a cross-platform agent (Windows/Mac/Linux) that users install on their PCs, authenticates via livinity.io OAuth Device Authorization Grant, connects through the existing relay server, and exposes local PC capabilities as AI-callable tools in Nexus. Users control their remote PCs via natural language through the LivOS AI chat.

- [x] **Phase 47: Platform OAuth + Relay Device Infrastructure** - livinity.io device endpoints, relay DeviceRegistry, /device/connect WebSocket (completed 2026-03-24)
- [x] **Phase 48: Agent Binary + Authentication** - Node.js SEA agent scaffold, OAuth device flow, connection manager, heartbeat (completed 2026-03-24)
- [x] **Phase 49: Relay Message Routing + DeviceBridge** - Tool call forwarding through relay, proxy tool registration in Nexus ToolRegistry (completed 2026-03-24)
- [ ] **Phase 50: Agent Core Tools -- Shell + Files** - Remote shell execution, file listing, read, write, delete operations
- [ ] **Phase 51: Agent Extended Tools -- Processes + Screenshot + System Info** - Process listing, screenshot capture, system information collection
- [ ] **Phase 52: My Devices UI** - Device list panel in LivOS, device status, rename, remove
- [ ] **Phase 53: Audit Logging + Security Hardening** - Operation audit log, dangerous command blocklist, agent runs as user

## Phase Details

### Phase 47: Platform OAuth + Relay Device Infrastructure
**Goal**: Devices can register via OAuth Device Authorization Grant and establish authenticated WebSocket connections to the relay server
**Depends on**: Nothing (first phase of v14.0; builds on existing relay codebase on Server5 and livinity.io platform)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, RELAY-01, RELAY-02
**Success Criteria** (what must be TRUE):
  1. An HTTP client can POST /api/device/register on livinity.io and receive a device_code + user_code pair
  2. A logged-in user can visit livinity.io/device, enter the user_code, and approve the device
  3. An HTTP client can poll POST /api/device/token and receive a device JWT after user approval
  4. A WebSocket client can connect to the relay at /device/connect with a valid device JWT and appear in the DeviceRegistry
  5. The relay tracks which devices belong to which user and disconnects devices with invalid/expired tokens
**Plans**: 2 plans

Plans:
- [x] 47-01: livinity.io device OAuth endpoints (register, token, approve) + /device approval page
- [x] 47-02: Relay DeviceRegistry + /device/connect WebSocket endpoint with JWT validation

### Phase 48: Agent Binary + Authentication
**Goal**: Users can download a single binary for their platform, authenticate it via OAuth device flow, and it maintains a persistent connection to the relay with auto-reconnect
**Depends on**: Phase 47
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AUTH-01, AUTH-02, AUTH-03, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. User downloads a single executable binary for Windows, macOS, or Linux and runs it without installing dependencies
  2. Running `livinity-agent setup` initiates OAuth device flow -- displays a code and URL, waits for user approval, stores the device token
  3. Running `livinity-agent start` connects to the relay via WSS, maintains heartbeat, and auto-reconnects with exponential backoff on connection loss
  4. Running `livinity-agent status` shows connection state, device name, and relay endpoint
  5. Agent reports its list of available tools to the relay on successful connection
**Plans**: 2 plans

Plans:
- [x] 48-01-PLAN.md -- Agent project scaffold, CLI commands, ConnectionManager with heartbeat & reconnect, tool stubs
- [x] 48-02-PLAN.md -- OAuth device flow (setup command), token storage, token expiry check

### Phase 49: Relay Message Routing + DeviceBridge
**Goal**: AI tool calls on LivOS flow through the relay to the correct device agent and results return to the AI, with device tools dynamically appearing and disappearing in the Nexus ToolRegistry
**Depends on**: Phase 47, Phase 48
**Requirements**: RELAY-03, RELAY-04, TOOLS-01, TOOLS-02, TOOLS-03
**Success Criteria** (what must be TRUE):
  1. When a device connects to the relay, LivOS receives a device_connected event via the existing tunnel WebSocket
  2. When a device disconnects, LivOS receives a device_disconnected event and the device's proxy tools are removed from ToolRegistry
  3. LivOS can send a tool_call message through the relay to a specific device and receive the tool_result back
  4. Connected device tools appear in the Nexus ToolRegistry with `device_{deviceId}_` prefix (e.g., `device_desktop-pc_shell`)
  5. The AI can select and invoke a device proxy tool and receive the result as part of the normal agent loop
**Plans**: 2 plans

Plans:
- [x] 49-01-PLAN.md -- Relay message routing: tunnel protocol types for device events, forward tool_call/tool_result between LivOS tunnel and device WS
- [x] 49-02-PLAN.md -- DeviceBridge module in livinityd, Nexus proxy tool registration API, tunnel-client event handlers, execution callback

### Phase 50: Agent Core Tools -- Shell + Files
**Goal**: The AI can execute shell commands and perform file operations on the user's remote PC via natural language
**Depends on**: Phase 48, Phase 49
**Requirements**: SHELL-01, SHELL-02, SHELL-03, FILES-01, FILES-02, FILES-03, FILES-04
**Success Criteria** (what must be TRUE):
  1. User says "run `ls -la` on my desktop PC" and the AI executes the command and returns formatted output
  2. Agent uses PowerShell on Windows and bash/zsh on macOS/Linux automatically
  3. Shell command output is returned as structured JSON with stdout, stderr, and exit code
  4. User says "show me files on my Desktop" and the AI returns a directory listing with name, size, type, and modified date
  5. AI can read, create/write, delete, and rename files on the remote PC
**Plans**: TBD

Plans:
- [ ] 50-01: Agent shell tool (cross-platform shell detection, child_process execution, structured JSON output)
- [ ] 50-02: Agent files tool (list, read, write, delete, rename with metadata)

### Phase 51: Agent Extended Tools -- Processes + Screenshot + System Info
**Goal**: The AI can inspect running processes, capture screenshots, and collect system information from the remote PC
**Depends on**: Phase 48, Phase 49
**Requirements**: PROC-01, PROC-02, SCREEN-01
**Success Criteria** (what must be TRUE):
  1. User says "what's eating CPU on my PC" and the AI returns a process list with PID, name, CPU%, and memory usage
  2. AI can collect system info including OS version, CPU model, RAM total/used, disk usage, hostname, and IP addresses
  3. User says "take a screenshot of my desktop" and the AI captures and displays the remote PC's screen
**Plans**: TBD

Plans:
- [ ] 51-01: Agent process + system info tools (systeminformation, structured output)
- [ ] 51-02: Agent screenshot tool (node-screenshots, JPEG compression, base64 transport)

### Phase 52: My Devices UI
**Goal**: Users can see all their connected devices, their status, and manage them from the LivOS interface
**Depends on**: Phase 49 (DeviceBridge provides device state)
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. LivOS shows a "My Devices" panel listing all registered devices with name, OS icon, platform, and connection status
  2. Each device shows whether it is online (green) or offline (gray) with a last-seen timestamp
  3. User can rename a device from the UI
  4. User can remove a device, which revokes its token and disconnects it
**Plans**: TBD

Plans:
- [ ] 52-01: Backend tRPC devices router (list, rename, remove) + Redis device state queries
- [ ] 52-02: Frontend My Devices panel (device cards, status indicators, rename dialog, remove confirmation)

### Phase 53: Audit Logging + Security Hardening
**Goal**: Every remote tool execution is logged for accountability, and dangerous operations are blocked by default
**Depends on**: Phase 50, Phase 51, Phase 52
**Requirements**: AUDIT-01, AUDIT-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Every remote tool execution is logged with timestamp, user, device, tool name, parameters, and result summary
  2. User can view the audit log for a specific device from the LivOS UI
  3. Agent runs as the logged-in OS user (not root/SYSTEM) by default
  4. A configurable dangerous command blocklist prevents execution of destructive commands (rm -rf /, format, shutdown, registry delete, etc.)
**Plans**: TBD

Plans:
- [ ] 53-01: Audit logging (agent-side local log + relay-forwarded events + LivOS storage + UI display)
- [ ] 53-02: Security hardening (user-level execution, command blocklist, agent-side enforcement)

## Progress

**Execution Order:** 47 -> 48 -> 49 -> 50 -> 51 -> 52 -> 53

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 26. Scheduler Coupling | v11.0 | 1/1 | Complete | 2026-03-22 |
| 27. Cron BullMQ | v11.0 | 1/1 | Complete | 2026-03-22 |
| 28. Tool Profiles | v11.0 | 1/1 | Complete | 2026-03-22 |
| 29. Session Cleanup | v11.0 | 1/1 | Complete | 2026-03-22 |
| 30. Multi-Channel | v11.0 | 1/1 | Complete | 2026-03-22 |
| 31. Skills->Tools | v11.0 | 1/1 | Complete | 2026-03-22 |
| 32. System Prompts | v11.0 | 1/1 | Complete | 2026-03-22 |
| 33. Progress Report | v11.0 | 1/1 | Complete | 2026-03-22 |
| 34. Misc Fixes | v11.0 | 1/1 | Complete | 2026-03-22 |
| 35. Docker Backend + Container List | v12.0 | 2/2 | Complete | 2026-03-22 |
| 36. Container Detail + Logs + Stats | v12.0 | 2/2 | Complete | 2026-03-22 |
| 37. Images, Volumes, Networks | v12.0 | 2/2 | Complete | 2026-03-22 |
| 38. PM2 Process Management | v12.0 | 2/2 | Complete | 2026-03-22 |
| 39. System Monitoring + Overview | v12.0 | 2/2 | Complete | 2026-03-22 |
| 40. Polish & Deployment | v12.0 | 0/? | Complete | 2026-03-22 |
| 41. Container Creation | v13.0 | 2/2 | Complete | 2026-03-23 |
| 42. Container Edit & Recreate | v13.0 | 2/2 | Complete | 2026-03-23 |
| 43. Exec Terminal + Enhanced Logs | v13.0 | 2/2 | Complete | 2026-03-23 |
| 44. Bulk Ops + Images + Networks + Volumes | v13.0 | 3/3 | Complete | 2026-03-23 |
| 45. Docker Compose Stacks | v13.0 | 2/2 | Complete | 2026-03-23 |
| 46. Events + Engine Info + Polish | v13.0 | 2/2 | Complete | 2026-03-23 |
| 47. Platform OAuth + Relay Device Infrastructure | v14.0 | 2/2 | Complete    | 2026-03-24 |
| 48. Agent Binary + Authentication | v14.0 | 2/2 | Complete    | 2026-03-24 |
| 49. Relay Message Routing + DeviceBridge | v14.0 | 2/2 | Complete   | 2026-03-24 |
| 50. Agent Core Tools -- Shell + Files | v14.0 | 0/2 | Not started | - |
| 51. Agent Extended Tools -- Processes + Screenshot | v14.0 | 0/2 | Not started | - |
| 52. My Devices UI | v14.0 | 0/2 | Not started | - |
| 53. Audit Logging + Security Hardening | v14.0 | 0/2 | Not started | - |
