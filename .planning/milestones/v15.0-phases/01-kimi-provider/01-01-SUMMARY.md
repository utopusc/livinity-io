---
phase: 01-kimi-provider
plan: 01
subsystem: ai
tags: [kimi, openai-compatible, fetch, sse, tool-calling, streaming, provider]

# Dependency graph
requires: []
provides:
  - KimiProvider class implementing full AIProvider interface
  - Tool format translation (Anthropic input_schema to OpenAI parameters)
  - Tool argument parser (string JSON to object with error fallback)
  - SSE streaming with tool call accumulation
  - Kimi cost defaults in PROVIDER_COST_DEFAULTS
  - Kimi message normalization in prepareForProvider
  - KimiProvider export from providers index
affects:
  - 01-02 (ProviderManager wiring and config system)
  - 02-kimi-agent (agent runner integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw fetch against OpenAI-compatible API (no SDK dependency)"
    - "Anthropic-to-OpenAI tool definition translation layer"
    - "SSE stream parsing with tool call accumulation by index"
    - "Redis-backed model tier mapping with TTL cache"

key-files:
  created:
    - nexus/packages/core/src/providers/kimi.ts
  modified:
    - nexus/packages/core/src/providers/normalize.ts
    - nexus/packages/core/src/providers/types.ts
    - nexus/packages/core/src/providers/index.ts

key-decisions:
  - "Raw fetch instead of openai npm package -- zero new dependencies, full control over request/response"
  - "Tool definition translation as internal helper functions, not exported -- keeps implementation private"
  - "60-second TTL cache for Redis model overrides -- balances freshness with performance"
  - "supportsVision = false for now -- Kimi K2.5 vision support TBD"

patterns-established:
  - "OpenAI-compatible provider pattern: translateToolDefinition + parseToolArguments + SSE parser"
  - "Model tier Redis override pattern: nexus:config:{provider}_models JSON key with fallback to constants"

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 01 Plan 01: KimiProvider Core Implementation Summary

**KimiProvider with OpenAI-compatible chat/streaming, tool format translation (input_schema to parameters), and Redis-backed model tiers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T08:36:00Z
- **Completed:** 2026-03-09T08:39:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Complete AIProvider implementation (chat, chatStream, think, isAvailable, getModels) using raw fetch against api.kimi.com/coding/v1
- Tool format translation layer converting Anthropic input_schema to OpenAI function parameters format
- SSE streaming parser with tool call accumulation by index and proper finish_reason handling
- Redis-backed model tier mapping with 60s cache and K2.5 hardcoded defaults
- Kimi message normalization, cost defaults, and provider export in shared modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KimiProvider with chat, streaming, tool calling, and model tiers** - `f0e532e` (feat)
2. **Task 2: Update shared types, normalize, and exports for Kimi** - `eb98812` (feat)

## Files Created/Modified
- `nexus/packages/core/src/providers/kimi.ts` - Full KimiProvider class (603 lines): chat, chatStream, tool translation, argument parsing, model tiers
- `nexus/packages/core/src/providers/normalize.ts` - Added 'kimi' to prepareForProvider (OpenAI message format: role + content)
- `nexus/packages/core/src/providers/types.ts` - Added Kimi cost defaults to PROVIDER_COST_DEFAULTS
- `nexus/packages/core/src/providers/index.ts` - Added KimiProvider re-export

## Decisions Made
- **Raw fetch over openai SDK:** Zero new dependencies, full control over request/response format, avoids version coupling
- **Internal helper functions:** translateToolDefinition and parseToolArguments are file-private, not exported -- consumers use AIProvider interface only
- **60s model cache TTL:** Avoids Redis reads on every API call while still picking up config changes within a minute
- **Vision disabled:** supportsVision = false since K2.5 vision capabilities are unverified

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- KimiProvider is a complete, self-contained AIProvider implementation
- Ready for Plan 02 to wire into ProviderManager and config system
- Model IDs are placeholder defaults (kimi-k2.5-flash, kimi-k2.5, kimi-k2.5-pro) -- will need verification via `kimi info` on server
- API key storage path established: `nexus:config:kimi_api_key` in Redis

---
*Phase: 01-kimi-provider*
*Completed: 2026-03-09*
