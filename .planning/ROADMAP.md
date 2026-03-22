# Roadmap: Livinity v11.0 — Nexus Agent Fixes

## Overview

Fix 27 issues in the Nexus AI agent system. Critical: sub-agent scheduler coupling (schedule without scheduled_task silently skips), cron tool using setTimeout (lost on restart), tool profile name mismatches, stale session accumulation, WhatsApp-only notification routing, skills/tools naming confusion, incomplete system prompts, and miscellaneous dead code/atomicity issues. All changes in `nexus/packages/core/src/`. Nine phases (26-34) continuing from v10.0.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [ ] **v11.0 Nexus Agent Fixes** - Phases 26-34 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (26, 27, 28...): Planned milestone work
- Decimal phases (26.1, 26.2): Urgent insertions (marked with INSERTED)

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

### v11.0 Nexus Agent Fixes (In Progress)

**Milestone Goal:** Fix 27 issues across the Nexus AI agent system — sub-agent scheduling, cron persistence, tool profiles, session cleanup, multi-channel routing, naming consistency, system prompts, and dead code removal.

- [ ] **Phase 26: Sub-agent Scheduler Coupling Fix** — Validate schedule+scheduled_task coupling, fallback to description, error on missing scheduled_task
- [ ] **Phase 27: Cron Tool BullMQ Migration** — Replace setTimeout with BullMQ cronQueue for restart-persistent scheduled tasks
- [ ] **Phase 28: Tool Profile Name Mismatch Fix** — Align TOOL_PROFILES names with actual registered tool names in daemon.ts
- [ ] **Phase 29: MultiAgentManager Cleanup** — Wire cleanup() into periodic call, convert sequential Redis exists to pipeline
- [ ] **Phase 30: Multi-Channel Notification Routing** — Add createdVia field, route scheduled/loop results to correct channel
- [ ] **Phase 31: Skills→Tools Naming Fix** — Rename SubagentConfig.skills to tools, update all references
- [ ] **Phase 32: Native System Prompt Improvements** — Add tool awareness, sub-agent guidance, consolidate WhatsApp rules
- [ ] **Phase 33: progress_report Multi-Channel** — Route progress reports to correct channel based on context
- [ ] **Phase 34: Miscellaneous Fixes** — JSON parse safety, dead code removal, atomic recordRun, parentSessionId fix, complexity limit

## Phase Details

### Phase 26: Sub-agent Scheduler Coupling Fix
**Goal**: When schedule is provided in subagent_create, the scheduler ALWAYS registers — never silently skips due to missing scheduled_task
**Depends on**: Nothing
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria**:
  1. subagent_create with schedule but no scheduled_task returns an error message (not silent success)
  2. Parameter descriptions clearly indicate schedule+scheduled_task coupling requirement
  3. subagent_create output includes schedule registration confirmation
**Plans**: 0 plans

### Phase 27: Cron Tool BullMQ Migration
**Goal**: Cron tool tasks persist across process restarts by using BullMQ instead of setTimeout
**Depends on**: Nothing
**Requirements**: CRON-01, CRON-02
**Success Criteria**:
  1. Cron tool uses this.config.cronQueue (BullMQ) for scheduling
  2. setTimeout fallback only when cronQueue is unavailable
  3. Scheduled tasks survive nexus-core restart
**Plans**: 0 plans

### Phase 28: Tool Profile Name Mismatch Fix
**Goal**: TOOL_PROFILES map names match actual registered tool names so profile-based filtering works correctly
**Depends on**: Nothing
**Requirements**: PROF-01
**Success Criteria**:
  1. Every tool name in TOOL_PROFILES exists as a registered tool in daemon.ts
  2. No phantom tool names (read_file, docker, send_whatsapp, etc.)
**Plans**: 0 plans

### Phase 29: MultiAgentManager Cleanup
**Goal**: Stale sessions are periodically cleaned from the active set, preventing maxConcurrent exhaustion
**Depends on**: Nothing
**Requirements**: SESS-01, SESS-02
**Success Criteria**:
  1. cleanup() called periodically (every 5 min or every inbox cycle)
  2. Sequential Redis exists calls converted to pipeline for efficiency
**Plans**: 0 plans

### Phase 30: Multi-Channel Notification Routing
**Goal**: Scheduled and loop sub-agent results route to the channel that created them, not just WhatsApp
**Depends on**: Nothing
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria**:
  1. SubagentConfig has createdVia field ('whatsapp'|'telegram'|'discord'|'web')
  2. subagent_create saves channel source from currentChannelContext
  3. Schedule/loop handlers route results to correct channel
**Plans**: 0 plans

### Phase 31: Skills→Tools Naming Fix
**Goal**: SubagentConfig.skills field renamed to tools for clarity since it contains tool names not skill names
**Depends on**: Nothing
**Requirements**: NAME-01, NAME-02
**Success Criteria**:
  1. SubagentConfig uses 'tools' field instead of 'skills'
  2. subagent_create parameter updated
  3. executeSubagentTask reads 'tools' field
**Plans**: 0 plans

### Phase 32: Native System Prompt Improvements
**Goal**: NATIVE_SYSTEM_PROMPT includes tool awareness, sub-agent guidance, and consolidated messaging rules
**Depends on**: Nothing
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03
**Success Criteria**:
  1. Native prompt lists all tool categories
  2. Sub-agent mechanism guidance included (spawn_subagent vs subagent_create vs sessions_create)
  3. WhatsApp rules moved from dead AGENT_SYSTEM_PROMPT to native prompt
**Plans**: 0 plans

### Phase 33: progress_report Multi-Channel
**Goal**: progress_report tool works from any channel context, not just WhatsApp
**Depends on**: Phase 30 (multi-channel infrastructure)
**Requirements**: PROG-01
**Success Criteria**:
  1. progress_report checks currentChannelContext and routes to correct channel
  2. Returns error message when no channel context available
**Plans**: 0 plans

### Phase 34: Miscellaneous Fixes
**Goal**: Clean up remaining issues — JSON parse safety, dead code removal, atomic Redis ops, parentSessionId fix, complexity limit increase
**Depends on**: Nothing
**Requirements**: MISC-01, MISC-02, MISC-03, MISC-04, MISC-05, MISC-06
**Success Criteria**:
  1. SELF_REFLECTION_PROMPT has try/catch + regex fallback for JSON.parse
  2. SUBAGENT_ROUTING_PROMPT removed (dead code)
  3. loopIterationPrompt removed (dead code)
  4. SubagentManager.recordRun uses atomic Redis Lua script
  5. sessions_create parentSessionId uses session UUID not chatId
  6. COMPLEXITY_PROMPT uses 1000 char limit instead of 500
**Plans**: 0 plans

## Progress

**Execution Order:** 26 -> 27 -> 28 -> 29 -> 30 -> 31 -> 32 -> 33 -> 34

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 26. Scheduler Coupling | v11.0 | 0/0 | Not Started | — |
| 27. Cron BullMQ | v11.0 | 0/0 | Not Started | — |
| 28. Tool Profiles | v11.0 | 0/0 | Not Started | — |
| 29. Session Cleanup | v11.0 | 0/0 | Not Started | — |
| 30. Multi-Channel | v11.0 | 0/0 | Not Started | — |
| 31. Skills→Tools | v11.0 | 0/0 | Not Started | — |
| 32. System Prompts | v11.0 | 0/0 | Not Started | — |
| 33. Progress Report | v11.0 | 0/0 | Not Started | — |
| 34. Misc Fixes | v11.0 | 0/0 | Not Started | — |
