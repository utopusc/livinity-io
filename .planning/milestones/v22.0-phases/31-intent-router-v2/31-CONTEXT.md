# Phase 31: Intent Router v2 - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase creates a new intent router that classifies user messages and selects relevant capabilities from the Phase 29 registry using semantic matching with confidence scoring. It replaces the static tool-loading approach with dynamic, intent-based capability selection with context budget management and Redis caching.

</domain>

<decisions>
## Implementation Decisions

### Matching Strategy
- Keyword + trigger matching from manifests — match user message tokens against `semantic_tags` and `triggers` fields from CapabilityRegistry, score by overlap. No embedding API needed.
- TF-IDF-like weighted overlap scoring — exact trigger match = 1.0, semantic_tag match = 0.5, partial word match = 0.3. Sum and normalize to 0-1 range.
- LLM flash-tier fallback — if no capability scores above threshold, use existing Brain.think() with flash tier for classification
- New `intent-router.ts` in nexus/packages/core/src/ — separate from existing router.ts which handles action dispatch

### Thresholds & Budgets
- Confidence threshold: 0.3 minimum — configurable via Redis `nexus:config:intent_threshold`
- Context budget: 30% of model's context window — sum `context_cost` from matched capabilities
- Max capabilities per session: 15 hard cap — even if budget allows more
- Core tools always loaded: shell, files, sysinfo, docker present regardless of intent match

### Caching & Integration
- Cache key: normalized message hash — lowercase, strip punctuation, sort words, MD5 → `nexus:intent:{hash}`
- Cache TTL: 1 hour — balances freshness with speed
- Integration point: called before agent loop in agent-session.ts, replaces static `listFiltered()` tool loading
- Return format: Array of CapabilityManifest sorted by score, with `_score` field appended

### Claude's Discretion
- Internal tokenization strategy for matching
- Edge case handling for very short or very long messages
- Logging verbosity for intent classification
- Exact normalization rules for cache keys

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `router.ts` (nexus/packages/core/src/): Existing Router with `classify()` method using rule-based + LLM classification
- `brain.ts`: Brain.think() for LLM calls with tier selection (flash/sonnet/opus)
- `capability-registry.ts`: CapabilityRegistry with `list()`, `search()`, `get()` and in-memory cache of all capabilities
- `tool-registry.ts`: ToolRegistry with `listFiltered(policy)` and `toToolDefinitions()` for building tool lists
- Redis client available throughout Nexus via dependency injection

### Established Patterns
- Dependency injection for all services (Brain, ToolRegistry, CapabilityRegistry, Redis)
- Redis config keys: `nexus:config:*` for configurable values
- Logger: `logger.info/warn/error` from `./logger.js`
- Flash tier for cheap AI operations: `tier: 'flash'`

### Integration Points
- `agent-session.ts`: Where agent loops are created — currently uses `ToolRegistry.listFiltered()` to build tool sets
- `ToolRegistry.toToolDefinitions()`: Converts tools to Claude/Kimi API format
- `CapabilityRegistry.list()` and `search()`: Return CapabilityManifest arrays from in-memory cache
- `index.ts`: Nexus startup — new IntentRouter needs to be instantiated and passed to agent sessions

</code_context>

<specifics>
## Specific Ideas

- The `resolveCapabilities(message: string)` method is the main entry point
- It returns `{capabilities: CapabilityManifest[], fromCache: boolean, score: number}`
- Agent session uses the result to build a filtered tool set instead of loading all 67+ tools
- Token counting: approximate by counting words × 1.3 (average tokens per word)
- Core tools list: ['shell', 'files_read', 'files_write', 'files_list', 'sysinfo', 'docker']

</specifics>

<deferred>
## Deferred Ideas

- Embedding-based matching — start with keyword/trigger, upgrade later if needed
- Per-user intent profiles — all users get same matching for now
- Intent clustering / pattern mining — deferred to Phase 36 (Learning Loop)

</deferred>
