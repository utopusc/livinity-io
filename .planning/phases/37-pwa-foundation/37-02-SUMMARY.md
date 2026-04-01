---
phase: 37-pwa-foundation
plan: 02
subsystem: ui
tags: [tailwindcss, safe-area, pwa, ios, css, mobile]

# Dependency graph
requires:
  - phase: 37-pwa-foundation-01
    provides: PWA manifest with viewport-fit=cover meta tag (required for safe area env() to work)
provides:
  - Safe area Tailwind utility classes (pt-safe, pb-safe, h-screen-safe, etc.)
  - CSS custom properties for safe area insets (--safe-area-top/right/bottom/left)
  - Overscroll-behavior prevention on app shell
  - Standalone mode media query for --sheet-top adjustment
  - Touch-action manipulation on inputs/buttons (300ms tap delay elimination)
affects: [38-mobile-layout, 39-mobile-apps, 40-mobile-polish]

# Tech tracking
tech-stack:
  added: [tailwindcss-safe-area@0.8.0]
  patterns: [safe-area-env-with-css-custom-property-fallback, display-mode-standalone-media-query]

key-files:
  created: []
  modified:
    - livos/packages/ui/tailwind.config.ts
    - livos/packages/ui/src/index.css
    - livos/packages/ui/package.json

key-decisions:
  - "tailwindcss-safe-area v0.8.0 (Tailwind v3 compatible) not v1.x (Tailwind v4)"
  - "Safe area CSS vars as custom properties for use outside Tailwind classes"
  - "overscroll-behavior: none on html,body prevents iOS rubber-band bounce"
  - "--sheet-top: 0vh in standalone mode eliminates desktop wallpaper peek gap in PWA"

patterns-established:
  - "Safe area pattern: use pt-safe/pb-safe Tailwind utilities or var(--safe-area-top) CSS custom properties"
  - "PWA detection: @media (display-mode: standalone) for PWA-specific CSS adjustments"

requirements-completed: [IOS-01]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 37 Plan 02: Safe Area CSS Foundation Summary

**tailwindcss-safe-area plugin with CSS custom property fallbacks, overscroll-behavior prevention, and standalone mode detection for native PWA feel on notched iOS devices**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T16:33:07Z
- **Completed:** 2026-04-01T16:36:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Installed tailwindcss-safe-area@0.8.0 and registered as Tailwind plugin, enabling pt-safe, pb-safe, h-screen-safe utility classes
- Added safe area CSS custom properties (--safe-area-top/right/bottom/left) with 0px fallbacks for non-notched devices
- Prevented iOS rubber-band bounce with overscroll-behavior: none and added touch-action: manipulation to eliminate 300ms tap delay
- Added standalone mode media query that sets --sheet-top: 0vh for proper PWA rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Install tailwindcss-safe-area and register in Tailwind config** - `9a095ec` (feat)
2. **Task 2: Add safe area CSS variables and overscroll-behavior to index.css** - `14d84ed` (feat)

## Files Created/Modified
- `livos/packages/ui/package.json` - Added tailwindcss-safe-area@0.8.0 as devDependency
- `livos/packages/ui/tailwind.config.ts` - Added tailwindSafeArea import and plugin registration
- `livos/packages/ui/src/index.css` - Safe area CSS vars, overscroll-behavior, standalone mode query, touch-action

## Decisions Made
- Used tailwindcss-safe-area v0.8.0 (Tailwind v3 compatible) rather than v1.x (which requires Tailwind v4)
- Defined safe area insets as both Tailwind utilities (via plugin) and CSS custom properties (for use in inline styles or non-Tailwind contexts)
- Applied overscroll-behavior: none globally on html,body rather than per-component for consistent native feel
- Set --sheet-top: 0vh in standalone mode because the desktop wallpaper peek gap is unnecessary in PWA mode

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pnpm postinstall script fails on Windows (cp -r command incompatible with Windows shell) - used --ignore-scripts to bypass. This is a pre-existing issue unrelated to our changes.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all additions are fully functional (safe area values resolve to real env() values on notched devices and 0px on desktop).

## Next Phase Readiness
- Safe area Tailwind utilities (pt-safe, pb-safe, h-screen-safe) are available for Phase 38 mobile layout components
- CSS custom properties (--safe-area-top, etc.) can be referenced in any component's inline styles
- Phase 38 can use @media (display-mode: standalone) for additional PWA-specific styling
- Build verified - all additions compile cleanly with zero desktop UI impact

## Self-Check: PASSED

All files exist, all commits verified (9a095ec, 14d84ed).

---
*Phase: 37-pwa-foundation*
*Completed: 2026-04-01*
