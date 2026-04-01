---
phase: 39-mobile-home-screen-app-access
plan: 01
subsystem: ui
tags: [react, mobile, pwa, dock, app-grid, framer-motion]

# Dependency graph
requires:
  - phase: 38-mobile-navigation-infrastructure
    provides: MobileAppContext (openApp/closeApp), useIsMobile hook, mobile overlay rendering
provides:
  - Hidden dock on mobile (DockBottomPositioner returns null)
  - Tab-bar-height spacer on mobile (72px DockSpacer)
  - System app icons in mobile app grid (AI Chat, Files, Settings, Server, Terminal)
  - openApp integration connecting grid icons to MobileAppContext
affects: [39-02 (tab bar needs DockSpacer 72px space), 40-mobile-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [mobile-gate-via-isMobile, system-apps-in-grid-on-mobile]

key-files:
  created: []
  modified:
    - livos/packages/ui/src/modules/desktop/dock.tsx
    - livos/packages/ui/src/modules/desktop/desktop-content.tsx

key-decisions:
  - "72px mobile spacer height (56px tab bar + 16px safe area estimate) for upcoming tab bar"
  - "System apps unshifted to top of appItems array so they appear first in grid"
  - "5 system apps selected for mobile grid: AI Chat, Files, Settings, Server, Terminal"

patterns-established:
  - "Mobile dock hiding: DockBottomPositioner returns null on mobile, keeping Dock() itself unchanged"
  - "Mobile system apps: conditionally prepended to grid inside existing useMemo, no separate component"

requirements-completed: [MOB-01]

# Metrics
duration: 3min
completed: 2026-04-01
---

# Phase 39 Plan 01: Mobile Home Screen App Access Summary

**Hidden macOS dock on mobile and added 5 system app icons (AI Chat, Files, Settings, Server, Terminal) to the app grid with full-screen openApp() integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T17:39:50Z
- **Completed:** 2026-04-01T17:42:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Dock completely hidden on mobile via DockBottomPositioner returning null when isMobile
- DockSpacer returns 72px on mobile (space reserved for upcoming tab bar) instead of dock height
- 5 system apps appear at top of mobile app grid, each tapping opens full-screen via MobileAppContext.openApp()
- Desktop UI completely unchanged -- all modifications gated behind isMobile checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Hide dock on mobile, provide tab-bar-height spacer** - `efa6510` (feat)
2. **Task 2: Add system app icons to grid on mobile** - `2aa1bd2` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `livos/packages/ui/src/modules/desktop/dock.tsx` - DockBottomPositioner returns null on mobile, DockSpacer returns 72px on mobile
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` - System app icons prepended to grid when isMobile, openApp() onClick handlers

## Decisions Made
- 72px spacer height chosen as 56px (tab bar) + 16px (safe area estimate) -- matches upcoming Phase 39-02 tab bar
- System apps unshifted (prepended) rather than appended so they appear first in the grid, matching phone home screen conventions
- Only 5 core system apps included (AI Chat, Files, Settings, Server, Terminal) -- utility apps like Live Usage and App Store omitted for mobile simplicity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- DockSpacer provides 72px space at bottom for the tab bar (Phase 39-02)
- System apps in grid are tappable and open full-screen via MobileAppContext
- Desktop UI verified unchanged -- ready for parallel desktop development

## Self-Check: PASSED

- All files exist (dock.tsx, desktop-content.tsx, SUMMARY.md)
- All commits verified (efa6510, 2aa1bd2)

---
*Phase: 39-mobile-home-screen-app-access*
*Completed: 2026-04-01*
