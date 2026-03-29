---
phase: 32-auto-provisioning-engine
plan: 01
subsystem: ai
tags: [intent-router, dependency-resolution, system-prompt, capability-discovery, agent-sdk]

# Dependency graph
requires:
  - phase: 31-intent-router-v2
    provides: IntentRouter class with resolveCapabilities(), scoring, caching, budget management
  - phase: 29-unified-capability-registry
    provides: CapabilityManifest with requires field, CapabilityRegistry
provides:
  - Dependency resolution via expandDependencies() in IntentRouter
  - Dynamic system prompt composition via composeSystemPrompt()
  - discover_capability tool for mid-conversation capability search
  - getCapabilitiesList() public accessor on IntentRouter
affects: [34-ai-self-modification, 33-marketplace-mcp, 35-agents-panel-redesign]

# Tech tracking
tech-stack:
  added: []
  patterns: [depth-first dependency expansion, dynamic system prompt composition, session-scoped discovery tool]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/intent-router.ts
    - nexus/packages/core/src/agent-session.ts
    - nexus/packages/core/src/lib.ts

key-decisions:
  - "discover_capability returns match info as text output (SDK cannot hot-add tools to running query)"
  - "Dependencies added with _score: 0 to distinguish from intent-matched capabilities"
  - "Circular dependencies logged as warnings and broken (not fatal errors)"
  - "System prompt composition does not enforce budget (caller responsibility via context_cost)"

patterns-established:
  - "Depth-first dependency expansion: expandDependencies resolves requires[] recursively with visited-set cycle detection"
  - "Dynamic system prompt: composeSystemPrompt(base, capabilities) appends metadata.instructions sections"
  - "Session-scoped discovery: discover_capability tool searches registry via intentRouter.getCapabilitiesList()"

requirements-completed: [PRV-01, PRV-02, PRV-03, PRV-04]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 32 Plan 01: Auto-Provisioning Engine Summary

**Dependency resolution with topological expansion, dynamic per-session system prompts from capability metadata, and discover_capability tool for mid-conversation registry search**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T05:14:53Z
- **Completed:** 2026-03-29T05:17:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- IntentRouter now expands `requires` dependencies via depth-first traversal before returning capabilities, with circular dependency detection and warning
- System prompt is dynamically composed per session by appending capability `metadata.instructions` sections to the base prompt
- Agent sessions include a `discover_capability` tool that searches the registry and returns match info for capabilities not currently loaded
- `composeSystemPrompt` exported from lib.ts for reuse across contexts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dependency resolution to IntentRouter and create composeSystemPrompt** - `85ff835` (feat)
2. **Task 2: Add discover_capability tool, hot-add mechanism, and dynamic system prompt in agent-session** - `9cb9403` (feat)

## Files Created/Modified
- `nexus/packages/core/src/intent-router.ts` - Added expandDependencies() method, getCapabilitiesList() accessor, composeSystemPrompt() function
- `nexus/packages/core/src/agent-session.ts` - Extracted BASE_SYSTEM_PROMPT, added discover_capability tool, replaced hardcoded prompt with dynamic composition
- `nexus/packages/core/src/lib.ts` - Added composeSystemPrompt export

## Decisions Made
- **discover_capability returns text output, not hot-added tools:** The Claude Agent SDK cannot add tools to a running query(). The tool returns match info and tells the AI that tools will auto-load on the next message turn via intent routing. Phase 34 can enhance with true mid-session hot-add when SDK supports it.
- **Dependencies scored at 0:** Dependencies injected by expandDependencies use `_score: 0` to clearly distinguish them from intent-matched capabilities in logs and analytics.
- **Circular deps are warnings, not errors:** Following the plan's decision, circular dependencies are detected via a visited set, logged as warnings, and broken without crashing the session.
- **composeSystemPrompt is budget-agnostic:** The function simply concatenates base + instruction sections. Budget enforcement is the caller's responsibility via IntentRouter's context_cost filtering.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-provisioning engine complete: sessions dynamically load capabilities, compose prompts, and expose discovery
- Ready for Phase 33 (Marketplace MCP) which will extend discover_capability to search external marketplace
- Ready for Phase 34 (AI Self-Modification) which can enhance hot-add with true mid-session tool injection
- PRV-01 through PRV-04 all satisfied

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 32-auto-provisioning-engine*
*Completed: 2026-03-29*
