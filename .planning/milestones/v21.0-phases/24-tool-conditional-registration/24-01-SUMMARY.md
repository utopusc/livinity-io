---
phase: 24-tool-conditional-registration
plan: 01
subsystem: ai
tags: [tool-registry, whatsapp, telegram, discord, slack, gmail, conditional-registration]

# Dependency graph
requires: []
provides:
  - "Conditional tool registration gates for whatsapp_send, channel_send, and gmail_* tools in daemon.ts"
affects: [system-prompt-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns: ["config-gated tool registration in registerTools()"]

key-files:
  created: []
  modified:
    - "nexus/packages/core/src/daemon.ts"

key-decisions:
  - "Used waConfig?.enabled !== false to preserve backward compat (enabled defaults to true)"
  - "Check status.connected || status.enabled for channels to register tool when configured but not yet connected at startup"
  - "Added try/catch around getStatus() calls to gracefully skip channels/gmail on status errors"

patterns-established:
  - "Conditional tool registration: wrap toolRegistry.register() in config/status if-gates with logger.info skip messages"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 24 Plan 01: Tool Conditional Registration Summary

**Config-gated registration for whatsapp_send, channel_send, and gmail_* tools based on integration enable/connect status**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T11:09:11Z
- **Completed:** 2026-03-28T11:12:05Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- whatsapp_send tool gated behind `channels.whatsapp.enabled !== false` config check
- channel_send tool gated behind at least one messaging channel (Telegram/Discord/Slack) being enabled or connected
- gmail_* tools (5 tools) gated behind `gmailStatus.connected` OAuth check instead of just provider existence
- registerTools() made async to support awaiting channel/gmail status checks
- All tool execute() implementations remain byte-for-byte identical (TOOL-04 requirement)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add conditional registration gates for whatsapp_send, channel_send, and gmail_* tools** - `aa92ef4` (feat)
2. **Task 2: Build nexus-core and verify tool count in logs** - no separate commit (dist/ is gitignored; build verified compiled output contains all gate variables)

## Files Created/Modified
- `nexus/packages/core/src/daemon.ts` - Added if-gates around whatsapp_send, channel_send, and gmail_* tool registrations in registerTools()

## Decisions Made
- Used `waConfig?.enabled !== false` to handle both `true` and `undefined` (when configManager not set), preserving backward compatibility since the WhatsApp schema defaults enabled to true
- Used `status.connected || status.enabled` for channel_send gate so the tool registers when a channel is configured even if not yet connected at startup (channels may connect moments later during connectAll())
- Wrapped getStatus() calls in try/catch blocks to gracefully handle status check failures without crashing tool registration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tool registry now only exposes integration tools when their backing services are actually available
- System prompt optimization phase can leverage the cleaner tool list for more focused AI behavior

## Self-Check: PASSED

- FOUND: nexus/packages/core/src/daemon.ts
- FOUND: .planning/phases/24-tool-conditional-registration/24-01-SUMMARY.md
- FOUND: commit aa92ef4

---
*Phase: 24-tool-conditional-registration*
*Completed: 2026-03-28*
