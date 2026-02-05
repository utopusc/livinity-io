# v2 Research: Autonomous Agent Evolution

**Date:** 2026-01-26
**Sources:** AutoGPT, BabyAGI, CrewAI, LangChain, Temporal, Cognee, Mem0, Zep, MemGPT/Letta, Claude Code architecture

## 1. Agent Framework Patterns

### AutoGPT
- **Architecture**: Task decomposition → subtask execution → result aggregation loop
- **Key pattern**: "Thoughts, Reasoning, Plan, Criticism" structured output per turn
- **Plugin system**: File-based plugins with manifest.json + Python handler, auto-discovered at startup
- **Memory**: ChromaDB vector store + file-based workspace for persistent state
- **Adopt**: Plugin auto-discovery, structured self-criticism, workspace per task
- **Avoid**: Unbounded loops, excessive token usage from full context replay

### BabyAGI
- **Architecture**: 3-function loop: task_creation → prioritization → execution
- **Key pattern**: Agent generates its OWN todo list, re-prioritizes after each task
- **Adopt**: Self-generating task lists, priority-based execution order
- **Avoid**: No safety limits, no memory consolidation

### CrewAI
- **Architecture**: Role-based agents with delegation, each agent has: role, goal, backstory, tools
- **Key pattern**: Agents can delegate to other agents via `delegate_work` tool
- **Scheduling**: External (called from cron/scheduler), not self-scheduling
- **Communication**: Sequential (pipeline) or hierarchical (manager delegates)
- **Adopt**: Role/goal/backstory for subagents, hierarchical delegation, tool scoping per agent
- **Avoid**: Over-abstraction, too many agent types for simple tasks

### Temporal.io (Workflow Orchestration)
- **Architecture**: Durable execution — workflows survive crashes, replayed from event history
- **Key pattern**: Workflows define steps, activities are the actual work, schedules trigger workflows
- **Adopt**: Durable state (Redis), schedule-triggered workflows, retry policies
- **Avoid**: Full Temporal SDK overhead (we use BullMQ + Redis which is sufficient)

### Claude Code Architecture
- **Subagent pattern**: `Task()` spawns specialized agents (Explore, Plan, gsd-executor, etc.)
- **Key pattern**: Agent type selection based on task, each agent has its own system prompt and tool set
- **Skill system**: YAML frontmatter + handler, triggers, hot-reload
- **Adopt**: Agent type registry, specialized system prompts per agent type, skill templates

## 2. SubAgent Lifecycle Patterns

### Recommended Model (synthesized from CrewAI + Temporal + AutoGPT):

```typescript
interface SubAgent {
  id: string;                  // Unique identifier
  name: string;                // Human-readable name
  purpose: string;             // What this agent does (backstory)
  tools: string[];             // Scoped tool access
  skills: string[];            // Skills loaded into this agent
  schedule?: CronSchedule;     // When to run (null = on-demand only)
  status: 'active' | 'paused' | 'stopped';
  config: {
    tier: ModelTier;           // AI model tier
    maxTurns: number;
    maxTokens: number;
    timeoutMs: number;
    systemPrompt?: string;     // Custom system prompt
  };
  state: {
    lastRun?: Date;
    lastResult?: string;
    runCount: number;
    failCount: number;
    totalTokens: number;
  };
  createdAt: Date;
  createdBy: string;           // 'user' | 'agent' | subagent name
}
```

### Persistence: Redis Hash
- Key: `nexus:subagent:{id}` → JSON
- Index: `nexus:subagents` → SET of IDs
- Schedule: BullMQ repeatable jobs linked to subagent ID

## 3. Scheduling Patterns

### Best approach for our stack (BullMQ + Redis):

```typescript
// Human-friendly schedule definition
interface CronSchedule {
  pattern: string;          // "0 9 * * *" (daily at 9am) or "every 6h"
  timezone?: string;        // Default: UTC
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

// BullMQ repeatable job
await queue.add('subagent-run', { subagentId: 'leadgen-daily' }, {
  repeat: { pattern: '0 9 * * *', tz: 'Europe/Istanbul' },
  jobId: 'subagent:leadgen-daily',
});
```

### Schedule management via WhatsApp:
- `!schedule leadgen daily at 9am` → Create subagent + BullMQ repeatable
- `!schedule email-check every 6h` → Create subagent + interval job
- `!schedule list` → Show all scheduled agents
- `!schedule pause leadgen` → Pause without deleting

## 4. Self-Generating Skills Pattern

### Recommended approach (AutoGPT plugins + Claude Code skills):

1. **Template**: Predefined skill template with YAML frontmatter placeholders
2. **Generation**: Agent analyzes task → writes skill code → saves to `skills/` directory
3. **Validation**: Parse YAML frontmatter, check handler export, dry-run with mock context
4. **Hot-reload**: Existing fs.watch picks up new file automatically
5. **Safety**: Generated skills can only use tools already in the registry (no arbitrary code execution)

```
User: "Create a skill that checks cryptocurrency prices every hour"
Agent: 1. Writes skills/crypto-check.ts with proper frontmatter
       2. Validates the file compiles
       3. SkillLoader hot-reloads it
       4. Creates a scheduled subagent to run it hourly
```

## 5. Memory System Patterns

### Current Cognee limitations:
- Only `add()` and `search()` — no graph traversal, no relationship queries
- No structured memory types (everything is flat text)
- No memory consolidation or decay
- No category-based retrieval

### Recommended enhancements:

**Structured Memory Types:**
- `episodic`: What happened (task executions, conversations) — auto-tagged with timestamps
- `semantic`: Facts and knowledge (user preferences, server configs, learned approaches)
- `procedural`: How to do things (successful skill approaches, command sequences)

**Memory Operations:**
- `add(content, type, tags, ttl?)` — Store with type classification
- `search(query, type?, tags?, limit?)` — Filtered semantic search
- `graph(entity)` — Get entity relationships from Cognee knowledge graph
- `consolidate()` — Periodic summarization of old episodic memories
- `forget(query)` — Remove specific memories

**Self-Updating Agent Purpose:**
- Every N hours, agent reviews recent conversation history
- Extracts user preferences, recurring tasks, common requests
- Updates its own system prompt with learned context
- Stores "agent:purpose" and "agent:preferences" in memory

## 6. Agent Communication Patterns

### WhatsApp Routing to SubAgents:
- `!agent:leadgen check status` → Route to leadgen subagent
- `!agent:monitor why is disk full` → Route to monitor subagent
- Default (no prefix): Route to main agent

### Inter-Agent Communication (Redis Pub/Sub):
- Channel: `nexus:agent:{id}:inbox` — Send messages to specific agent
- Channel: `nexus:agent:broadcast` — All agents receive
- Pattern: Producer-consumer via Redis lists (already proven with wa_outbox)

## 7. Loop Engine Pattern

### Types of loops:
1. **Interval loop**: Run every N minutes/hours (cron-based, via BullMQ)
2. **Watch loop**: Monitor a condition, act when triggered (polling-based)
3. **Pipeline loop**: Run phases in sequence, restart when complete

### Implementation:
- Loop config stored in SubAgent.schedule
- BullMQ repeatable jobs handle interval execution
- Watch loops implemented as skills with built-in polling
- Results aggregated and reported via WhatsApp/memory

---

*Research completed: 2026-01-26*
