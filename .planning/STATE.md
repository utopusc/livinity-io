# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v6.0 — Claude Code → Kimi Code Migration
**Current focus:** Defining requirements

## Current Position

Milestone: v6.0 (Claude Code → Kimi Code Migration)
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-09 — Milestone v6.0 started

## Accumulated Context

### Decisions

- Kimi Code replaces Claude Code as sole AI provider
- Kimi Code CLI has OAuth-style auth (URL → code → paste) — same UX as Claude Code
- MCP stays, adapter layer converts tool definitions to Kimi's format
- Gemini fallback removed — single provider architecture
- All Anthropic SDK dependencies will be removed
- Redis keys and config schema updated for Kimi

### Claude Code Integration Points (from inventory)

| Category | Files | Status |
|----------|-------|--------|
| SDK imports | sdk-agent-runner.ts, claude.ts | To remove |
| Models | claude.ts, schema.ts, sdk-agent-runner.ts | To replace |
| OAuth | claude.ts, claude-oauth.mjs | To replace with Kimi auth |
| Agent runners | sdk-agent-runner.ts, agent.ts | To rewrite |
| MCP | sdk-agent-runner.ts | To adapt |
| Provider | claude.ts (ClaudeProvider) | To replace with KimiProvider |
| API endpoints | api.ts (/api/claude-cli/*) | To rename/rewrite |
| UI config | ai-config.tsx, setup-wizard.tsx | To redesign |
| tRPC routes | livinityd ai/routes.ts | To update |
| Environment | .env, Redis keys | To clean |
| Config schema | schema.ts | To update |
| Packages | @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk | To remove |

## Session Continuity

Last session: 2026-03-09
Stopped at: Defining requirements for v6.0 migration
