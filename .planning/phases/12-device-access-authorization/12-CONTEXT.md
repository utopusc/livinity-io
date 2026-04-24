# Phase 12: Device Access Authorization - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Every device-routed tool call — whether through tRPC, Nexus REST, or the agent tool loop — verifies the caller owns the target device before executing, with failures surfaced clearly and recorded.

**Scope:**
- Single `authorizeDeviceAccess(userId, deviceId)` helper that verifies ownership via Redis DeviceRegistry + PostgreSQL fallback
- Invoke it in DeviceBridge tool dispatch (livos/livinityd)
- Invoke it in tRPC `devices.*` action routes (beyond list — tool invocations like shell/files)
- Invoke it in any REST endpoints that accept deviceId + action
- Authorization failures: return structured error `{code: "device_not_owned", message, deviceId}`
- Authorization failures append a row to a stub device_audit_log (or Redis stream if Phase 15's PG table doesn't exist yet — Phase 15 replaces stub with full PG implementation)
- Admin bypass is NOT allowed here — admin uses explicit Phase 16 endpoints for cross-user access

**Out of scope:**
- Shell tool default-device behavior → Phase 13
- Session binding via JWT → Phase 14
- Full audit log PG table → Phase 15 (this phase uses a stub)
- Admin cross-user endpoints → Phase 16

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — discuss skipped.

**Build on Phase 11 foundations:**
- `getDevicesForUser(userId)` exists in DeviceBridge → use it for ownership check
- `devices.rename`/`remove` already have FORBIDDEN ownership checks → extract the logic into reusable `authorizeDeviceAccess` helper
- Device Redis cache includes `userId` → O(1) ownership lookup

**Stub audit log (for Phase 15 to replace):**
- Use a Redis list `nexus:device:audit:failures` for failed-auth events
- Structure: `{timestamp, userId, deviceId, action, error}` JSON
- Phase 15 will migrate to PostgreSQL `device_audit_log` table

</decisions>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. Every device-routed tool call (tRPC or REST or agent tool loop) verifies caller owns target device before executing
2. Authorization failures return structured error without forwarding to the device bridge
3. Failures are recorded to audit log (stub acceptable — Phase 15 formalizes)
4. Single reusable `authorizeDeviceAccess` helper used across all callsites

**Implementation sketch (for plan-phase to refine):**
- Plan 12-01: Extract + create `authorizeDeviceAccess(userId, deviceId) → AuthResult` helper in livinityd/devices; add stub audit-log writer
- Plan 12-02: Apply helper to all device-routed callsites (tRPC tool routes, REST endpoints, DeviceBridge.handleToolCall)

</specifics>

<deferred>
## Deferred Ideas

- Admin bypass — Phase 16
- Full PG audit log schema — Phase 15
- Session/JWT binding — Phase 14

</deferred>
