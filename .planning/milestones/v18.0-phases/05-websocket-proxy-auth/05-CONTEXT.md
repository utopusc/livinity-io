# Phase 5: WebSocket Proxy & Auth - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `/ws/desktop` WebSocket endpoint to livinityd that bridges browser WebSocket connections to x11vnc's VNC TCP socket (localhost:5900). JWT auth on upgrade, Origin header validation, session persistence when browser disconnects.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase.

Key constraints:
- `/ws/desktop` must follow the existing upgrade handler pattern in `server/index.ts` (line 359+)
- **Critical difference from existing WS proxies**: VNC uses raw TCP, NOT WebSocket upstream. Use `net.connect(5900, '127.0.0.1')` instead of `new WebSocket()`. Bridge WS binary frames ↔ TCP data.
- JWT validation via `this.verifyToken(token)` — token from `?token=` query param (same as other WS endpoints)
- Origin header check: reject if Origin doesn't match the configured domain
- x11vnc process persists independently — closing WS only disconnects the viewer, not the VNC session
- NativeApp idle timer should reset on each WS connection/message to keep x11vnc alive while in use

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/index.ts` upgrade handler (line 359) — existing WS upgrade with JWT auth pattern
- `/ws/voice` proxy (line 476) — WS-to-WS bidirectional relay with JWT, closest pattern to adapt
- `this.verifyToken(token)` — JWT verification method already available on LivOSServer
- `WebSocketServer({noServer: true})` — used for all WS upgrades, `handleUpgrade` pattern
- `NativeApp.resetIdleTimer()` — keeps x11vnc alive during active use

### Established Patterns
- WS auth: token from `searchParams.get('token')`, verify, destroy socket on failure
- Bidirectional relay: `clientWs.on('message') → upstream.send()` and vice versa
- Cleanup: mutual close on either end disconnect, error → close other side
- Upstream failure: destroy raw socket before upgrade completes

### Integration Points
- Add `/ws/desktop` handler in `server/index.ts` upgrade handler, BEFORE the generic router check (line 542)
- Use `net.connect()` for TCP upstream to VNC port 5900 (NOT WebSocket)
- Bridge: WS binary frames ↔ TCP raw bytes
- Reset NativeApp idle timer on connection and on data activity
- NativeApp start: ensure x11vnc is running before connecting (auto-start if stopped)

</code_context>

<specifics>
## Specific Ideas

The WS-to-TCP bridge pattern (websockify equivalent):
```
Browser WS → livinityd /ws/desktop → net.connect(5900) → x11vnc TCP
```

Binary data flows in both directions:
- Client WS message (binary) → write to TCP socket
- TCP socket data → send as WS binary message

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
