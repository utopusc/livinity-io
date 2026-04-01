---
phase: 40-polish-ios-hardening
plan: 01
subsystem: ui
tags: [pwa, install-prompt, ios, android, standalone, service-worker, splash-screen]

# Dependency graph
requires:
  - phase: 37-pwa-manifest-service-worker
    provides: PWA manifest with theme_color, service worker, Apple meta tags
  - phase: 38-mobile-navigation-infrastructure
    provides: MobileAppProvider, MobileAppRenderer, mobile app context
  - phase: 39-mobile-home-screen-app-access
    provides: MobileTabBar at z-[60], mobile tab bar navigation
provides:
  - InstallPromptBanner component for mobile PWA install discovery
  - useIsStandalone hook for detecting PWA standalone mode
  - Splash screen theme_color alignment verification (PWA-06)
affects: [40-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [beforeinstallprompt event interception, navigator.standalone iOS detection, matchMedia display-mode listener, localStorage dismissal persistence]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-is-standalone.ts
    - livos/packages/ui/src/components/install-prompt-banner.tsx
  modified:
    - livos/packages/ui/src/router.tsx

key-decisions:
  - "Spring animation (stiffness 300, damping 30) for banner entrance/exit instead of tween for native feel"
  - "z-[70] for banner above MobileTabBar z-[60] ensures banner floats above tab bar"
  - "Splash screen (PWA-06) confirmed via manifest alignment check -- no code changes needed, already correct from Phase 37"

patterns-established:
  - "useIsStandalone hook: dual detection via navigator.standalone (iOS) + matchMedia display-mode (Android/Chrome) with change listener"
  - "Install prompt pattern: beforeinstallprompt interception + localStorage dismissal persistence"

requirements-completed: [PWA-05, PWA-06]

# Metrics
duration: 4min
completed: 2026-04-01
---

# Phase 40 Plan 01: Install Prompt Banner and Splash Screen Summary

**PWA install prompt banner for mobile visitors with platform-specific instructions (Android native prompt, iOS manual share guide) plus splash screen theme_color alignment verification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T18:12:04Z
- **Completed:** 2026-04-01T18:16:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created useIsStandalone hook detecting PWA mode on both iOS (navigator.standalone) and Android (matchMedia display-mode)
- Built InstallPromptBanner with Android native install via beforeinstallprompt and iOS manual "Add to Home Screen" instructions
- Banner respects localStorage dismissal, standalone mode detection, and mobile-only visibility
- Verified splash screen theme_color alignment across manifest, meta tag, and body background (all #f8f9fc)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useIsStandalone hook and InstallPromptBanner component** - `d78cc1c` (feat)
2. **Task 2: Render InstallPromptBanner in router.tsx and verify splash screen config** - `705a1f8` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-is-standalone.ts` - Hook detecting PWA standalone mode via navigator.standalone + matchMedia
- `livos/packages/ui/src/components/install-prompt-banner.tsx` - Dismissible bottom banner with platform-specific install instructions
- `livos/packages/ui/src/router.tsx` - Added InstallPromptBanner after MobileTabBar in component tree

## Decisions Made
- Spring animation (stiffness 300, damping 30) for banner slide-up entrance gives native-feeling physics
- z-[70] positioning above MobileTabBar (z-[60]) ensures banner is always visible above the tab bar
- PWA-06 splash screen confirmed satisfied by existing Phase 37 manifest configuration -- no additional code needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all components are fully wired with real data and behavior.

## Next Phase Readiness
- Install prompt banner complete, ready for 40-02 (keyboard, scroll, and tap fixes)
- Real-device iOS/Android testing recommended to verify beforeinstallprompt behavior and standalone detection

## Self-Check: PASSED

All files exist. All commit hashes verified.

---
*Phase: 40-polish-ios-hardening*
*Completed: 2026-04-01*
