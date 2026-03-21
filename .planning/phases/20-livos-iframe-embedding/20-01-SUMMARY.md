---
phase: 20-livos-iframe-embedding
plan: 01
subsystem: ui
tags: [iframe, postMessage, tRPC, react, app-store]

# Dependency graph
requires:
  - phase: 19-postmessage-bridge-protocol
    provides: postMessage bridge types and store-side send/receive logic
provides:
  - iframe-based App Store window in LivOS rendering livinity.io/store
  - postMessage bridge listener handling install/uninstall/open/ready commands
  - Backend getApiKey tRPC route for full API key retrieval
  - Bidirectional communication between LivOS parent and store iframe
affects: [app-store, platform-connection, app-install]

# Tech tracking
tech-stack:
  added: []
  patterns: [iframe-embedding-with-postMessage-bridge, imperative-trpc-mutations-in-event-handlers, ref-based-stale-closure-prevention]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-app-store-bridge.ts
  modified:
    - livos/packages/livinityd/source/modules/platform/routes.ts
    - livos/packages/ui/src/modules/window/app-contents/app-store-content.tsx
    - livos/packages/ui/src/modules/window/window-content.tsx

key-decisions:
  - "tRPC path is domain.platform.getApiKey (platform router nested under domain)"
  - "Use trpcClient (imperative) for mutations in postMessage event handlers, trpcReact.useUtils() for cache invalidation"
  - "Refs for utils/domain/iframeRef to prevent stale closures in addEventListener callback"
  - "Origin validation accepts *.livinity.io and localhost in dev mode"

patterns-established:
  - "iframe postMessage bridge: origin validation + typed message protocol + useCallback handlers"
  - "Imperative tRPC calls in event-driven contexts (not React hooks) with manual cache invalidation"

requirements-completed: [EMBED-01, EMBED-02, EMBED-03, EMBED-04, EMBED-05]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 20 Plan 01: LivOS iframe Embedding Summary

**iframe App Store window embedding livinity.io/store with bidirectional postMessage bridge for install/uninstall/status commands**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T04:22:36Z
- **Completed:** 2026-03-21T04:27:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced React-rendered App Store with iframe embedding livinity.io/store, passing API key and hostname as query params
- Created useAppStoreBridge hook that listens for postMessage commands (ready/install/uninstall/open) and executes them via tRPC
- Added getApiKey tRPC route returning full API key from Redis for iframe URL construction
- Bidirectional communication: LivOS sends app status on ready + after every install/uninstall, iframe receives operation results

## Task Commits

Each task was committed atomically:

1. **Task 1: iframe App Store window + backend API key route** - `53e6ae7` (feat)
2. **Task 2: postMessage bridge listener + install/uninstall executor** - `a1ba45f` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/platform/routes.ts` - Added getApiKey privateProcedure query returning full API key from Redis
- `livos/packages/ui/src/modules/window/app-contents/app-store-content.tsx` - Replaced React app store with iframe to livinity.io/store
- `livos/packages/ui/src/modules/window/window-content.tsx` - Added LIVINITY_app-store to fullHeightApps, removed initialRoute prop
- `livos/packages/ui/src/hooks/use-app-store-bridge.ts` - postMessage bridge listener with origin validation, install/uninstall/open/ready handlers

## Decisions Made
- tRPC path is `domain.platform.getApiKey` since platform router is nested under domain router (plan referenced it as `platform.getApiKey` which would not compile)
- Used trpcClient (imperative vanilla client) for mutations inside event handlers since React hooks cannot be called in callbacks
- Used useRef pattern for utils/domain/iframeRef to prevent stale closures in the addEventListener callback
- Origin validation accepts all *.livinity.io subdomains plus localhost in development mode
- App state mapping: running/ready -> 'running', stopped/stopping -> 'stopped', everything else -> 'not_installed'

## Deviations from Plan

None - plan executed exactly as written. One minor correction: the plan referenced `trpcReact.platform.getApiKey.useQuery()` but the actual tRPC path is `trpcReact.domain.platform.getApiKey.useQuery()` since the platform router is nested under the domain router. This was corrected during implementation.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- iframe embedding is complete, the App Store window now renders the remote store
- The postMessage bridge handles all four command types (ready, install, uninstall, open)
- Status updates flow bidirectionally between LivOS and the iframe store
- Ready for end-to-end testing with a connected LivOS instance

## Self-Check: PASSED

All 5 files verified present. Both task commits (53e6ae7, a1ba45f) verified in git log.

---
*Phase: 20-livos-iframe-embedding*
*Completed: 2026-03-21*
