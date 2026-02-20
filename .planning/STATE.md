# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v2.0 — OpenClaw-Class AI Platform
**Current focus:** Phase 1 — Stability & Security Foundation

## Current Position

Milestone: v2.0 (OpenClaw-Class AI Platform)
Phase: 1 of 6 (Stability & Security Foundation)
Plan: 3 of 4 in phase (v2.0-01-01, v2.0-01-02, v2.0-01-03 complete)
Status: In progress
Last activity: 2026-02-20 — Completed v2.0-01-02-PLAN.md (DM Pairing Security)

Progress: [███░░░░░░░░░░░░░░░░░░░] 3/22 (~14%)

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (v2.0)
- Average duration: 7min
- Total execution time: 18min

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

### Pending Todos

None.

### Blockers/Concerns

- nexus-core: 153 PM2 restarts in 47h — ADDRESSED in v2.0-01-01 (expanded error handlers, circuit breaker, PM2 backoff); verify after deployment
- Memory service empty results — needs debugging
- SdkAgentRunner tools:[] doesn't disable built-in Bash/Read/Write (SDK issue #115)
- SDK token visibility in subscription mode — MEDIUM confidence, verify before Phase 3 usage schema

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed v2.0-01-02-PLAN.md (DM Pairing Security)
Resume file: .planning/phases/v2.0-p01-stability-security/v2.0-01-04-PLAN.md
