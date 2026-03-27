---
gsd_state_version: 1.0
milestone: v20.0
milestone_name: Live Agent UI
status: unknown
stopped_at: Completed 18-01-PLAN.md
last_updated: "2026-03-27T12:30:31.963Z"
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
**Current focus:** Phase 18 — Cost Control + Settings Cleanup

## Current Position

Phase: 18
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 6min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17 | 2 | 12min | 6min |
| Phase 18 P01 | 14min | 2 tasks | 5 files |

## Accumulated Context

| Phase 11 P01 | 4min | 2 tasks | 2 files |
| Phase 12 P01 | 3min | 2 tasks | 2 files |
| Phase 13 P01 | 15min | 2 tasks | 6 files |
| Phase 13 P02 | 15min | 2 tasks | 2 files |
| Phase 14 P01 | 7min | 3 tasks | 5 files |
| Phase 14 P02 | 5min | 2 tasks | 1 files |
| Phase 15 P01 | 7min | 2 tasks | 2 files |
| Phase 16 P01 | 5min | 2 tasks | 2 files |
| Phase 17 P01 | 7min | 2 tasks | 5 files |
| Phase 17 P02 | 5min | 2 tasks | 2 files |

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
- [Phase 13]: AsyncIterable prompt mode with createInputChannel for mid-conversation message injection
- [Phase 13]: Zero-transformation SDK message relay: { type: 'sdk_message', data: SDKMessage }
- [Phase 13]: Single session per user via Map<userId, ActiveSession> with cleanup-on-new-start
- [Phase 13]: No session kill on WS disconnect -- allows reconnection on tab refresh
- [Phase 13]: useReducer for message state to avoid stale closures in WebSocket callbacks
- [Phase 13]: requestAnimationFrame batching for stream deltas -- mutable ref accumulation, RAF flush
- [Phase 13]: Dual-path send: WebSocket when connected, tRPC mutation fallback when disconnected
- [Phase 14]: Error messages detected by id prefix 'err_' matching ADD_ERROR reducer pattern
- [Phase 14]: Streamdown animated mode with isAnimating tied to message streaming state
- [Phase 14]: Component-per-role pattern: separate components for user/assistant/system/error with ChatMessageItem dispatcher
- [Phase 14]: Removed tRPC send mutation fallback -- WebSocket is now the only message path
- [Phase 14]: Auto-scroll pauses at 100px distance-from-bottom threshold
- [Phase 14]: VoiceButton removed from input area (tightly coupled to old state)
- [Phase 15]: content_block_stop keeps status running not complete -- tool input finalization != execution complete
- [Phase 15]: Tool output from both tool_use_summary (summary) and user tool_result (actual content) -- dual completion paths
- [Phase 15]: 1500-char output truncation with show more/less toggle for tool call cards
- [Phase 16]: onSend callback overloaded by parent: ChatInput always calls onSend(), parent routes to sendFollowUp or sendMessage based on streaming state
- [Phase 16]: Textarea stays enabled during streaming with placeholder 'Type to send a follow-up...' to signal interactivity
- [Phase 17]: Turn accumulation in consumeAndRelay: accumulate text + tool calls, flush on result message
- [Phase 17]: onTurnComplete callback pattern: AgentSessionManager stays storage-agnostic, ws-agent.ts bridges to AiModule
- [Phase 17]: Tool outputs captured from user tool_result blocks matching pending tool calls
- [Phase 17]: conversationIdRef uses useRef not useState -- avoids re-renders, parent manages via URL params
- [Phase 17]: useUtils() imperative fetch for sidebar conversation click -- user-triggered, not auto-fetch
- [Phase 17]: initialConvLoaded ref gate prevents double-load on mount when isConnected changes
- [Phase 18]: Cost displayed in connection status bar (subtle, non-intrusive placement)
- [Phase 18]: PersonalizationCard removed alongside NexusConfigSection (only consumer)

### Pending Todos

None

### Blockers/Concerns

- Claude Agent SDK requires valid Anthropic API key — must verify key config path works server-side
- SDK subprocess lifecycle management (start/stop/cleanup) needs careful design

## Session Continuity

Last session: 2026-03-27T12:13:55.697Z
Stopped at: Completed 18-01-PLAN.md
Resume file: None
