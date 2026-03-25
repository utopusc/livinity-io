---
phase: 03-ai-prompt-optimization-hybrid-mode
plan: 01
subsystem: ai
tags: [system-prompt, accessibility-tree, screenshot-caching, computer-use, sha256, hybrid-mode]

# Dependency graph
requires:
  - phase: 01-dpi-fix-screenshot-pipeline
    provides: Correct screenshot resize pipeline (physical to logical pixels via sharp)
  - phase: 02-windows-uia-accessibility-tree
    provides: screen_elements tool with UIA accessibility tree, raw flag on mouse tools
provides:
  - Accessibility-first AI system prompt for computer use (Elements-First Workflow)
  - Hash-based screenshot caching that skips re-capture when accessibility tree unchanged
  - screen_elements referenced in AI tool overview
affects: [computer-use, agent-loop, screenshot-pipeline]

# Tech tracking
tech-stack:
  added: [crypto.createHash (Node built-in)]
  patterns: [accessibility-first hybrid mode, hash-based cache invalidation, SHA-256 element tree hashing]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/agent.ts
    - agent-app/src/main/agent-core.ts

key-decisions:
  - "Replaced Screenshot-Analyze-Act-Verify loop with Elements-First Workflow in AI prompt"
  - "SHA-256 hash of pipe-delimited element text as cache key for screenshot deduplication"
  - "Cache stores base64, output string, and data object as instance variables on AgentCore"
  - "Cached screenshot response includes cached:true flag in data for observability"
  - "toolScreenshot() re-queries UIA to compute current hash for comparison (not just trusting stored hash)"

patterns-established:
  - "Accessibility-first prompt pattern: screen_elements first, screenshot only as fallback"
  - "Hash-based cache invalidation: compute SHA-256 of structured output to detect state changes"

requirements-completed: [AIP-01, AIP-02, AIP-03]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 03 Plan 01: AI Prompt Optimization & Hybrid Mode Summary

**Accessibility-first AI system prompt with Elements-First Workflow and SHA-256 hash-based screenshot caching that skips re-capture when the UIA accessibility tree is unchanged**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T09:48:08Z
- **Completed:** 2026-03-25T09:51:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote AI Computer Use system prompt to prefer accessibility tree element coordinates over screenshot pixel analysis
- Added screen_elements to the AI tool overview list so the model knows the tool exists
- Implemented hash-based screenshot caching: toolScreenElements() computes SHA-256 hash, toolScreenshot() returns cached image when tree unchanged
- Cached responses clearly marked with `cached: true` flag and `[cached]` output indicator

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite AI Computer Use system prompt for accessibility-first hybrid mode** - `57162d9` (feat)
2. **Task 2: Add hash-based screenshot caching tied to accessibility tree changes** - `df41e33` (feat)

## Files Created/Modified
- `nexus/packages/core/src/agent.ts` - Rewrote Computer Use section: Elements-First Workflow replacing Screenshot-Analyze-Act-Verify Loop, added screen_elements to tool list, documented raw:true for element-based clicks
- `agent-app/src/main/agent-core.ts` - Added createHash import, 4 cache instance variables, SHA-256 hash computation in toolScreenElements(), cache check + early return in toolScreenshot(), cache population after fresh capture

## Decisions Made
- Replaced the entire Screenshot-Analyze-Act-Verify Loop section rather than patching it incrementally, for clarity
- toolScreenshot() cache check re-queries UIA live (via queryUia()) rather than just comparing against stored hash -- ensures accuracy even if elements changed without toolScreenElements() being called
- Cache stores the output string and data object separately to avoid recomputing the message format on cache hits
- Used Node built-in crypto.createHash rather than an external dependency (already available in Electron main process)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v17.0 Precision Computer Use phases complete (01: DPI fix, 02: Windows UIA, 03: AI prompt + caching)
- Agent is ready for end-to-end testing: AI should now call screen_elements first, use element coords with raw:true, and fall back to screenshots only when needed
- Screenshot caching will reduce latency and vision token usage when the UI hasn't changed between actions

## Self-Check: PASSED

- [x] nexus/packages/core/src/agent.ts exists
- [x] agent-app/src/main/agent-core.ts exists
- [x] 03-01-SUMMARY.md exists
- [x] Commit 57162d9 found
- [x] Commit df41e33 found
- [x] TypeScript compilation clean (npx tsc --noEmit passes)

---
*Phase: 03-ai-prompt-optimization-hybrid-mode*
*Completed: 2026-03-25*
