---
phase: 31-intent-router-v2
plan: 01
subsystem: ai
tags: [intent-routing, tf-idf, redis-cache, capability-registry, tool-selection, context-budget]

# Dependency graph
requires:
  - phase: 29-unified-capability-registry
    provides: CapabilityManifest type, CapabilityRegistry with list/search/get, /api/capabilities endpoint
provides:
  - IntentRouter class with resolveCapabilities() for intent-based capability selection
  - TF-IDF-like scoring with keyword/trigger matching
  - Redis caching for repeated intents (1h TTL)
  - Context budget management (30% of context window)
  - Core tool guaranteed inclusion (shell, files, sysinfo, docker)
  - Optional LLM flash-tier fallback for unmatched intents
  - IntentRouter exports from @nexus/core/lib for cross-package consumption
  - AgentSessionManager intent-based tool selection with graceful degradation
affects: [32-auto-provisioning, 34-ai-self-modification, 36-learning-loop]

# Tech tracking
tech-stack:
  added: [node:crypto (MD5 hashing)]
  patterns: [function-dep injection for cross-context compatibility, scoped ToolRegistry for intent-filtered tools]

key-files:
  created:
    - nexus/packages/core/src/intent-router.ts
  modified:
    - nexus/packages/core/src/agent-session.ts
    - nexus/packages/core/src/lib.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts

key-decisions:
  - "getCapabilities() function dep instead of CapabilityRegistry class — supports both nexus (direct) and livinityd (HTTP fetch) contexts"
  - "Brain is optional in IntentRouterDeps — livinityd has no Brain, keyword matching only"
  - "Tier declaration moved before intent-based tool selection to satisfy TypeScript block scoping"

patterns-established:
  - "Function-dep injection: abstract data source as function param to avoid heavy dependency imports across packages"
  - "Scoped ToolRegistry: create filtered registry via intent matching, then apply tool policy on top"
  - "Graceful degradation: always fall back to full tool set if intent routing fails"

requirements-completed: [RTR-01, RTR-02, RTR-03, RTR-04]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 31 Plan 01: Intent Router v2 Summary

**IntentRouter with TF-IDF keyword/trigger scoring, 30% context budget cap, Redis caching, and LLM fallback wired into AgentSessionManager for intent-based tool selection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T04:58:20Z
- **Completed:** 2026-03-29T05:03:18Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created IntentRouter class implementing keyword/trigger semantic matching with TF-IDF-like scoring, configurable confidence threshold (0.3), 30% context budget cap, 15-capability hard limit, Redis caching with 1h TTL, and optional LLM flash-tier fallback
- Wired IntentRouter into AgentSessionManager for intent-based tool selection, replacing static full-tool-set loading with intelligent, intent-driven capability selection
- Exported IntentRouter and types from lib.ts for cross-package consumption; instantiated in ws-agent.ts with HTTP-backed capability fetching from nexus API
- Core tools (shell, files_read, files_write, files_list, sysinfo, docker_list, docker_manage, docker_exec) always loaded regardless of intent match

## Task Commits

Each task was committed atomically:

1. **Task 1: Create IntentRouter class with scoring, budget, caching, and LLM fallback** - `45d188a` (feat)
2. **Task 2: Wire IntentRouter into agent-session.ts, lib.ts, and ws-agent.ts** - `aae5f39` (feat)

**Plan metadata:** (pending - docs commit)

## Files Created/Modified
- `nexus/packages/core/src/intent-router.ts` - IntentRouter class with resolveCapabilities(), scoring, budget management, caching, LLM fallback
- `nexus/packages/core/src/agent-session.ts` - AgentSessionManager with optional intentRouter field, intent-based tool selection in consumeAndRelay()
- `nexus/packages/core/src/lib.ts` - IntentRouter + types exported, CapabilityManifest type re-exported
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` - IntentRouter instantiation with HTTP-backed capability fetch, injected into AgentSessionManager

## Decisions Made
- Used getCapabilities() function dep instead of CapabilityRegistry class to support both nexus (direct list()) and livinityd (HTTP fetch) contexts without importing heavy dependencies
- Brain is optional in IntentRouterDeps so livinityd (which has no Brain instance) can use keyword matching only, with LLM fallback skipped
- Moved tier declaration before intent-based tool selection block to satisfy TypeScript block scoping requirements (tier needed by resolveCapabilities())

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tier variable ordering in agent-session.ts**
- **Found during:** Task 2 (Wire IntentRouter into agent-session.ts)
- **Issue:** The `tier` const was declared after the intent-based tool selection block which used it, causing TS2448 (block-scoped variable used before declaration)
- **Fix:** Moved `const tier = model ?? agentDefaults?.tier ?? 'sonnet'` declaration before the intent-based tool selection block
- **Files modified:** nexus/packages/core/src/agent-session.ts
- **Verification:** `npx tsc --noEmit` shows zero errors outside pre-existing api.ts issues
- **Committed in:** aae5f39 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor ordering fix required for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `nexus/packages/core/src/api.ts` (8 errors about `deps` not found) cause `npm run build` to exit non-zero, but these are unrelated to intent-router changes. Verified with `npx tsc --noEmit | grep -v api.ts` showing zero errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- IntentRouter is operational and wired into the agent session pipeline
- Phase 32 (Auto-Provisioning Engine) can build on intent results to dynamically load/install capabilities
- Phase 36 (Learning Loop) can consume intent classification data for usage pattern mining
- The pre-existing api.ts build errors should be addressed separately (out of scope for this plan)

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit 45d188a (Task 1) verified in git log
- Commit aae5f39 (Task 2) verified in git log

---
*Phase: 31-intent-router-v2*
*Completed: 2026-03-29*
