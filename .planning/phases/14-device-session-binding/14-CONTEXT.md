# Phase 14: Device Session Binding - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Each DeviceBridge WebSocket connection is bound to a specific user session JWT at handshake, tokens expire and require refresh, and logout/session revocation disconnects all active device bridges.

**Scope:**
- Device bridge WS handshake validates session JWT in addition to device token; records {userId, deviceId, sessionId, tokenExpiresAt}
- Session/user mismatch: close 1008 unauthorized
- Server-side expiry timer: when tokenExpiresAt reached without refresh, close with code 4401
- Logout / session revocation: emit pub/sub event; matching sessionId bridges close with "session_revoked" within 5s
- Reconnection after revocation requires fresh login and new device token

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Session JWT is already issued/validated for Web UI — reuse the existing `is-authenticated` pattern
- Device bridge endpoint is at relay side (`platform/relay`) — the ws handshake currently accepts device tokens only
- Add sessionId claim validation at relay handshake against the `/session` validate endpoint or JWT decode
- Logout event: Redis pub/sub channel `livos:sessions:revoked` — relay subscribes and iterates active bridges

**Expiry implementation:**
- tokenExpiresAt stored in DeviceConnection at handshake (from JWT `exp` claim)
- setTimeout / setInterval checks every 60s to close expired connections
- Close code 4401 = "token_expired"
- Close code 4403 = "session_revoked" (Phase 16 also uses for admin disconnect)
- Close code 1008 = standard unauthorized

</decisions>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. /device/connect handshake validates session JWT, records bindings
2. Server-side expiry timer closes bridge with 4401 when token expires
3. Logout closes matching sessionId bridges within 5s
4. Reconnection requires fresh login + new device token

**Implementation sketch:**
- Plan 14-01: Handshake session binding + expiry watchdog
- Plan 14-02: Logout/revocation pub/sub + bridge disconnection

</specifics>

<deferred>
## Deferred Ideas

- Admin force-disconnect — Phase 16
- Fine-grained per-tool session policies — future

</deferred>
