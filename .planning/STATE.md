---
gsd_state_version: 1.0
milestone: v20.0
milestone_name: Live Agent UI
status: unknown
stopped_at: Completed 12-01-PLAN.md
last_updated: "2026-03-27T09:01:27.466Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v20.0 -- Live Agent UI
**Current focus:** Phase 12 — MCP Tool Bridge

## Current Position

Phase: 13
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

| Phase 11 P01 | 4min | 2 tasks | 2 files |
| Phase 12 P01 | 3min | 2 tasks | 2 files |

### Decisions

- v20.0 continues phase numbering from v19.0 (Phase 11 is first phase)
- Claude Agent SDK runs as subprocess, not embedded — query() with async generator
- MCP tools wrap existing ToolRegistry tools via tool() + createSdkMcpServer()
- WebSocket transport (not SSE) for streaming — bidirectional needed for mid-conversation interaction
- Provider layer preserved alongside SDK path (SDK-NF-03)
- Session persistence via SDK session_id + Redis metadata
- [Phase 11]: SDK is default agent runner; legacy AgentLoop accessible via Redis key nexus:config:agent_runner=legacy
- [Phase 11]: Watchdog 60s + budget caps (opus=0, sonnet=, haiku/flash=) protect against hangs and runaway costs
- [Phase 11]: Subprocess env restricted to HOME, PATH, NODE_ENV, LANG, ANTHROPIC_API_KEY only
- [Phase 12]: 50k char truncation limit (~12.5k tokens) balances detail vs SDK context budget
- [Phase 12]: Images forwarded as MCP image content blocks preserving mimeType from ToolResult
- [Phase 12]: Exported buildSdkTools and paramTypeToZod for direct testing without SDK subprocess

### Pending Todos

None

### Blockers/Concerns

- Claude Agent SDK requires valid Anthropic API key — must verify key config path works server-side
- SDK subprocess lifecycle management (start/stop/cleanup) needs careful design

## Session Continuity

Last session: 2026-03-27T08:57:40.572Z
Stopped at: Completed 12-01-PLAN.md
Resume file: None
