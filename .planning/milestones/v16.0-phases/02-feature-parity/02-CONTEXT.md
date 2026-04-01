# Phase 2: Feature Parity - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure Claude provider handles all AI capabilities identically to Kimi — streaming responses, tool calling, vision/multimodal input, and model tier routing. The restored ClaudeProvider already implements all these features. This phase verifies the integration with the agent loop (brain.ts rawMessages path) works end-to-end and fixes any type mismatches or missing adapters.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — the restored ClaudeProvider already supports streaming, tool calling, vision, and model tiers. This phase ensures the agent loop integration works correctly with both providers.

Key facts from codebase scout:
- Agent loop uses Anthropic format internally (rawMessages as Anthropic.MessageParam[])
- Claude gets rawMessages directly — NO conversion needed (unlike Kimi which uses convertRawMessages)
- brain.ts passes rawProviderMessages → rawMessages to provider
- ClaudeProvider already has: chat(), chatStream(), think(), isAvailable(), getModels()
- Model mapping: flash→haiku-4-5, haiku→haiku-4-5, sonnet→sonnet-4-5, opus→opus-4-6
- supportsVision=true, supportsToolCalling=true already set
- Tool results use Anthropic tool_use/tool_result blocks natively

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `brain.ts` — orchestrates provider calls, passes rawProviderMessages
- `claude.ts` — 467 lines, fully implements AIProvider with streaming, tools, vision
- `kimi.ts` — reference for how convertRawMessages bridges Anthropic→OpenAI format
- `normalize.ts` — prepareForProvider now supports 'claude' | 'kimi'

### Established Patterns
- brain.ts calls providerManager.chatStream() with rawMessages from agent loop
- Agent loop accumulates messages in Anthropic format (user/assistant/tool_use/tool_result)
- Provider handles format conversion internally (Kimi converts, Claude passes through)
- ProviderStreamChunk has toolUse, stopReason, reasoning fields

### Integration Points
- brain.ts rawProviderMessages → ProviderChatOptions.rawMessages → claude.ts
- Tool results: agent loop builds tool_result blocks → rawMessages → Claude API
- Vision: multimodal content blocks (image_url in messages) → Claude vision API
- Streaming: AsyncGenerator<ProviderStreamChunk> consumed by brain.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — verify existing integration works and fix any gaps.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
