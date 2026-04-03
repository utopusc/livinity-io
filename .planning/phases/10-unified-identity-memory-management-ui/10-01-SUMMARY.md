---
phase: 10-unified-identity-memory-management-ui
plan: 01
subsystem: database, api
tags: [postgresql, sqlite, fts5, trpc, redis, identity-mapping, memory-service]

# Dependency graph
requires:
  - phase: 09-cross-session-conversation-persistence-search
    provides: conversation_turns table, FTS5 search, archiveToMemory in daemon
provides:
  - channel_identity_map PostgreSQL table for cross-channel unified userId
  - resolveCanonicalUserId and linkChannelIdentity database functions
  - GET /conversation-turns/:userId memory service endpoint with pagination
  - DELETE /conversation-turns/:id memory service endpoint
  - 5 tRPC routes (memoryList, memoryDelete, conversationTurnsList, conversationTurnsDelete, conversationTurnsSearch)
  - Daemon Redis-cached identity resolution before archiving
affects: [10-02-PLAN, memory-management-ui, multi-user-identity]

# Tech tracking
tech-stack:
  added: []
  patterns: [redis-identity-cache, trpc-proxy-to-memory-service, canonical-userId-resolution]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/database/index.ts
    - nexus/packages/memory/src/index.ts
    - nexus/packages/core/src/daemon.ts
    - livos/packages/livinityd/source/modules/ai/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Redis identity cache in daemon (not direct PostgreSQL access) since daemon is in nexus package, not livinityd"
  - "FTS5 trigger handles conversation turn deletion automatically (no manual FTS cleanup needed)"
  - "Auto-create identity mapping on first encounter (channelUserId becomes canonical until admin links)"

patterns-established:
  - "Memory service proxy pattern: tRPC route -> fetch localhost:3300 with X-API-Key header"
  - "Identity resolution: Redis cache nexus:identity:{channel}:{chatId} for daemon, PostgreSQL channel_identity_map for persistent storage"

requirements-completed: [ID-01, UI-01, UI-02, UI-03]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 10 Plan 01: Unified Identity & Memory Backend Summary

**Cross-channel identity mapping table, memory service conversation-turns REST endpoints, daemon Redis identity cache, and 5 tRPC proxy routes for the Memory Management UI**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T04:00:24Z
- **Completed:** 2026-04-03T04:03:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created channel_identity_map PostgreSQL table with unique constraint on (channel, channel_user_id) and two indexes for fast lookups
- Added GET /conversation-turns/:userId and DELETE /conversation-turns/:id endpoints to the memory service with pagination, channel filtering, and total count
- Daemon now resolves canonical userId via Redis cache before archiving conversation turns, enabling unified cross-channel identity
- All 5 tRPC routes (memoryList, memoryDelete, conversationTurnsList, conversationTurnsDelete, conversationTurnsSearch) proxy to memory service with proper auth

## Task Commits

Each task was committed atomically:

1. **Task 1: channel_identity_map table, memory service endpoints, daemon identity resolution** - `ff72f25` (feat)
2. **Task 2: tRPC routes proxying memory service and httpOnlyPaths** - `16f97bc` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/database/schema.sql` - Added channel_identity_map table DDL with indexes
- `livos/packages/livinityd/source/modules/database/index.ts` - Added resolveCanonicalUserId and linkChannelIdentity exports
- `nexus/packages/memory/src/index.ts` - Added GET /conversation-turns/:userId and DELETE /conversation-turns/:id endpoints
- `nexus/packages/core/src/daemon.ts` - Added resolveCanonicalUserId Redis cache, linkIdentity method, canonical ID resolution in saveChannelTurn
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added 5 memory management tRPC routes (memoryList, memoryDelete, conversationTurnsList, conversationTurnsDelete, conversationTurnsSearch)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added ai.memoryDelete and ai.conversationTurnsDelete to httpOnlyPaths

## Decisions Made
- Redis identity cache in daemon (not direct PostgreSQL) since nexus-core cannot import livinityd database module -- lazy PostgreSQL mapping by livinityd instead
- FTS5 trigger ct_ad handles conversation turn deletion automatically -- simplified DELETE endpoint to just delete the row
- Auto-create identity mapping on first encounter so first-time channel users get a mapping without admin intervention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. The channel_identity_map table is created idempotently on startup via schema.sql.

## Next Phase Readiness
- All 5 tRPC routes are ready for the Memory Management UI (Plan 02) to consume
- conversationTurnsList provides pagination (limit/offset) and channel filtering needed for the UI
- memoryList and memoryDelete enable memory card display and deletion
- conversationTurnsSearch enables full-text search from the UI

## Self-Check: PASSED

All 7 files verified present. Both task commits (ff72f25, 16f97bc) confirmed in git log.

---
*Phase: 10-unified-identity-memory-management-ui*
*Completed: 2026-04-03*
