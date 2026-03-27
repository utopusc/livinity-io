---
phase: 11-platform-auth-registration
plan: 01
subsystem: ai
tags: [claude-agent-sdk, subprocess, watchdog, budget-cap, agent-runner]

# Dependency graph
requires:
  - phase: none
    provides: first phase of v20.0
provides:
  - SdkAgentRunner as default agent runner for /api/agent/stream
  - AgentLoop preserved as legacy fallback via Redis key
  - Stream watchdog (60s timeout) for stuck sessions
  - Per-tier budget cap ($2-$10 maxBudgetUsd)
  - Restricted subprocess environment (no secret leakage)
affects: [phase-12-mcp-tool-bridge, phase-13-websocket-streaming, phase-18-cost-control]

# Tech tracking
tech-stack:
  added: []
  patterns: [sdk-default-with-legacy-fallback, stream-watchdog-abort-pattern, safe-subprocess-env]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/api.ts
    - nexus/packages/core/src/sdk-agent-runner.ts

key-decisions:
  - "SDK is default agent runner; legacy AgentLoop accessible via Redis key nexus:config:agent_runner=legacy"
  - "Watchdog timeout set to 60s with 10s check interval to detect silent connection death"
  - "Budget cap per tier: opus=$10, sonnet=$5, haiku/flash=$2 (SDK-native maxBudgetUsd)"
  - "Subprocess env restricted to HOME, PATH, NODE_ENV, LANG, ANTHROPIC_API_KEY only"

patterns-established:
  - "Runner mode pattern: Redis key controls agent backend, defaults to SDK, escape hatch to legacy"
  - "Watchdog pattern: setInterval checks lastMessageTime, aborts via AbortController on timeout"

requirements-completed: [SDK-01, SDK-NF-03]

# Metrics
duration: 4min
completed: 2026-03-27
---

# Phase 11 Plan 01: Agent SDK Backend Integration Summary

**Claude Agent SDK set as default agent runner with 60s stream watchdog, per-tier budget caps ($2-$10), and restricted subprocess environment**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T08:16:54Z
- **Completed:** 2026-03-27T08:21:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- SdkAgentRunner is now the default for all /api/agent/stream requests (no auth-method gate)
- AgentLoop preserved as escape hatch via Redis key `nexus:config:agent_runner=legacy`
- Added 60s stream watchdog that aborts stuck SDK sessions via AbortController
- Added per-tier budget cap using SDK-native maxBudgetUsd ($2 for flash/haiku, $5 for sonnet, $10 for opus)
- Restricted subprocess environment to 5 safe variables, preventing secret leakage
- ProviderManager, KimiProvider, ClaudeProvider, AIProvider interface all verified completely untouched (SDK-NF-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Make SdkAgentRunner the default and add robustness** - `336fcb6` (feat)
2. **Task 2: Verify end-to-end message flow and no regressions** - verification-only, no commit

## Files Created/Modified
- `nexus/packages/core/src/api.ts` - Removed auth-method gate, SdkAgentRunner is default, AgentLoop is legacy fallback
- `nexus/packages/core/src/sdk-agent-runner.ts` - Added watchdog timer, maxBudgetUsd, safe subprocess env

## Decisions Made
- SDK is the default agent runner; no conditional based on auth method. Legacy AgentLoop accessible via Redis key `nexus:config:agent_runner` set to `legacy`.
- Watchdog timeout of 60 seconds with 10-second check interval chosen to balance between detecting silent connection death and allowing for normal pauses during long tool calls.
- Budget caps set per tier using SDK-native `maxBudgetUsd` field: opus=$10, sonnet=$5, haiku/flash=$2.
- Subprocess environment restricted to HOME, PATH, NODE_ENV, LANG, and ANTHROPIC_API_KEY only -- prevents leaking Redis passwords, database credentials, and other server-side secrets.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SDK is the active agent runner, ready for Phase 12 (MCP Tool Bridge) and Phase 13 (WebSocket Streaming)
- ProviderManager layer preserved for future multi-provider needs
- Budget enforcement via maxBudgetUsd prepares for Phase 18 (Cost Control + Settings Cleanup)

---
*Phase: 11-platform-auth-registration*
*Completed: 2026-03-27*
