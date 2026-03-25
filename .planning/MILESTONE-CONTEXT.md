# Milestone Context: Multi-Provider AI (Claude + Kimi)

## Features & Scope

### Goal
Add Claude (Anthropic) as a second AI provider alongside Kimi, with a settings toggle to switch between them. User selects preferred provider in Settings, AI uses that provider for all interactions.

### Target Features
- Restore ClaudeProvider from git history (commit `1ea5513^`, 467 lines, fully functional)
- Re-add `@anthropic-ai/sdk` package dependency
- Register Claude in ProviderManager alongside Kimi (fallback support)
- Add Claude auth endpoints (API key input + optional OAuth PKCE)
- Add provider selection to config schema (`primary: 'claude' | 'kimi'`)
- Add provider toggle in Settings UI (LivOS AI settings)
- Both providers support: streaming, tool calling, vision, model tiers

### Architecture Context (from research)

**Provider interface already exists** (`AIProvider` in types.ts):
- `chat()`, `chatStream()`, `think()`, `isAvailable()`, `getModels()`
- Both Claude and Kimi implement this interface perfectly

**Agent loop uses Anthropic format internally** — Claude needs NO message conversion. Kimi uses `convertRawMessages()` to convert to OpenAI format. Adding Claude is actually simpler than Kimi.

**ProviderManager has fallback loop** — designed for multiple providers. Just needs Claude instantiated alongside Kimi.

**Key files to modify:**
- `nexus/packages/core/src/providers/claude.ts` — restore from git (467 lines)
- `nexus/packages/core/src/providers/manager.ts` — add Claude to constructor + fallback
- `nexus/packages/core/src/providers/index.ts` — export ClaudeProvider
- `nexus/packages/core/src/config/schema.ts` — add provider selection setting
- `nexus/packages/core/src/api.ts` — add Claude auth endpoints
- `livos/packages/ui/src/routes/ai-chat/` or settings — provider toggle UI
- `livos/packages/livinityd/source/modules/ai/` — pass provider selection to Nexus

**Old Claude auth methods (from deleted code):**
- API key: Direct `ANTHROPIC_API_KEY` env var
- SDK subscription: Via Claude CLI (checks `~/.claude/.credentials.json`)
- OAuth PKCE: Custom flow (270+ lines in old ClaudeProvider)

**Model tier mapping:**
- flash/haiku → claude-haiku-4-5
- sonnet → claude-sonnet-4-5
- opus → claude-opus-4-6

### Out of Scope
- Multi-provider simultaneous (use one at a time, not both)
- Provider-specific tool formats in UI (abstracted away)
- OpenAI/GPT support (only Claude + Kimi for now)
- Per-conversation provider switching (global setting only)

## Source
Gathered from codebase exploration and git history analysis on 2026-03-24.
