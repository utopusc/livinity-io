---
phase: 07-whatsapp-qr-code-settings-ui
plan: 01
subsystem: api
tags: [whatsapp, baileys, trpc, express, redis, qr-code]

# Dependency graph
requires:
  - phase: 06-whatsapp-channel-foundation
    provides: WhatsAppProvider with Baileys connection, Redis auth store, QR code emission
provides:
  - fullDisconnect() method on WhatsAppProvider that clears auth state
  - Nexus REST endpoints for WhatsApp QR, connect, disconnect
  - tRPC routes whatsappGetQr, whatsappGetStatus, whatsappConnect, whatsappDisconnect
  - httpOnlyPaths registration for WhatsApp mutation routes
affects: [07-02-whatsapp-settings-ui-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [whatsapp-specific-rest-before-generic-channel-routes, redis-direct-status-read-for-trpc-queries]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/channels/whatsapp.ts
    - nexus/packages/core/src/api.ts
    - livos/packages/livinityd/source/modules/ai/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "WhatsApp-specific routes registered before generic :id route in Express for correct matching"
  - "whatsappGetStatus reads Redis directly instead of proxying through Nexus REST (avoids extra network hop)"
  - "fullDisconnect casts to any since ChannelProvider interface does not define it"

patterns-established:
  - "WhatsApp REST route ordering: specific /api/channels/whatsapp/* before generic /api/channels/:id"
  - "Direct Redis read for status queries vs HTTP proxy for mutations"

requirements-completed: [WA-01, WA-06]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 7 Plan 1: WhatsApp Backend Routes Summary

**Four tRPC routes and three Nexus REST endpoints for WhatsApp QR code retrieval, connection management, and full disconnect with auth state cleanup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T03:02:49Z
- **Completed:** 2026-04-03T03:05:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `fullDisconnect()` method to WhatsAppProvider that closes socket, clears auth state, and deletes QR from Redis
- Registered three new Nexus REST endpoints (GET /api/channels/whatsapp/qr, POST connect, POST disconnect) before generic channel routes
- Added four tRPC routes (whatsappGetQr, whatsappGetStatus, whatsappConnect, whatsappDisconnect) proxying to Nexus or reading Redis directly
- Registered WhatsApp mutation routes in httpOnlyPaths for reliable HTTP transport

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fullDisconnect method to WhatsAppProvider and Nexus REST endpoints** - `a6b1d3b` (feat)
2. **Task 2: Add tRPC routes proxying to Nexus WhatsApp endpoints and register in httpOnlyPaths** - `a087dba` (feat)

## Files Created/Modified
- `nexus/packages/core/src/channels/whatsapp.ts` - Added fullDisconnect() method that clears auth state + QR
- `nexus/packages/core/src/api.ts` - Three new WhatsApp-specific REST endpoints before generic channel routes
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Four new tRPC routes in WhatsApp Management section
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added ai.whatsappConnect and ai.whatsappDisconnect to httpOnlyPaths

## Decisions Made
- WhatsApp-specific REST routes placed BEFORE generic `/api/channels/:id` to prevent Express `:id` param from intercepting "whatsapp" as an ID
- `whatsappGetStatus` reads `nexus:whatsapp:status` directly from Redis instead of proxying through Nexus REST, avoiding an extra network hop
- `fullDisconnect` accessed via `(provider as any).fullDisconnect()` since the base `ChannelProvider` interface does not define it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four tRPC routes ready for Plan 02 (WhatsApp Settings UI panel) to consume
- `whatsappGetQr` returns QR data URL string (or null) for rendering in UI
- `whatsappGetStatus` returns connection status object for status display
- `whatsappConnect` and `whatsappDisconnect` mutations available for UI buttons

## Self-Check: PASSED

All files verified present. All commit hashes found in git log.

---
*Phase: 07-whatsapp-qr-code-settings-ui*
*Completed: 2026-04-03*
