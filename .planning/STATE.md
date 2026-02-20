# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v2.0 — OpenClaw-Class AI Platform
**Current focus:** Phase 2 complete. Ready for Phase 3 (Intelligence Layer).

## Current Position

Milestone: v2.0 (OpenClaw-Class AI Platform)
Phase: 2 of 6 (Automation Infrastructure) -- COMPLETE
Plan: 4 of 4 in phase (complete)
Status: Phase complete
Last activity: 2026-02-20 — Completed v2.0-02-04-PLAN.md (Gmail MCP Tools)

Progress: [████████░░░░░░░░░░░░░░] 8/22 (~36%)

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v2.0)
- Average duration: 6.6min
- Total execution time: 45min

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
- [Commands]: /compact is stub until session compaction ships in Phase 3
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
- [Gmail]: OAuth callback is public (before requireApiKey) — Google redirects browser directly
- [Gmail]: Polling interval default 60s, configurable via GMAIL_POLL_INTERVAL_SEC
- [Gmail]: Seen message IDs stored in Redis SET with 500-entry cap
- [Gmail]: GmailProvider registered in ChannelManager alongside existing providers
- [Gmail]: MCP tools only registered when gmailProvider exists (graceful no-op without config)
- [Gmail]: Token failure notifications sent to Telegram/Discord via channelManager
- [Gmail]: Notifications stored in Redis nexus:notifications list (capped at 100)
- [Gmail]: Reply emails use In-Reply-To and References headers for proper threading

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
Stopped at: Completed v2.0-02-04-PLAN.md (Phase 2 complete)
Resume file: None
