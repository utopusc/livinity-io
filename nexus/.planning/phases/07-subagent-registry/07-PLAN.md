# Phase 7: Persistent SubAgent Registry — Execution Plan

## Goal
Main agent can CREATE, MANAGE, and DESTROY persistent subagents that survive restarts, each with their own purpose, tools, skills, and schedule.

## Requirements
PSUB-01, PSUB-02, PSUB-03, PSUB-04, PSUB-05, PSUB-06

---

## Plan 01: SubAgent Data Model & Registry Class

**Wave:** 1
**Files:** `packages/core/src/subagent-registry.ts` (NEW)
**Depends on:** None

### Tasks

**Task 1: Define SubAgent interfaces**
Create the SubAgent TypeScript interfaces with all required fields:

```typescript
interface SubAgentConfig {
  tier: ModelTier;
  maxTurns: number;
  maxTokens: number;
  timeoutMs: number;
  systemPrompt?: string;
}

interface SubAgentState {
  lastRun?: string;       // ISO date
  lastResult?: string;    // Summary of last run
  runCount: number;
  failCount: number;
  totalTokens: number;
}

interface SubAgentSchedule {
  pattern: string;        // Cron expression or "every Xh"
  timezone: string;       // Default: UTC
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

interface SubAgent {
  id: string;
  name: string;
  purpose: string;        // What this agent does (CrewAI backstory)
  tools: string[];        // Scoped tool access
  skills: string[];       // Skills this agent can use
  schedule?: SubAgentSchedule;
  status: 'active' | 'paused' | 'stopped';
  config: SubAgentConfig;
  state: SubAgentState;
  createdAt: string;
  createdBy: string;      // 'user' | 'agent' | subagent name
}
```

**Task 2: Implement SubAgentRegistry class**
Create the registry class with Redis-backed CRUD:

```typescript
class SubAgentRegistry {
  constructor(redis: Redis) {}

  // CRUD
  async create(data: CreateSubAgentInput): Promise<SubAgent>
  async get(id: string): Promise<SubAgent | null>
  async update(id: string, updates: Partial<SubAgent>): Promise<SubAgent>
  async delete(id: string): Promise<boolean>
  async list(): Promise<SubAgent[]>

  // Lifecycle
  async activate(id: string): Promise<void>
  async pause(id: string): Promise<void>
  async stop(id: string): Promise<void>

  // Execution
  async run(id: string, task: string, options?: RunOptions): Promise<AgentResult>

  // State tracking
  async recordRun(id: string, result: AgentResult): Promise<void>

  // Persistence
  async loadAll(): Promise<void>  // Called at daemon startup
  async save(agent: SubAgent): Promise<void>
}
```

Redis structure:
- `nexus:subagent:{id}` → JSON string of SubAgent
- `nexus:subagents` → SET of all subagent IDs
- `nexus:subagent:{id}:history` → LIST of last 20 run summaries

**Task 3: Implement auto-generated system prompt**
Each subagent gets a system prompt derived from its purpose:

```typescript
private buildSystemPrompt(agent: SubAgent): string {
  return `You are "${agent.name}", a specialized Nexus subagent.

## Your Purpose
${agent.purpose}

## Your Tools
You have access to: ${agent.tools.join(', ')}

## Rules
1. Stay focused on your purpose — do not deviate
2. Be efficient — use the minimum tools needed
3. Report results clearly and concisely
4. If you encounter an error, try one alternative approach, then report failure
5. ALWAYS respond with valid JSON (tool_call or final_answer)`;
}
```

### Verification
- [ ] SubAgent interface has all fields from PSUB-01
- [ ] Redis persistence works (create, restart daemon, agent still exists)
- [ ] CRUD operations all functional
- [ ] System prompt generated from purpose

---

## Plan 02: SubAgent Tools (create, list, manage)

**Wave:** 2
**Files:** `packages/core/src/daemon.ts`
**Depends on:** Plan 01

### Tasks

**Task 1: Register `subagent_create` tool**
```typescript
toolRegistry.register({
  name: 'subagent_create',
  description: 'Create a new persistent subagent with a specific purpose and tool access. Use this when the user wants to set up a recurring task or a specialized agent.',
  parameters: [
    { name: 'name', type: 'string', description: 'Short name for the subagent (e.g. "leadgen", "email-checker")', required: true },
    { name: 'purpose', type: 'string', description: 'What this agent does (detailed description)', required: true },
    { name: 'tools', type: 'string', description: 'Comma-separated tool names this agent can use', required: true },
    { name: 'tier', type: 'string', description: 'AI model tier', required: false, default: 'sonnet' },
    { name: 'max_turns', type: 'number', description: 'Max turns per run', required: false, default: 15 },
  ],
  execute: async (params) => { ... }
});
```

**Task 2: Register `subagent_list` tool**
```typescript
toolRegistry.register({
  name: 'subagent_list',
  description: 'List all registered subagents with their status, last run, and purpose.',
  parameters: [],
  execute: async () => { ... }
});
```

**Task 3: Register `subagent_manage` tool**
```typescript
toolRegistry.register({
  name: 'subagent_manage',
  description: 'Manage a subagent: start, stop, pause, resume, delete, or run it immediately.',
  parameters: [
    { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['run', 'pause', 'resume', 'stop', 'delete', 'info'] },
    { name: 'name', type: 'string', description: 'Subagent name or ID', required: true },
    { name: 'task', type: 'string', description: 'Task to run (required for "run" operation)', required: false },
  ],
  execute: async (params) => { ... }
});
```

**Task 4: Wire SubAgentRegistry into Daemon**
- Add `subagentRegistry` to DaemonConfig
- Create registry in daemon startup (index.ts)
- Call `subagentRegistry.loadAll()` at startup
- Pass registry to tools via closure

### Verification
- [ ] `subagent_create` creates a new subagent persisted in Redis
- [ ] `subagent_list` shows all subagents with status
- [ ] `subagent_manage run` executes a subagent with its scoped tools
- [ ] `subagent_manage delete` removes subagent from Redis
- [ ] Subagents survive daemon restart (loadAll restores them)

---

## Plan 03: SkillContext Integration & WhatsApp Commands

**Wave:** 3
**Files:** `packages/core/src/skill-types.ts`, `packages/core/src/skill-loader.ts`, `packages/core/src/daemon.ts`
**Depends on:** Plan 02

### Tasks

**Task 1: Add subagent access to SkillContext**
Update SkillContext interface to include subagent registry access:

```typescript
interface SkillContext {
  // ... existing fields ...
  /** Create a persistent subagent */
  createSubAgent: (data: CreateSubAgentInput) => Promise<SubAgent>;
  /** Run a subagent by name */
  runSubAgent: (name: string, task: string) => Promise<AgentResult>;
  /** List all subagents */
  listSubAgents: () => Promise<SubAgent[]>;
}
```

**Task 2: Wire subagent helpers in SkillLoader.execute()**
Build subagent context helpers (similar to how runAgent, redis, think are built):

```typescript
const createSubAgent = async (data: CreateSubAgentInput) => {
  return subagentRegistry.create(data);
};
const runSubAgent = async (name: string, task: string) => {
  const agents = await subagentRegistry.list();
  const agent = agents.find(a => a.name === name);
  if (!agent) throw new Error(`SubAgent "${name}" not found`);
  return subagentRegistry.run(agent.id, task);
};
```

**Task 3: Add WhatsApp trigger skill for subagent management**
Create `skills/subagent-manage.ts` — a simple skill that handles:
- `!agent create <name> <purpose>` → Create subagent
- `!agent list` → List all subagents
- `!agent run <name> <task>` → Run subagent
- `!agent delete <name>` → Delete subagent
- `!agent info <name>` → Show subagent details

### Verification
- [ ] Skills can create subagents via ctx.createSubAgent()
- [ ] Skills can run subagents via ctx.runSubAgent()
- [ ] WhatsApp command `!agent list` shows subagents
- [ ] WhatsApp command `!agent create monitor "Check server health"` creates a subagent
- [ ] WhatsApp command `!agent run monitor "check disk usage"` executes it
- [ ] Created subagent persists after daemon restart

---

## must_haves (goal-backward verification)

1. **SubAgent model persisted in Redis** — create subagent, restart daemon, subagent still exists
2. **AI can create subagents** — via subagent_create tool, agent decides to create a subagent for a recurring task
3. **Subagent execution works** — subagent runs its own AgentLoop with scoped tools and custom system prompt
4. **CRUD complete** — create, read, update, delete all work via tools and WhatsApp
5. **Skills can use subagents** — ctx.createSubAgent and ctx.runSubAgent available in skill handlers

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `packages/core/src/subagent-registry.ts` | NEW | SubAgent model, Redis CRUD, registry class |
| `packages/core/src/daemon.ts` | MODIFY | Register 3 new tools, wire registry |
| `packages/core/src/skill-types.ts` | MODIFY | Add subagent helpers to SkillContext |
| `packages/core/src/skill-loader.ts` | MODIFY | Build subagent context in execute() |
| `packages/core/src/index.ts` | MODIFY | Create SubAgentRegistry, pass to Daemon |
| `skills/subagent-manage.ts` | NEW | WhatsApp subagent management commands |
