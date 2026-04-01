---
gsd_state_version: 1.0
milestone: v23.0
milestone_name: Mobile PWA
status: planning
stopped_at: Defining requirements
last_updated: "2026-04-01T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v23.0 -- Mobile PWA
**Current focus:** Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-01 — Milestone v23.0 started

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v22.0)
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 29 P01 | 2min | 1 tasks | 1 files |
| Phase 29 P02 | 3min | 2 tasks | 3 files |
| Phase 30 P01 | 5min | 2 tasks | 2 files |
| Phase 31 P01 | 5min | 2 tasks | 4 files |
| Phase 32 P01 | 3min | 2 tasks | 3 files |
| Phase 33 P01 | 4min | 2 tasks | 5 files |
| Phase 34 P01 | 5min | 2 tasks | 4 files |
| Phase 35 P01 | 5min | 2 tasks | 2 files |
| Phase 35 P02 | 14min | 2 tasks | 2 files |
| Phase 36 P01 | 5min | 2 tasks | 5 files |
| Phase 36 P02 | 4min | 2 tasks | 3 files |
| Phase 36 P03 | 3min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- v22.0 continues phase numbering from v21.0 (Phase 29 is first phase)
- CRITICAL: Auth system (OAuth, JWT, API key, login flows) must NOT be modified
- CRITICAL: Existing streaming, block model, typewriter animation must NOT be broken
- CRITICAL: nexus-core runs compiled JS — MUST run `npm run build --workspace=packages/core` after source changes
- UIP requirements split across Phase 30 (dashboard/cards) and Phase 35 (auto-install/editor/analytics) to respect dependency ordering
- Learning Loop (Phase 36) positioned after Router (Phase 31) since logging needs router intent classification
- Phase 35 depends on Phase 30 + 33 + 36 because analytics view needs learning data and auto-install needs marketplace
- [Phase 29]: In-memory Map cache for capability search (<200 entries, no Redis SCAN needed)
- [Phase 29]: Skip mcp__ tools in syncTools to avoid double-counting with MCP capability entries
- [Phase 29]: Used /:id(*) wildcard Express route param for colon-containing capability IDs
- [Phase 30]: Default active tab is Skills as most commonly used capability type
- [Phase 30]: Success rate shows em-dash when absent (Phase 36 populates real values)
- [Phase 30]: Inline CapabilityManifest type in UI (no cross-package import from nexus-core)
- [Phase 31]: getCapabilities() function dep for cross-context compatibility (nexus direct vs livinityd HTTP)
- [Phase 31]: Brain is optional in IntentRouterDeps — livinityd uses keyword matching only, no LLM fallback
- [Phase 31]: Scoped ToolRegistry pattern: intent-filter first, then apply tool policy on top
- [Phase 32]: discover_capability returns text match info (SDK cannot hot-add tools to running query)
- [Phase 32]: Dependencies injected with _score: 0 to distinguish from intent-matched capabilities
- [Phase 32]: Circular dependencies logged as warnings and broken (not fatal)
- [Phase 32]: composeSystemPrompt is budget-agnostic — caller enforces limits via context_cost
- [Phase 33]: GitHub raw URL fetch with Redis 1-hour TTL cache for marketplace index
- [Phase 33]: registerCapability/unregisterCapability as public CapabilityRegistry mutation API for marketplace
- [Phase 34]: Redis pipeline batch read for hook configs (efficient for <50 hooks)
- [Phase 34]: Fire-and-forget hook execution via child_process.exec (non-blocking, 30s timeout)
- [Phase 34]: capabilityRegistry optional in DaemonConfig for backward compatibility
- [Phase 35]: Prompt templates stored as JSON file (data/prompt-templates.json) instead of Redis
- [Phase 35]: CSS-only bar charts for analytics -- no chart library dependency
- [Phase 35]: installMarketplaceCapability fetches GitHub marketplace index directly (same source as MarketplaceMcp) for simplicity
- [Phase 35]: Recommendation cards render inside expandable tool call output, not as standalone chat messages
- [Phase 35]: Card install/dismiss status uses local React state (ephemeral per session)
- [Phase 36]: Fire-and-forget XADD logging to avoid disrupting agent sessions on Redis errors
- [Phase 36]: Duration logged as 0 from tool_result since SDK handles execution internally
- [Phase 36]: 5-minute cache TTL for co-occurrence and stats analysis
- [Phase 36]: Suggestions added with confidence 0.25 (below 0.3 threshold) for low-priority discovery
- [Phase 36]: Redis stream aggregation done in tRPC route (not LearningEngine) since livinityd has own Redis connection
- [Phase 36]: Feedback widget in chat UI deferred -- rateConversation backend contract is LRN-04 complete
- [Phase 36 gap]: Global feedback aggregation across all conversations (not per-session) for simplicity
- [Phase 36 gap]: Fire-and-forget aggregation to avoid blocking rateConversation response
- [Phase 36 gap]: FeedbackBar resets per component instance so switching conversations shows the bar again

### Pending Todos

None

### Blockers/Concerns

None

## Session Continuity

Last session: 2026-03-29T07:07:01Z
Stopped at: Completed 36-03-PLAN.md (gap closure)
Resume file: None
