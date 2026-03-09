# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v6.0 -- Claude Code to Kimi Code Migration
**Current focus:** Phase 2 - Configuration Layer

## Current Position

Milestone: v6.0 (Claude Code to Kimi Code Migration)
Phase: 2 of 4 (Configuration Layer)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-03-09 -- Completed 02-01-PLAN.md (Kimi auth routes and tRPC procedures)

Progress: [###.......] 37% (3/8 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 2.7 min
- Total execution time: 8 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-kimi-provider | 2/2 | 5 min | 2.5 min |
| 02-configuration-layer | 1/2 | 3 min | 3 min |

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

### Pending Todos

None yet.

### Blockers/Concerns

- Kimi Agent SDK is v0.1.5 (pre-stable) -- using print mode fallback mitigates this
- Device auth API endpoints found in GitHub issues, not official docs -- needs verification in Phase 2
- Model IDs need runtime verification via `kimi info` on server
- Pre-existing TypeScript errors in livinityd (toolRegistry, subagent typing, apps.ts) -- unrelated to migration

## Session Continuity

Last session: 2026-03-09
Stopped at: Completed 02-01-PLAN.md (Kimi auth routes and tRPC procedures)
Resume file: None
