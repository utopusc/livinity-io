# Phase 33: Livinity Marketplace MCP - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase creates the Livinity Marketplace as a set of tools registered in Nexus's ToolRegistry (livinity_search, livinity_install, livinity_uninstall, livinity_recommend, livinity_list) backed by a GitHub-based capability registry. Capabilities can be searched, installed with one tool call, validated, conflict-checked, and immediately available in the CapabilityRegistry.

</domain>

<decisions>
## Implementation Decisions

### MCP Server Architecture
- Internal tools in Nexus ToolRegistry with `livinity_` prefix — no separate MCP process needed
- Tool names: livinity_search, livinity_install, livinity_uninstall, livinity_recommend, livinity_list
- Registered during Nexus init alongside other services

### Registry Backend
- Extend existing `utopusc/livinity-skills` GitHub repo — add `marketplace/` directory with category subdirs
- YAML `manifest.yml` per capability — extends existing SKILL.md format with CapabilityManifest fields
- Install: download from GitHub raw + register in CapabilityRegistry — same pattern as SkillRegistryClient
- Conflict detection: check `conflicts` array in manifest against installed capabilities

### Install & Validation
- Schema validation: check required fields (name, type, description, version), reject invalid manifests
- Post-install: register in CapabilityRegistry + sync to Redis — immediately available
- Recommend: tag overlap with recent intents from IntentRouter cache

### Claude's Discretion
- Exact YAML manifest schema fields
- GitHub API caching strategy
- Error message formatting for install failures
- Recommendation scoring algorithm details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skill-registry-client.ts`: SkillRegistryClient with addRegistry(), fetchCatalog(), searchCatalog(), downloadSkill() — same pattern for marketplace
- `capability-registry.ts`: CapabilityRegistry with registerCapability() for post-install registration
- `tool-registry.ts`: ToolRegistry.register() for adding marketplace tools
- `mcp-client-manager.ts`: McpClientManager for MCP install pattern reference
- Existing REST routes for skills: GET /api/skills/marketplace, POST /api/skills/install

### Established Patterns
- GitHub API: unauthenticated Contents API + raw.githubusercontent.com for downloads
- File caching: `registry-{hash}.json` with TTL (SkillRegistryClient pattern)
- Tool registration: `{name, description, parameters, execute}` objects
- Dependency injection: services passed via constructor deps

### Integration Points
- `index.ts`: Nexus startup — new MarketplaceMcp registered here
- `capability-registry.ts`: registerCapability() called after install
- `intent-router.ts`: Recent intent cache used for recommendations
- `api.ts`: May need REST endpoints for marketplace if UI wants direct access

</code_context>

<specifics>
## Specific Ideas

- New `marketplace-mcp.ts` module in nexus/packages/core/src/
- MarketplaceMcp class with constructor(deps: {capabilityRegistry, skillRegistryClient, redis, toolRegistry})
- registerTools() method that registers all 5 livinity_* tools in ToolRegistry
- GitHub marketplace index: `marketplace/index.json` listing all available capabilities
- Install flow: validate manifest → check conflicts → download files → register in CapabilityRegistry → sync to Redis

</specifics>

<deferred>
## Deferred Ideas

- Marketplace analytics (install counts, ratings) — future
- Paid capabilities — future
- Private marketplace for teams — future
- Capability versioning with rollback — future

</deferred>
