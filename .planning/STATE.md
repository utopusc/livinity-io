# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v6.0 -- Claude Code to Kimi Code Migration (COMPLETE)
**Current focus:** Post-v6.0 hardening complete

## Current Position

Milestone: v6.0 (Claude Code to Kimi Code Migration) — COMPLETE
Phase: All 4 phases complete + post-migration hardening
Status: Deployed and production-verified
Last activity: 2026-03-09 -- Post-migration fixes: 9 bugs fixed, settings UI simplified, Redis cleaned

Progress: [##########] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 3.5 min
- Total execution time: 28 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-kimi-provider | 2/2 | 5 min | 2.5 min |
| 02-configuration-layer | 2/2 | 7 min | 3.5 min |
| 03-kimi-agent-runner | 2/2 | 6 min | 3 min |
| 04-onboarding-cleanup | 2/2 | 10 min | 5 min |

## Accumulated Context

### Decisions

- Kimi Code replaces Claude Code as sole AI provider
- Print mode (`--print --output-format=stream-json`) for agent runner, not SDK (v0.1.5 too unstable)
- Build Kimi alongside Claude first, remove Claude code last (Phase 4)
- OpenAI-compatible API at `api.kimi.com/coding/v1` for KimiProvider
- Gemini fallback removed -- single provider architecture
- Raw fetch over openai SDK for KimiProvider -- zero new dependencies (01-01)
- 60s TTL cache for Redis model tier overrides (01-01)
- supportsVision = false for Kimi until K2.5 vision verified (01-01)
- Kimi primary, Claude secondary fallback -- three-provider coexistence until Phase 4 cleanup (01-02)
- Config schema defaults changed from Claude to Kimi model IDs; runtime Redis overrides still take precedence (01-02)
- Kimi auth is API key only, stored at nexus:config:kimi_api_key in Redis (02-01)
- Key validation via GET api.kimi.com/coding/v1/models (zero token cost) (02-01)
- ClaudeProvider import kept in api.ts -- still used by agent stream SDK detection (02-01)
- Model tier stored as Nexus config agent.tier using existing flash/sonnet/opus enum values (02-02)
- Tier mapping: fast=K2.5 Flash, balanced=K2.5, powerful=K2.5 Pro (02-02)
- Compact AiConfigSection omits model selection; full page only (02-02)
- Deploy script pattern for server setup -- repeatable, version-controlled, idempotent (03-01)
- uv tool install kimi-code as primary install method, official installer as fallback (03-01)
- PATH in both .profile and .bashrc for PM2 and interactive shell coverage (03-01)
- nexus-tools MCP via HTTP URL (port 3100) not inline server -- Kimi CLI cannot host in-process MCP (03-02)
- Temp agent YAML + .md files in /tmp/nexus-agents/ with cleanup in finally block (03-02)
- KimiAgentRunner exported from lib.ts barrel, not index.ts (which is main entry) (03-02)
- Model IDs: kimi-for-coding (sonnet), kimi-latest (flash/haiku), kimi-k2.5 (opus) -- may need adjustment (03-02)
- Kimi API key input replaces Claude OAuth PKCE flow in setup wizard (04-01)
- PasswordInput label prop used as placeholder (component has no separate placeholder prop) (04-01)
- AgentLoop as sole inline runner (not KimiAgentRunner for subprocess); all SdkAgentRunner paths removed (04-02)
- ClaudeToolDefinition renamed to ToolDefinition; toClaudeTools renamed to toToolDefinitions (04-02)
- Memory embeddings switched from Google API to Kimi OpenAI-compatible endpoint (04-02)

### Pending Todos

- None — v6.0 complete and deployed

### Post-Migration Fixes (2026-03-09)

1. Fixed 403 "only available for Coding Agents" — wrong model names + missing headers in chatStream
2. Fixed empty response — SSE parser expected `data: ` (with space) but Kimi sends `data:` (no space)
3. Fixed token refresh — Content-Type override was being overridden by getKimiHeaders spread
4. Fixed tool_use format error — Anthropic-format messages converted to OpenAI format in convertRawMessages()
5. Fixed reasoning_content missing — captured reasoning tokens from stream, attached as _reasoning to assistant messages
6. Fixed config schema — all model defaults updated to kimi-for-coding
7. Fixed Settings UI — replaced misleading K2.5 Flash/K2.5/K2.5 Pro tier selector with honest "Kimi for Coding" display
8. Fixed KimiAgentRunner — stale model mapping (kimi-k2.5, kimi-latest) updated to kimi-for-coding
9. Added stream_options.include_usage for accurate streaming token counts
10. Cleaned stale Redis key nexus:config:claude_auth_method

### Blockers/Concerns

- Kimi Agent SDK is v0.1.5 (pre-stable) -- using print mode fallback mitigates this
- Pre-existing TypeScript errors in livinityd (toolRegistry, subagent typing, apps.ts) -- unrelated to migration

## Session Continuity

Last session: 2026-03-09
Stopped at: v6.0 migration complete + hardening deployed — all agent flows verified on production
Resume file: None
