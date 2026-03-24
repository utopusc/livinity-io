---
phase: 42-container-edit-recreate
plan: 02
subsystem: ui
tags: [react, docker, container-edit, container-duplicate, container-rename, trpc]

# Dependency graph
requires:
  - phase: 42-container-edit-recreate/01
    provides: "recreateContainer, renameContainer mutations and inspectContainer query"
  - phase: 41-container-creation/02
    provides: "ContainerCreateForm component with tabbed form layout"
provides:
  - "Edit mode for ContainerCreateForm (pre-fill + recreate mutation)"
  - "Duplicate mode for ContainerCreateForm (pre-fill + empty name + create mutation)"
  - "Rename dialog with renameContainer mutation"
  - "Edit/Duplicate/Rename action buttons in container table and detail sheet"
affects: [container-management, server-control-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["detailToFormState mapping pattern for inspect-to-form conversion", "modal mode pattern via optional string props (editContainerName/duplicateContainerName)"]

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/routes/server-control/container-create-form.tsx"
    - "livos/packages/ui/src/routes/server-control/index.tsx"
    - "livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx"

key-decisions:
  - "Form mode determined by optional string props rather than explicit mode prop"
  - "detailToFormState leaves fields not in ContainerDetail empty rather than guessing"
  - "Edit mode disables name field and sets pullImage false since image is already present"

patterns-established:
  - "Modal mode pattern: optional string props (editContainerName/duplicateContainerName) on form components determine behavior"
  - "detailToFormState: standard conversion from Docker inspect data to form state"

requirements-completed: [EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07, UI-03]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 42 Plan 02: Container Edit/Duplicate/Rename UI Summary

**Edit/Duplicate/Rename UI with inspect-to-form pre-filling, recreate mutation in edit mode, and rename dialog**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T00:28:38Z
- **Completed:** 2026-03-23T00:33:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ContainerCreateForm supports edit mode (pre-filled from inspectContainer, recreate mutation, warning banner, disabled name field)
- ContainerCreateForm supports duplicate mode (pre-filled with empty name, uses existing createContainer mutation)
- Container table has Edit, Duplicate, and Rename action buttons alongside existing start/stop/restart/remove
- Detail sheet header has Edit and Duplicate icon buttons that close sheet and open form in correct mode
- RenameDialog component with renameContainer mutation integration
- Protected containers have Edit and Rename buttons disabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Add edit and duplicate modes to ContainerCreateForm** - `9c27b5f` (feat)
2. **Task 2: Add Edit/Duplicate/Rename actions to container table and detail sheet** - `9f92776` (feat)

## Files Created/Modified
- `livos/packages/ui/src/routes/server-control/container-create-form.tsx` - Added editContainerName/duplicateContainerName props, detailToFormState mapping, recreate mutation, warning banner, mode-dependent header/submit text
- `livos/packages/ui/src/routes/server-control/index.tsx` - Added editTarget/duplicateTarget/renameTarget state, Edit/Duplicate/Rename action buttons in container table, RenameDialog component, updated ContainerCreateForm and ContainerDetailSheet usage
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` - Added onEdit/onDuplicate callback props, Edit and Duplicate icon buttons in header

## Decisions Made
- Form mode determined by optional string props (editContainerName/duplicateContainerName) rather than explicit mode enum, keeping the API simple and avoiding breaking changes
- detailToFormState leaves fields not available in ContainerDetail (command, entrypoint, workingDir, user, hostname, labels) empty rather than guessing, since Docker inspect does not reliably expose all original create options
- Edit mode sets pullImage=false since the image is already present locally, avoiding unnecessary network calls on recreate

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources are wired (inspectContainer query provides real data for pre-filling, recreateContainer/renameContainer mutations are fully connected).

## Next Phase Readiness
- Phase 42 (container-edit-recreate) is fully complete
- All container edit workflow features are implemented (edit, duplicate, rename)
- Ready for verification and deployment

## Self-Check: PASSED

All files verified present. All commits (9c27b5f, 9f92776) verified in git log.

---
*Phase: 42-container-edit-recreate*
*Completed: 2026-03-23*
