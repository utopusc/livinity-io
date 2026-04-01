# Phase 1: Provider Restore & Registration - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore ClaudeProvider from git history, add @anthropic-ai/sdk dependency, and register Claude in ProviderManager alongside Kimi. Pure infrastructure — no user-facing changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIProvider` interface in `nexus/packages/core/src/providers/types.ts` — ClaudeProvider must implement this
- `ProviderManager` in `manager.ts` — already has fallback loop, `providers` Map, `fallbackOrder` array
- `KimiProvider` in `kimi.ts` — reference implementation (~800 lines)
- Git commit `1ea5513` deleted `claude.ts` — restore from `1ea5513^`

### Established Patterns
- Providers registered in constructor: `this.providers.set('id', instance)`
- Exports via `index.ts`: `export { ClassName } from './file.js'`
- Redis passed to provider constructor for config/state
- `ProviderConfig` type for provider metadata (priority, models, costs)

### Integration Points
- `manager.ts` constructor — add ClaudeProvider instantiation
- `index.ts` — add ClaudeProvider export
- `types.ts` PROVIDER_COST_DEFAULTS — add Claude pricing
- `package.json` — add `@anthropic-ai/sdk` dependency

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
