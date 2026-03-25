---
phase: 35-docker-backend-container-list-actions-ui
plan: 02
subsystem: ui
tags: [react, trpc, tabs, docker, container-management, shadcn, tailwind]

# Dependency graph
requires:
  - phase: 35-docker-backend-container-list-actions-ui
    plan: 01
    provides: "Docker tRPC router (docker.listContainers, docker.manageContainer) and ContainerInfo types"
provides:
  - "Tabbed Server Management dashboard UI with Containers as default tab"
  - "use-containers hook wrapping docker.listContainers (5s polling) and docker.manageContainer"
  - "Container table with Name, Image, State badge, Ports, inline Actions"
  - "Protected container lock indicators with disabled Stop/Remove"
  - "Remove confirmation dialog requiring typed container name"
  - "Placeholder tabs for Images, Volumes, Networks, PM2, Monitoring"
  - "Server-control registered as fullHeightApp with 1100x750 window"
affects: [36-docker-images-volumes-networks, 37-pm2-management, 38-monitoring, 39-container-detail]

# Tech tracking
tech-stack:
  added: []
  patterns: ["useContainers hook pattern for docker data + mutations", "Tabbed dashboard with per-tab overflow-auto scroll"]

key-files:
  created:
    - "livos/packages/ui/src/hooks/use-containers.ts"
  modified:
    - "livos/packages/ui/src/routes/server-control/index.tsx"
    - "livos/packages/ui/src/modules/window/window-content.tsx"
    - "livos/packages/ui/src/providers/window-manager.tsx"

key-decisions:
  - "Kept ResourceCard components and chart data inline in server-control rather than extracting to separate component"
  - "Used shadcn Table for container list instead of the previous card-based layout for better information density"
  - "PlaceholderTab component for future tabs with icon + Coming soon text"

patterns-established:
  - "useContainers hook: centralized container state with 5s polling + manage mutation + action result toast state"
  - "Tabbed dashboard: Tabs fill remaining height via flex-1 min-h-0, each TabsContent uses overflow-auto"
  - "Remove confirmation dialog: type container name to enable destructive action"

requirements-completed: [UI-01, UI-04, UI-05, DOCK-07, SEC-03]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 35 Plan 02: Frontend Server Management Dashboard Summary

**Tabbed Server Management UI with container table, protected-container lock indicators, type-to-confirm remove dialog, and 5-second auto-refresh via useContainers hook**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T21:04:05Z
- **Completed:** 2026-03-22T21:08:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rewrote Server Control as tabbed Server Management dashboard with Containers as default tab and 5 placeholder tabs for future phases
- Container table shows Name (with lock icon for protected), Image, State (color-coded badge), Ports (formatted), and inline action buttons
- Protected containers have Stop and Remove buttons disabled; Remove opens a confirmation dialog requiring exact name typing
- Replaced old ai.listDockerContainers/ai.manageDockerContainer with new docker.listContainers/docker.manageContainer endpoints
- Registered server-control as fullHeightApp with increased 1100x750 default window for table layout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create use-containers hook and rewrite server-control with tabbed UI + container table** - `2486b6d` (feat)
2. **Task 2: Register server-control as fullHeightApp and increase default window size** - `e65ab42` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-containers.ts` - Hook wrapping docker.listContainers (5s polling) and docker.manageContainer mutation with action result state
- `livos/packages/ui/src/routes/server-control/index.tsx` - Complete rewrite: tabbed Server Management dashboard with container table, state badges, protected indicators, remove dialog
- `livos/packages/ui/src/modules/window/window-content.tsx` - Added LIVINITY_server-control to fullHeightApps set
- `livos/packages/ui/src/providers/window-manager.tsx` - Increased default window size to 1100x750

## Decisions Made
- Kept ResourceCard components and chart data inline rather than extracting to shared component (consistency with existing code)
- Used shadcn Table component for container list instead of the previous card-per-container layout for better information density at scale
- PlaceholderTab component pattern for future tabs keeps the structure clean and easily replaceable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors exist in `server-control/index.tsx` related to tabler icons' `ForwardRefExoticComponent<IconProps>` not being assignable to the custom `ComponentType<{size?: number}>` prop types. These identical errors existed in the original file and are a project-wide pattern (out of scope for this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Server Management tabbed UI shell is ready for Phase 36 (Docker Images/Volumes/Networks) to fill placeholder tabs
- useContainers hook pattern established for similar hooks in future phases
- fullHeightApp registration ensures tab scrolling works correctly

## Self-Check: PASSED

- All 4 created/modified files exist on disk
- Commit 2486b6d (Task 1) found in git log
- Commit e65ab42 (Task 2) found in git log
- SUMMARY.md exists at expected path

---
*Phase: 35-docker-backend-container-list-actions-ui*
*Completed: 2026-03-22*
