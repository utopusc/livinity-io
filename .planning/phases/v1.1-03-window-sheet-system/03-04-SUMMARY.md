---
phase: v1.1-03-window-sheet-system
plan: 04
subsystem: ui
tags: [semantic-tokens, immersive-dialog, window-resize, animation, framer-motion, radix]

# Dependency graph
requires:
  - phase: v1.1-01-design-system
    provides: semantic color/typography/radius/elevation tokens
  - phase: v1.1-03-window-sheet-system (03-01)
    provides: shared/dialog.ts dialogContentClass with semantic tokens
  - phase: v1.1-03-window-sheet-system (03-03)
    provides: window chrome and body redesign with semantic tokens
provides:
  - ImmersiveDialog fully migrated to semantic tokens
  - Window resize capability with UPDATE_SIZE action in window-manager
  - Resize handles on all 4 edges and 4 corners of windows
  - Smoother exit animations via increased EXIT_DURATION_MS (150ms)
affects: [v1.1-04-settings-panel, v1.1-05-ai-chat, v1.1-06-app-store-files]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Window resize via global mouse events (same pattern as drag)"
    - "Resize direction string encoding (n/s/e/w/ne/nw/se/sw)"
    - "Minimum window size enforcement (400x400) in resize handler"

key-files:
  modified:
    - livos/packages/ui/src/components/ui/immersive-dialog.tsx
    - livos/packages/ui/src/providers/window-manager.tsx
    - livos/packages/ui/src/modules/window/window.tsx
    - livos/packages/ui/src/utils/dialog.ts

key-decisions:
  - "ImmersiveDialog title promoted to text-text-primary (0.90) from text-white/80 (0.80) for prominence"
  - "Icon message description text-text-secondary (0.60) from text-white/50 (0.50) for visibility"
  - "KeyValue key opacity-60 replaced with text-text-secondary semantic token"
  - "Window resize minimum 400x400 matches getResponsiveSize minimum constraint"
  - "EXIT_DURATION_MS 100ms -> 150ms (50% longer) for smoother close feel"

patterns-established:
  - "Window resize direction encoding: single string with compass directions (n/s/e/w combinations)"
  - "Resize state refs pattern: resizeStartPos/Size/Position refs for delta calculation"

# Metrics
duration: 6min
completed: 2026-02-06
---

# Phase 3 Plan 4: ImmersiveDialog Semantic Tokens, Window Resize, and Animation Polish Summary

**ImmersiveDialog migrated to semantic tokens (heading-lg/body-lg/body-sm/caption/text-primary/secondary/tertiary), window resize handles on 8 edges/corners with 400x400 min, EXIT_DURATION_MS increased to 150ms**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-06T20:12:22Z
- **Completed:** 2026-02-06T20:18:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ImmersiveDialog fully migrated: title, description, body text, separator, split content ring, icon messages, icon circles, icon text, KeyValue all using semantic tokens
- Window resize system: UPDATE_SIZE reducer action, updateWindowSize context method, 8 resize handles with cursor feedback, 400x400 minimum enforcement, north/west resize updates position
- Exit animation duration increased from 100ms to 150ms for smoother sheet and dialog close animations

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate ImmersiveDialog to semantic tokens** - `6a97853` (feat)
2. **Task 2: Add window resize handles and update EXIT_DURATION_MS** - `42bfa7f` (feat)

## Files Created/Modified
- `livos/packages/ui/src/components/ui/immersive-dialog.tsx` - Full semantic token migration: title (text-heading-lg text-text-primary), description (text-body-lg text-text-tertiary), body (text-body-lg text-text-primary), separator (border-border-default), split ring (ring-border-subtle), icon containers (rounded-radius-sm border-border-subtle bg-surface-base), icon text (text-body-sm, text-caption, text-text-secondary), KeyValue (text-body, text-text-secondary)
- `livos/packages/ui/src/providers/window-manager.tsx` - Added UPDATE_SIZE action type, reducer case, updateWindowSize callback and context method
- `livos/packages/ui/src/modules/window/window.tsx` - Added resize state, handleResizeStart/Move/Up handlers, updated useEffect for resize events, 8 resize handle divs (4 edges + 4 corners)
- `livos/packages/ui/src/utils/dialog.ts` - EXIT_DURATION_MS 100 -> 150

## Decisions Made
- [v1.1-03-04]: ImmersiveDialog title text-text-primary (0.90) from text-white/80 (0.80) -- title should be prominent
- [v1.1-03-04]: Icon message description visibility increased: text-text-secondary (0.60) from text-white/50 (0.50)
- [v1.1-03-04]: KeyValue key: opacity-60 replaced with text-text-secondary for proper semantic color
- [v1.1-03-04]: Window resize 400x400 minimum matches getResponsiveSize constraint
- [v1.1-03-04]: EXIT_DURATION_MS 150ms (50% longer) balances smoothness and responsiveness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Window & Sheet System) is now complete: all 4 plans executed
- All dialog variants migrated: Dialog, AlertDialog, Sheet, ImmersiveDialog
- Window system complete: chrome, body, drag, and resize
- Ready for Phase 4 (Settings Panel) which will consume these migrated components

---
*Phase: v1.1-03-window-sheet-system*
*Completed: 2026-02-06*
