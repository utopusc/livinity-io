---
phase: 08-whatsapp-message-routing-safety
plan: 02
subsystem: channels
tags: [whatsapp, channel-manager, daemon, message-routing, legacy-removal]

# Dependency graph
requires:
  - phase: 08-whatsapp-message-routing-safety
    plan: 01
    provides: WhatsAppRateLimiter integrated into WhatsAppProvider.sendMessage
  - phase: 06-whatsapp-channel-foundation
    provides: WhatsAppProvider class, ChannelManager with WhatsApp support
provides:
  - Unified WhatsApp message routing through ChannelManager (zero legacy wa_outbox/wa_pending references)
  - All 4 tool/callback sites (whatsapp_send, progress_report, buildActionCallback, routeSubagentResult) using ChannelManager
  - WhatsApp history/turn saving via generic getChannelHistory/saveChannelTurn
affects: [whatsapp-channel-foundation, agent-tools, subagent-manager]

# Tech tracking
tech-stack:
  added: []
  patterns: [Unified channel routing for all messaging platforms including WhatsApp]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/daemon.ts

key-decisions:
  - "Merged WhatsApp into existing channel arrays rather than special-casing -- reduces code duplication and ensures consistent behavior"
  - "WhatsAppProvider.sendMessage handles chunking internally (via chunkText) so chunkForWhatsApp import was fully removed"
  - "buildActionCallback silently drops messages when ChannelManager unavailable (same as existing behavior for non-WhatsApp channels)"
  - "routeSubagentResult WhatsApp branch merged into unified channel branch with other messaging platforms"

patterns-established:
  - "All messaging channels (telegram, discord, slack, matrix, whatsapp) use identical routing through ChannelManager.sendMessage"

requirements-completed: [WA-03, MEM-04]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 8 Plan 2: WhatsApp Message Routing Consolidation Summary

**All WhatsApp outbound routing unified through ChannelManager -- 204 lines of legacy wa_outbox/wa_pending code deleted from daemon.ts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T03:26:09Z
- **Completed:** 2026-04-03T03:30:47Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Unified all WhatsApp response routing through sendChannelResponse (which uses ChannelManager.sendMessage -> WhatsAppProvider.sendMessage with rate limiter)
- Deleted 3 legacy methods: sendWhatsAppResponse (48 lines), getWhatsAppHistory (43 lines), saveWhatsAppTurn (15 lines)
- Updated 4 tool/callback sites to use ChannelManager: whatsapp_send, progress_report, buildActionCallback, routeSubagentResult
- Zero references to wa_outbox, wa_pending, or chunkForWhatsApp remain in daemon.ts
- WhatsApp conversation history now uses same getChannelHistory/saveChannelTurn pattern as Telegram/Discord

## Task Commits

Each task was committed atomically:

1. **Task 1: Route WhatsApp through sendChannelResponse and remove sendWhatsAppResponse** - `9639ec8` (feat)
2. **Task 2: Update whatsapp_send, progress_report, buildActionCallback, routeSubagentResult to use ChannelManager** - `9d96390` (feat)

## Files Created/Modified
- `nexus/packages/core/src/daemon.ts` - Consolidated all WhatsApp routing through ChannelManager, deleted 3 legacy methods, updated 4 tool/callback sites, removed chunkForWhatsApp import

## Decisions Made
- Merged WhatsApp into existing channel arrays (channelSources) rather than special-casing -- consistent with Telegram/Discord/Slack/Matrix pattern
- WhatsAppProvider.sendMessage handles chunking internally, so chunkForWhatsApp was fully removed along with its import
- buildActionCallback: removed wa_outbox else branch entirely; if ChannelManager unavailable, action messages silently dropped (same as existing non-WhatsApp behavior)
- routeSubagentResult: WhatsApp branch merged into unified channel condition rather than having separate whatsapp-specific code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed processInboxItem skill callback missing source parameter**
- **Found during:** Task 1 (processInboxItem updates)
- **Issue:** `this.buildActionCallback(item.from)` was missing the `source` parameter, meaning WhatsApp action callbacks in the realtime path would not route correctly
- **Fix:** Changed to `this.buildActionCallback(item.from, item.source)` matching the polling loop
- **Files modified:** nexus/packages/core/src/daemon.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 9639ec8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct action callback routing. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all routing is fully wired through ChannelManager.

## Next Phase Readiness
- WhatsApp message flow is now fully unified: WhatsAppProvider.handleMessages -> daemon.addToInbox -> processInboxItem -> sendChannelResponse -> ChannelManager.sendMessage('whatsapp', ...) -> WhatsAppProvider.sendMessage (rate-limited)
- All legacy Redis polling delivery mechanism (wa_outbox/wa_pending) is removed from daemon.ts
- Phase 08 is complete (both plans executed)

## Self-Check: PASSED

- FOUND: nexus/packages/core/src/daemon.ts
- FOUND: .planning/phases/08-whatsapp-message-routing-safety/08-02-SUMMARY.md
- FOUND: commit 9639ec8
- FOUND: commit 9d96390

---
*Phase: 08-whatsapp-message-routing-safety*
*Completed: 2026-04-03*
