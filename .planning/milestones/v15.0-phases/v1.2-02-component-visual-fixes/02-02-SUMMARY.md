---
phase: v1.2-02-component-visual-fixes
plan: 02
subsystem: ui
tags: [sheet, dialog, window, border, shadow, backdrop-brightness, tailwind]

# Dependency graph
requires:
  - phase: v1.2-01-token-foundation
    provides: Updated semantic token values (border-default 0.16, border-emphasis 0.30, shadow-elevation-lg)
provides:
  - Sheet with brighter wallpaper bleed-through (0.38) and top border on bottom variants
  - Dialog with upgraded border visibility (border-default instead of border-subtle)
  - Window with emphasis border and elevation shadow class
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tailwind shadow class with inline boxShadow override (undefined lets class apply, inline overrides during drag)"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/shadcn-components/ui/sheet.tsx
    - livos/packages/ui/src/shadcn-components/ui/shared/dialog.ts
    - livos/packages/ui/src/modules/window/window.tsx

key-decisions:
  - "Window inline boxShadow set to undefined for non-dragging state so Tailwind shadow-elevation-lg applies"

patterns-established:
  - "isDragging ternary: inline shadow during drag, undefined lets Tailwind class apply at rest"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 2 Plan 2: Sheet + Dialog + Window Visual Fixes Summary

**Sheet backdrop brightness 0.30->0.38 with top border, dialog border-subtle->border-default, window border-emphasis + shadow-elevation-lg with inline boxShadow fix**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T07:01:03Z
- **Completed:** 2026-02-07T07:03:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Sheet wallpaper bleed-through brightened from 0.30 to 0.38 for warmer color showing through
- Bottom sheet variants (bottom, bottom-zoom) now have visible top border (border-t border-border-default)
- Dialog border upgraded from border-subtle (0.10 opacity) to border-default (0.16 opacity) for visible edges
- Window border upgraded from border-default (0.16) to border-emphasis (0.30) for clear floating separation
- Window shadow-elevation-lg Tailwind class added; inline boxShadow non-dragging value set to undefined so the class applies at rest while inline shadow still overrides during drag

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade sheet backdrop brightness and add top border** - `4cc4bf8` (fix)
2. **Task 2: Upgrade dialog border and window border/shadow** - `5e5a23b` (fix)

## Files Created/Modified
- `livos/packages/ui/src/shadcn-components/ui/sheet.tsx` - Backdrop brightness 0.38, border-t on bottom variants
- `livos/packages/ui/src/shadcn-components/ui/shared/dialog.ts` - border-border-default (was border-subtle)
- `livos/packages/ui/src/modules/window/window.tsx` - border-border-emphasis, shadow-elevation-lg, inline boxShadow undefined

## Decisions Made
- Window inline boxShadow set to undefined for non-dragging state so Tailwind shadow-elevation-lg class applies (inline styles override Tailwind, so removing the inline value lets the class take effect)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CV-03, CV-04, CV-07 requirements complete
- Ready for remaining plans: 02-03 (File Manager + Menu) and 02-04 (Button highlight/height)

---
*Phase: v1.2-02-component-visual-fixes*
*Completed: 2026-02-07*
