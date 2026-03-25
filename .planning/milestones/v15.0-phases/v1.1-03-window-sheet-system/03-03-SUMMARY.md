---
phase: v1.1-03-window-sheet-system
plan: 03
subsystem: ui
tags: [tailwind, semantic-tokens, framer-motion, window, drag-feedback]

# Dependency graph
requires:
  - phase: v1.1-01-design-system
    provides: "Semantic tokens (border-border-emphasis, border-border-default, text-text-primary, text-text-secondary, text-body, h-icon-md, shadow-elevation-md, rounded-radius-xl, hover:bg-destructive)"
  - phase: v1.1-03-window-sheet-system (03-01)
    provides: "Dialog foundation tokens established, Phase 3 token migration pattern"
provides:
  - "Window chrome with semantic tokens and cleaner minimal style (WS-01)"
  - "Window body with semantic tokens and reduced blur (WS-02)"
  - "Drag visual feedback via deeper shadow and opacity reduction (WS-03)"
affects: [v1.1-03-window-sheet-system (03-04 sheet system)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Framer Motion animate prop for dynamic drag feedback (not style prop, since animate overrides style for shared properties)"
    - "isDragging ternary in boxShadow for deeper lifted shadow during drag"

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/modules/window/window-chrome.tsx"
    - "livos/packages/ui/src/modules/window/window.tsx"
    - "livos/packages/ui/src/modules/window/window-content.tsx"

key-decisions:
  - "Drag opacity feedback via Framer Motion animate prop instead of style prop (animate overrides style for shared properties)"
  - "Window body boxShadow isDragging ternary in style prop (boxShadow not animated by Framer Motion, so style prop works correctly)"

patterns-established:
  - "Framer Motion drag feedback: use animate prop for opacity, style prop for boxShadow"
  - "Window chrome semantic pattern: border-border-emphasis for floating chrome elements"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 3 Plan 03: Window Chrome & Body Redesign Summary

**Window chrome and body migrated to semantic tokens with cleaner minimal borders, reduced glassmorphism, and visual drag feedback via deeper shadow and opacity**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06T20:04:09Z
- **Completed:** 2026-02-06T20:08:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Window chrome redesigned with cleaner minimal style: single-pixel border-border-emphasis, bg-black/80, backdrop-blur-lg, shadow-elevation-md, semantic typography and icon sizing, semantic destructive hover
- Window body migrated to semantic tokens: rounded-radius-xl, backdrop-blur-xl, border-border-default
- Drag visual feedback added: deeper shadow (0.5 -> 0.7 opacity, 50px -> 60px spread), brighter ring (0.05 -> 0.08), and subtle opacity reduction (0.95 body, 0.9 chrome) during drag
- Window content unknown app text migrated to text-text-secondary

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign window chrome with cleaner minimal styling** - `9538349` (feat)
2. **Task 2: Migrate window body to semantic tokens and add drag feedback** - `f492c5b` (feat)

## Files Created/Modified
- `livos/packages/ui/src/modules/window/window-chrome.tsx` - Window chrome with semantic tokens: border-border-emphasis, shadow-elevation-md, text-body, text-text-primary, text-text-secondary, h-icon-md, hover:bg-destructive
- `livos/packages/ui/src/modules/window/window.tsx` - Window body with semantic tokens (rounded-radius-xl, backdrop-blur-xl, border-border-default) and drag visual feedback (isDragging ternary for boxShadow and opacity)
- `livos/packages/ui/src/modules/window/window-content.tsx` - Unknown app text migrated from text-white/50 to text-text-secondary

## Decisions Made
- **Drag opacity via Framer Motion animate prop:** Plan specified CSS `style.opacity` for drag feedback, but Framer Motion's `animate` prop overrides `style` for shared properties (like `opacity`). Used `animate={{opacity: isDragging ? 0.95 : 1}}` instead to ensure the drag feedback actually takes effect. The `boxShadow` remains in `style` since Framer Motion doesn't animate it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drag opacity moved from style to Framer Motion animate prop**
- **Found during:** Task 2 (Window body drag feedback)
- **Issue:** Plan specified `opacity: isDragging ? 0.95 : 1` in the style prop and `transition: 'box-shadow 0.2s ease, opacity 0.2s ease'` for CSS transitions. However, Framer Motion's `animate={{opacity: 1}}` overrides `style.opacity`, making the drag opacity feedback invisible.
- **Fix:** Moved opacity control into Framer Motion's `animate` prop: `animate={{opacity: isDragging ? 0.95 : 1, scale: 1, y: 0}}` for body and `animate={{opacity: isDragging ? 0.9 : 1, y: 0, scale: 1}}` for chrome. Removed CSS transition strings since Framer Motion handles the animation via its spring physics.
- **Files modified:** livos/packages/ui/src/modules/window/window.tsx
- **Verification:** `isDragging` ternary appears in both animate props, TypeScript compiles
- **Committed in:** f492c5b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Bug fix necessary for drag feedback to actually work. Same visual outcome, correct implementation approach for Framer Motion.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Window chrome and body fully migrated to semantic tokens
- Drag visual feedback system established
- Ready for 03-04 (sheet/bottom sheet system) if applicable
- All existing drag mechanics, Framer Motion spring physics, and component exports preserved

---
*Phase: v1.1-03-window-sheet-system*
*Completed: 2026-02-06*
