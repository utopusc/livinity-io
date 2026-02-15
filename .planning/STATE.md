# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.5 — Claude Migration & AI Platform
**Current focus:** Phase 2 — Native Tool Calling + Auth UI

## Current Position

Milestone: v1.5 (Claude Migration & AI Platform)
Phase: 2 of 5 (Native Tool Calling + Auth UI)
Plan: —
Status: Planned (3 plans created, ready to execute)
Last activity: 2026-02-15 — Phase 2 planned (3 plans in 2 waves)

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (v1.5)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Provider Abstraction | 3/3 | — | — |

*Updated after each plan completion*

## Accumulated Context

### Decisions

v1.5 decisions:
- [Milestone]: Claude as primary AI provider, Gemini as fallback (not replacement)
- [Milestone]: Standard API keys only — subscription OAuth tokens blocked by Anthropic (Jan 2026)
- [Milestone]: Multi-provider abstraction built natively (no Vercel AI SDK, no LangChain)
- [Milestone]: Keep existing AgentEvent SSE format — no frontend streaming changes
- [Milestone]: sqlite-vec for vector search enhancement, keep Gemini for embeddings
- [Milestone]: Git-based skill registries (no centralized marketplace server)
- [Milestone]: 5 channels max (WhatsApp, Telegram, Discord, Slack, Matrix)
- [Tech]: Tier mapping: flash/haiku -> claude-haiku-4-5, sonnet -> claude-sonnet-4-5, opus -> claude-opus-4-6
- [Tech]: Dual-mode tool calling: native tool_use for Claude, JSON-in-text for Gemini
- [Tech]: API key stored in Redis: nexus:config:anthropic_api_key
- [Phase1]: @anthropic-ai/sdk upgraded to v0.74.0 (verified working)
- [Phase1]: Brain refactored as thin wrapper — all callers unchanged
- [Phase1]: ProviderManager hasYielded guard prevents fallback after partial stream delivery

### Pending Todos

None.

### Blockers/Concerns

- sqlite-vec is alpha-versioned (v0.1.7) — needs stability testing in Phase 3
- Matrix SDK complexity uncertain — may need prototyping in Phase 3

## Session Continuity

Last session: 2026-02-15
Stopped at: Phase 2 planned — ready to execute
Resume file: None
