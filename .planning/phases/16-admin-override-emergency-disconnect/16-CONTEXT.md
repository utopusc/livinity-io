# Phase 16: Admin Override & Emergency Disconnect - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Admin panel lists all devices across all users and can force-terminate any active device bridge.

**Scope:**
- Admin-only tRPC: `devices.adminListAll` (lists every device across all users with ownership info)
- Admin-only REST: `GET /api/admin/devices` on platform/web (cross-user)
- Admin-only tRPC: `devices.adminForceDisconnect(deviceId)` — closes the DeviceBridge WebSocket with code 4403 reason 'admin_disconnect'
- Non-admin users get FORBIDDEN for all admin endpoints
- Admin actions audit-logged via Phase 15's recordDeviceEvent with special markers (tool_name='admin_list_all' / 'admin_force_disconnect')
- Basic UI: Admin panel shows cross-user device table, "Force Disconnect" button on online rows

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Reuse existing `adminProcedure` (RBAC from v7.0)
- Reuse Phase 14's WS close 4403 pattern for force disconnect
- Admin listing: `DeviceBridge.allConnections()` (already exists from Phase 14)
- UI minimal — just add admin-only section to My Devices page (or dedicated /admin/devices if cleaner)
- Use Phase 15 audit sink for admin actions (attribution to admin user)

**UI approach:**
- Add to existing Settings → Users / Admin panel (if exists) or create new Settings → Admin → Devices section
- Show username, device id, status, last connected, force-disconnect button
- Non-admin users never see this section (role check)

</decisions>

<specifics>
## Specific Ideas

**Success criteria:**
1. Admin-only tRPC devices.adminListAll + REST /api/admin/devices return all devices cross-user; members get 403
2. Admin panel renders cross-user device table with red "Force Disconnect" button on each online row
3. Force Disconnect closes WebSocket with 4403 reason 'admin_disconnect'; device offline within 3s
4. Admin list-all and force-disconnect actions write audit rows attributing to admin's user_id

**Plans:**
- Plan 16-01: Admin backend — adminListAll tRPC + REST endpoint + adminForceDisconnect + audit integration
- Plan 16-02: Admin UI — cross-user device table + Force Disconnect button (minimal styling, functional)

</specifics>

<deferred>
## Deferred Ideas

- Admin-to-admin approvals (multi-admin oversight) — future
- Device transfer between users (admin tool) — v27.0
- Bulk force-disconnect — future

</deferred>
