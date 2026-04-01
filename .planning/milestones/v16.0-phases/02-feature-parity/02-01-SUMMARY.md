---
phase: 02-feature-parity
plan: 01
subsystem: ai
tags: [claude, anthropic, tool-calling, vision, streaming, agent-loop]

# Dependency graph
requires:
  - phase: 01-provider-restore-registration
    provides: ClaudeProvider restored and registered in ProviderManager
provides:
  - Native tool calling enabled for Claude in agent loop
  - Provider-aware image format conversion in tool_result blocks
  - Documented rawMessages passthrough for tool_use/tool_result
  - Verified CLAUDE_MODELS tier mapping (flash/haiku/sonnet/opus)
affects: [03-auth-config, 04-settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [provider-aware branching in agent loop for format differences]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/agent.ts
    - nexus/packages/core/src/providers/claude.ts

key-decisions:
  - "Single-line change to useNativeTools enables full tool calling for Claude -- no additional plumbing needed"
  - "Image format branching by activeProvider keeps Kimi and Claude formats isolated"
  - "rawMessages passthrough is correct as-is -- Anthropic SDK natively handles tool_use/tool_result blocks"

patterns-established:
  - "Provider-aware branching: use activeProvider check for format differences between providers"

requirements-completed: [FEAT-01, FEAT-02, FEAT-03, FEAT-04]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 2 Plan 1: Feature Parity Summary

**Native tool calling and Anthropic image format enabled for Claude in the agent loop, with model tier mapping verified**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T05:35:07Z
- **Completed:** 2026-03-25T05:37:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Native tool calling enabled for Claude (was Kimi-only) by adding `activeProvider === 'claude'` to useNativeTools check
- Provider-aware image format conversion: Claude gets Anthropic `image.source.base64` format, Kimi retains OpenAI `image_url` format
- Documentation comments added to ClaudeProvider `chat()` and `chatStream()` explaining rawMessages tool_use/tool_result passthrough
- CLAUDE_MODELS tier mapping verified: flash/haiku -> claude-haiku-4-5, sonnet -> claude-sonnet-4-5, opus -> claude-opus-4-6

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable native tool calling for Claude and convert image format** - `3e40404` (feat)
2. **Task 2: Validate Claude rawMessages passthrough and add documentation** - `fa17803` (docs)

## Files Created/Modified
- `nexus/packages/core/src/agent.ts` - Enabled useNativeTools for Claude; added provider-aware image format in tool_result blocks
- `nexus/packages/core/src/providers/claude.ts` - Added clarifying comments to chat() and chatStream() documenting rawMessages format

## Decisions Made
- Single-line change to useNativeTools is sufficient because the agent loop already builds messages in Anthropic format (providerMessages array) -- no additional conversion needed for Claude
- Image format branching uses runtime `activeProvider` check rather than a provider method, keeping the conversion co-located with the tool_result construction
- rawMessages passthrough verified correct as-is -- Anthropic SDK natively understands tool_use/tool_result content blocks, no adaptation needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Claude now has full feature parity with Kimi in the agent loop: streaming, native tool calling, vision/multimodal, model tiers
- Ready for Phase 03 (auth-config) to add Claude authentication endpoints and provider selection config
- Ready for Phase 04 (settings-ui) to add provider toggle in the UI

## Self-Check: PASSED

- All files exist (agent.ts, claude.ts, SUMMARY.md)
- All commits found (3e40404, fa17803)
- Build passes with zero errors

---
*Phase: 02-feature-parity*
*Completed: 2026-03-25*
