# Phase 29: Unified Capability Registry - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase creates a unified capability registry that aggregates all capability types (tools, skills, MCPs, hooks, agents) into a single queryable data model with rich metadata and semantic search. The registry is backend-only — no UI changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Registry Architecture
- Storage backend: Redis hash — consistent with SubagentManager and MCP status patterns, persists across restarts
- New `capability-registry.ts` module in nexus/packages/core/src/ — clean separation from ToolRegistry (which stays for execution)
- Sync strategy: Startup sync + event-driven via Redis pub/sub (`nexus:config:updated`) for MCP changes
- Redis key namespace: `nexus:cap:{type}:{name}` — typed prefix, consistent with `nexus:subagent:*` pattern

### Manifest Schema
- TypeScript interface + JSON in Redis — matches existing patterns (SubagentConfig stored as JSON)
- Semantic tags: Free-form strings — start simple, controlled taxonomy later when data warrants it
- Context cost: Approximate token count — count tool description + param schema tokens, store as number
- Dependency format: Simple name array — `requires: ["chrome-mcp"]`, resolve at load time

### API & Integration
- REST endpoints on Nexus + tRPC proxy in daemon — matches skills/MCP endpoint pattern
- Search: In-memory filter on cached data — registry will have <200 entries, Redis SCAN is overkill
- Existing panels keep their APIs for now — unified registry is additive, panel migration deferred to Phase 30
- Hook representation: Placeholder type in schema — hooks defined as capability type but no sync source yet (created in Phase 34)

### Claude's Discretion
- Internal data structure optimizations
- Redis TTL and caching strategy details
- Error handling patterns for sync failures

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ToolRegistry` (nexus/packages/core/src/tool-registry.ts): In-memory Map<string, Tool>, register/get/list/listFiltered/toJsonSchemas methods, ToolPolicy profiles (minimal/basic/coding/messaging/full)
- `SkillRegistryClient` (nexus/packages/core/src/skill-registry-client.ts): GitHub-based registry, file cache with TTL, searchCatalog(), CatalogEntry schema
- `McpClientManager` (nexus/packages/core/src/mcp-client-manager.ts): Redis config + in-memory Map<string, ManagedServer>, tools registered as `mcp__{server}__{tool}`, status in `nexus:mcp:status:{name}`
- `SubagentManager` (nexus/packages/core/src/subagent-manager.ts): Redis hash `nexus:subagent:{id}`, SubagentConfig with tools/schedule/loop/tier
- Redis pub/sub pattern: `nexus:config:updated` channel for config change notifications

### Established Patterns
- All persistent state in Redis (SubagentManager, MCP configs, conversations)
- REST API endpoints in Nexus + tRPC proxy in livinityd
- Tool naming: `mcp__{serverName}__{toolName}` for MCP-provided tools
- JSON serialization for Redis storage (SubagentConfig pattern)
- Lua scripts for atomic operations (SubagentManager.recordRun)

### Integration Points
- ToolRegistry.register() — called by McpClientManager for MCP tools, by daemon for proxy tools
- SkillRegistryClient — separate from ToolRegistry, has own search/install flow
- SubagentManager.list() — returns summary with id, name, status, description, tier
- Nexus REST routes in nexus/packages/core/src/routes/ directory
- livinityd tRPC routes in livos/packages/livinityd/source/modules/ai/routes.ts

</code_context>

<specifics>
## Specific Ideas

- Manifest format from NEXT-MILESTONE-PROMPT.md:
  ```yaml
  id: web-scraping-chrome
  type: mcp
  name: "Chrome Browser Control"
  description: "Navigate pages, click elements, fill forms, take screenshots"
  semantic_tags: ["web", "browser", "automation", "scraping", "testing"]
  triggers: ["browse", "open website", "screenshot", "click", "fill form"]
  provides_tools: ["navigate_page", "take_screenshot", "click", "fill_form"]
  requires: []
  conflicts: []
  context_cost: 450
  tier: basic
  source: marketplace | builtin | custom
  ```
- 5 capability types: tool, skill, mcp, hook, agent
- Registry should count ~67 tools + 8 skills + 19 MCPs + 0 hooks + N agents

</specifics>

<deferred>
## Deferred Ideas

- Controlled tag taxonomy — start with free-form, formalize when patterns emerge
- Full dependency graph with conflict resolution — simple name array for now
- Hook sync source — hooks don't exist yet, placeholder type only
- Panel migration to registry API — deferred to Phase 30

</deferred>
