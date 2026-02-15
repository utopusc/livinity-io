# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.5 — Claude Migration & AI Platform
**Current focus:** Defining requirements

## Current Position

Milestone: v1.5 (Claude Migration & AI Platform)
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-15 — Milestone v1.5 started

## Accumulated Context

### Decisions

v1.5 decisions:
- [Milestone]: Replace Gemini with Claude subscription-based auth (Yol A: wrap `claude setup-token` CLI)
- [Milestone]: Multi-provider AI support (Claude primary, OpenAI/Gemini optional fallback)
- [Milestone]: OpenClaw-inspired features integrated with LivOS security model
- [Milestone]: install.sh auto-installs Claude Code CLI
- [Milestone]: LivOS UI one-click Claude auth flow
- [Milestone]: Keep localhost-only Docker isolation and JWT security approach
- [Tech]: Tier mapping: flash→haiku, sonnet→sonnet, opus→opus
- [Tech]: Brain class rewrite from @google/genai to @anthropic-ai/sdk
- [Tech]: Auth via subscription token from `claude setup-token` (not API key)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-15
Stopped at: Starting v1.5 milestone — research phase
Resume file: None
