# Phase 27: Self-Evaluation & Improvement Loop - Research

**Researched:** 2026-03-28
**Domain:** AI agent self-evaluation, meta-agent loops, autonomous improvement
**Confidence:** HIGH

## Summary

Phase 27 adds two capabilities to Nexus: (1) self-evaluation after task completion (AGI-05), and (2) a Self-Improvement Agent that runs as a persistent meta-agent loop (AGI-06). Both build on Phase 25's Self-Improvement system prompt section (skill creation, MCP tool installation) and Phase 26's Autonomous Scheduling (subagent creation with loop config, cron schedules).

The architecture is straightforward because all the plumbing already exists. Self-evaluation is a system prompt addition that instructs the AI to reflect after tasks -- no new code paths needed, just prompt engineering. The Self-Improvement Agent is a pre-seeded SubagentConfig that runs via the existing LoopRunner with a carefully crafted task prompt. The key engineering decisions are: what goes into the self-evaluation prompt section, how to seed the built-in agent config into Redis at daemon startup, and what the meta-agent's loop task should instruct it to do.

**Primary recommendation:** Implement self-evaluation as a new system prompt section in NATIVE_SYSTEM_PROMPT (agent.ts), and the Self-Improvement Agent as a pre-registered SubagentConfig seeded in daemon.ts startup, running via LoopRunner with a 6-hour interval.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- After completing a task, the AI evaluates its own performance
- Evaluation identifies: missing skills, slow patterns, repeated failures
- Triggers concrete actions: create skills, update skills, install tools, set schedules
- System prompt enhancement to include self-evaluation guidance
- A meta-agent that runs as a loop via LoopRunner
- Periodically scans for capability gaps across the system
- Creates a built-in subagent config for the Self-Improvement Agent
- Can be started/stopped from the Agents tab (Phase 22)

### Claude's Discretion
- Evaluation frequency and criteria
- Self-improvement agent loop interval
- What metrics to track for self-evaluation
- How aggressively to trigger improvements

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGI-05 | AI can evaluate its own performance after completing a task and trigger self-improvement actions (create skills, update skills, install tools, set schedules) | Self-Evaluation system prompt section added to NATIVE_SYSTEM_PROMPT; uses existing tools (skill_generate, mcp_registry_search, mcp_install, subagent_create, task_state) |
| AGI-06 | Self-Improvement Agent runs as a meta-agent loop, continuously identifying and filling capability gaps | Pre-seeded SubagentConfig in daemon.ts startup with loop config; runs via existing LoopRunner infrastructure |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing codebase | N/A | All implementation uses existing modules | No new dependencies needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SubagentManager | N/A | Store and manage the Self-Improvement Agent config in Redis | Pre-registering the built-in agent at startup |
| LoopRunner | N/A | Execute the meta-agent on a recurring interval | Running the Self-Improvement Agent every N hours |
| AgentLoop / SdkAgentRunner | N/A | Execute agent tasks with tool calling | Both self-evaluation (prompt-driven) and meta-agent iterations |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Approach

```
agent.ts (NATIVE_SYSTEM_PROMPT)
  └── New "## Self-Evaluation" section
        ├── After-task reflection criteria
        ├── What to evaluate (success, tool failures, missing capabilities)
        └── What actions to take (skill_generate, mcp_install, subagent_create, memory_add)

daemon.ts (start method)
  └── seedBuiltInAgents()
        └── Create "self-improvement-agent" SubagentConfig if not exists
              ├── loop.intervalMs = 21600000 (6 hours)
              ├── loop.task = "[detailed improvement scanning task]"
              ├── tools = ['*'] (all tools)
              ├── tier = 'sonnet'
              └── createdBy = 'system'
```

### Pattern 1: System Prompt Self-Evaluation Section
**What:** A new section in NATIVE_SYSTEM_PROMPT that instructs the AI to evaluate its performance after completing tasks and trigger improvement actions when gaps are identified.
**When to use:** Every agent task execution inherits this guidance automatically.
**Key Design:**
```typescript
// In agent.ts, NATIVE_SYSTEM_PROMPT, after "## Autonomous Scheduling" section:

## Self-Evaluation (After-Task Reflection)

After completing a task, briefly evaluate your performance:

### What to Evaluate
- Did you complete the task successfully on the first approach?
- Did any tool calls fail? If so, why?
- Did you lack a tool or skill that would have made this easier?
- Did you repeat similar steps that could be automated as a skill?
- Did you need information you didn't have in memory?

### When to Take Action
- **Create a skill**: You performed a multi-step workflow that will likely recur
- **Install an MCP tool**: You needed an external integration that doesn't exist yet
- **Save to memory**: You discovered something useful for future tasks (use memory_add with "LEARNED:" prefix)
- **Create a schedule**: The task should run automatically going forward

### When NOT to Act
- One-off tasks that won't recur
- Tasks that completed smoothly with existing tools
- Minor failures that were resolved within the same session
```

### Pattern 2: Pre-Seeded SubagentConfig at Daemon Startup
**What:** A method in daemon.ts that creates the Self-Improvement Agent config in Redis if it doesn't already exist, then starts its loop.
**When to use:** Called during daemon.start(), after all managers are wired up.
**Key Design:**
```typescript
// In daemon.ts, after loopRunner.startAll():

private async seedBuiltInAgents(): Promise<void> {
  const SELF_IMPROVEMENT_ID = 'self-improvement-agent';
  const existing = await this.config.subagentManager.get(SELF_IMPROVEMENT_ID);
  if (!existing) {
    await this.config.subagentManager.create({
      id: SELF_IMPROVEMENT_ID,
      name: 'Self-Improvement Agent',
      description: 'Meta-agent that periodically scans for capability gaps and triggers improvements',
      tools: ['*'],
      tier: 'sonnet',
      maxTurns: 15,
      status: 'active',
      createdBy: 'system',
      createdVia: 'web',
      loop: {
        intervalMs: 21_600_000, // 6 hours
        task: SELF_IMPROVEMENT_TASK, // Detailed task prompt
      },
    });
    logger.info('Seeded built-in Self-Improvement Agent');
  }
}
```

### Pattern 3: Self-Improvement Agent Task Prompt
**What:** The task prompt the meta-agent executes each loop iteration.
**Key Design:** The task prompt should instruct the agent to:
1. Check recent agent session history for patterns (via memory_search, task_state)
2. Look for repeated failures or missing capabilities
3. Check if any new MCP tools are available that could fill gaps (mcp_registry_search)
4. Create skills for repeated workflows (skill_generate)
5. Save findings to persistent state (task_state) for the next iteration

```typescript
const SELF_IMPROVEMENT_TASK = `You are the Self-Improvement Agent. Your job is to make Nexus better by identifying and filling capability gaps.

## Your Process

1. **Review recent activity**: Use memory_search with tags "self_reflection" and "LEARNED:" to find recent insights
2. **Check for patterns**: Use task_state to load your previous findings (key: "self-improvement-state")
3. **Scan for gaps**:
   - Search memory for recent failures or user complaints
   - Check if commonly requested capabilities are missing
   - Look for repetitive multi-step workflows that could become skills
4. **Take action** (if gaps found):
   - Use skill_generate to create skills for repeated workflows
   - Use mcp_registry_search + mcp_install for missing integrations
   - Use memory_add to record insights with tag "self_reflection"
5. **Save state**: Use task_state to save your findings for next iteration (key: "self-improvement-state")

## Rules
- Be conservative: only create skills/install tools when there is clear evidence of a recurring need
- Never duplicate existing capabilities (check mcp_list and memory first)
- If no improvements are needed, save a brief "no gaps found" state and finish
- Keep your actions minimal — one or two improvements per run maximum`;
```

### Anti-Patterns to Avoid
- **Over-eager improvement:** Creating skills for every task, flooding the system with unnecessary skills. The prompt must emphasize conservative action.
- **Infinite self-improvement loops:** The meta-agent should NOT be able to modify its own config or create additional meta-agents. The `createdBy: 'system'` flag helps identify it.
- **Heavy loop intervals:** Running every 5 minutes would waste API credits for minimal benefit. 6 hours is a good balance -- the agent checks a few times per day.
- **Blocking the daemon startup:** The seedBuiltInAgents() call should be fire-and-forget or non-blocking so it doesn't delay other startup tasks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent agent storage | Custom database schema | SubagentManager (Redis) | Already stores all subagent configs, history, run counts |
| Recurring execution | Custom timer/cron system | LoopRunner | Already handles intervals, state persistence, start/stop |
| Agent task execution | Custom execution pipeline | executeSubagentTask() | Already handles tool scoping, memory injection, history context |
| Metrics collection | Custom analytics pipeline | memory_search + task_state | The AI can query its own memory for patterns; simple is better |

**Key insight:** The entire infrastructure for running a meta-agent loop already exists. Phase 27 is primarily prompt engineering plus a single seeding function. No new modules, no new tools, no new API endpoints needed.

## Common Pitfalls

### Pitfall 1: Duplicate Seeding on Restart
**What goes wrong:** Every time the daemon restarts, it tries to create the Self-Improvement Agent again, hitting the "already exists" error in SubagentManager.create().
**Why it happens:** The create() method throws if the ID already exists.
**How to avoid:** Check `subagentManager.get(id)` first. If it exists, skip creation. If the user has stopped it (status: 'stopped'), respect that -- don't force-restart.
**Warning signs:** Error logs with "Subagent 'self-improvement-agent' already exists" on every restart.

### Pitfall 2: Self-Improvement Agent Respects User Control
**What goes wrong:** User stops the Self-Improvement Agent from the Agents tab, but it restarts automatically on daemon restart.
**Why it happens:** LoopRunner.startAll() fetches all active loop agents and starts them. If the agent's status is 'active', it will start.
**How to avoid:** The seeding function should only create the config if it doesn't exist. If it already exists (even if stopped), leave it alone. LoopRunner.startAll() naturally respects `status !== 'active'`.
**Warning signs:** User complains the agent keeps running after they stopped it.

### Pitfall 3: Self-Evaluation Prompt Bloat
**What goes wrong:** The self-evaluation section in the system prompt is too long, consuming valuable context window tokens on every single request.
**Why it happens:** Over-detailed instructions with too many examples.
**How to avoid:** Keep the section under 20 lines. The AI is smart enough to understand concise guidance. Phase 28 (System Prompt Optimization) will further compact all sections.
**Warning signs:** Token usage increases noticeably after deployment.

### Pitfall 4: Meta-Agent Consumes Too Many API Credits
**What goes wrong:** The Self-Improvement Agent runs on 'sonnet' tier every 6 hours, costing money even when it finds nothing to improve.
**Why it happens:** Fixed interval regardless of activity level.
**How to avoid:** Use 'flash' tier for the initial scan. The agent can escalate to sonnet only if it finds actionable gaps. Also, the "no gaps found" early exit path should keep iterations short (1-2 turns).
**Warning signs:** Usage tracker shows many sessions from 'self-improvement-agent' with high token counts and "no gaps found" results.

### Pitfall 5: Stale Loop State
**What goes wrong:** The meta-agent's task_state accumulates old findings that are no longer relevant.
**Why it happens:** task_state persists indefinitely in Redis.
**How to avoid:** The task prompt should instruct the agent to keep state concise and rotate old entries. Alternatively, LoopRunner already sets a 7-day TTL on loop state via Redis SET ... EX.
**Warning signs:** Loop state grows unboundedly; agent wastes turns processing old data.

## Code Examples

### Example 1: System Prompt Section Placement
```typescript
// In agent.ts, NATIVE_SYSTEM_PROMPT:
// Current section order:
// 1. Tool Overview
// 2. Computer Use
// 3. Messaging Context
// 4. How You Work
// 5. Sub-agent Guidance
// 6. Rules
// 7. Browser Safety
// 8. Memory
// 9. Self-Improvement          <-- Phase 25
// 10. Autonomous Scheduling    <-- Phase 26
// 11. [NEW] Self-Evaluation    <-- Phase 27 (place AFTER Autonomous Scheduling)
// 12. Domain & Caddy Configuration
```

### Example 2: Seeding Built-in Agent in daemon.ts
```typescript
// In daemon.ts, Daemon.start() method, after loopRunner.startAll():

// Seed built-in agents (Self-Improvement Agent)
await this.seedBuiltInAgents();

// ...

private async seedBuiltInAgents(): Promise<void> {
  const SELF_IMPROVEMENT_ID = 'self-improvement-agent';

  // Only create if it doesn't exist — respect user changes (stop/delete)
  const existing = await this.config.subagentManager.get(SELF_IMPROVEMENT_ID);
  if (existing) {
    logger.debug('Built-in Self-Improvement Agent already exists', { status: existing.status });
    return;
  }

  try {
    const config = await this.config.subagentManager.create({
      id: SELF_IMPROVEMENT_ID,
      name: 'Self-Improvement Agent',
      description: 'Periodically scans for capability gaps and triggers improvements (skill creation, tool installation, memory insights)',
      tools: ['*'],
      tier: 'flash',  // Use flash for cost efficiency; escalate within task if needed
      maxTurns: 15,
      status: 'active',
      createdBy: 'system',
      createdVia: 'web',
      loop: {
        intervalMs: 21_600_000, // 6 hours
        task: SELF_IMPROVEMENT_TASK,
      },
    });

    // Start the loop immediately
    await this.config.loopRunner.start(config);
    logger.info('Seeded and started built-in Self-Improvement Agent');
  } catch (err) {
    logger.error('Failed to seed Self-Improvement Agent', { error: formatErrorMessage(err) });
  }
}
```

### Example 3: How LoopRunner Already Handles This
```typescript
// LoopRunner.startAll() is already called in daemon.start() at line 252.
// It calls subagentManager.getLoopAgents() which returns all active agents with loop configs.
// So once we seed the Self-Improvement Agent with status: 'active' and a loop config,
// LoopRunner.startAll() will automatically pick it up on subsequent restarts.

// The key insight: we only need to call loopRunner.start(config) on FIRST creation.
// After that, loopRunner.startAll() handles it on every restart.
```

### Example 4: Verifying the Agent Appears in Agents Tab
```typescript
// The Agents tab (Phase 22) calls subagent_list, which calls subagentManager.list().
// SubagentManager.list() returns ALL subagents including our seeded one.
// The frontend already supports start/stop controls via loop_manage tool.
// No UI changes needed — the Self-Improvement Agent will appear automatically.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No self-evaluation | Prompt-guided self-evaluation (Phase 27) | v21.0 | AI reflects on task outcomes and triggers improvements |
| Manual capability expansion | Autonomous + meta-agent improvement loop | v21.0 | System continuously identifies and fills gaps |

**Deprecated/outdated:**
- SELF_REFLECTION_PROMPT in prompts.ts: This prompt exists but is currently unused ("dead code" per comments in prompts.ts). It outputs JSON with insights/improvements/goals/memory_updates. This is NOT used by the self-evaluation feature because it's a separate scheduled reflection mechanism, not an after-task inline evaluation. The self-evaluation in Phase 27 is embedded in the main system prompt, not a separate prompt.

## Open Questions

1. **Tier for the Self-Improvement Agent**
   - What we know: 'flash' is cheapest, 'sonnet' is most capable for reasoning about capability gaps.
   - What's unclear: Whether flash is smart enough to meaningfully assess capability gaps.
   - Recommendation: Start with 'flash' tier to minimize cost. The prompt should be clear enough that flash can handle it. If results are poor, user can update the agent's tier via the Agents tab.

2. **Should self-evaluation add latency to every response?**
   - What we know: Self-evaluation is a system prompt instruction, so the AI evaluates within the same response turn. It doesn't add a separate API call.
   - What's unclear: Whether the AI will actually perform evaluation or just ignore it under time pressure.
   - Recommendation: The prompt should frame evaluation as "if applicable" -- not every task warrants reflection. Simple queries (status checks, lookups) should skip evaluation.

3. **What about the existing SELF_REFLECTION_PROMPT?**
   - What we know: It exists in prompts.ts but is unused dead code. It's a structured JSON output format for periodic self-reflection.
   - What's unclear: Whether we should reuse or remove it.
   - Recommendation: Leave it alone for now. The Self-Improvement Agent serves the same purpose in a more sophisticated way. Cleanup can happen in Phase 28 (System Prompt Optimization).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no test infrastructure in nexus-core) |
| Config file | None |
| Quick run command | `cd nexus && npm run build --workspace=packages/core` |
| Full suite command | `cd nexus && npm run build --workspace=packages/core` (build-only verification) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGI-05 | Self-evaluation prompt present in system prompt | manual-only | Verify string present in agent.ts | N/A |
| AGI-06 | Self-Improvement Agent seeded at startup | manual-only | Check Redis for subagent config after daemon restart | N/A |

**Justification for manual-only:** No test framework exists in nexus-core. Verification is via TypeScript compilation (catches syntax/type errors) and manual inspection of deployed behavior. Phase 28 does not add tests either -- this is consistent with the project's pattern.

### Sampling Rate
- **Per task commit:** `cd nexus && npm run build --workspace=packages/core`
- **Per wave merge:** Same build command
- **Phase gate:** Build succeeds + manual verification on Server4

### Wave 0 Gaps
None -- no test infrastructure to gap-fill, consistent with all prior phases.

## Sources

### Primary (HIGH confidence)
- `nexus/packages/core/src/agent.ts` - NATIVE_SYSTEM_PROMPT structure, section ordering, Self-Improvement section (Phase 25)
- `nexus/packages/core/src/daemon.ts` - Daemon.start() flow, LoopRunner wiring (lines 235-252), executeSubagentTask() (lines 3138-3251), agent handler (lines 967-1252)
- `nexus/packages/core/src/subagent-manager.ts` - SubagentConfig interface, create/get/update methods, Redis storage
- `nexus/packages/core/src/loop-runner.ts` - LoopContext, start/stopOne/startAll, iteration execution with state persistence
- `nexus/packages/core/src/prompts.ts` - SELF_REFLECTION_PROMPT (unused), subagentPrompt template

### Secondary (MEDIUM confidence)
- Phase 25 summary (25-01-SUMMARY.md) - Confirmed Self-Improvement section placement and tool response enhancements
- Phase 26 summary (26-01-SUMMARY.md) - Confirmed Autonomous Scheduling section and tier config patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, entirely uses existing modules verified by reading source code
- Architecture: HIGH - All integration points (SubagentManager, LoopRunner, NATIVE_SYSTEM_PROMPT) thoroughly analyzed from source
- Pitfalls: HIGH - Identified from actual code behavior (create() throws on duplicate, LoopRunner respects status, loop state TTL)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies, all internal code)
