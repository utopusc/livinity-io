# Phase 32: Auto-Provisioning Engine - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase extends the Phase 31 IntentRouter with mid-conversation capability discovery, dynamic system prompt composition, and dependency resolution. Agent sessions now dynamically load only relevant capabilities, can hot-add missing ones mid-conversation, and compose system prompts based on loaded capabilities.

</domain>

<decisions>
## Implementation Decisions

### Mid-Conversation Discovery
- New tool `discover_capability` — AI calls it when it needs a capability not currently loaded, searches the registry, and hot-adds to the session
- Hot-add to session — register new tools in the scoped ToolRegistry without restarting the agent loop
- Install scope: registry only — if capability is in CapabilityRegistry, load it; if not, suggest marketplace install via response message

### Dynamic System Prompt
- Template sections — base prompt + capability-specific instruction blocks appended per loaded capability
- Capability instructions from `CapabilityManifest.metadata.instructions` field — optional string in manifest metadata
- System prompt budget: 20% of context for system prompt, 30% for tools, 50% for conversation

### Dependency Resolution
- Simple topological sort on `requires` array — resolve deps before loading the capability
- Circular dependency: detect and break with warning — log warning, load both anyway
- Resolution runs in IntentRouter.resolveCapabilities() — after scoring, before returning results

### Claude's Discretion
- Exact discover_capability tool parameter schema
- System prompt template structure and section ordering
- Error messages for missing/unavailable capabilities
- Logging strategy for provisioning decisions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `intent-router.ts` (Phase 31): IntentRouter with resolveCapabilities(), scoring, caching, budget management
- `agent-session.ts`: AgentSessionManager with intent-based tool selection (lines 212-242)
- `capability-registry.ts` (Phase 29): CapabilityRegistry with list/search/get and CapabilityManifest
- `tool-registry.ts`: ToolRegistry with register(), get(), toToolDefinitions()
- `daemon.ts`: Contains NATIVE_SYSTEM_PROMPT and tool registration
- `brain.ts`: Brain with system prompt support in think() calls

### Established Patterns
- Tool registration: `toolRegistry.register({name, description, parameters, execute})`
- System prompt: NATIVE_SYSTEM_PROMPT string in daemon.ts, passed to Brain/AgentSession
- IntentRouter returns `{capabilities: CapabilityManifest[], fromCache, totalScore}`
- Agent session creates scoped ToolRegistry with only matched capabilities

### Integration Points
- `agent-session.ts`: Where scoped ToolRegistry is built from IntentRouter results — needs discover_capability tool added here
- `intent-router.ts`: resolveCapabilities() needs dependency expansion
- System prompt composition: needs new function that builds prompt from base + loaded capabilities
- `daemon.ts` NATIVE_SYSTEM_PROMPT: currently static, needs to become dynamic per session

</code_context>

<specifics>
## Specific Ideas

- discover_capability tool schema: `{query: string}` → searches registry, returns matches, auto-installs top match
- System prompt composition function: `composeSystemPrompt(basePrompt: string, capabilities: CapabilityManifest[]): string`
- Dependency expansion: before returning capabilities, check `requires` field, add missing deps recursively
- Hot-add mechanism: agent-session exposes `addCapability(manifest)` that registers tools mid-loop

</specifics>

<deferred>
## Deferred Ideas

- Marketplace auto-install (mid-conversation install from external marketplace) — Phase 33/34
- Capability versioning/rollback — future
- Per-user capability preferences — future
- A/B testing different capability sets — Phase 36

</deferred>
