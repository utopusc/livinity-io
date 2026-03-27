---
phase: 18-cost-control-settings-cleanup
plan: 01
subsystem: ui
tags: [react, websocket, cost-tracking, settings, sdk]

# Dependency graph
requires:
  - phase: 13-websocket-agent-streaming
    provides: useAgentSocket hook with WebSocket transport and SDK message handling
  - phase: 11-platform-auth-registration
    provides: SDK subprocess with result messages containing total_cost_usd and usage
provides:
  - Real-time cost display per conversation ($X.XXXX badge in chat status bar)
  - Token usage stats on hover (input/output tokens, duration)
  - Nexus AI Settings panel completely removed from settings
affects: [19-deployment, 20-live-agent-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [cost-state-in-hook, hover-tooltip-for-details]

key-files:
  modified:
    - livos/packages/ui/src/hooks/use-agent-socket.ts
    - livos/packages/ui/src/routes/ai-chat/index.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
    - livos/packages/ui/src/routes/settings/index.tsx
  deleted:
    - livos/packages/ui/src/routes/settings/nexus-config.tsx

key-decisions:
  - "Cost displayed in connection status bar (subtle, non-intrusive placement)"
  - "Token breakdown shown on hover via title attribute (keeps UI clean)"
  - "PersonalizationCard removed alongside NexusConfigSection (only consumer)"

patterns-established:
  - "SDK result fields (total_cost_usd, usage) extracted in handleSdkMessage result case"
  - "Cost state reset on clearMessages to track per-conversation"

requirements-completed: [SDK-08, SDK-09]

# Metrics
duration: 14min
completed: 2026-03-27
---

# Phase 18 Plan 01: Cost Control + Settings Cleanup Summary

**Real-time cost badge ($X.XXXX) in chat status bar from SDK result messages, Nexus AI Settings panel fully removed (~960 lines deleted)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-27T11:58:44Z
- **Completed:** 2026-03-27T12:12:24Z
- **Tasks:** 2
- **Files modified:** 4 modified, 1 deleted

## Accomplishments
- Cost tracking state (totalCost, usageStats) added to useAgentSocket hook, extracted from SDK result messages
- Subtle "$0.0234" cost badge in chat connection status bar with token breakdown on hover
- Nexus AI Settings panel completely removed: NexusConfigSection, PersonalizationCard, NexusConfig interface, AI constants, menu item, route, and standalone page file

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cost/usage state to useAgentSocket and display cost badge in chat** - `dfdd632` (feat)
2. **Task 2: Remove Nexus AI Settings panel from settings** - `fba96cd` (chore)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-agent-socket.ts` - Added totalCost/usageStats state, SDK result extraction, reset on clearMessages
- `livos/packages/ui/src/routes/ai-chat/index.tsx` - Added cost badge in connection status bar with hover tooltip
- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` - Removed NexusConfigSection, PersonalizationCard, AI constants, menu item, switch case, unused imports
- `livos/packages/ui/src/routes/settings/index.tsx` - Removed NexusConfigPage lazy import and /nexus-config route
- `livos/packages/ui/src/routes/settings/nexus-config.tsx` - Deleted (standalone settings page)

## Decisions Made
- Cost displayed in the connection status bar rather than per-message -- shows total conversation cost in a consistent location
- Token breakdown (input/output counts, duration) on hover via title attribute -- keeps the UI clean while providing detail
- PersonalizationCard (AI role, response style, use cases) removed along with NexusConfigSection since it was only used as part of that section
- setup-wizard.tsx reference to updateNexusConfig tRPC mutation left intact -- that's a backend API call for onboarding, not the removed UI panel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cost tracking is wired end-to-end (SDK -> WebSocket -> hook -> UI badge)
- Settings are cleaned up -- only AI Configuration (API key, provider, computer use) remains
- Ready for Phase 19 (deployment) or further UI work

---
*Phase: 18-cost-control-settings-cleanup*
*Completed: 2026-03-27*
