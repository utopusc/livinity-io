# Phase 47: Platform OAuth + Relay Device Infrastructure - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the foundational infrastructure for device registration and connectivity. Delivers: livinity.io OAuth Device Authorization Grant endpoints (register, token, approve page), relay server DeviceRegistry with /device/connect WebSocket endpoint, and PostgreSQL devices table. Does NOT build the agent binary itself (Phase 48) or message routing (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### OAuth Device Flow Design
- Follow RFC 8628 exactly: POST /api/device/register returns device_code + user_code + verification_uri + interval + expires_in
- User code format: 4 alphanumeric uppercase chars + dash + 4 chars (e.g., "ABCD-1234") for easy readability
- Device code: nanoid(32) — opaque, never shown to user
- Token polling interval: 5 seconds (RFC default)
- Grant expiry: 15 minutes (RFC recommends short window)
- Store pending grants in PostgreSQL `device_grants` table (not Redis — need persistence across relay restarts)

### Device Approval Page
- Route: /device (Next.js App Router page)
- Simple centered card with code input field and "Approve Device" button
- Requires active session (redirect to /auth/login if not logged in)
- After approval, show success state with device name and OS info
- Match existing livinity.io Apple-style premium design

### Device Token (JWT)
- Claims: { userId, deviceId, deviceName, platform, iat, exp }
- Expiry: 24 hours (auto-refresh by agent before expiry)
- Signed with same JWT secret as relay API key tokens
- Separate from user session tokens — device tokens are long-lived background tokens

### Relay /device/connect Endpoint
- New WebSocket endpoint at /device/connect (separate from /tunnel/connect)
- Auth: device JWT in first message (same pattern as TunnelAuth but for devices)
- Auth timeout: 5 seconds (matching existing tunnel auth timeout)
- Create DeviceRegistry class (parallel to TunnelRegistry): Map<userId, Map<deviceId, DeviceConnection>>
- DeviceConnection stores: ws, deviceId, deviceName, platform, tools[], lastSeen, sessionId
- Heartbeat: 30s ping/pong (same as tunnel)
- Reconnection buffer: 30s grace period (same as tunnel)

### Database Schema
- New `devices` table in platform PostgreSQL: id, user_id, device_id (UUID), device_name, platform, created_at, last_seen, revoked
- New `device_grants` table: id, user_id (nullable until approved), device_code, user_code, status (pending/approved/expired), device_info (JSON), created_at, expires_at
- Use Drizzle ORM (matching platform/web pattern)

### Claude's Discretion
- Error response formatting and HTTP status codes
- Internal code organization within relay/src/
- Drizzle migration file naming

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/relay/src/tunnel-registry.ts` — TunnelRegistry class is the direct template for DeviceRegistry
- `platform/relay/src/auth.ts` — bcrypt + prefix API key auth; JWT validation will follow similar pattern
- `platform/relay/src/protocol.ts` — Message type definitions to extend
- `platform/relay/src/config.ts` — Relay configuration constants (heartbeat, timeouts)
- `platform/web/src/lib/auth.ts` — Session validation for the approval page
- `platform/web/src/db/schema.ts` — Drizzle schema patterns (apps, installHistory)
- `platform/web/src/app/api/` — API route patterns (login, register, etc.)

### Established Patterns
- Relay: WebSocket auth on first message with 5s timeout, then session-based reconnection
- Platform API: JSON request/response, session cookie auth for user routes
- Database: Drizzle ORM with PostgreSQL, schema in `src/db/schema.ts`
- UI: Next.js App Router pages with Apple-style centered card layouts

### Integration Points
- Relay: Add /device/connect handler in `index.ts` alongside existing /tunnel/connect
- Platform API: Add /api/device/* routes in `src/app/api/device/`
- Platform UI: Add /device page in `src/app/device/page.tsx`
- Database: Extend schema.ts with devices + device_grants tables

</code_context>

<specifics>
## Specific Ideas

- Device approval page should match the existing auth pages (login, register) — centered card, minimal, premium feel
- User code should be easy to type on mobile — uppercase alphanumeric, no ambiguous characters (0/O, 1/I/l)
- Relay should log device connections/disconnections for debugging
- Device JWT should include platform info (win32/darwin/linux) so the UI can show appropriate icons

</specifics>

<deferred>
## Deferred Ideas

- Device token revocation from dashboard (Phase 52 — My Devices UI handles this)
- Device notification to LivOS on connect/disconnect (Phase 49 — message routing)
- Rate limiting on device registration endpoint (Phase 53 — security hardening)

</deferred>
