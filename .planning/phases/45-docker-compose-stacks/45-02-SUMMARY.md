---
phase: 45-docker-compose-stacks
plan: 02
subsystem: ui
tags: [docker-compose, stacks, react, trpc, hooks, yaml-editor]

# Dependency graph
requires:
  - phase: 45-docker-compose-stacks
    plan: 01
    provides: Stack tRPC routes (listStacks, deployStack, editStack, controlStack, removeStack, getStackCompose, getStackEnv)
provides:
  - useStacks hook wrapping all 7 stack tRPC routes
  - StacksTab component with stack list, status badges, expand, action buttons
  - DeployStackForm full-page overlay with YAML textarea and env vars
  - RemoveStackDialog with volume cleanup checkbox
  - Stacks tab between Networks and PM2 in Server Management
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [monospace YAML textarea for compose editing, full-page overlay form for stack deploy/edit]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-stacks.ts
  modified:
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "DeployStackForm uses absolute inset-0 overlay (same pattern as ContainerCreateForm) not Dialog"
  - "YAML editor uses simple monospace textarea (no syntax highlighting per CONTEXT.md)"
  - "Edit mode queries getStackCompose and getStackEnv to prefill form; name field is read-only"
  - "Status badges: green for running, red for stopped, yellow/amber for partial"

patterns-established:
  - "Stack form overlay: absolute inset-0 z-50 with header/body/footer layout"
  - "Env var rows: array of key-value inputs with add/remove buttons"

requirements-completed: [STACK-01, STACK-02, STACK-03, STACK-04, STACK-05, STACK-06, UI-04]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 45 Plan 02: Stack Frontend UI Summary

**Stacks tab with list table, deploy/edit form overlay with YAML textarea, env var rows, and remove dialog with volume cleanup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T01:37:15Z
- **Completed:** 2026-03-23T01:40:56Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created use-stacks.ts hook wrapping all 7 stack tRPC routes with actionResult state for toast messages
- Added StacksTab component with stack list table showing name, status badge, container count, and action buttons (start/stop/restart/edit/remove)
- Built DeployStackForm full-page overlay with stack name input, monospace YAML textarea, and env var key-value rows
- Edit mode prefills YAML and env vars from getStackCompose/getStackEnv queries; name field is read-only; button says "Redeploy"
- Added RemoveStackDialog with "Also remove associated volumes" checkbox
- Inserted Stacks tab between Networks and PM2 in the Server Management tab bar
- Clicking a stack row expands to show constituent containers (name, image, state)

## Task Commits

Each task was committed atomically:

1. **Task 1: Stacks hook and StacksTab UI** - `1bedad3` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-stacks.ts` - React hook wrapping all stack tRPC queries and mutations with actionResult state
- `livos/packages/ui/src/routes/server-control/index.tsx` - Added StacksTab component, DeployStackForm, RemoveStackDialog, and Stacks tab trigger/content

## Decisions Made
- Used absolute inset-0 overlay for DeployStackForm (same pattern as ContainerCreateForm) for maximum space
- Simple monospace textarea for YAML editing per CONTEXT.md guidance (no syntax highlighting needed)
- Edit mode fetches current compose YAML and env vars via separate queries, prefills form, locks name field
- Status badges use same color scheme as PM2StatusBadge: green=running, red=stopped, amber=partial
- Action buttons follow existing container/PM2 pattern with ActionButton component and stopPropagation wrappers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full Docker Compose stack management UI complete (both backend and frontend)
- All 7 requirements addressed: stack list (STACK-01), deploy (STACK-02), edit (STACK-03), start/stop (STACK-04), remove with volumes (STACK-05), env vars (STACK-06), tab placement (UI-04)
- Phase 45 (docker-compose-stacks) is fully complete

## Self-Check: PASSED
