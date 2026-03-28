# Phase 26: Autonomous Schedule & Tier Management - Research

**Researched:** 2026-03-28
**Domain:** AI agent self-management (schedule creation, model tier selection)
**Confidence:** HIGH

## Summary

Phase 26 enhances the AI agent to (1) autonomously create recurring schedules and loops when it identifies repetitive tasks, and (2) select appropriate model tiers based on task complexity via a configurable `tiers.json` file. Both capabilities already have strong foundations in the codebase -- the tools `subagent_create`, `subagent_schedule`, `loop_manage`, and `task_state` are fully implemented, and `selectTier()` in brain.ts already classifies intent types into tiers. The work is primarily about adding system prompt guidance for autonomous schedule decisions and replacing the hardcoded tier arrays in `selectTier()` with a JSON-driven configurable approach.

This phase requires no new dependencies, no new tools, and no new infrastructure. It is purely about enhancing the system prompt in agent.ts and refactoring selectTier() in brain.ts to read from `nexus/config/tiers.json`.

**Primary recommendation:** Add a "Schedule & Loop Autonomy" section to NATIVE_SYSTEM_PROMPT in agent.ts, and refactor selectTier() to load tier rules from a JSON config file at runtime.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Enhance system prompt to guide AI on when to create recurring schedules
- AI should analyze tasks and determine "this should run daily/hourly/etc."
- Use existing `subagent_create` + `subagent_schedule` + `loop_manage` tools
- AI manages its own state via `task_state` tool during loops
- Enhance `selectTier()` in brain.ts with configurable rules
- Create `nexus/config/tiers.json` for tier selection rules
- Simple -> flash/haiku, reasoning -> sonnet, architecture -> opus
- Agents can specify their own tier via SubagentConfig

### Claude's Discretion
- Exact system prompt wording for schedule creation guidance
- Tier selection rule specifics and thresholds
- Whether to log tier selection decisions

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGI-03 | AI can autonomously create and manage schedules and loops, analyzing tasks to determine recurrence needs | System prompt enhancement in agent.ts NATIVE_SYSTEM_PROMPT; existing tools `subagent_create`, `subagent_schedule`, `loop_manage`, `task_state` already functional |
| AGI-04 | AI selects appropriate model tier based on task complexity via enhanced selectTier() with configurable rules in nexus/config/tiers.json | Refactor `selectTier()` in brain.ts to read from JSON; create `nexus/config/tiers.json`; Brain constructor needs access to config path |
</phase_requirements>

## Standard Stack

No new dependencies required. All work is within the existing codebase.

### Core (Already Present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs/promises` | built-in | Read tiers.json at runtime | Zero-dependency JSON config loading |
| BullMQ | 5.67.2 | Cron scheduling (ScheduleManager) | Already used for schedule infrastructure |
| ioredis | (existing) | Loop state persistence | Already used throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON file for tiers | Redis config | JSON file is editable without Redis access, version-controllable in git |
| fs.readFileSync at startup | fs.watchFile for hot reload | Hot reload adds complexity; reading at each call is fast enough for a small JSON |

## Architecture Patterns

### Current Architecture (Relevant Files)

```
nexus/packages/core/src/
  brain.ts          # selectTier() — hardcoded arrays, needs refactoring
  agent.ts          # NATIVE_SYSTEM_PROMPT — needs schedule guidance section
  daemon.ts         # Tool registrations (subagent_create, subagent_schedule, loop_manage, task_state)
  schedule-manager.ts  # BullMQ cron scheduling (fully implemented)
  loop-runner.ts       # Interval-based loop execution (fully implemented)
  subagent-manager.ts  # SubagentConfig with tier field (fully implemented)
  prompts.ts           # COMPLEXITY_PROMPT, subagentPrompt (reference)
  config/
    schema.ts        # NexusConfigSchema, ModelTierSchema
    manager.ts       # ConfigManager (Redis-based config)
nexus/config/        # DOES NOT EXIST YET — must be created for tiers.json
```

### Pattern 1: System Prompt Enhancement for Schedule Autonomy (AGI-03)

**What:** Add a dedicated section to NATIVE_SYSTEM_PROMPT that teaches the AI when and how to create schedules/loops autonomously.

**When to use:** When the agent processes a task that has recurring characteristics (monitoring, reporting, checking, scraping at intervals).

**Key insight:** The tools already exist and work. The AI just needs guidance on WHEN to decide something should be scheduled vs. one-shot. The prompt should include:
1. Recognition patterns (keywords like "every day", "keep checking", "monitor", "regularly")
2. Decision framework (when to suggest a schedule vs. just do it once)
3. Tool selection (subagent_create with schedule for cron, with loop for continuous)
4. State management guidance (use task_state for multi-iteration context)

**Where to add:** After the existing "## Self-Improvement" section in NATIVE_SYSTEM_PROMPT (agent.ts line ~339), before "## Domain & Caddy Configuration".

**Example prompt section:**
```typescript
## Autonomous Scheduling

When you recognize a task that should recur, create a persistent agent with a schedule or loop:

### When to Create a Schedule
- User says "every day/week/hour", "regularly", "keep checking", "monitor"
- Task is clearly repetitive (daily reports, periodic checks, recurring scrapes)
- User asks for ongoing automation (e.g. "let me know if X changes")

### How to Create
1. Use **subagent_create** with a cron schedule for time-based recurrence:
   - Daily 9am: schedule="0 9 * * *", scheduled_task="..."
   - Every 6 hours: schedule="0 */6 * * *", scheduled_task="..."
   - Weekdays: schedule="0 9 * * MON-FRI", scheduled_task="..."
2. Use **subagent_create** with loop config for continuous monitoring:
   - loop_interval_ms=300000 (5 min), loop_task="...", loop_max_iterations=0 (unlimited)
3. Use **task_state** to persist data between iterations (e.g., last-seen values, accumulated results)
4. Use **subagent_schedule** to modify schedules on existing agents

### Schedule vs. One-Shot Decision
- If the task has a natural recurrence pattern -> create schedule
- If "just do it once" is implied or explicit -> run immediately, no schedule
- When unsure, ask the user: "Should I set this up to run automatically?"
- Always inform the user what schedule you created and how to manage it
```

### Pattern 2: Configurable Tier Selection (AGI-04)

**What:** Replace hardcoded intent-type arrays in `selectTier()` with a JSON config file that maps intent types to tiers.

**Current implementation (brain.ts lines 99-109):**
```typescript
selectTier(intentType: string): ModelTier {
  const noAi = ['docker_command', 'file_read', 'cron_set', 'status_check', 'direct_execute', 'shell_command', 'system_monitor', 'file_operation', 'service_management'];
  if (noAi.includes(intentType)) return 'none';
  const cheap = ['classify', 'summarize', 'parse_message', 'simple_answer', 'format'];
  if (cheap.includes(intentType)) return 'flash';
  const mid = ['research', 'analyze', 'code_review', 'write_content', 'debug'];
  if (mid.includes(intentType)) return 'sonnet';
  const strong = ['complex_plan', 'architecture', 'multi_step_reasoning'];
  if (strong.includes(intentType)) return 'opus';
  return 'flash';
}
```

**Proposed tiers.json structure:**
```json
{
  "$schema": "tiers.schema.json",
  "defaultTier": "flash",
  "rules": {
    "none": [
      "docker_command", "file_read", "cron_set", "status_check",
      "direct_execute", "shell_command", "system_monitor",
      "file_operation", "service_management"
    ],
    "flash": [
      "classify", "summarize", "parse_message", "simple_answer", "format"
    ],
    "sonnet": [
      "research", "analyze", "code_review", "write_content", "debug"
    ],
    "opus": [
      "complex_plan", "architecture", "multi_step_reasoning"
    ]
  }
}
```

**Loading approach:** Read the JSON file synchronously once at Brain construction, then cache. The file is tiny (< 1KB), and `readFileSync` at startup is appropriate. If file doesn't exist, fall back to hardcoded defaults for backward compatibility.

**File location:** `nexus/config/tiers.json` (create `nexus/config/` directory)

**Implementation in brain.ts:**
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface TierConfig {
  defaultTier: ModelTier;
  rules: Record<string, string[]>;
}

// In Brain class:
private tierConfig: TierConfig;

constructor(redis?: Redis) {
  this.manager = new ProviderManager(redis);
  this.tierConfig = this.loadTierConfig();
  // ... existing init
}

private loadTierConfig(): TierConfig {
  const defaults: TierConfig = {
    defaultTier: 'flash',
    rules: {
      none: ['docker_command', 'file_read', 'cron_set', 'status_check', 'direct_execute', 'shell_command', 'system_monitor', 'file_operation', 'service_management'],
      flash: ['classify', 'summarize', 'parse_message', 'simple_answer', 'format'],
      sonnet: ['research', 'analyze', 'code_review', 'write_content', 'debug'],
      opus: ['complex_plan', 'architecture', 'multi_step_reasoning'],
    },
  };

  try {
    // Resolve path relative to package root: nexus/config/tiers.json
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(__dirname, '..', '..', '..', 'config', 'tiers.json');
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { defaultTier: parsed.defaultTier || 'flash', rules: parsed.rules || defaults.rules };
    }
  } catch (err) {
    logger.warn('Brain: failed to load tiers.json, using defaults', { error: (err as Error).message });
  }
  return defaults;
}

selectTier(intentType: string): ModelTier {
  for (const [tier, intents] of Object.entries(this.tierConfig.rules)) {
    if (intents.includes(intentType)) return tier as ModelTier;
  }
  return this.tierConfig.defaultTier;
}
```

**Important path note:** brain.ts compiles to `nexus/packages/core/dist/brain.js`. The path `resolve(__dirname, '..', '..', '..', 'config', 'tiers.json')` from `dist/` goes: `dist/ -> src/ (../) -> core/ (../) -> packages/ (../) -> nexus/` which is wrong. The correct resolution from the compiled location `nexus/packages/core/dist/brain.js` is:
- `dist/` -> `packages/core/` (../) -> `packages/` (../) -> `nexus/` (../) -> `config/tiers.json`
- So: `resolve(__dirname, '..', '..', '..', 'config', 'tiers.json')`

From the source location `nexus/packages/core/src/brain.ts`:
- `src/` -> `packages/core/` (../) -> `packages/` (../) -> `nexus/` (../) -> `config/tiers.json`
- Same path: `resolve(__dirname, '..', '..', '..', 'config', 'tiers.json')`

Both source and compiled resolve identically. This is correct.

### Pattern 3: Subagent Tier from Config

**What:** SubagentConfig already has a `tier` field (`'flash' | 'sonnet' | 'opus'`), and `executeSubagentTask()` already passes `config.tier` to the AgentLoop (daemon.ts line 3218). When the AI creates a subagent via `subagent_create`, it already specifies a tier. No code change needed here -- the AI just needs prompt guidance to choose the right tier for each subagent.

**Current flow (already working):**
1. AI calls `subagent_create` with `tier: 'flash'` (or sonnet/opus)
2. daemon.ts stores this in SubagentConfig
3. `executeSubagentTask()` reads `config.tier` and passes it to AgentLoop
4. AgentLoop uses that tier for all LLM calls

### Anti-Patterns to Avoid

- **Hot-reloading tiers.json on every call:** The JSON is < 1KB. Reading it once at construction is sufficient. Don't add file watchers or Redis caching for this.
- **Adding tiers.json to NexusConfigSchema/Redis:** The user decision explicitly says "configurable in nexus/config/tiers.json". Keep it as a file, not Redis config. This lets users edit it with a text editor.
- **Overcomplicating the prompt:** The schedule guidance should be concise. The AI is already capable of using the tools; it just needs the decision framework.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom setInterval-based scheduler | ScheduleManager (BullMQ) | Already implemented, handles persistence, timezone, restart recovery |
| Loop execution | Custom loop manager | LoopRunner | Already implemented with state persistence, max iterations, graceful stop |
| Config validation for tiers.json | Complex Zod schema + validation pipeline | Simple JSON.parse + fallback defaults | tiers.json is too simple to need a schema; fallback to hardcoded defaults handles corruption |
| Tier selection logic | ML-based classifier | Regex/keyword matching via JSON config | The existing approach works well; complexity classification already happens via COMPLEXITY_PROMPT |

**Key insight:** Nearly everything for this phase already exists. The implementation is about wiring existing tools to the AI's decision-making via prompt engineering and externalizing one hardcoded data structure.

## Common Pitfalls

### Pitfall 1: Path Resolution for tiers.json in Compiled JS
**What goes wrong:** The path to tiers.json differs between development (tsx running src/) and production (compiled dist/).
**Why it happens:** `import.meta.url` resolves to the actual file location, which differs between src/ and dist/.
**How to avoid:** Use `__dirname` derived from `import.meta.url` with relative traversal. Both src/ and dist/ are at the same depth relative to `nexus/config/`. Verified: `resolve(__dirname, '..', '..', '..', 'config', 'tiers.json')` works from both locations.
**Warning signs:** "Cannot find tiers.json" errors in production but not development, or vice versa.

### Pitfall 2: System Prompt Growing Too Large
**What goes wrong:** NATIVE_SYSTEM_PROMPT is already ~170 lines. Adding schedule guidance + tier guidance could make it excessively large.
**Why it happens:** Each phase adds more instructions without trimming existing content.
**How to avoid:** Keep the new sections concise. Use bullet points, not paragraphs. The schedule section should be ~20-25 lines. Phase 28 (SPRT-01/02) will optimize the full prompt for conciseness.
**Warning signs:** Agent responses mentioning "context window" or becoming less coherent.

### Pitfall 3: AI Creating Redundant Schedules
**What goes wrong:** AI creates duplicate scheduled agents for the same task because it doesn't check existing schedules first.
**Why it happens:** The system prompt doesn't tell the AI to check existing schedules before creating new ones.
**How to avoid:** Include in the prompt guidance: "Before creating a new scheduled agent, use `subagent_schedule` list or `subagent_list` to check if a similar schedule already exists."
**Warning signs:** Multiple subagents with identical tasks appearing in `subagent_list`.

### Pitfall 4: tiers.json Not Found on Fresh Deploy
**What goes wrong:** If tiers.json doesn't exist (e.g., fresh clone without the config dir), selectTier() must still work.
**Why it happens:** The config file is part of the repo but might be missing in edge cases.
**How to avoid:** Always fall back to hardcoded defaults when the file is missing. The `existsSync` + try/catch pattern handles this gracefully.
**Warning signs:** "Using defaults" warning in logs (which is actually fine -- just informational).

### Pitfall 5: selectTier Called from router.ts Uses Different Logic than daemon.ts Complexity Assessment
**What goes wrong:** `selectTier()` in brain.ts is called from `router.ts` for the fallback path (non-agent intents), while daemon.ts uses its own `COMPLEXITY_PROMPT` + tier logic for agent tasks. These are two separate tier-selection mechanisms.
**Why it happens:** Historical separation of concerns -- router handles simple intents, daemon handles agent loop.
**How to avoid:** Understand that `selectTier()` enhancement only affects the router.ts fallback path. The main agent loop in daemon.ts (lines 1058-1065) determines tier based on complexity score (1-5) from a flash model call. These are complementary, not conflicting systems.
**Warning signs:** Confusion about "which tier selection applies where."

## Code Examples

### Example 1: Current selectTier() (to be refactored)
```typescript
// Source: nexus/packages/core/src/brain.ts lines 99-109
selectTier(intentType: string): ModelTier {
  const noAi = ['docker_command', 'file_read', ...];
  if (noAi.includes(intentType)) return 'none';
  const cheap = ['classify', 'summarize', ...];
  if (cheap.includes(intentType)) return 'flash';
  const mid = ['research', 'analyze', ...];
  if (mid.includes(intentType)) return 'sonnet';
  const strong = ['complex_plan', 'architecture', ...];
  if (strong.includes(intentType)) return 'opus';
  return 'flash';
}
```

### Example 2: Existing subagent_create Tool with Tier
```typescript
// Source: nexus/packages/core/src/daemon.ts lines 1910-1986
// The 'tier' parameter already exists and defaults to 'sonnet':
tier: tier || 'sonnet',
// SubagentConfig already stores tier:
tier: 'flash' | 'sonnet' | 'opus';
// executeSubagentTask already uses config.tier:
tier: config.tier as 'flash' | 'haiku' | 'sonnet' | 'opus',
```

### Example 3: Existing Schedule Creation Flow
```typescript
// Source: nexus/packages/core/src/daemon.ts lines 1963-1976
// After subagent_create, if schedule is provided:
if (config.schedule && config.scheduledTask) {
  await this.config.scheduleManager.addSchedule({
    subagentId: config.id,
    task: config.scheduledTask,
    cron: config.schedule,
    timezone: config.timezone,
  });
}
// If loop is configured:
if (config.loop) {
  await this.config.loopRunner.start(config);
}
```

### Example 4: Current Agent Tier Selection in Daemon (Complexity-Based)
```typescript
// Source: nexus/packages/core/src/daemon.ts lines 1058-1065
// This is separate from selectTier() -- used for agent loop routing
const configTier = agentDefaults?.tier ?? ((process.env.AGENT_TIER as any) || 'sonnet');
const baseTier = intent.source === 'voice'
  ? 'haiku'
  : (complexity >= 4 ? 'sonnet' : configTier);
const effectiveTier = userModelTier || baseTier;
```

### Example 5: Where to Insert Schedule Guidance in agent.ts
```typescript
// Source: nexus/packages/core/src/agent.ts
// NATIVE_SYSTEM_PROMPT currently has these sections (in order):
// 1. ## Tool Overview (~line 239)
// 2. ## Computer Use (~line 256)
// 3. ## Messaging Context (~line 293)
// 4. ## How You Work (~line 305)
// 5. ## Sub-agent Guidance (~line 312)
// 6. ## Rules (~line 318)
// 7. ## Browser Safety (~line 326)
// 8. ## Memory (~line 333)
// 9. ## Self-Improvement (~line 339)
// 10. ## Domain & Caddy Configuration (~line 363)
//
// New section should be inserted between ## Self-Improvement and ## Domain & Caddy
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded tier arrays in brain.ts | Config-driven tiers.json (this phase) | Phase 26 | Users can customize tier selection without code changes |
| No schedule autonomy guidance | System prompt with schedule decision framework | Phase 26 | AI can proactively create schedules for repetitive tasks |
| Only manual subagent creation | AI decides to create subagents autonomously | Phase 25+ | Progressive autonomy: skills (25), schedules (26), self-eval (27) |

## Open Questions

1. **Logging tier selection decisions**
   - What we know: The context says this is Claude's discretion. Adding a `logger.debug()` call is trivial.
   - What's unclear: Whether verbose logging is desired in production.
   - Recommendation: Add `logger.debug('selectTier', { intentType, selectedTier })` -- debug level means it's off by default but available when needed.

2. **Should `reloadTierConfig()` be exposed?**
   - What we know: Current approach loads once at construction. If the user edits tiers.json, they need to restart nexus-core.
   - What's unclear: Whether runtime reload is important.
   - Recommendation: Not needed for v21.0. A `nexus-core` restart is acceptable. Keep it simple.

3. **Haiku tier in tiers.json**
   - What we know: `SubagentConfig.tier` is typed as `'flash' | 'sonnet' | 'opus'` (no 'haiku'). But `ModelTier` includes 'haiku'. The tiers.json `rules` object could include a 'haiku' key.
   - What's unclear: Whether haiku should be a distinct tier in tiers.json.
   - Recommendation: Include haiku in the schema but don't add any default intent types to it. This matches the existing ModelTier type and allows users to use it if they want.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No test framework detected in nexus/packages/core |
| Config file | none |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGI-03 | AI creates schedules when task is repetitive | manual-only | Manual: send "check disk usage every morning" via chat | N/A |
| AGI-04 | selectTier reads from tiers.json | manual-only | Manual: edit tiers.json, restart, verify via debug logs | N/A |

### Sampling Rate
- **Per task commit:** Build check: `cd nexus && npm run build --workspace=packages/core`
- **Per wave merge:** Full build + manual functional test
- **Phase gate:** Build succeeds + manual verification of both AGI-03 and AGI-04

### Wave 0 Gaps
- No test framework in nexus/packages/core -- all validation is build + manual
- This is consistent with all previous phases in the project

## Sources

### Primary (HIGH confidence)
- `nexus/packages/core/src/brain.ts` - Full selectTier() implementation, lines 99-109
- `nexus/packages/core/src/agent.ts` - NATIVE_SYSTEM_PROMPT structure, lines 236-409
- `nexus/packages/core/src/daemon.ts` - Tool implementations (subagent_create lines 1910-1986, subagent_schedule lines 2040-2083, loop_manage lines 2117-2169), complexity-based tier selection lines 1011-1066, executeSubagentTask lines 3139-3251
- `nexus/packages/core/src/schedule-manager.ts` - Full ScheduleManager with BullMQ
- `nexus/packages/core/src/loop-runner.ts` - Full LoopRunner implementation
- `nexus/packages/core/src/subagent-manager.ts` - SubagentConfig interface with tier field
- `nexus/packages/core/src/config/schema.ts` - NexusConfigSchema, ModelTierSchema
- `nexus/packages/core/src/config/manager.ts` - ConfigManager (Redis-based)
- `nexus/packages/core/src/prompts.ts` - COMPLEXITY_PROMPT, subagentPrompt

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing code
- Architecture: HIGH - Clear integration points identified, exact line numbers documented
- Pitfalls: HIGH - Based on direct code reading, not speculation

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- internal codebase, no external API changes)
