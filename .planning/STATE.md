# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v2.0 — OpenClaw-Class AI Platform
**Current focus:** Defining requirements

## Current Position

Milestone: v2.0 (OpenClaw-Class AI Platform)
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-20 — Milestone v2.0 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

v1.5 decisions (carried forward):
- [Milestone]: Claude Code SDK subscription mode (dontAsk permissionMode)
- [Milestone]: SdkAgentRunner as primary agent execution engine
- [Milestone]: Nexus tools via MCP (nexus-tools server)
- [Tech]: Chrome DevTools MCP for browser control
- [Tech]: Telegram dedup via Redis NX + stale message filter
- [Tech]: Channel conversation history for all providers
- [Tech]: AI-generated live updates (agent's own text, not hardcoded descriptions)

v2.0 decisions:
- [Milestone]: Claude Code Auth ONLY — no API keys, no Gemini, no OpenAI
- [Milestone]: Telegram + Discord only (WhatsApp deferred)
- [Milestone]: Cartesia for TTS, Deepgram for STT
- [Milestone]: Web-based Live Canvas (no native apps)
- [Milestone]: LivHub branding for skill registry

### Pending Todos

None.

### Blockers/Concerns

- nexus-core: 153 PM2 restarts in 47h — must investigate root cause
- Memory service empty results — needs debugging
- SdkAgentRunner tools:[] doesn't disable built-in tools

## Session Continuity

Last session: 2026-02-20
Stopped at: Defining v2.0 milestone requirements
Resume file: None
