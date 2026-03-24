# Phase 9: Security & Permissions - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add security controls for AI computer use: user consent dialog before AI takes control, emergency stop hotkey (3x Escape) on the device agent, per-action audit logging with coordinates/timestamps, and auto-timeout for inactive sessions.

</domain>

<decisions>
## Implementation Decisions

### User Consent (SEC-01)
- Before the AI executes any mouse/keyboard tool, check if user has approved the computer use session
- Add a consent check in the agent loop (nexus agent.ts) or in livinityd before forwarding tool calls
- Frontend shows a modal dialog: "AI wants to control your device. Allow?" with Allow/Deny buttons
- Consent is per-session (one approval covers the entire session, not per-action)
- Store consent state in chatStatus or a dedicated consent map

### Emergency Stop (SEC-02)
- Agent binary monitors for 3 rapid Escape key presses (within 1 second)
- On detection: immediately stop executing tools, send a "emergency_stop" message through the WebSocket
- DeviceBridge receives emergency_stop → cancels any pending tool execution
- This works even if the LivOS UI is not open (agent-side hotkey)
- Use @jitsi/robotjs keyboard listener or native input monitoring

### Audit Logging (SEC-03)
- Every mouse/keyboard action logged with: tool name, coordinates/text, timestamp, screenshot reference
- Extend existing audit trail (from v14.0) — agent already logs tool executions
- Add coordinate/text metadata to audit events for computer use tools
- Store in Redis (existing audit storage pattern) with per-device capping

### Auto-Timeout (SEC-04)
- If no AI activity for configurable period (default 60s), auto-terminate the session
- Implement in the agent loop — track last tool call timestamp
- On timeout: send completion message, stop the loop
- Notify user via chatStatus that session timed out

### Claude's Discretion
- Exact consent dialog styling
- How to implement Escape key monitoring (robotjs vs native listener)
- Timeout reset logic (does screenshot count as activity?)
- Whether to add consent to agent protocol or keep it in livinityd

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `nexus/packages/core/src/agent.ts` — AgentLoop with computerUseStepLimit counter (from Phase 7)
- `livos/packages/livinityd/source/modules/ai/index.ts` — chatStatus map with computerUse fields
- `livos/packages/livinityd/source/modules/ai/routes.ts` — pause/stop mutations (from Phase 8)
- `agent/src/connection-manager.ts` — WebSocket connection, sends DeviceAuditEvent
- `agent/src/tools.ts` — executeTool dispatcher, TOOL_NAMES
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — DeviceBridge, audit logging
- Existing audit trail: agent sends DeviceAuditEvent, relay forwards, Redis stores (capped 1000/device)

### Established Patterns
- Audit events: `{ type: 'device_audit_event', tool, params, duration, success, timestamp }`
- chatStatus polling: frontend checks every 500ms
- Agent protocol: DeviceToolCall/DeviceToolResult message types
- AbortController for session stop (from Phase 8 gap closure)

### Integration Points
- `agent/src/tools.ts` — add Escape key listener for emergency stop
- `agent/src/connection-manager.ts` — send emergency_stop message type
- `nexus/packages/core/src/agent.ts` — add timeout tracking, consent gate
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — consent dialog before computer use
- `livos/packages/livinityd/source/modules/ai/routes.ts` — consent approval mutation

</code_context>

<specifics>
## Specific Ideas

- Consent dialog should be Apple-style clean: icon + "AI wants to control [device name]" + Allow/Deny
- Emergency stop should flash a red indicator on the tray icon briefly
- Audit log entries for computer use should include a thumbnail screenshot reference (not full screenshot)
- Timeout message should be clear: "Session ended — no activity for 60 seconds"

</specifics>

<deferred>
## Deferred Ideas

- Per-application permissions (v15.1)
- Consent preferences (always allow for specific devices)
- Audit log export/download
- Emergency stop customization (different hotkey)

</deferred>
