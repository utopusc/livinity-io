---
phase: 16-admin-override-emergency-disconnect
plan: 01
subsystem: livinityd/devices + platform/relay + platform/web
tags: [admin, rbac, force-disconnect, websocket, trpc, audit, tunnel-protocol, device-security]
requirements_completed: [ADMIN-01, ADMIN-02]
requirements_partial: false
dependency_graph:
  requires:
    - phase: 15-device-audit-log
      plan: 02
      why: "Consumes recordDeviceEvent writer for admin.list_all and admin.force_disconnect audit rows"
    - phase: 14-device-session-binding
      plan: 02
      why: "Reuses DeviceConnection.ws close-code pattern (4401 token_expired -> 4403 admin_disconnect)"
    - phase: 11-device-ownership-foundation
      plan: 02
      why: "Reuses DeviceBridge.getAllDevicesFromRedis + getDeviceFromRedis primitives and the tunnel message wire"
    - phase: 7-multi-user
      why: "adminProcedure (requireRole('admin')) is the authoritative gate on both adminListAll and adminForceDisconnect"
  provides:
    - "admin_force_disconnect tunnel verb (livinityd -> relay) that closes any DeviceConnection WS with code 4403 reason 'admin_disconnect', crossing user boundaries by design"
    - "DeviceBridge.forceDisconnect(targetUserId, deviceId) — thin wrapper that sends the tunnel message without touching local state (cleanup follows the relay's ws.close -> device_disconnected echo pathway)"
    - "devicesAdmin tRPC router with two adminProcedure endpoints: adminListAll (cross-user device query with username join) + adminForceDisconnect (relay dispatch + audit)"
    - "devicesAdmin.adminListAll and devicesAdmin.adminForceDisconnect in httpOnlyPaths — admin-only; HTTP so failures surface immediately"
    - "platform/web REST GET /api/admin/devices — defense-in-depth cross-user listing behind platform-admin detection (oldest user, matches migration 0007 convention)"
  affects:
    - "Plan 16-02 UI consumer can call trpc.devicesAdmin.adminListAll() and trpc.devicesAdmin.adminForceDisconnect({deviceId}) directly"
    - "Phase 15 device_audit_log gains two new tool_name values: 'admin.list_all' and 'admin.force_disconnect' (no schema changes)"
    - "Future admin operations can follow the same pattern: new tunnel verb + new devicesAdmin procedure + httpOnlyPaths entry"
tech_stack:
  added: []
  patterns:
    - "Cross-user tunnel verb — admin command legitimately targets (targetUserId, deviceId) rather than the tunnel owner's userId; permission gate on livinityd side (adminProcedure), relay side trusts the signed tunnel"
    - "Force disconnect without state mutation — forceDisconnect() does NOT touch connectedDevices or Redis; the normal onDeviceDisconnected pathway cleans up once the relay's ws.close propagates as a device_disconnected event"
    - "Batch username resolution via ANY($1::uuid[]) with empty-set shortcut to avoid a spurious WHERE id IN () clause"
    - "Audit on both success and miss — adminForceDisconnect writes tool_name='admin.force_disconnect' whether the device is online (success=true, params includes targetUserId) or offline (success=false, error='device_not_connected')"
    - "Platform-admin detection via created_at ASC LIMIT 1 — platform/web has no role column, so the 'oldest user is admin' convention from migration 0007 is adopted for REST defense-in-depth"
key_files:
  created:
    - path: livos/packages/livinityd/source/modules/devices/admin-routes.ts
      purpose: "Admin-only tRPC router: adminListAll + adminForceDisconnect with audit integration"
      lines: 118
    - path: platform/web/src/app/api/admin/devices/route.ts
      purpose: "Platform REST GET /api/admin/devices with platform-admin detection — defense-in-depth for ADMIN-01"
      lines: 82
  modified:
    - path: platform/relay/src/protocol.ts
      purpose: "Added TunnelAdminForceDisconnect message type; unioned into ClientToRelayMessage; registered in MessageTypeMap"
      change: "+17 lines (interface + union entry + registry entry)"
    - path: platform/relay/src/index.ts
      purpose: "New 'admin_force_disconnect' case in onTunnelConnect switch — calls deviceRegistry.getDevice(targetUserId, deviceId) and closes target.ws with 4403 'admin_disconnect'"
      change: "+21 lines (import addition + switch case with noop-on-miss + error-tolerant close)"
    - path: livos/packages/livinityd/source/modules/devices/device-bridge.ts
      purpose: "Added forceDisconnect(targetUserId, deviceId) method — sends admin_force_disconnect tunnel payload without mutating local state"
      change: "+16 lines (new public method + comment)"
    - path: livos/packages/livinityd/source/modules/server/trpc/index.ts
      purpose: "Mounted devicesAdmin submodule in appRouter"
      change: "+2 lines (import + router key)"
    - path: livos/packages/livinityd/source/modules/server/trpc/common.ts
      purpose: "Added devicesAdmin.adminListAll + devicesAdmin.adminForceDisconnect to httpOnlyPaths"
      change: "+3 lines (banner comment + two entries)"
decisions:
  - "Separate tunnel verb from device_disconnect — admin_force_disconnect is a NEW message type rather than reusing device_disconnect, so relay-side auditing + permission distinction stays clean (device_disconnect remains the owner-initiated removeDevice pathway; admin_force_disconnect is the cross-user override)"
  - "Cross-user scope on the relay side — the admin_force_disconnect handler looks up DeviceRegistry.getDevice(targetUserId, deviceId), NOT (tunnel.userId, deviceId). This is intentional: the adminProcedure gate on livinityd is the authoritative permission check; once the signed tunnel delivers the message, relay trusts it"
  - "forceDisconnect does NOT mutate local state — distinct from removeDevice which deletes Redis + local cache. Admin force-disconnect only tears down the live WS; the device JWT + DB row remain intact so the device can legitimately re-pair. Cleanup follows the normal onDeviceDisconnected echo pathway"
  - "Router name devicesAdmin (not 'admin') — avoids colliding with any future generic admin router and keeps domain visibility. Callers use trpc.devicesAdmin.adminListAll / trpc.devicesAdmin.adminForceDisconnect"
  - "Audit miss path writes tool_name='admin.force_disconnect' with success=false error='device_not_connected' — gives the admin proof-of-attempt in device_audit_log even when the target is already offline"
  - "Platform-admin detection = oldest-user-by-created_at — platform/web has no role column, so migration 0007's fallback convention is adopted at the REST layer for defense-in-depth. Primary enforcement of ADMIN-01 still lives on the livinityd side via adminProcedure"
  - "Empty-set shortcut on username batch query — if getAllDevicesFromRedis returns zero devices, skip the WHERE id = ANY($1::uuid[]) query entirely (PG rejects WHERE id IN () syntax)"
metrics:
  duration_seconds: 237
  duration_human: "3m 57s"
  tasks_completed: 3
  files_touched: 7
  commits:
    - hash: "7b12d0c"
      task: 1
      message: "feat(16-01): admin_force_disconnect tunnel verb + DeviceBridge.forceDisconnect"
    - hash: "0d2c1f6"
      task: 2
      message: "feat(16-01): devicesAdmin tRPC router for adminListAll + adminForceDisconnect"
    - hash: "8c9c88c"
      task: 3
      message: "feat(16-01): platform REST GET /api/admin/devices with platform-admin detection"
  completed_at: "2026-04-24T18:33:33Z"
---

# Phase 16 Plan 01: Admin backend Summary

Delivered the server-side backbone for admin-only cross-user device management: a `devicesAdmin` tRPC router with `adminListAll` (cross-user device query with username join) and `adminForceDisconnect` (targets any live DeviceBridge), a new `admin_force_disconnect` tunnel verb that closes the target WebSocket with code 4403 reason `admin_disconnect` at the relay, a matching `DeviceBridge.forceDisconnect(targetUserId, deviceId)` method, and a platform/web REST `GET /api/admin/devices` endpoint with platform-admin detection (oldest-user fallback) for defense-in-depth — all actions audit-logged via Phase 15's `recordDeviceEvent` with tool_name `admin.list_all` or `admin.force_disconnect` attributed to the admin's user_id.

## What Changed

### Task 1: admin_force_disconnect tunnel verb + DeviceBridge.forceDisconnect (commit 7b12d0c)

**`platform/relay/src/protocol.ts`** — Added new `TunnelAdminForceDisconnect` interface (`type: 'admin_force_disconnect'`, `targetUserId: string`, `deviceId: string`); unioned into `ClientToRelayMessage` alongside `TunnelDeviceToolCall`; registered in `MessageTypeMap` so discriminated-union consumers handle it correctly.

**`platform/relay/src/index.ts`** — Added `TunnelAdminForceDisconnect` to the protocol import block and new `case 'admin_force_disconnect':` inside `onTunnelConnect`'s authenticated-message switch. Handler:
1. Casts msg to `TunnelAdminForceDisconnect`.
2. Calls `deviceRegistry.getDevice(adminMsg.targetUserId, adminMsg.deviceId)` — crosses user boundaries by design (the adminProcedure gate on livinityd is the authoritative permission check).
3. If no live bridge, logs and noops (admin's livinityd side already audited the attempt).
4. Otherwise calls `target.ws.close(4403, 'admin_disconnect')` inside try/catch (ws.close can throw if the socket is already closing).
5. Logs `closed bridge for user=... device=... with 4403`.

**`livos/packages/livinityd/source/modules/devices/device-bridge.ts`** — Added `forceDisconnect(targetUserId: string, deviceId: string): void` after `removeDevice`. Sole responsibility: send `{type: 'admin_force_disconnect', targetUserId, deviceId}` via `sendTunnelMessage`. Deliberately does NOT mutate `connectedDevices`, Redis, or reject pending requests — the relay's `ws.close` propagates back through the tunnel as a `device_disconnected` event which triggers the normal `onDeviceDisconnected` cleanup. This is different from `removeDevice` (which deletes state immediately + sends `device_disconnect`): admin force-disconnect only tears down the live bridge; device JWT + DB row remain intact so the device can legitimately re-pair after an admin pause.

### Task 2: devicesAdmin tRPC router (commit 0d2c1f6)

**New `livos/packages/livinityd/source/modules/devices/admin-routes.ts`** (118 lines) — Mirror of Phase 15's `audit-routes.ts` pattern:

- `adminListAll: adminProcedure.query(...)` — pulls every device from `bridge.getAllDevicesFromRedis()`, batch-resolves usernames via `SELECT id, username FROM users WHERE id = ANY($1::uuid[])` (empty-set shortcut when no devices, avoiding PG's `WHERE id IN ()` rejection), shapes to `{deviceId, deviceName, platform, ownerUserId, ownerUsername, online, connectedAt}`, fires `recordDeviceEvent` with `tool_name='admin.list_all'`, `userId=adminUserId`, `params={count}`, `success=true`. Returns `{devices: AdminDeviceRow[]}`.
- `adminForceDisconnect: adminProcedure.input(z.object({deviceId}))... .mutation(...)` — resolves owner via `bridge.getDeviceFromRedis(deviceId)`. If null (device offline or never connected), writes audit row with `success=false error='device_not_connected'` and throws `TRPCError NOT_FOUND`. Otherwise calls `bridge.forceDisconnect(device.userId, deviceId)`, writes audit row with `success=true params={deviceId, targetUserId}`, returns `{success: true, targetUserId}`.

**`livos/packages/livinityd/source/modules/server/trpc/index.ts`** — Added `import devicesAdmin from '../../devices/admin-routes.js'` after the `audit` import; added `devicesAdmin,` to the `router({...})` call after `audit,` to keep Phase 15/16 neighbors adjacent. Deliberately named `devicesAdmin` (not `admin`) to avoid colliding with any future generic admin router.

**`livos/packages/livinityd/source/modules/server/trpc/common.ts`** — Added new banner and two httpOnlyPaths entries (`'devicesAdmin.adminListAll'`, `'devicesAdmin.adminForceDisconnect'`) right after `audit.listDeviceEvents` to match Phase 15 layout. Admin queries/mutations route via HTTP so failures surface immediately rather than hanging on a dropped WS.

### Task 3: platform REST endpoint GET /api/admin/devices (commit 8c9c88c)

**New `platform/web/src/app/api/admin/devices/route.ts`** (82 lines) — Next.js App Router GET handler providing a parallel REST path for ADMIN-01 at the platform-cloud layer:

1. Extract `liv_session` cookie → 401 if missing.
2. `getSession(token)` → 401 if invalid/expired.
3. Admin detection: `SELECT id FROM users ORDER BY created_at ASC LIMIT 1` — if session.userId != oldest-user.id, return 403 Forbidden. This matches migration 0007's "oldest admin" fallback convention because platform/web has no `role` column.
4. Cross-user listing: `SELECT d.device_id, d.device_name, d.platform, d.created_at, d.last_seen, d.revoked, d.user_id, u.username FROM devices d JOIN users u ON u.id = d.user_id WHERE d.revoked = false ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC`. Online = `last_seen` within 60 seconds (matches relay heartbeat cadence).

This is defense-in-depth. Primary enforcement of ADMIN-01 lives on the livinityd side via `adminProcedure` on `devicesAdmin.adminListAll`. This REST endpoint covers the platform-cloud layer so a browser bypassing the LivOS UI still cannot enumerate devices without being the platform admin.

## Grep Audit — Verification Invariants

| Invariant                                                                  | Location                                               | Status |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| `admin_force_disconnect` literal in relay protocol                         | platform/relay/src/protocol.ts (interface + union + registry) | PASS   |
| `admin_force_disconnect` switch case in relay                              | platform/relay/src/index.ts (inside onTunnelConnect)   | PASS   |
| `ws.close(4403, 'admin_disconnect')`                                       | platform/relay/src/index.ts L318                       | PASS   |
| `forceDisconnect(targetUserId` method                                      | livos/.../device-bridge.ts L608                        | PASS   |
| `adminProcedure` usage ≥2 in admin-routes.ts                               | admin-routes.ts (5 occurrences: 1 import + 2 query/mutation + 2 docstring) | PASS   |
| `admin.list_all` tool_name literal                                         | admin-routes.ts L73                                    | PASS   |
| `admin.force_disconnect` tool_name literal (success + miss paths)          | admin-routes.ts L96, L110                              | PASS   |
| `bridge.forceDisconnect(device.userId` call                                | admin-routes.ts L105                                   | PASS   |
| `devicesAdmin` mounted on appRouter                                        | trpc/index.ts (import + router key)                    | PASS   |
| `devicesAdmin.` entries in httpOnlyPaths (exactly 2)                       | trpc/common.ts                                         | PASS   |
| `export async function GET` in admin/devices REST route                    | platform/web/.../admin/devices/route.ts L22            | PASS   |
| `SELECT id FROM users ORDER BY created_at ASC LIMIT 1` admin-detect query  | platform/web/.../admin/devices/route.ts L36            | PASS   |
| `JOIN users u ON u.id = d.user_id` cross-user join                         | platform/web/.../admin/devices/route.ts L58            | PASS   |
| `status: 403` non-admin rejection                                          | platform/web/.../admin/devices/route.ts L40            | PASS   |

## Regression Guards — Phase 11-15 Invariants Intact

| Guard                                                                       | Check                                                 | Status |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `privateProcedure` still used by devices router (Phase 11-02)               | 6 occurrences in devices/routes.ts                    | PASS   |
| `recordAuthFailure` absent from device-bridge + routes (Phase 15-02)        | 0 occurrences in either file                          | PASS   |
| Phase 14 `startSessionExpiryWatchdog` intact                                | platform/relay/src/index.ts L683 + L704               | PASS   |
| Phase 14 `ws.close(4401, 'token_expired')` intact                           | platform/relay/src/index.ts L690                      | PASS   |
| Existing `device_disconnect` pathway (removeDevice) unchanged               | device-bridge.ts L590 `type: 'device_disconnect', deviceId` | PASS   |

## TypeScript Compile Results

| Package                          | Command                      | New Errors | Notes                                                                                     |
| -------------------------------- | ---------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `platform/relay`                 | `npx tsc --noEmit`           | 0          | Clean compile                                                                             |
| `platform/web`                   | `npx tsc --noEmit`           | 0          | Clean compile                                                                             |
| `livos/packages/livinityd`       | `npx tsc --noEmit`           | 0 new      | 365 pre-existing errors (ai/skills/tunnel-client per 11-02/15-02 baseline); device-bridge.ts / admin-routes.ts / trpc/index.ts / trpc/common.ts introduce zero new errors — the 2 errors shown at trpc/index.ts L58/L72 are pre-existing (verified via stash) and merely shifted 2 lines due to our added import + router key |

## Requirement Coverage

### ADMIN-01 — Admin lists all devices cross-user

- **tRPC path:** `devicesAdmin.adminListAll` — adminProcedure gate rejects member-role callers with tRPC FORBIDDEN before the handler runs. Returns `{devices: [{deviceId, deviceName, platform, ownerUserId, ownerUsername, online, connectedAt}]}` via `bridge.getAllDevicesFromRedis()` + username JOIN.
- **REST path:** `GET /api/admin/devices` — platform-admin detection (oldest user) → non-admin gets 403; admin gets the same shape from direct DB query with `JOIN devices d JOIN users u`. Defense-in-depth.
- **Audit:** every admin list-all call writes one `device_audit_log` row with `tool_name='admin.list_all'`, `user_id=admin.id`, `success=true`, `params={count}`.

### ADMIN-02 — Admin force-disconnects any device within 3 seconds

- `devicesAdmin.adminForceDisconnect({deviceId})` → `bridge.forceDisconnect(device.userId, deviceId)` → tunnel `{type: 'admin_force_disconnect', targetUserId, deviceId}` → relay's `case 'admin_force_disconnect'` → `deviceRegistry.getDevice(targetUserId, deviceId).ws.close(4403, 'admin_disconnect')`.
- Tunnel + relay hop is synchronous single-hop; `ws.close` is invoked on the next event-loop tick after the JSON.parse of the tunnel frame. Well under the 3-second bound in must_haves.
- **Audit on both paths:** success → `tool_name='admin.force_disconnect', success=true, params={deviceId, targetUserId}`; offline/miss → `success=false, error='device_not_connected'`, plus `TRPCError NOT_FOUND` surfaced to the caller.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed the plan's action blocks verbatim, verification commands all pass, and no Rule 1-4 auto-fixes were required.

## Authentication Gates

None — no external auth required (database, Redis, and WebSocket were all accessed via already-configured local primitives).

## Unblocks

**Plan 16-02 (Admin UI consumer)** can now build against the stable backend:
- `trpc.devicesAdmin.adminListAll.useQuery()` returns the cross-user device list
- `trpc.devicesAdmin.adminForceDisconnect.useMutation()` takes `{deviceId}` and returns `{success, targetUserId}`
- Both routes are in `httpOnlyPaths` so they work reliably over HTTP (not WS) from the LivOS UI

## Self-Check: PASSED

Files verified present:
- FOUND: livos/packages/livinityd/source/modules/devices/admin-routes.ts
- FOUND: platform/web/src/app/api/admin/devices/route.ts

Commits verified present:
- FOUND: 7b12d0c (Task 1)
- FOUND: 0d2c1f6 (Task 2)
- FOUND: 8c9c88c (Task 3)
