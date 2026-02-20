# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v2.0 — OpenClaw-Class AI Platform
**Current focus:** Phase 3 complete (Intelligence Enhancements). Ready for Phase 4 (Voice Pipeline).

## Current Position

Milestone: v2.0 (OpenClaw-Class AI Platform)
Phase: 3 of 6 (Intelligence Enhancements)
Plan: 3 of 3 in phase (Phase complete)
Status: Phase complete
Last activity: 2026-02-20 — Completed v2.0-03-03-PLAN.md (Sub-Agent Execution Engine)

Progress: [███████████░░░░░░░░░░░] 11/22 (~50%)

## Performance Metrics

**Velocity:**
- Total plans completed: 11 (v2.0)
- Average duration: 5.9min
- Total execution time: 57min

## Accumulated Context

### Decisions

v1.5 decisions (carried forward):
- [Milestone]: Claude Code SDK subscription mode (dontAsk permissionMode)
- [Milestone]: SdkAgentRunner as primary agent execution engine
- [Milestone]: Nexus tools via MCP (nexus-tools server)
- [Tech]: Telegram dedup via Redis NX + stale message filter

v2.0 decisions:
- [Milestone]: Claude Code Auth ONLY — no API keys, no Gemini, no OpenAI
- [Milestone]: Telegram + Discord only (WhatsApp deferred)
- [Milestone]: Cartesia for TTS, Deepgram for STT
- [Milestone]: Web-based Live Canvas via iframe srcdoc (no A2UI, no Sandpack)
- [Milestone]: LivHub branding for skill registry
- [Milestone]: Session compaction via SessionManager (not native Compaction API — incompatible with subscription mode)
- [Milestone]: DAG topology for multi-agent (no recursive sub-agents)
- [Milestone]: Gmail polling default, Pub/Sub as advanced option

v2.0 Phase 1 decisions:
- [Infra]: CircuitBreaker wraps Redis error events, not individual commands (non-invasive)
- [Infra]: BullMQ delayed jobs for cron scheduling (replaces setTimeout)
- [Infra]: Agent turn cap: default 15, hard max 25
- [Infra]: Telegram polling offset persisted to Redis for restart recovery
- [Commands]: Activation mode stored in Redis key nexus:activation:{channelId} (not channel config)
- [Commands]: /new resets both SessionManager and UserSessionManager, optionally switches model
- [Commands]: /compact now calls compactSession() with token savings report (implemented in Phase 3)
- [Security]: Default DM policy is 'pairing' (activation code flow) for maximum security
- [Security]: Max 3 pending activation codes per channel, 1-hour TTL
- [Security]: DM check runs after dedup/stale filters, before AI handler
- [Security]: Group messages bypass DM pairing entirely
- [Usage]: Cost stored as integer cents in Redis to avoid float precision
- [Usage]: Daily usage keys have 90-day TTL for automatic cleanup
- [Usage]: tRPC proxy routes for usage dashboard (consistent with existing patterns)

v2.0 Phase 2 decisions:
- [Webhook]: Route registered before express.json() and requireApiKey — uses own HMAC-SHA256 auth
- [Webhook]: UUID validation on route IDs to avoid intercepting /api/webhook/git
- [Webhook]: Duplicate deliveries return HTTP 200 to prevent external service retries
- [Webhook]: BullMQ webhook worker concurrency 2 (matches memory extraction pattern)
- [Webhook]: WebhookManager injected post-construction via setWebhookManager() (circular dependency resolution)
- [Webhook]: Secrets stripped from GET/LIST responses; only returned once at POST creation
- [Webhook]: Rate limiter uses Redis INCR+EXPIRE; failure doesn't block processing (graceful degradation)
- [Gmail]: OAuth callback is public (before requireApiKey) — Google redirects browser directly
- [Gmail]: Polling interval default 60s, configurable via GMAIL_POLL_INTERVAL_SEC
- [Gmail]: Seen message IDs stored in Redis SET with 500-entry cap
- [Gmail]: GmailProvider registered in ChannelManager alongside existing providers
- [Gmail]: MCP tools only registered when gmailProvider exists (graceful no-op without config)
- [Gmail]: Token failure notifications sent to Telegram/Discord via channelManager
- [Gmail]: Notifications stored in Redis nexus:notifications list (capped at 100)
- [Gmail]: Reply emails use In-Reply-To and References headers for proper threading

v2.0 Phase 3 decisions:
- [Compaction]: Brain passed as parameter to compactSession(), not stored on SessionManager
- [Compaction]: Token estimation via Math.ceil(text.length/4) — no tokenizer dependency
- [Compaction]: Auto-compact threshold 100k tokens, triggers after agent runs
- [Multi-Agent]: Redis with 1-hour TTL for session state, history as list
- [Multi-Agent]: Max 2 concurrent sub-agents via SCARD check (MULTI-06)
- [Multi-Agent]: Tools conditionally registered when multiAgentManager exists
- [Multi-Agent]: DAG enforcement via restricted ToolRegistry (exclude sessions_* tools) + system prompt
- [Multi-Agent]: Sub-agents use sonnet tier, stream disabled (background BullMQ execution)
- [Multi-Agent]: sessions_send only enqueues if session not already running (prevent duplicates)

### Pending Todos

None.

### Blockers/Concerns

- nexus-core: 153 PM2 restarts in 47h — ADDRESSED in v2.0-01-01 (expanded error handlers, circuit breaker, PM2 backoff); verify after deployment
- Memory service empty results — needs debugging
- SdkAgentRunner tools:[] doesn't disable built-in Bash/Read/Write (SDK issue #115)
- SDK token visibility in subscription mode — MEDIUM confidence, verify before Phase 3 usage schema
- Gmail requires GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET env vars + Google Cloud Console OAuth setup before verification

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed v2.0-03-03-PLAN.md (Sub-Agent Execution Engine) — Phase 3 complete
Resume file: None
