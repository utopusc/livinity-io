# Phase 26: Autonomous Schedule & Tier Management - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase enhances the AI to autonomously create recurring schedules/loops for repetitive tasks and select appropriate model tiers based on task complexity. Existing tools (`subagent_schedule`, `loop_manage`, `subagent_create`) and `selectTier()` in brain.ts already provide the foundation.

</domain>

<decisions>
## Implementation Decisions

### Autonomous Schedule/Loop Management (AGI-03)
- Enhance system prompt to guide AI on when to create recurring schedules
- AI should analyze tasks and determine "this should run daily/hourly/etc."
- Use existing `subagent_create` + `subagent_schedule` + `loop_manage` tools
- AI manages its own state via `task_state` tool during loops

### Smart Model Tier Selection (AGI-04)
- Enhance `selectTier()` in brain.ts with configurable rules
- Create `nexus/config/tiers.json` for tier selection rules
- Simple → flash/haiku, reasoning → sonnet, architecture → opus
- Agents can specify their own tier via SubagentConfig

### Claude's Discretion
- Exact system prompt wording for schedule creation guidance
- Tier selection rule specifics and thresholds
- Whether to log tier selection decisions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `selectTier()` in brain.ts — current regex-based tier selection
- `subagent_create`, `subagent_schedule`, `loop_manage` tools
- `task_state` tool for state management in loops
- `ScheduleManager` with BullMQ cron scheduling
- `LoopRunner` for interval-based execution
- SubagentConfig already has `tier` field

### Integration Points
- `agent.ts` — system prompt for schedule guidance
- `brain.ts` — selectTier() enhancement
- `nexus/config/tiers.json` — new config file

</code_context>

<specifics>
## Specific Ideas

- Tier config should be editable without code changes (JSON file)
- AI should explain why it chose a particular tier when asked

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 26-autonomous-schedule-tier-management*
*Context gathered: 2026-03-28 via smart discuss*
