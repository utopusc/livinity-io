---
phase: 36-learning-loop
plan: 01
subsystem: ai
tags: [redis-streams, co-occurrence, learning, intent-router, agent-session]

# Dependency graph
requires:
  - phase: 31-intent-router
    provides: IntentRouter with resolveCapabilities and scoring pipeline
  - phase: 29-capability-registry
    provides: CapabilityManifest type and unified registry
provides:
  - LearningEngine class with Redis stream logging, co-occurrence mining, and proactive suggestions
  - Tool call logging wired into AgentSessionManager relay loop
  - Suggestion injection into IntentRouter after capability resolution
affects: [36-02-learning-loop, 35-auto-install-editor-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [redis-stream-xadd-with-approximate-trimming, session-grouped-co-occurrence-matrix, fire-and-forget-logging]

key-files:
  created:
    - nexus/packages/core/src/learning-engine.ts
  modified:
    - nexus/packages/core/src/agent-session.ts
    - nexus/packages/core/src/intent-router.ts
    - nexus/packages/core/src/lib.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts

key-decisions:
  - "Fire-and-forget XADD logging -- errors caught and logged, never thrown, to avoid disrupting agent sessions"
  - "Duration logged as 0 from tool_result -- SDK handles tool execution internally so exact duration is unavailable"
  - "5-minute cache TTL for co-occurrence and stats to avoid repeated XRANGE scans"
  - "Suggestions added with confidence 0.25 (below 0.3 threshold) so they appear as low-priority recommendations"
  - "selectedIds Set also tracks core tool IDs after insertion to prevent duplicate suggestion injection"

patterns-established:
  - "Redis stream pattern: XADD with MAXLEN ~N for bounded append-only logs"
  - "Cache-on-read pattern: refreshCache() computes both co-occurrences and stats in single XRANGE pass"

requirements-completed: [LRN-01, LRN-02, LRN-03]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 36 Plan 01: Learning Loop Backend Summary

**LearningEngine with Redis stream tool call logging, session-grouped co-occurrence mining, and proactive capability suggestion injection into IntentRouter**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T06:34:48Z
- **Completed:** 2026-03-29T06:39:31Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- LearningEngine class with logToolCall (Redis XADD), getCoOccurrences (session-grouped co-occurrence matrix), getSuggestions (maps co-occurring tools to capabilities), and getToolStats (per-tool aggregation)
- Tool call logging wired into AgentSessionManager's consumeAndRelay loop -- every tool_result triggers a fire-and-forget log entry
- IntentRouter step 9b injects learning-based suggestions after core tools and before cache write
- ws-agent.ts creates LearningEngine and passes it to both IntentRouter and AgentSessionManager

## Task Commits

Each task was committed atomically:

1. **Task 1: Create LearningEngine class** - `edb403b` (feat)
2. **Task 2: Wire logging and suggestions** - `b4f1fdb` (feat)

## Files Created/Modified
- `nexus/packages/core/src/learning-engine.ts` - LearningEngine class with logToolCall, getCoOccurrences, getSuggestions, getToolStats
- `nexus/packages/core/src/lib.ts` - Added LearningEngine export
- `nexus/packages/core/src/agent-session.ts` - Added learningEngine opt + logToolCall in tool_result handler
- `nexus/packages/core/src/intent-router.ts` - Added learningEngine to IntentRouterDeps + step 9b suggestion injection
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` - Creates LearningEngine, passes to IntentRouter and AgentSessionManager

## Decisions Made
- Fire-and-forget XADD logging to avoid disrupting agent sessions on Redis errors
- Duration logged as 0 from tool_result since SDK handles tool execution internally
- 5-minute cache TTL for co-occurrence and stats analysis to balance freshness vs. scan cost
- Suggestions inserted with confidence 0.25 (below default 0.3 threshold) for low-priority discovery
- Added selectedIds tracking for core tools to prevent duplicate entries during suggestion injection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt nexus-core dist for livinityd type resolution**
- **Found during:** Task 2 (ws-agent.ts LearningEngine import)
- **Issue:** livinityd imports from `@nexus/core/lib` which resolves to compiled `dist/lib.d.ts` -- the new LearningEngine export was not in dist yet
- **Fix:** Ran `npm run build --workspace=packages/core` to regenerate dist/ with new types
- **Files modified:** nexus/packages/core/dist/ (gitignored, not committed)
- **Verification:** `pnpm --filter livinityd exec tsc --noEmit` shows no ws-agent.ts errors
- **Committed in:** N/A (dist is gitignored)

**2. [Rule 1 - Bug] Added selectedIds.add() for core tools to prevent duplicate suggestions**
- **Found during:** Task 2 (intent-router suggestion injection)
- **Issue:** Core tools added in step 9 were not tracked in selectedIds Set, so step 9b could re-add them as suggestions
- **Fix:** Added `selectedIds.add(coreId)` after inserting each core tool in step 9
- **Files modified:** nexus/packages/core/src/intent-router.ts
- **Verification:** TypeScript compiles, logic correct
- **Committed in:** b4f1fdb (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LearningEngine is fully wired and operational -- tool calls will be logged to Redis stream on every agent interaction
- Phase 36-02 (if present) can build on this foundation for UI analytics, A/B testing, or advanced pattern mining
- Phase 35 analytics views can now consume getToolStats() for real success rate and usage data

## Self-Check: PASSED

All 5 files verified present. Both commit hashes (edb403b, b4f1fdb) confirmed in git log.

---
*Phase: 36-learning-loop*
*Completed: 2026-03-29*
