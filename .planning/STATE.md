# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.5 — Claude Migration & AI Platform
**Current focus:** Phase 3 — Hybrid Memory + Channel Expansion

## Current Position

Milestone: v1.5 (Claude Migration & AI Platform)
Phase: 3 of 5 (Hybrid Memory + Channel Expansion) -- COMPLETE
Plan: 5 of 5 in Phase 3 (all complete)
Status: Phase 3 complete -- ready for Phase 4
Last activity: 2026-02-15 — Completed v1.5-03-05-PLAN.md (Slack/Matrix Settings UI & Response Routing)

Progress: [███████░░░] 70%

## Performance Metrics

**Velocity:**
- Total plans completed: 12 (v1.5)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Provider Abstraction | 3/3 | — | — |
| 2 - Native Tool Calling + Auth UI | 3/3 | — | — |
| 3 - Hybrid Memory + Channel Expansion | 5/5 | — | ~5min |

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
- [Phase2]: Dual-mode AgentLoop: Claude native tool_use + Gemini JSON-in-text preserved
- [Phase2]: rawClaudeMessages bypass for pre-formatted content blocks (tool_use/tool_result)
- [Phase2]: validateKey mutation tests API keys before saving (Claude max_tokens:1, Gemini models.list)
- [Phase2]: Provider selection stored in Redis nexus:config:primary_provider
- [Phase3]: SlackProvider uses @slack/bolt Socket Mode (no public URL required)
- [Phase3]: ChannelId forward-extended with 'slack' + 'matrix' to avoid second type change
- [Phase3]: ChannelConfig extended with appToken, homeserverUrl, roomId for Slack/Matrix
- [Phase3]: Memory dedup threshold 0.92, time-decay 30-day half-life, 70/30 relevance/recency weighting
- [Phase3]: Memory extraction uses flash tier, max 5 memories per conversation, fire-and-forget via BullMQ
- [Phase3]: MatrixProvider uses matrix-js-sdk v40 with sync-based listening, initialSyncLimit: 0
- [Phase3]: Memory /context endpoint with 2000 token budget, best-effort 2s timeout injection into agent prompts
- [Phase3]: CHAN-05 response routing uses per-request closures (not instance state) — race-condition free
- [Phase3]: tRPC integration routes expanded to 4 channels (telegram, discord, slack, matrix)

### Pending Todos

None.

### Blockers/Concerns

- sqlite-vec is alpha-versioned (v0.1.7) — needs stability testing in Phase 3

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed v1.5-03-05-PLAN.md (Phase 3 fully complete)
Resume file: None
