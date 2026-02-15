# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.5 — Claude Migration & AI Platform
**Current focus:** Phase 1 — Provider Abstraction + Claude Integration

## Current Position

Milestone: v1.5 (Claude Migration & AI Platform)
Phase: 1 of 5 (Provider Abstraction + Claude Integration)
Plan: —
Status: Ready to plan
Last activity: 2026-02-15 — Roadmap created for v1.5 milestone (5 phases, 54 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v1.5)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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

### Pending Todos

None.

### Blockers/Concerns

- Verify @anthropic-ai/sdk latest version before Phase 1 starts (research says ^0.74.0)
- sqlite-vec is alpha-versioned (v0.1.7) — needs stability testing in Phase 3
- Matrix SDK complexity uncertain — may need prototyping in Phase 3

## Session Continuity

Last session: 2026-02-15
Stopped at: v1.5 roadmap created — ready to plan Phase 1
Resume file: None
