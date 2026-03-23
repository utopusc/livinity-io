---
phase: 44-bulk-ops-images-networks-volumes
plan: 02
subsystem: docker, ui
tags: [docker, images, pull, tag, history, tRPC, react]

# Dependency graph
requires:
  - phase: 44-bulk-ops-images-networks-volumes/01
    provides: "Images tab with list/remove/prune and base table UI"
provides:
  - "pullImage backend endpoint (blocking pull with followProgress)"
  - "tagImage backend endpoint (docker tag API)"
  - "imageHistory backend query (layer-by-layer Dockerfile history)"
  - "PullImageDialog UI component with loading state"
  - "TagImageDialog UI component with repo/tag fields"
  - "ImageHistoryRow expandable component per image row"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Blocking Docker pull via followProgress promise wrapper"
    - "Expandable table rows with Fragment for layer-detail inline expansion"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/docker/types.ts"
    - "livos/packages/livinityd/source/modules/docker/docker.ts"
    - "livos/packages/livinityd/source/modules/docker/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "livos/packages/ui/src/hooks/use-images.ts"
    - "livos/packages/ui/src/routes/server-control/index.tsx"

key-decisions:
  - "Blocking pull approach (no streaming progress) per CONTEXT.md -- pulls typically < 60s"
  - "Layer history rendered inline as expanded table rows rather than separate modal"

patterns-established:
  - "Expandable table rows using Fragment + conditional render of detail component"
  - "Action buttons grouped in flex container with stopPropagation for row click safety"

requirements-completed: [IMG-01, IMG-02, IMG-03]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 44 Plan 02: Image Pull/Tag/History Summary

**Docker image pull with blocking followProgress, tag with repo:tag dialog, and expandable layer history per image row**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T01:10:10Z
- **Completed:** 2026-03-23T01:14:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Backend pullImage endpoint using Dockerode's followProgress for blocking pull with proper error handling
- Backend tagImage endpoint wrapping docker tag API with repo/tag parameters
- Backend imageHistory query mapping layer entries to typed ImageHistoryEntry objects
- Frontend Pull Image dialog with image name input and loading state during pull
- Frontend Tag Image dialog with repo/tag fields and current tag reference
- Expandable image rows showing layer-by-layer Dockerfile commands, sizes, and dates

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend -- pullImage, tagImage, imageHistory endpoints** - `486b810` (feat)
2. **Task 2: Frontend -- Pull Image dialog, Tag dialog, expandable layer history** - `34272e7` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` - Added ImageHistoryEntry interface
- `livos/packages/livinityd/source/modules/docker/docker.ts` - Added pullImage, tagImage, imageHistory functions
- `livos/packages/livinityd/source/modules/docker/routes.ts` - Added pullImage mutation, tagImage mutation, imageHistory query
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added docker.pullImage, docker.tagImage to httpOnlyPaths
- `livos/packages/ui/src/hooks/use-images.ts` - Added pullImage, tagImage mutations with isPulling/isTagging states
- `livos/packages/ui/src/routes/server-control/index.tsx` - Added PullImageDialog, TagImageDialog, ImageHistoryRow components; updated ImagesTab with pull button, tag button, expand chevron

## Decisions Made
- Blocking pull approach (no streaming progress) per CONTEXT.md -- pulls typically < 60s, simple approach
- Layer history rendered inline as expanded table rows (Fragment + conditional render) rather than separate modal for quick inspection UX

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources are wired to live Docker API endpoints.

## Next Phase Readiness
- Image management features (pull, tag, history) complete
- Ready for Plan 03 (remaining bulk ops, networks, volumes features)

## Self-Check: PASSED

All 6 files verified present. Both task commits (486b810, 34272e7) confirmed in git log.

---
*Phase: 44-bulk-ops-images-networks-volumes*
*Completed: 2026-03-23*
