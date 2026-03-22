# Requirements: Livinity v11.0 — Nexus Agent Fixes

**Defined:** 2026-03-22
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v11.0 Requirements

### SCHED — Sub-agent Scheduler Coupling

- [ ] **SCHED-01**: subagent_create with schedule but no scheduled_task returns error (not silent success)
- [ ] **SCHED-02**: schedule and scheduled_task parameter descriptions indicate coupling requirement
- [ ] **SCHED-03**: subagent_create output confirms schedule registration status

### CRON — Cron Tool Persistence

- [ ] **CRON-01**: cron tool uses BullMQ cronQueue instead of setTimeout
- [ ] **CRON-02**: Scheduled cron tasks survive nexus-core process restart

### PROF — Tool Profile Accuracy

- [ ] **PROF-01**: TOOL_PROFILES names match actual registered tool names in daemon.ts

### SESS — Session Cleanup

- [ ] **SESS-01**: MultiAgentManager.cleanup() called periodically to remove stale sessions
- [ ] **SESS-02**: cleanup() uses Redis pipeline instead of sequential exists calls

### ROUTE — Multi-Channel Notification Routing

- [ ] **ROUTE-01**: SubagentConfig includes createdVia field tracking source channel
- [ ] **ROUTE-02**: subagent_create saves channel source from currentChannelContext
- [ ] **ROUTE-03**: Schedule/loop results route to originating channel (WhatsApp/Telegram/Discord/Web)

### NAME — Skills→Tools Naming

- [ ] **NAME-01**: SubagentConfig.skills field renamed to tools
- [ ] **NAME-02**: All references updated (subagent_create params, executeSubagentTask, Redis migration)

### PROMPT — System Prompt Improvements

- [ ] **PROMPT-01**: NATIVE_SYSTEM_PROMPT includes tool category overview
- [ ] **PROMPT-02**: Sub-agent mechanism guidance added (spawn_subagent vs subagent_create vs sessions_create)
- [ ] **PROMPT-03**: WhatsApp rules consolidated into native prompt, AGENT_SYSTEM_PROMPT dead code removed

### PROG — Progress Report Multi-Channel

- [ ] **PROG-01**: progress_report tool routes to correct channel based on context

### MISC — Miscellaneous Fixes

- [ ] **MISC-01**: SELF_REFLECTION_PROMPT JSON.parse has try/catch + regex fallback
- [ ] **MISC-02**: SUBAGENT_ROUTING_PROMPT dead code removed
- [ ] **MISC-03**: loopIterationPrompt dead code removed
- [ ] **MISC-04**: SubagentManager.recordRun uses atomic Redis Lua script
- [ ] **MISC-05**: sessions_create parentSessionId uses session UUID not chatId
- [ ] **MISC-06**: COMPLEXITY_PROMPT uses 1000 char limit instead of 500

## Out of Scope

| Feature | Reason |
|---------|--------|
| New tool development | Bug fixes only, no new tools |
| UI changes | Backend/agent system only |
| New AI provider support | Kimi-only policy unchanged |
| Channel manager refactor | Minimal routing changes, not full rewrite |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHED-01 | Phase 26 | Pending |
| SCHED-02 | Phase 26 | Pending |
| SCHED-03 | Phase 26 | Pending |
| CRON-01 | Phase 27 | Pending |
| CRON-02 | Phase 27 | Pending |
| PROF-01 | Phase 28 | Pending |
| SESS-01 | Phase 29 | Pending |
| SESS-02 | Phase 29 | Pending |
| ROUTE-01 | Phase 30 | Pending |
| ROUTE-02 | Phase 30 | Pending |
| ROUTE-03 | Phase 30 | Pending |
| NAME-01 | Phase 31 | Pending |
| NAME-02 | Phase 31 | Pending |
| PROMPT-01 | Phase 32 | Pending |
| PROMPT-02 | Phase 32 | Pending |
| PROMPT-03 | Phase 32 | Pending |
| PROG-01 | Phase 33 | Pending |
| MISC-01 | Phase 34 | Pending |
| MISC-02 | Phase 34 | Pending |
| MISC-03 | Phase 34 | Pending |
| MISC-04 | Phase 34 | Pending |
| MISC-05 | Phase 34 | Pending |
| MISC-06 | Phase 34 | Pending |

**Coverage:**
- v11.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
