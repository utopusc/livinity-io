# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v12.0 Server Management Dashboard -- full Docker container lifecycle, PM2 process management, and enhanced system monitoring from the browser.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [x] **v11.0 Nexus Agent Fixes** - Phases 26-34 (shipped 2026-03-22)
- [ ] **v12.0 Server Management Dashboard** - Phases 35-40 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (35, 36, 37...): Planned milestone work
- Decimal phases (35.1, 35.2): Urgent insertions (marked with INSERTED)

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

### Phase 26: Sub-agent Scheduler Coupling Fix
**Goal**: When schedule is provided in subagent_create, the scheduler ALWAYS registers -- never silently skips due to missing scheduled_task
**Depends on**: Nothing
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria**:
  1. subagent_create with schedule but no scheduled_task returns an error message (not silent success)
  2. Parameter descriptions clearly indicate schedule+scheduled_task coupling requirement
  3. subagent_create output includes schedule registration confirmation
**Plans**: 1/1 complete

### Phase 27: Cron Tool BullMQ Migration
**Goal**: Cron tool tasks persist across process restarts by using BullMQ instead of setTimeout
**Depends on**: Nothing
**Requirements**: CRON-01, CRON-02
**Success Criteria**:
  1. Cron tool uses this.config.cronQueue (BullMQ) for scheduling
  2. setTimeout fallback only when cronQueue is unavailable
  3. Scheduled tasks survive nexus-core restart
**Plans**: 1/1 complete

### Phase 28: Tool Profile Name Mismatch Fix
**Goal**: TOOL_PROFILES map names match actual registered tool names so profile-based filtering works correctly
**Depends on**: Nothing
**Requirements**: PROF-01
**Success Criteria**:
  1. Every tool name in TOOL_PROFILES exists as a registered tool in daemon.ts
  2. No phantom tool names (read_file, docker, send_whatsapp, etc.)
**Plans**: 1/1 complete

### Phase 29: MultiAgentManager Cleanup
**Goal**: Stale sessions are periodically cleaned from the active set, preventing maxConcurrent exhaustion
**Depends on**: Nothing
**Requirements**: SESS-01, SESS-02
**Success Criteria**:
  1. cleanup() called periodically (every 5 min or every inbox cycle)
  2. Sequential Redis exists calls converted to pipeline for efficiency
**Plans**: 1/1 complete

### Phase 30: Multi-Channel Notification Routing
**Goal**: Scheduled and loop sub-agent results route to the channel that created them, not just WhatsApp
**Depends on**: Nothing
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria**:
  1. SubagentConfig has createdVia field ('whatsapp'|'telegram'|'discord'|'web')
  2. subagent_create saves channel source from currentChannelContext
  3. Schedule/loop handlers route results to correct channel
**Plans**: 1/1 complete

### Phase 31: Skills->Tools Naming Fix
**Goal**: SubagentConfig.skills field renamed to tools for clarity since it contains tool names not skill names
**Depends on**: Nothing
**Requirements**: NAME-01, NAME-02
**Success Criteria**:
  1. SubagentConfig uses 'tools' field instead of 'skills'
  2. subagent_create parameter updated
  3. executeSubagentTask reads 'tools' field
**Plans**: 1/1 complete

### Phase 32: Native System Prompt Improvements
**Goal**: NATIVE_SYSTEM_PROMPT includes tool awareness, sub-agent guidance, and consolidated messaging rules
**Depends on**: Nothing
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03
**Success Criteria**:
  1. Native prompt lists all tool categories
  2. Sub-agent mechanism guidance included (spawn_subagent vs subagent_create vs sessions_create)
  3. WhatsApp rules moved from dead AGENT_SYSTEM_PROMPT to native prompt
**Plans**: 1/1 complete

### Phase 33: progress_report Multi-Channel
**Goal**: progress_report tool works from any channel context, not just WhatsApp
**Depends on**: Phase 30 (multi-channel infrastructure)
**Requirements**: PROG-01
**Success Criteria**:
  1. progress_report checks currentChannelContext and routes to correct channel
  2. Returns error message when no channel context available
**Plans**: 1/1 complete

### Phase 34: Miscellaneous Fixes
**Goal**: Clean up remaining issues -- JSON parse safety, dead code removal, atomic Redis ops, parentSessionId fix, complexity limit increase
**Depends on**: Nothing
**Requirements**: MISC-01, MISC-02, MISC-03, MISC-04, MISC-05, MISC-06
**Success Criteria**:
  1. SELF_REFLECTION_PROMPT has try/catch + regex fallback for JSON.parse
  2. SUBAGENT_ROUTING_PROMPT removed (dead code)
  3. loopIterationPrompt removed (dead code)
  4. SubagentManager.recordRun uses atomic Redis Lua script
  5. sessions_create parentSessionId uses session UUID not chatId
  6. COMPLEXITY_PROMPT uses 1000 char limit instead of 500
**Plans**: 1/1 complete

</details>

### v12.0 Server Management Dashboard

**Milestone Goal:** Build a comprehensive server management UI in LivOS -- full Docker container lifecycle (inspect, logs, exec, remove, stats), Docker images/volumes/networks, PM2 process management, and enhanced system monitoring. Production-grade server administration from the browser.

- [x] **Phase 35: Docker Backend + Container List/Actions UI** -- Dockerode singleton, protected container registry, tRPC docker router, container list with actions, tabbed dashboard shell (completed 2026-03-22)
- [x] **Phase 36: Container Detail View + Logs + Stats** -- Container inspect detail drawer, log streaming with xterm, per-container CPU/memory stats (completed 2026-03-22)
- [x] **Phase 37: Images, Volumes, Networks** -- Docker image list/remove/prune, volume list/remove, network list/inspect tabs (completed 2026-03-22)
- [x] **Phase 38: PM2 Process Management** -- PM2 process list, start/stop/restart actions, process logs and details (completed 2026-03-22)
- [x] **Phase 39: Enhanced System Monitoring + Overview Tab** -- Network I/O, disk I/O, process list, overview dashboard with system health (completed 2026-03-22)
- [ ] **Phase 40: Polish, Edge Cases & Deployment** -- Error handling for Docker daemon unavailability, confirmation UX audit, deprecated route cleanup, production deployment

## Phase Details

### Phase 35: Docker Backend + Container List/Actions UI
**Goal**: Admin users can see all Docker containers and perform lifecycle actions (start, stop, restart, remove) with safety guardrails preventing infrastructure damage
**Depends on**: Nothing (first phase of v12.0)
**Requirements**: DOCK-01, DOCK-02, DOCK-06, DOCK-07, UI-01, UI-04, UI-05, SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. User opens Server Management and sees a tabbed interface with Containers as the default active tab
  2. Container list shows all running and stopped containers with name, image, state, ports, and resource usage columns
  3. User can start, stop, and restart any non-protected container from action buttons in the list
  4. User cannot stop or remove Redis, PostgreSQL, Caddy, or LivOS core containers -- UI disables actions and backend rejects requests
  5. Remove requires a confirmation dialog where user must type the container name before proceeding
**Plans**: 2 plans
Plans:
- [x] 35-01-PLAN.md -- Docker backend module (types, singleton, tRPC router, protected registry, httpOnlyPaths)
- [x] 35-02-PLAN.md -- Frontend tabbed UI shell with container table, actions, remove dialog

### Phase 36: Container Detail View + Logs + Stats
**Goal**: User can drill into any container to see its full configuration, stream its logs in real-time, and monitor its resource usage
**Depends on**: Phase 35
**Requirements**: DOCK-03, DOCK-04, DOCK-05, UI-03
**Success Criteria** (what must be TRUE):
  1. Clicking a container opens a detail view (slide-over or modal) with tabbed sections: Info, Logs, Stats
  2. Info tab shows ports, volumes, environment variables, networks, mounts, restart policy, and health status
  3. Logs tab streams container logs in real-time with ANSI color rendering, tail limit (default 500 lines), auto-scroll, and text search
  4. Stats tab shows live CPU percentage and memory usage for the selected container, updating without page refresh
**Plans**: 2 plans
Plans:
- [x] 36-01-PLAN.md -- Backend tRPC queries (inspectContainer, containerLogs, containerStats)
- [x] 36-02-PLAN.md -- Frontend ContainerDetailSheet with Info/Logs/Stats tabs

### Phase 37: Images, Volumes, Networks
**Goal**: User can manage secondary Docker resources -- view and clean up images, inspect volumes, and see network topology
**Depends on**: Phase 35
**Requirements**: IMG-01, IMG-02, IMG-03, VOL-01, VOL-02, VOL-03, VOL-04
**Success Criteria** (what must be TRUE):
  1. Images tab lists all Docker images with name, tag, size, and creation date
  2. User can remove individual images and prune all dangling/unused images with confirmation and space-reclaimed feedback
  3. Volumes tab lists all volumes with name, driver, and mount point; user can remove unused volumes with confirmation
  4. Networks tab lists all networks with name, driver, and connected container count; user can inspect a network to see its connected containers
**Plans**: 2 plans
Plans:
- [x] 37-01-PLAN.md -- Backend tRPC routes for images, volumes, networks (types, domain functions, routes, httpOnlyPaths)
- [x] 37-02-PLAN.md -- Frontend ImagesTab, VolumesTab, NetworksTab replacing placeholders

### Phase 38: PM2 Process Management
**Goal**: User can monitor and control all PM2-managed processes from the dashboard -- a unique LivOS capability no other self-hosted UI provides
**Depends on**: Phase 35 (tabbed UI shell, admin auth)
**Requirements**: PM2-01, PM2-02, PM2-03, PM2-04
**Success Criteria** (what must be TRUE):
  1. PM2 tab lists all processes with name, status (online/stopped/errored), CPU%, memory usage, uptime, and restart count
  2. User can start, stop, and restart individual PM2 processes from the list
  3. User can view PM2 process logs (stdout and stderr) with tail and auto-scroll
  4. User can see process details including pid, script path, working directory, and Node version
**Plans**: 2 plans
Plans:
- [x] 38-01-PLAN.md -- PM2 backend module (types, domain functions, tRPC routes, httpOnlyPaths)
- [x] 38-02-PLAN.md -- Frontend PM2Tab with process table, actions, inline detail panel, log viewer

### Phase 39: Enhanced System Monitoring + Overview Tab
**Goal**: User has a comprehensive view of server health -- system-wide metrics, network traffic, disk I/O, and a process list, all unified in an overview dashboard
**Depends on**: Phase 35 (tabbed UI), Phase 36 (stats patterns), Phase 38 (PM2 data)
**Requirements**: MON-01, MON-02, MON-03, UI-02
**Success Criteria** (what must be TRUE):
  1. Monitoring tab shows real-time network interface traffic (bytes in/out, current speed) as charts
  2. Monitoring tab shows real-time disk I/O metrics (read/write speed) as charts
  3. Monitoring tab shows a process list sorted by CPU or memory usage
  4. Overview tab displays a system health dashboard with CPU, RAM, Disk, and Network sparklines alongside container count and PM2 process summary
**Plans**: 2 plans
Plans:
- [x] 39-01-PLAN.md -- Backend monitoring module + frontend Monitoring tab (network/disk charts, process table)
- [x] 39-02-PLAN.md -- Frontend Overview tab with system health cards, container/PM2 summaries, network throughput

### Phase 40: Polish, Edge Cases & Deployment
**Goal**: The server management dashboard handles all edge cases gracefully, deprecated Docker routes are cleaned up, and the feature is deployed to production
**Depends on**: Phases 35-39
**Requirements**: None (hardening phase -- validates requirements delivered in Phases 35-39)
**Success Criteria** (what must be TRUE):
  1. When Docker daemon is unreachable, all Docker tabs show a clear error state (not a crash or infinite spinner)
  2. All destructive operations (remove container, remove image, prune, remove volume) have consistent confirmation dialog UX
  3. Deprecated Docker routes in ai/routes.ts are cleaned up or aliased without breaking existing AI tool calls
  4. Dashboard is deployed to production (Server4) and functional with real containers/processes
**Plans**: TBD

## Progress

**Execution Order:** 35 -> 36 -> 37 -> 38 -> 39 -> 40

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
| 35. Docker Backend + Container List | v12.0 | 2/2 | Complete    | 2026-03-22 |
| 36. Container Detail + Logs + Stats | v12.0 | 2/2 | Complete    | 2026-03-22 |
| 37. Images, Volumes, Networks | v12.0 | 2/2 | Complete    | 2026-03-22 |
| 38. PM2 Process Management | v12.0 | 2/2 | Complete    | 2026-03-22 |
| 39. System Monitoring + Overview | v12.0 | 2/2 | Complete   | 2026-03-22 |
| 40. Polish & Deployment | v12.0 | 0/? | Not started | - |
