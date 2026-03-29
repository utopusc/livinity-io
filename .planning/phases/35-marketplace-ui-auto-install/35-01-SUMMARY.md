---
phase: 35-marketplace-ui-auto-install
plan: 01
subsystem: ui, api
tags: [trpc, react, prompts, analytics, capabilities-panel, tabler-icons, css-bar-chart]

requires:
  - phase: 30-capability-dashboard
    provides: capabilities-panel.tsx with 4-tab layout and tRPC integration
  - phase: 29-capability-registry
    provides: CapabilityRegistry API endpoints proxied through livinityd

provides:
  - Prompts tab in capabilities panel with built-in + custom prompt template CRUD
  - Analytics tab in capabilities panel with capability stats table and CSS bar chart
  - tRPC routes listPrompts, savePrompt, deletePrompt, getAnalytics
  - JSON file-based prompt template storage (data/prompt-templates.json)

affects: [35-02-PLAN, 36-learning-loop]

tech-stack:
  added: []
  patterns: [file-based JSON config storage for prompt templates, CSS-only bar charts for analytics visualization]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/routes.ts
    - livos/packages/ui/src/routes/ai-chat/capabilities-panel.tsx

key-decisions:
  - "Prompt templates stored as JSON file (data/prompt-templates.json) instead of Redis -- simpler, livinityd can read directly without proxying through nexus"
  - "Built-in prompts hardcoded in route handler, custom prompts appended to JSON file -- builtins always present even if file missing"
  - "CSS-only bar charts for analytics -- no chart library dependency added"
  - "Search bar hidden for prompts/analytics tabs since they have their own content views"

patterns-established:
  - "File-based JSON config: read with fallback defaults, write with mkdir -p, append pattern"
  - "Tab-specific view components: PromptsView/AnalyticsView rendered conditionally by activeTab"

requirements-completed: [UIP-04, UIP-05]

duration: 5min
completed: 2026-03-29
---

# Phase 35 Plan 01: Prompts & Analytics Tabs Summary

**Prompt template CRUD (4 built-in + custom) and capability analytics table with CSS bar charts added to 6-tab capabilities panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T06:02:18Z
- **Completed:** 2026-03-29T06:07:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 4 new tRPC routes: listPrompts, savePrompt, deletePrompt, getAnalytics
- PromptsView component with create form, built-in badge, delete for custom prompts
- AnalyticsView component with summary cards, table header, CSS bar chart per capability
- Capabilities panel extended from 4 to 6 tabs (Skills, MCPs, Hooks, Agents, Prompts, Analytics)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tRPC routes for prompt CRUD and analytics data** - `02bbcb6` (feat)
2. **Task 2: Add Prompts and Analytics tabs to capabilities panel** - `dd4bf81` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added listPrompts, savePrompt, deletePrompt, getAnalytics tRPC routes with file-based JSON storage and nexus capability aggregation
- `livos/packages/ui/src/routes/ai-chat/capabilities-panel.tsx` - Extended to 6 tabs with PromptsView and AnalyticsView components, conditional search bar visibility

## Decisions Made

- Prompt templates stored as JSON file instead of Redis -- livinityd reads directly without proxying to nexus
- Built-in prompts hardcoded in route handler so they appear even without the JSON file
- CSS-only bar charts (no chart library added) for analytics visualization
- Search bar hidden when prompts or analytics tab is active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added EMPTY_STATES entries for new tabs**
- **Found during:** Task 2 (Adding Prompts/Analytics tabs)
- **Issue:** EMPTY_STATES used Record<CapabilityTab, ...> which requires entries for all keys -- TypeScript would error without prompts/analytics entries
- **Fix:** Added prompts and analytics entries to EMPTY_STATES constant
- **Files modified:** capabilities-panel.tsx
- **Verification:** Vite build passes
- **Committed in:** dd4bf81 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed header visibility condition for new tabs**
- **Found during:** Task 2 (Adding Prompts/Analytics tabs)
- **Issue:** Header only showed when view.mode === 'list', but prompts/analytics tabs need the header visible too
- **Fix:** Changed condition to (view.mode === 'list' || activeTab === 'prompts' || activeTab === 'analytics')
- **Files modified:** capabilities-panel.tsx
- **Verification:** Vite build passes
- **Committed in:** dd4bf81 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None

## Known Stubs

None -- all data flows are wired to real tRPC endpoints.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Capabilities panel now has 6 tabs ready for Phase 35-02 (auto-install dialog)
- Analytics shows real data from CapabilityRegistry; success rates will be populated by Phase 36 (Learning Loop)
- Prompt templates ready for future integration with AI chat system prompt selection

---
*Phase: 35-marketplace-ui-auto-install*
*Completed: 2026-03-29*
