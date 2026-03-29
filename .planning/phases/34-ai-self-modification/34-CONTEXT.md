# Phase 34: AI Self-Modification - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase enables the AI to autonomously create new skills, hooks, and agent templates. Two new tools (create_hook, create_agent_template) and enhanced system prompt guidance for the create→test→fix loop. All created capabilities auto-register in CapabilityRegistry.

</domain>

<decisions>
## Implementation Decisions

### Skill Creation Enhancement
- Enhanced system prompt guidance — extend Self-Improvement section with registry integration instructions
- AI uses existing `skill_generate` + new `livinity_install` for marketplace publishing, plus registerCapability() for immediate availability
- Same-session: register in CapabilityRegistry after creation so discover_capability finds it
- Self-testing: system prompt instructs 3-attempt create→test→fix loop — AI manages the loop

### Hook Creation
- New `create_hook` tool — writes hook config to Redis, registers in CapabilityRegistry as type 'hook'
- Hook storage: Redis `nexus:hooks:{name}` — JSON config with event, command, enabled fields
- 3 event types: pre-task, post-task, scheduled — simple event system, no file watchers
- Hook execution: simple command runner triggered by event dispatcher in agent-session

### Agent Template Creation
- New `create_agent_template` tool — wraps SubagentManager.create() with better defaults
- Registers in CapabilityRegistry as type 'agent' after creation
- Appears in Agents tab via existing listSubagents() flow

### Testing & Registration
- Dry-run execution: AI calls created capability once with test params
- Auto-register in CapabilityRegistry after all create_* tools
- Failure handling: return detailed error after 3 attempts for user to debug

### Claude's Discretion
- Exact create_hook parameter schema
- Hook event dispatcher implementation details
- Agent template default values
- System prompt section wording

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `daemon.ts`: NATIVE_SYSTEM_PROMPT with Self-Improvement section (from v21.0 Phase 25)
- `skill_generate` tool: existing tool for creating skill files
- `SubagentManager`: create(), list(), update() for agent management
- `CapabilityRegistry`: registerCapability() (added in Phase 33)
- `marketplace-mcp.ts`: livinity_install pattern for capability registration

### Established Patterns
- Tool registration in ToolRegistry
- Redis storage for config: `nexus:config:*` and `nexus:hooks:*`
- System prompt sections: labeled blocks with clear boundaries
- SubagentConfig: id, name, description, tools, systemPrompt, schedule, loop, tier

### Integration Points
- `agent-session.ts`: Where new tools get registered in scoped registry
- `daemon.ts`: NATIVE_SYSTEM_PROMPT needs updated Self-Improvement section
- `capability-registry.ts`: registerCapability() called after each creation
- `index.ts`: Hook event dispatcher needs to be wired into agent lifecycle

</code_context>

<specifics>
## Specific Ideas

- create_hook params: {name: string, event: 'pre-task'|'post-task'|'scheduled', command: string, schedule?: string}
- create_agent_template params: {name: string, description: string, systemPrompt: string, tools?: string[], tier?: string, schedule?: string}
- Hook execution dispatcher: simple function called at pre/post points in agent-session processMessage()
- System prompt update: "When you create a skill/hook/agent, always test it immediately. If the test fails, fix and retry up to 3 times."

</specifics>

<deferred>
## Deferred Ideas

- File change watcher hooks — complex, not needed for v22.0
- Visual hook builder UI — Phase 35 or future
- Hook chaining (output of one → input of next) — future
- Agent collaboration patterns — future

</deferred>
