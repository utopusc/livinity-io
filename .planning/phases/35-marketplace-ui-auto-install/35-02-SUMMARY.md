---
phase: 35-marketplace-ui-auto-install
plan: 02
subsystem: ui
tags: [react, trpc, marketplace, inline-cards, auto-install, tabler-icons]

# Dependency graph
requires:
  - phase: 33-livinity-marketplace-mcp
    provides: marketplace index JSON format and livinity_search/livinity_install tool output schemas
  - phase: 35-marketplace-ui-auto-install plan 01
    provides: capabilities panel UI and prompt templates
provides:
  - installMarketplaceCapability tRPC mutation for UI-triggered capability install
  - CapabilityRecommendationCard component rendering inline marketplace recommendations in chat
  - Marketplace tool detection (livinity_search/recommend/install) in chat message stream
affects: [ai-chat, marketplace, capability-registry]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-recommendation-cards, tool-output-parsing-for-ui-rendering]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/routes.ts
    - livos/packages/ui/src/routes/ai-chat/chat-messages.tsx

key-decisions:
  - "installMarketplaceCapability fetches GitHub marketplace index directly (same source as MarketplaceMcp) rather than proxying through agent stream"
  - "Recommendation cards render inside the expandable tool call output section, not as standalone chat messages"
  - "Card state management uses local useState (idle/installing/installed/rejected) per card instance"

patterns-established:
  - "Tool-output-specific UI rendering: parse tool output JSON and render specialized cards based on tool name"
  - "isMarketplaceTool helper centralizes livinity tool name detection for reuse"

requirements-completed: [UIP-03]

# Metrics
duration: 14min
completed: 2026-03-29
---

# Phase 35 Plan 02: Auto-Install Recommendation Cards Summary

**Inline marketplace capability recommendation cards in chat with Install/Dismiss buttons and tRPC install mutation**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-29T06:09:15Z
- **Completed:** 2026-03-29T06:23:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `installMarketplaceCapability` tRPC mutation that fetches marketplace index from GitHub, validates manifest, and registers capability via nexus API
- Created `CapabilityRecommendationCard` component with styled capability info display (name, type badge, description, tools list) and Install/Dismiss action buttons
- Integrated marketplace tool detection into chat message rendering so cards appear inline when AI calls livinity_search/recommend/install

## Task Commits

Each task was committed atomically:

1. **Task 1: Add installMarketplaceCapability tRPC mutation** - `349c000` (feat)
2. **Task 2: Add auto-install recommendation card in chat messages** - `a5aecc1` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added installMarketplaceCapability mutation (fetches GitHub marketplace index, validates, registers via nexus)
- `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` - Added CapabilityRecommendationCard component, isMarketplaceTool helper, IconDownload/IconPuzzle imports, trpcReact import

## Decisions Made
- Fetch marketplace index directly from GitHub raw URL in tRPC mutation rather than proxying through agent stream -- simpler, avoids agent overhead for a UI-triggered action
- Render recommendation cards inside the expandable tool call output area (after ToolOutput) rather than as separate top-level chat blocks -- keeps UI context clear (card is visually connected to the tool call that produced it)
- Use local React state per card for install/dismiss status rather than persisting to backend -- cards are ephemeral within the chat session

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict type errors in new code**
- **Found during:** Task 1
- **Issue:** `fetch().json()` returns `unknown` in strict mode, causing TS2322 and TS18046 errors
- **Fix:** Added explicit type assertions: `as any[]` for marketplace items, `as {id?: string}` for registration response
- **Files modified:** livos/packages/livinityd/source/modules/ai/routes.ts
- **Verification:** TypeScript compilation shows no new errors from our code
- **Committed in:** 349c000 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type assertion fix required for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 35 complete (both plans) -- marketplace UI and auto-install cards shipped
- Capability recommendation cards will render when AI uses marketplace tools in conversation
- Ready for Phase 36 (Learning Loop) or next milestone phases

---
*Phase: 35-marketplace-ui-auto-install*
*Completed: 2026-03-29*
