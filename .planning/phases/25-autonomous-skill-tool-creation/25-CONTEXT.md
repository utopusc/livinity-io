# Phase 25: Autonomous Skill & Tool Creation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase enhances the AI's ability to autonomously create skills and install MCP tools when it identifies capability gaps. The `skill_generate` tool and `mcp_registry_search` + `mcp_install` tools already exist — this phase makes their usage more intelligent and proactive via system prompt enhancements and agent loop improvements.

</domain>

<decisions>
## Implementation Decisions

### Autonomous Skill Creation (AGI-01)
- Enhance the `skill_generate` tool or the agent's system prompt so when the AI determines it needs a capability it doesn't have, it can create a new skill
- Skills write to `nexus/skills/` directory in YAML frontmatter + TypeScript handler format
- The AI should detect "no tool for this" situations and trigger skill generation
- System prompt should include guidance on when/how to create skills

### Autonomous MCP Tool Installation (AGI-02)
- The AI can already search (`mcp_registry_search`) and install (`mcp_install`) MCP tools
- Enhance the system prompt to encourage the AI to proactively search for tools when it encounters a gap
- After installation, tool should be immediately usable in subsequent turns
- AI should be able to uninstall unnecessary tools

### Claude's Discretion
- Exact system prompt wording for autonomous behavior
- Whether to add a "capability gap detection" step in the agent loop
- How aggressively the AI should create skills vs asking the user

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skill_generate` tool — creates skills from description
- `skill_install` tool — installs skills from marketplace
- `mcp_registry_search` tool — searches MCP registry
- `mcp_install` tool — installs MCP servers
- `mcp_list` tool — lists installed MCP tools
- `mcp_manage` tool — manages MCP configurations
- Agent system prompt in `agent.ts`

### Established Patterns
- Tools registered in daemon.ts
- Skills loaded by SkillLoader from nexus/skills/
- MCP tools managed by mcp-manager

### Integration Points
- `agent.ts` — system prompt, agent loop
- `daemon.ts` — tool registration
- `skill-loader.ts` — skill loading and discovery

</code_context>

<specifics>
## Specific Ideas

- The AI should be able to say "I don't have a tool for X, let me create one" and then do it
- New skills should be immediately available without restart
- MCP tool search should happen naturally when the AI needs external capabilities

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 25-autonomous-skill-tool-creation*
*Context gathered: 2026-03-28 via smart discuss*
