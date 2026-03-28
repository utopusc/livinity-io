---
phase: 21-sidebar-agents-tab
plan: 02
subsystem: ui
tags: [react, sidebar, agents, tRPC, tailwind, lazy-loading]

# Dependency graph
requires:
  - phase: 21-sidebar-agents-tab/01
    provides: "getSubagent, getSubagentHistory tRPC queries, enhanced listSubagents with description/tier"
provides:
  - "Agents tab in AI Chat sidebar replacing LivHub"
  - "AgentsPanel component with list/detail navigation"
  - "Agent list with status badges, run count, last run time, tier"
  - "Agent detail view with chat history, last result, configuration, back button"
affects: [22-agent-interaction-controls]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Discriminated union for panel view state (list/detail)", "5s polling for agent list freshness"]

key-files:
  created:
    - "livos/packages/ui/src/routes/ai-chat/agents-panel.tsx"
  modified:
    - "livos/packages/ui/src/routes/ai-chat/index.tsx"

key-decisions:
  - "Kept SkillsPanel rendering block intact for backward compatibility even though no tab points to it"
  - "Read-only panel per Phase 21 scope -- no start/stop/send controls (deferred to Phase 22)"
  - "Used discriminated union AgentsView type for type-safe list/detail navigation"

patterns-established:
  - "Discriminated union view state: {mode: 'list'} | {mode: 'detail'; agentId: string}"
  - "Sidebar panel structure: sticky header + scrollable content + back button navigation"

requirements-completed: [AGNT-01, AGNT-02, AGNT-03]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 21 Plan 02: Sidebar Agents Tab UI Summary

**Agents tab replacing LivHub in AI Chat sidebar with list/detail AgentsPanel showing agent status, history, configuration, and run metrics**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T09:53:55Z
- **Completed:** 2026-03-28T09:58:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Renamed LivHub tab to Agents with IconRobot icon in AI Chat sidebar (AGNT-01)
- Built AgentsPanel component with list view showing agent cards with status badges, description, run count, last run time, and tier (AGNT-02)
- Built agent detail view with back button, status/tier meta, last result, configuration section, and chat history bubbles (AGNT-03)
- Empty state with guidance text when no agents exist

## Task Commits

Each task was committed atomically:

1. **Task 1: Modify index.tsx to add Agents tab replacing LivHub** - `c09fd27` (feat)
2. **Task 2: Create agents-panel.tsx with list and detail views** - `5bdccf7` (feat)

## Files Created/Modified
- `livos/packages/ui/src/routes/ai-chat/index.tsx` - Added IconRobot import, AgentsPanel lazy import, 'agents' to SidebarView type, tab button renamed, AgentsPanel rendering block
- `livos/packages/ui/src/routes/ai-chat/agents-panel.tsx` - New 318-line component with AgentList, AgentDetail, StatusBadge, and AgentsPanel default export

## Decisions Made
- Kept SkillsPanel rendering block intact (no tab points to it, but preserves backward compatibility for direct 'skills' view access)
- Panel is strictly read-only per Phase 21 scope; start/stop/send controls deferred to Phase 22
- Used discriminated union for view state instead of separate boolean flags for cleaner type safety
- 5-second polling on listSubagents for agent list freshness (matching existing subagents page pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript strict-mode errors in routes.ts (`ctx.livinityd possibly undefined`) across all routes -- not caused by changes, out of scope
- Pre-existing TypeScript errors in index.tsx legacy tRPC send fallback path (lines 355-360) -- not caused by changes, out of scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Agents tab fully functional in AI Chat sidebar
- Agent list and detail views wired to backend tRPC queries from Plan 21-01
- Ready for Phase 22 to add interaction controls (start/stop/send) to the detail view
- UI build succeeds without errors

## Self-Check: PASSED

- All 2 created/modified files exist on disk
- Both task commits verified (c09fd27, 5bdccf7)
- SUMMARY.md created successfully

---
*Phase: 21-sidebar-agents-tab*
*Completed: 2026-03-28*
