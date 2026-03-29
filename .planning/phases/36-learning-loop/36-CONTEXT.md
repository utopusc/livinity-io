# Phase 36: Learning Loop - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds tool call execution logging to Redis streams, pattern mining for co-used capabilities, proactive capability suggestions based on intent history, and user feedback (task completion + rating) that feeds into capability confidence scores. Backend-focused with a small UI touchpoint for the feedback mechanism.

</domain>

<decisions>
## Implementation Decisions

### Tool Call Logging
- Redis stream `nexus:tool_calls` — each entry contains tool name, input params (truncated), output status, duration_ms, success/failure boolean
- Logged in agent-session.ts after each tool execution — wraps the existing tool.execute() call
- Stream maxlen: 10,000 entries (MAXLEN ~10000 approximate trimming)
- Entry format: `{tool, type, input_hash, success, duration_ms, timestamp, session_id}`

### Pattern Mining
- New `learning-engine.ts` module in nexus/packages/core/src/
- Analyzes Redis stream to find co-occurrence patterns — tools used in same session
- Simple co-occurrence matrix: count how often tool A and tool B appear in same session
- Runs on-demand (not scheduled) — called when livinity_recommend needs data

### Proactive Suggestions
- IntentRouter enhanced: after resolving capabilities, check learning engine for commonly co-used tools not yet in the result set
- Append suggestions with lower confidence scores (0.1 below threshold) — they appear in discover_capability results
- Based on intent history from Redis cache (existing `nexus:intent:*` keys from Phase 31)

### User Feedback
- New tRPC route `rateConversation` — accepts conversationId, rating (1-5), completed boolean
- Stores in Redis `nexus:feedback:{conversationId}` with tool names used in that conversation
- Feedback aggregated into capability success_rate in CapabilityRegistry metadata
- UI: small feedback widget at end of conversation (thumbs up/down + optional 1-5 stars)

### Claude's Discretion
- Co-occurrence threshold for "commonly used together"
- Feedback aggregation algorithm
- Stream entry TTL/cleanup strategy
- UI feedback widget exact design

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent-session.ts`: Agent loop with tool execution — logging point
- `intent-router.ts`: resolveCapabilities() — suggestion injection point
- `capability-registry.ts`: CapabilityManifest with metadata field for success_rate
- Redis client: available throughout Nexus
- `routes.ts` in livinityd: tRPC route definitions
- `capabilities-panel.tsx`: Analytics tab (Phase 35) that will consume this data

### Established Patterns
- Redis streams: XADD/XRANGE for append-only logs
- Tool execution: tool.execute(params) in agent-session
- CapabilityManifest.metadata: flexible object for additional data
- tRPC mutations for data submission

### Integration Points
- `agent-session.ts`: Wrap tool.execute() with timing + logging
- `intent-router.ts`: Add suggestion injection after resolveCapabilities()
- `routes.ts`: New rateConversation tRPC mutation
- Analytics tab in capabilities-panel.tsx: Consumes getAnalytics tRPC route (already created in Phase 35)
- Chat UI: Feedback widget at conversation end

</code_context>

<specifics>
## Specific Ideas

- Tool call log entry: `XADD nexus:tool_calls MAXLEN ~10000 * tool {name} success {0|1} duration {ms} session {id}`
- Co-occurrence: simple Map<string, Map<string, number>> built from scanning stream entries by session_id
- Suggestion format: `{capability: CapabilityManifest, reason: "commonly used with {tool}", confidence: 0.25}`
- Feedback widget: floating bar at bottom of chat with "Was this helpful?" + thumbs up/down

</specifics>

<deferred>
## Deferred Ideas

- A/B testing different capability sets — future
- Cross-user pattern aggregation — future
- Capability deprecation suggestions — future
- Time-series analytics — future

</deferred>
