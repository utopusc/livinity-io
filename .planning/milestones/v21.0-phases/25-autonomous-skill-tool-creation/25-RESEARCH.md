# Phase 25: Autonomous Skill & Tool Creation - Research

**Researched:** 2026-03-28
**Domain:** AI agent self-improvement via skill generation and MCP tool installation
**Confidence:** HIGH

## Summary

This phase enhances the Nexus AI agent to proactively create skills and install MCP tools when it detects capability gaps. The infrastructure for both capabilities already exists: `skill_generate` tool (generates TypeScript skill files from descriptions, compiles them, and hot-reloads them into the SkillLoader), and `mcp_registry_search` + `mcp_install` tools (search the official MCP registry and install servers that auto-connect via Redis pub/sub). The core work is making the AI **proactively use** these tools rather than waiting for explicit user commands, and ensuring newly created resources are **immediately usable** within the current agent session.

The critical technical finding is that `nativeTools` (the tool definitions sent to the LLM) are built once at `AgentLoop.run()` entry (line 484 of agent.ts) and never refreshed during the turn loop. This means that while `toolRegistry.execute()` on line 720 CAN execute newly registered tools, the LLM never sees them in its available tool list within the same session. For skills, the `SkillGenerator.generate()` already calls `skillLoader.loadAll()` which registers new custom tools. For MCP, the `McpConfigManager.saveAndPublish()` triggers `McpClientManager.reconcile()` via Redis pub/sub, which connects and registers tools. But the LLM cannot call them until a new session starts.

**Primary recommendation:** Add "autonomous capability gap" instructions to the NATIVE_SYSTEM_PROMPT so the AI proactively uses `skill_generate` and `mcp_registry_search`/`mcp_install` when it identifies missing capabilities. Accept the limitation that newly installed MCP tools and newly generated skill tools are available in the NEXT session, not the current one -- document this in the tool response messages so the AI can inform the user.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Enhance the `skill_generate` tool or the agent's system prompt so when the AI determines it needs a capability it doesn't have, it can create a new skill
- Skills write to `nexus/skills/` directory in YAML frontmatter + TypeScript handler format
- The AI should detect "no tool for this" situations and trigger skill generation
- System prompt should include guidance on when/how to create skills
- The AI can already search (`mcp_registry_search`) and install (`mcp_install`) MCP tools
- Enhance the system prompt to encourage the AI to proactively search for tools when it encounters a gap
- After installation, tool should be immediately usable in subsequent turns
- AI should be able to uninstall unnecessary tools

### Claude's Discretion
- Exact system prompt wording for autonomous behavior
- Whether to add a "capability gap detection" step in the agent loop
- How aggressively the AI should create skills vs asking the user

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGI-01 | AI can autonomously create new skills when it determines one is needed, writing to nexus/skills/ | System prompt enhancement in NATIVE_SYSTEM_PROMPT + existing `skill_generate` tool + `SkillLoader.startWatching()` for hot-reload + `SkillGenerator.generate()` for full pipeline |
| AGI-02 | AI can autonomously search and install MCP tools via mcp_registry_search + mcp_install | System prompt enhancement + existing `mcp_registry_search` and `mcp_install` tools + `McpClientManager.reconcile()` for auto-connection via Redis pub/sub |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.12.0 | MCP client for connecting to installed servers | Already in use, provides StdioClientTransport and StreamableHTTPClientTransport |
| TypeScript (tsx) | Runtime | Skills are .ts files compiled then loaded | SkillGenerator uses `npx tsc` to compile generated skills |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | Existing | Pub/sub for MCP config change notifications | McpConfigManager publishes config changes, McpClientManager subscribes |
| fs/promises (watch) | Node.js built-in | Skill file hot-reload via SkillLoader.startWatching() | Auto-detects new skill files dropped in nexus/skills/ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| System prompt modification only | Agent loop code change (capability gap detection step) | Prompt-only approach is simpler, less invasive, sufficient for v21.0 |
| Hot-reload for same-session tool availability | Rebuilding nativeTools mid-loop | Would require significant agent.ts refactoring, out of scope |

## Architecture Patterns

### Existing Architecture (No Structural Changes Needed)

```
nexus/packages/core/src/
  agent.ts              # System prompt (NATIVE_SYSTEM_PROMPT) -- PRIMARY EDIT TARGET
  daemon.ts             # Tool registration (skill_generate, mcp_* tools already registered)
  skill-generator.ts    # SkillGenerator: AI generates .ts file, compiles, hot-reloads
  skill-loader.ts       # SkillLoader: loads skills, watches directory, lazy-loads new ones
  mcp-registry-client.ts # McpRegistryClient: searches official MCP registry
  mcp-config-manager.ts  # McpConfigManager: CRUD for MCP server configs in Redis
  mcp-client-manager.ts  # McpClientManager: connects to MCP servers, registers tools
nexus/skills/           # Skill files (YAML frontmatter + TypeScript handler)
```

### Pattern 1: System Prompt Enhancement for Autonomous Behavior
**What:** Add a dedicated section to NATIVE_SYSTEM_PROMPT instructing the AI when and how to create skills and install MCP tools
**When to use:** When the AI encounters a task it cannot accomplish with existing tools
**Key design:**
```typescript
// In agent.ts, NATIVE_SYSTEM_PROMPT addition:
`
## Self-Improvement (Autonomous Capability Building)

You can expand your own capabilities when you encounter gaps:

### Creating New Skills
When you find yourself repeatedly needing a capability that no existing tool provides, or when the user asks for automation of a recurring task:
1. Use **skill_generate** to create a new skill file
2. Provide a clear description, name (kebab-case), trigger patterns, and required tools
3. The skill will be written to nexus/skills/ and compiled automatically
4. The skill becomes available for trigger-based activation in future conversations
5. After creating a skill, inform the user what was created and how to trigger it

### Installing MCP Tools
When you need external integrations or capabilities not covered by built-in tools:
1. Use **mcp_registry_search** to find relevant MCP servers
2. Review the search results for the best match
3. Use **mcp_install** to install the chosen server
4. The server connects automatically and its tools become available in subsequent conversations
5. Use **mcp_list** to verify installation and see available tools

### When to Self-Improve vs Ask
- Create a skill: when a multi-step workflow would benefit from being packaged as a reusable automation
- Install MCP tool: when you need an external integration (filesystem access patterns, database connections, API integrations)
- Ask the user: when the task is ambiguous, involves security-sensitive operations, or when you are unsure which approach is best
`
```

### Pattern 2: Skill File Generation Pipeline
**What:** The existing SkillGenerator handles the full pipeline: AI generates code -> write .ts file -> compile with tsc -> reload SkillLoader
**How it works:**
1. `skill_generate` tool in daemon.ts receives description from AI
2. `SkillGenerator.generate()` calls `brain.think()` with `SKILL_GEN_PROMPT` to produce TypeScript code
3. Code is validated (must have `handler` export and frontmatter)
4. File written to `nexus/skills/{name}.ts`
5. Compiled with `npx tsc -p nexus/skills/tsconfig.json`
6. `skillLoader.loadAll()` reloads all skills (registers any new custom tools)

**Source:** `nexus/packages/core/src/skill-generator.ts` lines 113-176

### Pattern 3: MCP Tool Installation Pipeline
**What:** The existing MCP installation pipeline: search registry -> install config -> auto-connect via pub/sub -> tools registered
**How it works:**
1. `mcp_registry_search` queries `registry.modelcontextprotocol.io/v0.1/servers`
2. `mcp_install` calls `McpConfigManager.installServer()` which saves to Redis and publishes change
3. `McpClientManager` receives pub/sub notification, calls `reconcile()`
4. `reconcile()` connects to new server, discovers tools via `client.listTools()`
5. Each MCP tool registered as `mcp_{serverName}_{toolName}` in ToolRegistry

**Source:** `nexus/packages/core/src/mcp-client-manager.ts` lines 124-158

### Anti-Patterns to Avoid
- **Rebuilding nativeTools mid-loop**: The agent.ts run() method builds tool definitions once. Attempting to refresh mid-session would require deep refactoring of the message history (provider messages include tool schemas). Not worth the complexity.
- **Auto-creating skills without user awareness**: The AI should always inform the user when it creates a skill or installs an MCP tool. Silent self-modification erodes trust.
- **Generating skills for one-off tasks**: Skills should only be created for reusable capabilities. One-off tasks should use existing tools directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill generation | Custom code generation pipeline | `SkillGenerator.generate()` | Already handles AI code gen, validation, compilation, and hot-reload |
| MCP tool discovery | Custom tool registry scraping | `McpRegistryClient.search()` | Already queries official MCP registry with caching |
| MCP server management | Custom process management | `McpClientManager` + `McpConfigManager` | Already handles stdio/HTTP transports, reconnection, tool registration |
| Skill hot-reload | Custom file watcher + dynamic import | `SkillLoader.startWatching()` + `loadAll()` | Already watches nexus/skills/ and reloads on file changes |
| Capability gap detection | Complex code-level detection in agent loop | System prompt instructions | The LLM is better at reasoning about when it lacks capabilities than rule-based code |

**Key insight:** All infrastructure exists. This phase is primarily about prompt engineering and minor enhancements to tool response messages, not about building new systems.

## Common Pitfalls

### Pitfall 1: Newly Created Tools Not Available in Current Session
**What goes wrong:** The AI creates a skill via `skill_generate` or installs an MCP server via `mcp_install`, then tries to use the new tools in the same conversation. The LLM never sees them because `nativeTools` was built at session start.
**Why it happens:** `AgentLoop.run()` builds tool definitions once (line 484 of agent.ts) and uses them for all turns. The ToolRegistry is live (execute works), but the LLM's view of available tools is frozen.
**How to avoid:** The tool response messages from `skill_generate` and `mcp_install` should explicitly state that new capabilities are available in the NEXT conversation. The system prompt should instruct the AI to relay this to the user.
**Warning signs:** AI repeatedly attempts to call tools that don't exist in its tool list.

### Pitfall 2: Skill Compilation Failures
**What goes wrong:** `SkillGenerator.generate()` produces TypeScript that fails to compile.
**Why it happens:** The AI-generated code may have import errors, type mismatches, or syntax issues. The generator only validates basic structure (handler export + frontmatter present).
**How to avoid:** The existing code already handles this gracefully -- compilation warnings are logged but don't fail the operation (skill-generator.ts line 162). The SkillLoader will skip files that fail dynamic import.
**Warning signs:** Skill file written but not appearing in `skillLoader.listSkills()`.

### Pitfall 3: MCP Server Connection Failures
**What goes wrong:** MCP server installed but fails to connect (timeout, command not found, missing env vars).
**Why it happens:** Registry entries may require environment variables (API keys) that the user hasn't configured.
**How to avoid:** The system prompt should instruct the AI to check MCP server requirements (environment variables) in the registry search results before installing, and to inform the user if configuration is needed.
**Warning signs:** `mcp_list` shows server as STOPPED with an error.

### Pitfall 4: Overzealous Skill Creation
**What goes wrong:** AI creates too many skills for tasks that don't need them, cluttering the skills directory.
**Why it happens:** Without guidance, the AI may interpret any multi-step task as needing a new skill.
**How to avoid:** System prompt should specify criteria: only create skills for genuinely reusable workflows, not one-off tasks. Include "ask yourself: will this be useful more than once?" guidance.
**Warning signs:** Many generated-*.ts files in nexus/skills/ that are never triggered.

### Pitfall 5: System Prompt Token Budget
**What goes wrong:** Adding too much autonomous behavior text to NATIVE_SYSTEM_PROMPT bloats the context window.
**Why it happens:** NATIVE_SYSTEM_PROMPT is already substantial (~385 lines including Caddy docs, messaging context, computer use instructions).
**How to avoid:** Keep the self-improvement section concise (under 30 lines). Focus on decision criteria and workflow, not exhaustive instructions.
**Warning signs:** Increased token usage per turn, reduced context for conversation history.

## Code Examples

### Current NATIVE_SYSTEM_PROMPT Structure (agent.ts line 236)
```typescript
// Source: nexus/packages/core/src/agent.ts
const NATIVE_SYSTEM_PROMPT = (canSpawnSubagent: boolean) => `You are Nexus, an autonomous AI assistant...

## Tool Overview
// Lines 241-254: Lists tool categories including MCP tools

## Computer Use (Device Desktop Control)
// Lines 256-291: Device interaction instructions

## Messaging Context
// Lines 293-303: Channel routing

## How You Work
// Lines 305-316: Tool calling instructions

## Rules
// Lines 318-324: Basic rules

## Browser Safety (CRITICAL)
// Lines 326-330: Browser safety

## Memory
// Lines 332-337: Memory usage

## Domain & Caddy Configuration
// Lines 339-385: Caddy configuration details
`;
```

### skill_generate Tool Registration (daemon.ts line 2085)
```typescript
// Source: nexus/packages/core/src/daemon.ts
toolRegistry.register({
  name: 'skill_generate',
  description: 'Generate a new AI skill file from a description...',
  parameters: [
    { name: 'description', type: 'string', description: 'What the skill should do', required: true },
    { name: 'name', type: 'string', description: 'Skill name (kebab-case)', required: false },
    { name: 'triggers', type: 'string', description: 'Comma-separated trigger patterns', required: false },
    { name: 'tools', type: 'string', description: 'Comma-separated tool names the skill needs', required: false },
  ],
  execute: async (params) => {
    // Calls this.config.skillGenerator.generate({...})
    // Returns: "Skill generated: {filePath}" on success
  },
});
```

### SkillGenerator.generate() Pipeline (skill-generator.ts)
```typescript
// Source: nexus/packages/core/src/skill-generator.ts
async generate(options: GenerateSkillOptions): Promise<{ success: boolean; filePath?: string; error?: string }> {
  // 1. AI generates TypeScript code via brain.think()
  const code = await this.brain.think({ prompt, systemPrompt: SKILL_GEN_PROMPT, tier: 'sonnet', maxTokens: 4096 });
  // 2. Clean markdown fences
  const cleaned = code.replace(/^```(?:typescript|ts)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  // 3. Validate structure (handler export + frontmatter)
  if (!cleaned.includes('export async function handler')) { return { success: false, error: '...' }; }
  // 4. Write to nexus/skills/{name}.ts
  await writeFile(filePath, cleaned, 'utf-8');
  // 5. Compile with npx tsc
  await execAsync(`npx tsc -p ${tsconfigPath}`, { cwd: dirname(this.skillsDir), timeout: 30_000 });
  // 6. Hot-reload all skills
  await this.skillLoader.loadAll();
  return { success: true, filePath };
}
```

### MCP Install Flow (daemon.ts + mcp-config-manager.ts + mcp-client-manager.ts)
```typescript
// Source: nexus/packages/core/src/daemon.ts (mcp_install tool)
// 1. Parse params from AI
const name = params.name as string;
const transport = params.transport as 'stdio' | 'streamableHttp';
// 2. Save config to Redis
await configMgr.installServer({ name, transport, command, args, env, enabled: true, ... });
// 3. McpConfigManager.saveAndPublish() -> publishes 'mcp_config' to Redis
// 4. McpClientManager receives pub/sub -> reconcile() -> connectServer()
// 5. connectServer() discovers tools -> registers mcp_{name}_{tool} in ToolRegistry
```

### SkillLoader Hot-Reload (skill-loader.ts)
```typescript
// Source: nexus/packages/core/src/skill-loader.ts
async startWatching(): Promise<void> {
  const watcher = watch(this.skillsDir, { signal: ac.signal });
  for await (const event of watcher) {
    if (event.filename?.endsWith('.ts') || event.filename?.endsWith('.js')) {
      logger.info(`SkillLoader: detected change in ${event.filename}, reloading...`);
      await this.loadSkill(join(this.skillsDir, event.filename));
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual skill creation only | `skill_generate` tool exists but is passive | Already implemented | AI CAN create skills when asked, but doesn't proactively do so |
| Manual MCP server installation | `mcp_install` tool exists but is passive | Already implemented | AI CAN install MCP servers when asked, but doesn't proactively search |
| No self-improvement guidance | System prompt mentions MCP tools in tool overview | Current | AI knows the tools exist but lacks decision framework for when to use them |

## Open Questions

1. **Should the AI confirm before creating a skill?**
   - What we know: The CONTEXT.md says "Claude's Discretion" on how aggressively to create skills vs asking the user
   - What's unclear: Whether silent skill creation is acceptable or if the AI should always ask first
   - Recommendation: Default to informing the user BEFORE creating (not blocking, just a progress message like "I notice I need a capability for X, creating a skill..."). This balances autonomy with transparency. The system prompt should instruct this.

2. **Same-session tool availability for MCP tools**
   - What we know: The CONTEXT.md says "After installation, tool should be immediately usable in subsequent turns." However, `nativeTools` is built once at session start.
   - What's unclear: Whether "subsequent turns" means within the same session or next session
   - Recommendation: Accept the limitation. The tool response from `mcp_install` should say "Server installed and connecting. New tools will be available in your next conversation." This is an honest, practical approach. Attempting to rebuild nativeTools mid-session would require significant refactoring.

3. **Skill quality validation beyond compilation**
   - What we know: SkillGenerator validates basic structure (handler export + frontmatter present) and compiles
   - What's unclear: Whether generated skills should be tested before being marked as available
   - Recommendation: Out of scope for v21.0. Compilation + structural validation is sufficient. Users can delete bad skills manually.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js assert (lightweight, no framework dependency) |
| Config file | None -- tests run directly via `npx tsx` |
| Quick run command | `npx tsx nexus/packages/core/src/agent-session.test.ts` |
| Full suite command | Same (only one test file exists) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGI-01 | AI proactively creates skills when capability gap detected | manual-only | N/A -- requires LLM interaction | N/A |
| AGI-01 | System prompt includes self-improvement instructions | unit | `npx tsx tests/test-system-prompt.ts` | No -- Wave 0 |
| AGI-02 | AI proactively searches and installs MCP tools | manual-only | N/A -- requires LLM + registry interaction | N/A |
| AGI-02 | System prompt includes MCP self-improvement instructions | unit | `npx tsx tests/test-system-prompt.ts` | No -- Wave 0 |

**Justification for manual-only tests:** AGI-01 and AGI-02 are fundamentally about LLM behavior (whether the AI decides to create a skill or search for MCP tools). This cannot be unit-tested -- it requires running the full agent loop with a real LLM. The verifiable code changes (system prompt content) can be tested with string assertions.

### Sampling Rate
- **Per task commit:** `npx tsx nexus/packages/core/src/agent-session.test.ts`
- **Per wave merge:** Same + manual smoke test (send a message to the AI requesting something that requires a new capability)
- **Phase gate:** Build succeeds (`npm run build --workspace=packages/core`) + manual verification

### Wave 0 Gaps
- [ ] System prompt content verification test -- verify NATIVE_SYSTEM_PROMPT includes self-improvement section
- [ ] Build verification -- `npm run build --workspace=packages/core` succeeds after changes

## Sources

### Primary (HIGH confidence)
- **nexus/packages/core/src/agent.ts** -- NATIVE_SYSTEM_PROMPT (line 236), AgentLoop.run() (line 461), nativeTools built once (line 484)
- **nexus/packages/core/src/skill-generator.ts** -- SkillGenerator.generate() full pipeline
- **nexus/packages/core/src/skill-loader.ts** -- SkillLoader: loadAll(), loadSkill(), startWatching(), loadSkillLazy()
- **nexus/packages/core/src/daemon.ts** -- skill_generate (line 2085), mcp_registry_search (line 2173), mcp_install (line 2216), mcp_manage (line 2308)
- **nexus/packages/core/src/mcp-registry-client.ts** -- McpRegistryClient.search(), getServer()
- **nexus/packages/core/src/mcp-client-manager.ts** -- McpClientManager.reconcile(), connectServer(), pub/sub subscription
- **nexus/packages/core/src/mcp-config-manager.ts** -- McpConfigManager.installServer(), saveAndPublish()

### Secondary (MEDIUM confidence)
- **nexus/skills/skill-create.ts** -- Existing skill that demonstrates the skill generation pattern
- **nexus/skills/** directory -- 10+ existing skills showing the YAML frontmatter + handler pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code read directly from source, no external libraries needed
- Architecture: HIGH -- existing patterns fully documented from source code analysis
- Pitfalls: HIGH -- identified through source code analysis of tool lifecycle and agent loop

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable internal codebase, no external dependency changes expected)
