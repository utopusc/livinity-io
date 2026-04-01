---
phase: 01-provider-restore-registration
plan: 01
subsystem: ai-providers
tags: [claude, anthropic, sdk, multi-provider, typescript]

# Dependency graph
requires: []
provides:
  - ClaudeProvider class implementing AIProvider interface (467 lines)
  - "@anthropic-ai/sdk" dependency installed
  - Claude registered in ProviderManager alongside Kimi
  - ClaudeProvider exported from providers index
  - Claude pricing in PROVIDER_COST_DEFAULTS
  - normalize.ts supports 'claude' provider argument
affects: [feature-parity-streaming-tools, auth-config-endpoints, settings-ui-provider-toggle]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk ^0.80.0"]
  patterns: ["multi-provider registration in ProviderManager constructor", "provider-specific early return in prepareForProvider"]

key-files:
  created:
    - nexus/packages/core/src/providers/claude.ts
  modified:
    - nexus/packages/core/package.json
    - nexus/packages/core/src/providers/normalize.ts
    - nexus/packages/core/src/providers/types.ts
    - nexus/packages/core/src/providers/manager.ts
    - nexus/packages/core/src/providers/index.ts

key-decisions:
  - "Kimi stays first in fallback order (established provider), Claude second"
  - "Used @anthropic-ai/sdk ^0.80.0 (latest stable)"

patterns-established:
  - "Provider registration: instantiate in ProviderManager constructor, add to providers map and fallbackOrder"
  - "Provider normalization: early return branch in prepareForProvider for provider-specific message format"

requirements-completed: [PROV-01, PROV-02]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 01 Plan 01: Provider Restore and Registration Summary

**ClaudeProvider restored from git history (467 lines) with Anthropic SDK, registered in ProviderManager alongside Kimi, building with zero TypeScript errors**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T05:20:58Z
- **Completed:** 2026-03-25T05:22:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Restored fully functional ClaudeProvider (chat, chatStream, think, isAvailable, getModels, OAuth PKCE, CLI status) from git history
- Installed @anthropic-ai/sdk ^0.80.0 as dependency
- Registered ClaudeProvider in ProviderManager with Kimi-first fallback order
- Added Claude pricing (haiku $0.80/$4, sonnet $3/$15, opus $15/$75 per million tokens)
- Extended normalize.ts to support Claude's Anthropic-native message format
- Full TypeScript build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Restore ClaudeProvider and add SDK dependency** - `afffe61` (feat)
2. **Task 2: Register ClaudeProvider in ProviderManager and export** - `18f848a` (feat)

## Files Created/Modified
- `nexus/packages/core/src/providers/claude.ts` - ClaudeProvider class (467 lines) with full AIProvider implementation
- `nexus/packages/core/package.json` - Added @anthropic-ai/sdk ^0.80.0 dependency
- `nexus/packages/core/src/providers/normalize.ts` - Added 'claude' to provider union type, Anthropic format conversion
- `nexus/packages/core/src/providers/types.ts` - Added Claude pricing to PROVIDER_COST_DEFAULTS
- `nexus/packages/core/src/providers/manager.ts` - Import, instantiate, and register ClaudeProvider
- `nexus/packages/core/src/providers/index.ts` - Export ClaudeProvider from module barrel

## Decisions Made
- Kimi stays first in fallback order (established provider), Claude second -- can be changed via setFallbackOrder() or config in Phase 3
- Used @anthropic-ai/sdk ^0.80.0 (latest stable at time of execution)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ClaudeProvider is registered and building cleanly
- Ready for Phase 2 (feature parity: streaming, tool calling) which will exercise the provider's methods
- Ready for Phase 3 (auth & config) which will wire API key/OAuth endpoints
- Claude is available via `ProviderManager.getProvider('claude')` but requires API key configuration to pass `isAvailable()`

## Self-Check: PASSED

All files exist, all commits found, build succeeds with zero errors.

---
*Phase: 01-provider-restore-registration*
*Completed: 2026-03-25*
