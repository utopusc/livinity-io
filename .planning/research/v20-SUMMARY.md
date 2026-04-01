# Research Summary: v20.0 Live Agent UI

**Domain:** AI Agent Chat with Real-Time Claude Agent SDK Streaming
**Researched:** 2026-03-27
**Overall confidence:** HIGH

## Executive Summary

v20.0 replaces the existing Nexus AI chat (custom agent loop + SSE streaming via `/api/agent/stream`) with the Claude Agent SDK, delivering a Claude Code-like experience in the browser. The key finding is that the existing codebase already has 80% of the infrastructure needed -- the `SdkAgentRunner` already consumes `query()` output, `ws` is already a dependency, and the WebSocket architecture pattern exists in `WsGateway` and `/ws/desktop`. The primary new work is (1) a WebSocket endpoint that relays SDK messages to the browser, (2) a React client that renders streaming events with proper state management, and (3) removing the old Nexus AI abstraction layer.

The Claude Agent SDK (v0.2.85, latest) provides a `query()` async generator that yields typed `SDKMessage` events including `stream_event` (real-time deltas), `assistant` (complete turns), and `result` (final outcome with cost). Enabling `includePartialMessages: true` unlocks character-by-character streaming. The SDK spawns a Claude Code CLI subprocess per session, which handles tool execution, context management, and compaction internally -- eliminating the need for the custom `AgentLoop` class, `KimiAgentRunner`, and provider abstraction.

For streaming markdown rendering, `streamdown` (from Vercel) is the recommended replacement for `react-markdown` in the agent chat view. It handles unterminated markdown blocks during streaming, includes Shiki syntax highlighting, and is compatible with shadcn/ui design tokens. The existing `react-markdown` setup stays for non-agent views (settings, help text).

The critical architectural decision is WebSocket over SSE for the transport layer. v20.0 requires bidirectional communication (mid-conversation message injection, interrupt/cancel signals), which SSE cannot provide on a single connection. The project already uses WebSocket extensively (tRPC, VNC, WsGateway), making this the natural choice.

## Key Findings

**Stack:** Claude Agent SDK `query()` + WebSocket relay + `streamdown` for streaming markdown. One new dependency (`streamdown`). No framework changes.

**Architecture:** Dedicated `/ws/agent` WebSocket endpoint (like `/ws/desktop`). Server-side `AgentSessionManager` maps users to `query()` instances. SDK messages relayed directly to browser (no transformation layer). Client-side `useAgentSocket` hook with streaming state machine.

**Critical pitfall:** The SDK spawns a CLI subprocess per session (~100MB RAM each). At 5+ concurrent users, this becomes the primary resource constraint on Server4. Must set `maxTurns` and `maxBudgetUsd` to prevent runaway sessions. Must clean up on WebSocket disconnect to avoid orphaned processes.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **WebSocket Agent Endpoint** - Build `/ws/agent` with JWT auth and basic SDK `query()` relay
   - Addresses: Real-time streaming, model selection, stop/cancel
   - Avoids: Pitfall 6 (permission mode), Pitfall 7 (API key propagation)
   - This is the foundation. Everything depends on it. Test with a simple prompt before building UI.

2. **Streaming Chat UI** - New React component with `streamdown`, tool visualization, message state machine
   - Addresses: Live text streaming, tool call visualization, code highlighting, error display
   - Avoids: Pitfall 2 (event ordering), Pitfall 5 (re-render storm)
   - Build the event state machine first, then the visual components.

3. **Mid-Conversation & Session Management** - Streaming input mode for message injection, session persistence
   - Addresses: Send message while agent works, session resume, disconnect handling
   - Avoids: Pitfall 4 (disconnect during long sessions), Pitfall 9 (session ID mismatch)
   - This is the hardest phase. The streaming input AsyncGenerator pattern has subtle timing requirements.

4. **Nexus AI Cleanup** - Remove old agent loop, provider abstraction, SSE endpoint, AI settings
   - Addresses: PROJECT.md requirement to remove Nexus AI API layer
   - Avoids: Pitfall 13 (stale UI from partial removal)
   - Do this LAST, after the new system is fully working. Don't remove old code until new code is validated.

**Phase ordering rationale:**
- Phase 1 before Phase 2: Can't build the UI without the backend endpoint to connect to.
- Phase 2 before Phase 3: Basic streaming must work before adding mid-conversation complexity.
- Phase 3 before Phase 4: Don't remove old code until replacement is complete.
- Each phase can be tested independently. Phase 1 can be verified with `wscat` or a simple HTML test page.

**Research flags for phases:**
- Phase 1: Standard patterns. The `SdkAgentRunner` and `WsGateway` provide working examples. Unlikely to need deeper research.
- Phase 2: `streamdown` integration may need testing for CSS conflicts. The stream event state machine is non-trivial but well-documented in SDK docs.
- Phase 3: The AsyncGenerator input pattern for mid-conversation messages is the least documented area. May need experimentation.
- Phase 4: Straightforward deletion. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SDK already integrated, WebSocket already in use, `streamdown` is well-documented |
| Features | HIGH | SDK docs clearly describe all message types and capabilities |
| Architecture | HIGH | Follows existing patterns (WsGateway, /ws/desktop), reference implementation exists |
| Pitfalls | HIGH | SDK docs explicitly document limitations (thinking + streaming, subprocess model) |
| Streaming input mode | MEDIUM | Less documented than single-message mode. May need experimentation for edge cases. |
| `streamdown` integration | MEDIUM | New library, not yet used in project. CSS compatibility with existing theme needs testing. |

## Gaps to Address

- **OAuth PKCE flow with SDK**: The existing `ClaudeProvider` has OAuth PKCE auth for subscription users. How this interacts with the SDK's auth (which reads `ANTHROPIC_API_KEY` env var or `~/.claude/` credentials) needs verification during Phase 1.
- **Concurrent session limits**: How many simultaneous `query()` sessions can Server4 (8GB RAM) handle? Needs load testing during Phase 1.
- **V2 Session API stability**: The `unstable_v2_createSession` API is cleaner for multi-turn but marked unstable. Monitor for stabilization. Could simplify Phase 3 significantly.
- **Kimi fallback**: v20.0 removes Kimi support. If Claude API is down, there's no fallback. Acceptable for v20.0 but should be addressed in a future milestone.
