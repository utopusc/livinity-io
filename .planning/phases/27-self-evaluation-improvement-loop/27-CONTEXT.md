# Phase 27: Self-Evaluation & Improvement Loop - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds self-evaluation capability to the AI agent and creates a meta "Self-Improvement Agent" that runs as a loop. The AI evaluates its performance after tasks and triggers concrete improvement actions. Depends on Phase 25 (skill/tool creation) and Phase 26 (schedule/tier management) for the improvement actions.

</domain>

<decisions>
## Implementation Decisions

### Self-Evaluation (AGI-05)
- After completing a task, the AI evaluates its own performance
- Evaluation identifies: missing skills, slow patterns, repeated failures
- Triggers concrete actions: create skills, update skills, install tools, set schedules
- System prompt enhancement to include self-evaluation guidance

### Self-Improvement Agent (AGI-06)
- A meta-agent that runs as a loop via LoopRunner
- Periodically scans for capability gaps across the system
- Creates a built-in subagent config for the Self-Improvement Agent
- Can be started/stopped from the Agents tab (Phase 22)

### Claude's Discretion
- Evaluation frequency and criteria
- Self-improvement agent loop interval
- What metrics to track for self-evaluation
- How aggressively to trigger improvements

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- System prompt Self-Improvement section (Phase 25)
- Autonomous Scheduling section (Phase 26)
- `subagent_create` tool for creating the meta-agent
- `loop_manage` tool for running it as a loop
- `task_state` tool for tracking evaluation state
- `skill_generate`, `mcp_install` for improvement actions

### Integration Points
- `agent.ts` — system prompt for self-evaluation guidance
- `daemon.ts` — pre-register Self-Improvement Agent subagent config
- SubagentManager — store the built-in agent config

</code_context>

<specifics>
## Specific Ideas

- The Self-Improvement Agent should be a "seed" subagent that comes pre-configured
- It should run on a reasonable interval (e.g., every 6 hours)
- It should check: failed tool calls, repeated user corrections, missing capabilities

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 27-self-evaluation-improvement-loop*
*Context gathered: 2026-03-28 via smart discuss*
