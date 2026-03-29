---
phase: 30-agents-panel-redesign
plan: 01
subsystem: ui
tags: [react, trpc, tabler-icons, tailwind, capabilities, sidebar]

# Dependency graph
requires:
  - phase: 29-unified-capability-registry
    provides: tRPC routes (listCapabilities, searchCapabilities, getCapability) and CapabilityManifest type
provides:
  - Unified CapabilitiesPanel component with 4 sub-tabs (Skills, MCPs, Hooks, Agents)
  - Sidebar integration with single "Capabilities" tab replacing 3 separate panels
affects: [35-analytics-auto-install, 36-learning-loop]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-capability-panel-with-tabs, capability-row-component, capability-detail-view]

key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/capabilities-panel.tsx
  modified:
    - livos/packages/ui/src/routes/ai-chat/index.tsx

key-decisions:
  - "Default active tab is Skills as the most commonly used capability type"
  - "Success rate shows em-dash when no data exists (Phase 36 will populate real values)"
  - "Removed IconPlug and IconRobot imports from index.tsx as they became unused after tab consolidation"

patterns-established:
  - "CapabilityTab type union: 'skill' | 'mcp' | 'hook' | 'agent' for filtering"
  - "PanelView discriminated union: {mode: 'list'} | {mode: 'detail'; capabilityId: string} for navigation"
  - "Inline CapabilityManifest type in UI (no cross-package import from nexus-core)"

requirements-completed: [UIP-01, UIP-02]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 30 Plan 01: Agents Panel Redesign Summary

**Unified capabilities panel with 4 sub-tabs (Skills, MCPs, Hooks, Agents), search, status dots, tier badges, tool counts, success rate placeholders, and detail views -- all wired to Phase 29 unified registry via tRPC**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T04:29:27Z
- **Completed:** 2026-03-29T04:34:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `capabilities-panel.tsx` (440 lines) with CapabilitiesPanel default export rendering 4 sub-tabs, each showing filtered capabilities from the unified registry
- Wired panel into `index.tsx` sidebar replacing 3 separate panels (MCP, Skills, Agents) with a single "Capabilities" tab
- Each capability row shows name, status dot, tier badge, tool count, and success rate placeholder (em-dash when absent)
- Detail view shows full manifest including semantic tags as violet pills, tools as chips, dependencies, conflicts, and metadata section
- Search input filters capabilities via `searchCapabilities` tRPC route
- Vite build and TypeScript compilation succeed with no new errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create capabilities-panel.tsx with tabbed list, search, and detail views** - `ebb1965` (feat)
2. **Task 2: Wire capabilities panel into ai-chat index replacing 3 separate panels** - `db0c9ce` (feat)

## Files Created/Modified
- `livos/packages/ui/src/routes/ai-chat/capabilities-panel.tsx` - New unified capabilities panel with 4 sub-tabs, search, list, and detail views
- `livos/packages/ui/src/routes/ai-chat/index.tsx` - Replaced 3 separate panel tabs with single Capabilities tab, updated SidebarView type, cleaned unused imports

## Decisions Made
- Default active tab is Skills (most commonly used capability type per 30-CONTEXT.md decision)
- Success rate displays em-dash when `metadata.success_rate` is absent -- Phase 36 (Learning Loop) will populate real values
- Removed unused `IconPlug` and `IconRobot` imports from index.tsx after tab consolidation
- Defined inline `CapabilityManifest` type in UI rather than importing from nexus-core (separate packages cannot cross-import)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Capabilities panel is live and wired to the unified registry
- Phase 35 (auto-install/editor/analytics) can extend this panel with additional features
- Phase 36 (learning loop) will populate `metadata.success_rate` values displayed in the panel

---
*Phase: 30-agents-panel-redesign*
*Completed: 2026-03-29*
