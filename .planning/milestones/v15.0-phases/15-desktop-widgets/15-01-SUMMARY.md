---
phase: 15-desktop-widgets
plan: 01
subsystem: ui
tags: [widgets, css-grid, multi-cell, dnd-kit, localStorage, trpc-preferences]

# Dependency graph
requires: []
provides:
  - Widget type system with WidgetSize, WidgetType, WidgetMeta, WIDGET_CATALOG
  - Multi-cell grid support via colSpan/rowSpan in AppGrid and DraggableItem
  - Widget storage hooks (useDesktopWidgets) with localStorage + server sync
  - addDesktopWidget/removeDesktopWidget imperative helpers
affects: [15-desktop-widgets]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-cell CSS grid spans, spanMap for collision detection, widget catalog pattern]

key-files:
  created:
    - livos/packages/ui/src/modules/desktop/widgets/widget-types.ts
  modified:
    - livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx
    - livos/packages/ui/src/modules/desktop/desktop-content.tsx

key-decisions:
  - "Widget sizes use iOS/iPadOS-style system: small 2x2, medium 4x2, large 4x4 grid cells"
  - "Multi-cell DnD rejects drops when any target cell is occupied (no swap for multi-cell items)"
  - "Widget storage follows exact same pattern as folder storage (localStorage + trpcReact.preferences)"

patterns-established:
  - "spanMap pattern: AppGrid builds Map<id, {colSpan, rowSpan}> from items and passes to all helpers"
  - "Widget placeholder pattern: glassmorphism div showing widget type name, replaced by real components in plan 02"

requirements-completed: [WIDGET-01, WIDGET-02, WIDGET-08]

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 15 Plan 01: Widget Foundation Summary

**Widget type catalog with 4 types (clock, system-info-compact, system-info-detailed, quick-notes), multi-cell CSS grid support, and localStorage + server-synced widget storage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T23:10:35Z
- **Completed:** 2026-03-18T23:14:13Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Widget type system with WidgetSize (small/medium/large), WidgetType (4 types), WidgetMeta interface, and WIDGET_CATALOG
- Extended AppGrid for multi-cell items: DraggableItem with colSpan/rowSpan CSS grid spans, spanMap-aware collision detection, clamping, and DnD
- Widget storage via useDesktopWidgets hook following the same localStorage + trpcReact.preferences.set/get pattern as folders
- Widget placeholder items rendered in grid with glassmorphism styling and correct multi-cell spans

## Task Commits

Each task was committed atomically:

1. **Task 1: Create widget type definitions and size catalog** - `a9e7cc4` (feat)
2. **Task 2: Extend app-grid.tsx for multi-cell items** - `f0110bd` (feat)
3. **Task 3: Add widget storage hooks and wire widget items into grid** - `85a9de3` (feat)

## Files Created/Modified
- `livos/packages/ui/src/modules/desktop/widgets/widget-types.ts` - Widget type definitions, size catalog, WidgetMeta interface, createWidgetId/getWidgetSize helpers
- `livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx` - Multi-cell grid support: colSpan/rowSpan on AppGridItem and DraggableItem, spanMap, updated occupiedSet/firstFreeCell/clampLayout/ensureAllPositioned, multi-cell DnD rejection, DragOverlay sizing
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` - useDesktopWidgets hook, addDesktopWidget/removeDesktopWidget exports, widgetItems in gridItems with glassmorphism placeholders

## Decisions Made
- Widget sizes use iOS/iPadOS-style system: small 2x2, medium 4x2, large 4x4 grid cells
- Multi-cell DnD rejects drops when any target cell is occupied by another item (no swap for multi-cell)
- Single-cell swap behavior preserved exactly for non-widget items (backward compatible)
- Widget storage follows exact same localStorage + trpcReact.preferences pattern as folder storage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Widget type system ready for Plan 02 to implement actual widget components (clock, system-info, notes)
- Multi-cell grid ready for any size widget to be rendered
- useDesktopWidgets hook exported for Plan 03 widget picker dialog
- addDesktopWidget/removeDesktopWidget ready for context menu integration

## Self-Check: PASSED

All 3 files verified present. All 3 task commits verified in git history.

---
*Phase: 15-desktop-widgets*
*Completed: 2026-03-18*
