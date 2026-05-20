---
phase: 183-polish-tmux-skipperms-gear
plan: 02
subsystem: ui
tags: [react, sidebar, window-manager, vitest, settings]

requires:
  - phase: 174-sidebar-tree
    provides: SidebarFooter with onOpenSettings prop stub + SidebarTree mount point
  - phase: 182-settings-restructure
    provides: Settings route + LIVINITY_settings window id

provides:
  - SidebarTree gear icon wired to open Settings window via WindowManager
  - Idempotent open: focusWindow if Settings already open, openWindow otherwise
  - Guard: null windowManager (outside provider) does not throw

affects: [settings-panel, window-manager-consumers, sidebar-footer-consumers]

tech-stack:
  added: []
  patterns:
    - "Idempotent window-open pattern: windows.find(w => w.appId === 'LIVINITY_settings') → focusWindow/openWindow"
    - "useWindowManagerOptional in sidebar component: safe outside-provider use with null guard"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx

key-decisions:
  - "SidebarFooter rendered in BOTH return paths (empty-state + normal) so gear is always visible"
  - "Empty-state layout changed from items-center/justify-center wrapper to flex-col with flex-1 center area + footer pin at bottom"
  - "useWindowManagerOptional hook called before early-return check to maintain React hooks ordering"

requirements-completed:
  - V38-sidebar-settings-gear

duration: 10min
completed: 2026-05-20
---

# Phase 183 Plan 02: Sidebar gear → Settings window Summary

**SidebarFooter gear icon wired to idempotent Settings window open via useWindowManagerOptional — focusWindow if already open, openWindow otherwise**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-20T11:38:00Z
- **Completed:** 2026-05-20T11:42:00Z
- **Tasks:** 2 (RED + GREEN TDD)
- **Files modified:** 2

## Accomplishments

- `useWindowManagerOptional` + `SidebarFooter` imported into SidebarTree
- `handleOpenSettings` implements idempotent pattern: finds existing LIVINITY_settings window → focusWindow; else openWindow
- SidebarFooter rendered in both the empty-state branch and the normal (tree) branch
- Null guard: if windowManager unavailable (outside WindowManagerProvider) handler returns immediately
- All 54 sidebar-tree suite tests pass (existing + 4 new T-GEAR-1 through T-GEAR-4)

## Task Commits

1. **Task 1: RED** - `123f9a56` (test): add failing tests for sidebar gear → settings window
2. **Task 2: GREEN** - `64444b74` (feat): sidebar gear opens Settings window (idempotent via focusWindow)

## Files Created/Modified

- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` - Added imports, handleOpenSettings hook, SidebarFooter in both return paths
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx` - Added @/providers/window-manager mock + Phase 183 gear describe block

## Decisions Made

- SidebarFooter placed in both return paths so the gear is always visible (empty vault = still accessible Settings)
- Empty-state JSX refactored from `flex-col items-center justify-center` to `flex-col` + `flex-1 items-center justify-center` inner div + `SidebarFooter` sibling — pinning footer at bottom without centering it
- Module-level `mockWindowManager` variable used in mock factory (not inside beforeEach) due to Vitest hoist semantics

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Threat Flags

None — T-183-05 through T-183-07 addressed in plan threat model. openWindow args are static string literals, no user input.

## Known Stubs

None — gear click is fully wired.

## Next Phase Readiness

- Gear icon in sidebar now opens Settings dock window
- Idempotency prevents duplicate Settings windows
- Phase 182 AiChatSettingsPanel confirm-dialog mitigation verified intact (Phase 183 does not touch that file)

---
*Phase: 183-polish-tmux-skipperms-gear*
*Completed: 2026-05-20*
