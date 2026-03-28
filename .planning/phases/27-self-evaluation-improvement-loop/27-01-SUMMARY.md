---
phase: 27-self-evaluation-improvement-loop
plan: 01
subsystem: ai
tags: [system-prompt, self-evaluation, meta-agent, loop-runner, subagent]

# Dependency graph
requires:
  - phase: 25-agi-skill-tool-creation
    provides: Self-Improvement system prompt section, skill_generate tool, mcp_install tool
  - phase: 26-agi-schedule-tier-management
    provides: Autonomous Scheduling system prompt section, subagent_create tool, LoopRunner infrastructure
provides:
  - Self-Evaluation system prompt section in NATIVE_SYSTEM_PROMPT (after-task reflection guidance)
  - Pre-seeded Self-Improvement Agent SubagentConfig with 6-hour loop interval
  - seedBuiltInAgents() daemon startup method for built-in agent registration
affects: [28-system-prompt-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns: [built-in-agent-seeding, system-prompt-self-evaluation]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/agent.ts
    - nexus/packages/core/src/daemon.ts

key-decisions:
  - "Flash tier for Self-Improvement Agent to minimize cost; user can upgrade via Agents tab"
  - "get() check before create() prevents duplicate seeding on daemon restart"
  - "createdBy: 'system' ensures loop results are not routed to any messaging channel"
  - "Self-Evaluation section is 18 lines (under 20-line budget) to minimize system prompt bloat"

patterns-established:
  - "Built-in agent seeding: seedBuiltInAgents() pattern for pre-registering system agents at daemon startup"
  - "Idempotent seeding: check exists before create, respect user modifications (stop/delete)"

requirements-completed: [AGI-05, AGI-06]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 27 Plan 01: Self-Evaluation & Improvement Loop Summary

**Self-evaluation system prompt section with after-task reflection guidance plus pre-seeded Self-Improvement Agent meta-loop running every 6 hours on flash tier**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T12:04:18Z
- **Completed:** 2026-03-28T12:06:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added Self-Evaluation system prompt section to NATIVE_SYSTEM_PROMPT with evaluation criteria, action triggers, and when-not-to-act guidelines
- Seeded Self-Improvement Agent as a built-in subagent with 6-hour loop, flash tier, 15 max turns, and all tools
- Agent appears automatically in Agents tab via existing SubagentManager.list() infrastructure -- no UI changes needed
- Idempotent seeding: respects user control (stop/delete), no duplicate creation on restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Self-Evaluation system prompt section to agent.ts** - `d34f3ca` (feat)
2. **Task 2: Seed Self-Improvement Agent in daemon.ts and build** - `86cb768` (feat)

## Files Created/Modified
- `nexus/packages/core/src/agent.ts` - Added 18-line "## Self-Evaluation (After-Task Reflection)" section to NATIVE_SYSTEM_PROMPT between Autonomous Scheduling and Domain & Caddy Configuration
- `nexus/packages/core/src/daemon.ts` - Added SELF_IMPROVEMENT_TASK constant, seedBuiltInAgents() private method, and call in start() after loopRunner.startAll()

## Decisions Made
- **Flash tier** for Self-Improvement Agent (cheapest option; user can upgrade via Agents tab if needed)
- **createdBy: 'system'** so loop results are not routed to any messaging channel (daemon.ts line 239 skips routing for system agents)
- **tools: ['*']** gives the meta-agent access to all tools including skill_generate, mcp_install, memory_search/add, task_state
- **get() before create()** prevents SubagentManager.create() from throwing "already exists" on daemon restart
- **loopRunner.start() only on first creation** -- subsequent restarts rely on loopRunner.startAll() which picks up all active loop agents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All AGI requirements (AGI-01 through AGI-06) are now complete
- Phase 28 (System Prompt Optimization) can proceed -- it may compact the Self-Evaluation section further
- Self-Improvement Agent will start running on first daemon restart; user can manage it from the Agents tab

## Self-Check: PASSED

- [x] nexus/packages/core/src/agent.ts exists
- [x] nexus/packages/core/src/daemon.ts exists
- [x] .planning/phases/27-self-evaluation-improvement-loop/27-01-SUMMARY.md exists
- [x] Commit d34f3ca found in git log
- [x] Commit 86cb768 found in git log
- [x] nexus-core build succeeds (exit code 0)

---
*Phase: 27-self-evaluation-improvement-loop*
*Completed: 2026-03-28*
