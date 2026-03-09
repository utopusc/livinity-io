# Phase 04 Plan 02: Claude/Anthropic/Gemini Cleanup Summary

**One-liner:** Purged all Claude, Anthropic, and Gemini code leaving Kimi as sole AI provider with zero legacy references.

## Completed Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Delete provider files and remove packages | 1ea5513 | providers/claude.ts (deleted), providers/gemini.ts (deleted), sdk-agent-runner.ts (deleted), core/package.json, providers/index.ts, providers/manager.ts, providers/types.ts, providers/normalize.ts |
| 2 | Clean all importing files and verify zero matches | ac5b692 | agent.ts, api.ts, daemon.ts, brain.ts, ws-gateway.ts, skill-loader.ts, task-manager.ts, tool-registry.ts, multi-agent.ts, kimi.ts, kimi-agent-runner.ts, index.ts, infra/errors.ts, infra/backoff.ts, memory/index.ts, setup.ts, .env.example, ai-config-dialog.tsx, usage-dashboard.tsx, env-writer.ts, session-start.js, check-inbox.js, nexus/package.json, livinityd/modules/ai/index.ts |

## What Was Done

### Task 1: Delete provider files and remove packages
- Deleted `nexus/packages/core/src/providers/claude.ts` (ClaudeProvider class)
- Deleted `nexus/packages/core/src/providers/gemini.ts` (GeminiProvider class)
- Deleted `nexus/packages/core/src/sdk-agent-runner.ts` (SdkAgentRunner class)
- Removed 3 dependencies from core package.json: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, `@google/generative-ai`
- Rewrote `providers/index.ts` to export only KimiProvider
- Rewrote `providers/manager.ts` to single-provider Kimi architecture (no fallback chain)
- Rewrote `providers/types.ts`: renamed `ClaudeToolDefinition` to `ToolDefinition`, removed Claude/Gemini cost defaults
- Rewrote `providers/normalize.ts`: removed Claude alternation validation and Gemini format conversion, single Kimi/OpenAI-compatible format

### Task 2: Clean all importing files and verify zero matches
- **Type renames across all files:** `ClaudeToolDefinition` -> `ToolDefinition`, `claudeTools` -> `nativeTools`, `claudeMessages` -> `providerMessages`, `rawClaudeMessages` -> `rawProviderMessages`, `CLAUDE_NATIVE_SYSTEM_PROMPT` -> `NATIVE_SYSTEM_PROMPT`
- **Method renames in tool-registry.ts:** `toClaudeTools()` -> `toToolDefinitions()`, `toClaudeToolsFiltered()` -> `toToolDefinitionsFiltered()`, `toolToClaudeDefinition()` -> `toolToDefinition()`
- **Agent runner cleanup:** Replaced all `useSdk ? new SdkAgentRunner(...) : new AgentLoop(...)` patterns with `new AgentLoop(...)` in api.ts, daemon.ts (2 locations), ws-gateway.ts, skill-loader.ts, task-manager.ts
- **Multi-agent:** Replaced `SdkAgentRunner` import and usage with `AgentLoop`
- **Provider gate:** Changed `activeProvider === 'claude'` to `activeProvider === 'kimi'` in agent.ts for native tool calling
- **Memory service:** Updated from Gemini embedding API to Kimi API (key retrieval + endpoint)
- **Setup wizard:** `GEMINI_API_KEY` prompt -> `KIMI_API_KEY` with Moonshot platform URL
- **CLI env-writer:** Updated from Claude Code subscription message to Kimi API key instructions
- **Settings UI:** ai-config-dialog.tsx updated from Gemini key to Kimi key
- **Usage dashboard:** Removed "Claude Code" reference
- **.env.example:** Replaced `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` with `KIMI_API_KEY`, model default `kimi-k2.5-flash`
- **Root package.json:** Removed `@anthropic-ai/sdk` from nexus root
- **Hook scripts:** Removed "Claude Code" references from session-start.js and check-inbox.js
- **kimi.ts:** Updated `ClaudeToolDefinition` -> `ToolDefinition`, cleaned Anthropic references in comments
- **kimi-agent-runner.ts:** Updated SdkAgentRunner reference in JSDoc to AgentLoop
- **livinityd:** Updated `geminiApiKey` to `kimiApiKey` in AiModuleOptions interface

## Verification Results

All checks passed:
1. `grep -ri "claude|anthropic" *.ts *.tsx` = **0 matches** (excluding dnd-kit 'clauderic')
2. `grep -ri "gemini|@google/generative-ai" *.ts *.tsx` = **0 matches**
3. `@anthropic-ai` in core/package.json = **0**
4. `@google/generative-ai` in core/package.json = **0**
5. Deleted files = **0 remaining on disk**
6. TypeScript compilation = **zero errors**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] nexus root package.json still had @anthropic-ai/sdk**
- **Found during:** Task 2
- **Issue:** The plan only mentioned removing from core/package.json, but the root nexus/package.json also had `@anthropic-ai/sdk`
- **Fix:** Removed the dependency from nexus/package.json
- **Commit:** ac5b692

**2. [Rule 2 - Missing Critical] Additional files had Claude/Gemini references not listed in plan**
- **Found during:** Task 2
- **Issue:** Several files not in the plan's file list contained references: nexus/packages/cli/src/lib/env-writer.ts, nexus/packages/hooks/session-start.js, nexus/packages/hooks/check-inbox.js, nexus/packages/core/src/providers/kimi.ts, nexus/packages/core/src/kimi-agent-runner.ts, livos/packages/livinityd/source/modules/ai/index.ts
- **Fix:** Cleaned all references (comments, imports, types)
- **Commit:** ac5b692

**3. [Rule 1 - Bug] Memory embedding endpoint needed update alongside key name**
- **Found during:** Task 2
- **Issue:** Changing GEMINI_API_KEY to KIMI_API_KEY without updating the embedding API endpoint would cause the function to send a Kimi key to Google's API
- **Fix:** Updated endpoint to Kimi's OpenAI-compatible embeddings API at api.kimi.com/coding/v1/embeddings
- **Commit:** ac5b692

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use AgentLoop as sole runner (not KimiAgentRunner) for inline agent creation | KimiAgentRunner is for CLI subprocess mode; AgentLoop with native tool calling handles API-based agent runs | All agent creation points use AgentLoop |
| Keep package-lock.json as-is with stale references | Auto-generated file; will regenerate on next `npm install` | Minor: stale references in lock file until next install |

## Tech Stack Changes

- **Removed:** @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk, @google/generative-ai
- **Deleted:** ClaudeProvider, GeminiProvider, SdkAgentRunner classes
- **Renamed types:** ClaudeToolDefinition -> ToolDefinition
- **Renamed methods:** toClaudeTools -> toToolDefinitions, toClaudeToolsFiltered -> toToolDefinitionsFiltered

## Next Steps

- Run `npm install` in nexus/ to regenerate package-lock.json without Anthropic/Google packages
- Run install-kimi.sh on server to complete server-side setup
- Verify end-to-end Kimi agent flow on production server
