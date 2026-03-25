---
phase: 19-postmessage-bridge-protocol
plan: 01
subsystem: ui
tags: [postmessage, iframe, bridge, react-hooks, typescript]

# Dependency graph
requires:
  - phase: 18-store-ui
    provides: App Store UI with types, store-provider context, app-detail page, app-card components
provides:
  - TypeScript type definitions for bidirectional postMessage protocol (StoreToLivOS and LivOSToStore)
  - usePostMessage hook with iframe detection, origin validation, send/receive handlers
  - Dynamic Install/Open/Start/Uninstall buttons on app detail page wired to postMessage
  - Dynamic status badges on app cards reflecting installed/running/stopped state
  - Graceful degradation when store is not embedded in an iframe
affects: [20-livos-iframe-embedding, store-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [postMessage bridge with origin validation, iframe detection via window.self !== window.top, optimistic UI updates on install]

key-files:
  created:
    - platform/web/src/app/store/hooks/use-post-message.ts
  modified:
    - platform/web/src/app/store/types.ts
    - platform/web/src/app/store/store-provider.tsx
    - platform/web/src/app/store/[id]/app-detail-client.tsx
    - platform/web/src/app/store/components/app-card.tsx

key-decisions:
  - "postMessage sends use targetOrigin '*' since LivOS parent origin varies per instance; security enforced on receive side via origin validation"
  - "Optimistic UI update on install -- sets status to 'stopped' immediately while waiting for parent confirmation"
  - "Origin validation allows *.livinity.io subdomains plus localhost in development mode"
  - "Graceful degradation: non-embedded store shows informational text instead of Install button"

patterns-established:
  - "postMessage bridge pattern: usePostMessage hook manages send/receive, StoreProvider exposes via context"
  - "iframe detection: try/catch around window.self !== window.top for cross-origin safety"
  - "Dynamic UI badges: IIFE pattern inside JSX for conditional rendering based on app status"

requirements-completed: [BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, BRIDGE-05, BRIDGE-06]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 19 Plan 01: postMessage Bridge Protocol Summary

**Bidirectional postMessage bridge between store iframe and LivOS parent with origin-validated install/uninstall/open/status messaging and dynamic UI state**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T04:08:27Z
- **Completed:** 2026-03-21T04:11:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full TypeScript type definitions for bidirectional postMessage protocol (StoreToLivOS: ready/install/uninstall/open; LivOSToStore: status/installed/uninstalled)
- usePostMessage hook with iframe detection, origin validation against *.livinity.io, message send/receive, and optimistic UI updates
- App detail page Install button replaced with context-aware buttons (Install/Open/Start/Uninstall) based on app status and iframe embedding
- App cards show dynamic status badges (green Open, amber Stopped, teal Get, gray Get) based on bridge state
- Graceful degradation when store is accessed standalone (not in iframe)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define postMessage types and create usePostMessage hook** - `4d1b707` (feat)
2. **Task 2: Wire bridge into StoreProvider and update Install button + app cards** - `f689117` (feat)

## Files Created/Modified
- `platform/web/src/app/store/types.ts` - Added StoreToLivOSMessage, LivOSToStoreMessage, AppStatus types; extended StoreContextValue with bridge fields
- `platform/web/src/app/store/hooks/use-post-message.ts` - New hook: iframe detection, origin validation, postMessage send/receive, status state management
- `platform/web/src/app/store/store-provider.tsx` - Integrated usePostMessage hook, exposed bridge state through StoreContext
- `platform/web/src/app/store/[id]/app-detail-client.tsx` - Replaced placeholder alert with dynamic Install/Open/Start/Uninstall buttons
- `platform/web/src/app/store/components/app-card.tsx` - Replaced static "Get" badge with dynamic status badges

## Decisions Made
- **targetOrigin '*' for sends:** LivOS parent origin varies per user instance, so we cannot hardcode it. Security is enforced on the receive side with origin validation on all incoming messages.
- **Optimistic install UI:** When sendInstall is called, status is immediately set to 'stopped' (installing state) so the UI reacts before parent confirmation arrives.
- **Wildcard subdomain matching:** Origin validation uses regex to allow any *.livinity.io subdomain, supporting both production and per-user LivOS instances.
- **IIFE rendering pattern:** Used immediately-invoked function expressions inside JSX for clean conditional rendering of status-dependent UI.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- postMessage bridge protocol is fully defined and wired on the store side
- Phase 20 (LivOS iframe embedding) can implement the parent-side listener that responds to these messages
- The 'ready' message is sent automatically when the store loads in an iframe, allowing the parent to send initial status

## Self-Check: PASSED

All 5 files verified present. Both task commits (4d1b707, f689117) verified in git log.

---
*Phase: 19-postmessage-bridge-protocol*
*Completed: 2026-03-21*
