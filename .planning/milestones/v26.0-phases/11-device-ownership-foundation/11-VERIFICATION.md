---
phase: 11-device-ownership-foundation
verified: 2026-04-24T17:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 11: Device Ownership Foundation Verification Report

**Phase Goal:** Every device in PostgreSQL is owned by exactly one user, registration binds new devices to their creator, and users only see their own devices.
**Verified:** 2026-04-24
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every row in the devices table has a non-null user_id FK to users.id; backfill for pre-existing NULLs | VERIFIED | `platform/web/src/db/migrations/0007_device_user_id_fk.sql` lines 9-33: UPDATE backfill, ALTER SET NOT NULL, DO block adding `devices_user_id_fkey` REFERENCES users(id) ON DELETE RESTRICT |
| 2 | OAuth Device Grant approve rejects unauthenticated requests with 401 | VERIFIED | `platform/web/src/app/api/device/approve/route.ts` lines 7-9: no session cookie returns 401 "Authentication required"; lines 11-14: stale session returns 401 |
| 3 | OAuth Device Grant token exchange only issues device JWT when grant.userId present | VERIFIED | `platform/web/src/app/api/device/token/route.ts` lines 29-31: `if (!grant.userId || !grant.deviceInfo) return 500`; `createDeviceRecord` (device-auth.ts lines 151-153) throws on falsy userId |
| 4 | GET /api/devices returns only session user's devices; 401 on no-auth | VERIFIED | `platform/web/src/app/api/devices/route.ts` lines 14-16 (401 no cookie), 19-21 (401 bad session), 36 (WHERE user_id = $1) |
| 5 | tRPC devices.list is privateProcedure and filters by ctx.currentUser.id | VERIFIED | `livos/.../devices/routes.ts` line 4: imports `privateProcedure` (zero `adminProcedure` occurrences); line 27: `bridge.getDevicesForUser(ctx.currentUser.id)`; lines 22-24: legacy fallback for single-user mode |
| 6 | Redis livos:devices:{id} cache includes userId; DeviceRegistry stays in sync | VERIFIED | `device-bridge.ts` lines 191-194: hard-reject missing userId; line 205: `JSON.stringify({userId, deviceId, ...})`; line 199: in-memory map stores userId |
| 7 | relay->LivOS device_connected tunnel event carries userId | VERIFIED | `platform/relay/src/protocol.ts` line 84: `userId: string` in TunnelDeviceConnected; `platform/relay/src/index.ts` line 429: `userId: tokenPayload.userId`; `tunnel-client.ts` line 98: mirrors field; bridge receives full msg at line 403 |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `platform/web/src/db/migrations/0007_device_user_id_fk.sql` | VERIFIED | Exists, 33 lines, all required strings present: `devices_user_id_fkey`, `REFERENCES users(id)`, `ON DELETE RESTRICT`, `ALTER COLUMN user_id SET NOT NULL`, `CREATE INDEX IF NOT EXISTS idx_devices_user_id`, DO block with pg_constraint guard, UPDATE backfill |
| `platform/web/src/db/schema.ts` | VERIFIED | Line 39: `user_id: uuid('user_id').notNull()` with comment `FK -> users(id) ON DELETE RESTRICT (see migration 0007)`; all exports preserved (devices, deviceGrants, apps, installHistory, customDomains) |
| `platform/relay/src/schema.sql` | VERIFIED | Phase 11 OWN-01 block at lines 130-152: UPDATE backfill, ALTER SET NOT NULL, DO block with `devices_user_id_fkey`; original `CREATE INDEX IF NOT EXISTS idx_devices_user_id` preserved; original `CREATE TABLE IF NOT EXISTS devices` unmodified |
| `platform/web/src/lib/device-auth.ts` | VERIFIED | `createDeviceRecord` lines 151-153: throws `Error('createDeviceRecord called with missing userId — device registration requires an authenticated user (OWN-02)')` when userId is falsy, non-string, or empty |
| `platform/relay/src/protocol.ts` | VERIFIED | `TunnelDeviceConnected` has `userId: string` with `Phase 11 OWN-03` doc comment; `TunnelDeviceDisconnected` unchanged |
| `platform/relay/src/index.ts` | VERIFIED | Line 429: `userId: tokenPayload.userId` in event literal with inline OWN-03 comment |
| `livos/.../platform/tunnel-client.ts` | VERIFIED | Internal `TunnelDeviceConnected` at line 98: `userId: string  // Phase 11 OWN-03: device owner forwarded from relay`; routing at line 403 passes full msg to `onDeviceConnected` |
| `livos/.../devices/device-bridge.ts` | VERIFIED | `ConnectedDevice` line 140: `userId: string`; `onDeviceConnected` line 186 includes userId in signature; lines 191-194 hard-reject missing userId; line 205 JSON includes userId; `getDevicesForUser` method lines 488-493; `getDeviceFromRedis`/`getAllDevicesFromRedis` return types include userId |
| `livos/.../devices/routes.ts` | VERIFIED | Imports `privateProcedure` (not `adminProcedure`); `list` calls `getDevicesForUser(ctx.currentUser.id)`; `auditLog`, `rename`, `remove` throw FORBIDDEN `device_not_owned` on userId mismatch; `confirmName` safety preserved on `remove`; `Phase 11 OWN-03` comment at top |
| `platform/web/src/app/api/devices/route.ts` | VERIFIED | Exists (55 lines); exports `async function GET`; imports from `@/lib/auth` and `@/lib/db`; `WHERE user_id = $1 AND revoked = false`; 401 on missing cookie; 401 on invalid session; `{devices: [...]}` wrapper with camelCase fields |

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `0007_device_user_id_fk.sql` | users table (platform DB) | `FOREIGN KEY (user_id) REFERENCES users(id)` | WIRED | `platform/relay/src/schema.sql` line 150 confirms constraint in relay schema too |
| `device-auth.ts (createDeviceRecord)` | devices.user_id column | INSERT INTO devices (user_id, ...) VALUES ($1, ...) | WIRED | device-auth.ts line 156-160; guarded by OWN-01/OWN-02 throw at lines 151-153 |
| `relay/src/index.ts (onDeviceConnect)` | TunnelDeviceConnected event | `userId: tokenPayload.userId` | WIRED | index.ts line 429; matches protocol.ts TunnelDeviceConnected interface |
| `tunnel-client.ts` | DeviceBridge.onDeviceConnected | `this._deviceBridge.onDeviceConnected(msg)` | WIRED | tunnel-client.ts line 403; msg is full TunnelDeviceConnected including userId |
| `device-bridge.ts (onDeviceConnected)` | Redis livos:devices:{deviceId} | `JSON.stringify({userId, deviceId, ...})` | WIRED | device-bridge.ts line 205 |
| `devices/routes.ts (list)` | DeviceBridge.getDevicesForUser(userId) | `ctx.currentUser.id` filter | WIRED | routes.ts line 27 |
| `platform/web/src/app/api/devices/route.ts` | devices table filtered by session userId | `WHERE user_id = $1` | WIRED | route.ts line 36 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OWN-01 | 11-01-PLAN.md | Every device record in PostgreSQL has a non-null user_id linking it to its owner | SATISFIED | Migration 0007 adds FK + NOT NULL constraint; relay schema.sql mirrors it; createDeviceRecord guards application layer |
| OWN-02 | 11-02-PLAN.md | Device registration binds the new device to the authenticated user creating it (no orphan devices) | SATISFIED | approve/route.ts rejects unauthenticated with 401; token/route.ts returns 500 when grant.userId absent (no device created); createDeviceRecord throws on falsy userId |
| OWN-03 | 11-02-PLAN.md | Device list endpoint returns only devices owned by the calling user (no cross-user device visibility) | SATISFIED | GET /api/devices filters by session.userId; tRPC devices.list calls getDevicesForUser(ctx.currentUser.id); cache entries include userId; rename/remove/auditLog enforce FORBIDDEN on mismatch |

---

## Anti-Patterns Found

None. All 10 files scanned — zero TODOs, FIXMEs, placeholders, return null stubs, or empty handler bodies found in the Phase 11 modified/created files.

Notable: `devices/routes.ts` has zero occurrences of `adminProcedure` (confirmed programmatically). The legacy single-user fallback (`if (!ctx.currentUser) return bridge.getAllDevicesFromRedis()`) is intentional and documented — it is not a stub, it is a backwards-compatibility guard that matches the same pattern in the `requireRole` middleware.

---

## Human Verification Required

The following items cannot be verified by static analysis alone:

### 1. End-to-end device pairing flow

**Test:** Pair a new device via the OAuth Device Grant flow (agent calls POST /api/device/register, user visits /device and enters the code, agent polls /api/device/token).
**Expected:** The resulting row in `SELECT user_id, device_id, device_name FROM devices ORDER BY created_at DESC LIMIT 1` matches the approving user's UUID.
**Why human:** Requires a running platform DB and an agent binary to exercise the full 3-step OAuth flow.

### 2. GET /api/devices cross-user isolation

**Test:** With two browser sessions (user A and user B), call `GET /api/devices` with each session cookie. Register one device for each user.
**Expected:** Each response contains only that user's device. User A's cookie cannot retrieve user B's device in the response.
**Why human:** Requires two live user sessions and at least two devices registered to different owners.

### 3. tRPC devices.list cross-user isolation

**Test:** Connect two devices (one owned by user A, one by user B). Call `devices.list` via each user's JWT.
**Expected:** User A's response contains only device A; user B's response contains only device B. No cross-contamination in the Redis-backed list.
**Why human:** Requires live Redis state with two user-owned device entries.

### 4. devices.rename FORBIDDEN enforcement

**Test:** User B calls `devices.rename` targeting a deviceId owned by user A.
**Expected:** tRPC returns FORBIDDEN with message `device_not_owned`.
**Why human:** Requires two live user sessions and a device registered to user A.

### 5. Relay userId forwarding visible in livinityd logs

**Test:** Connect a device agent and check livinityd logs.
**Expected:** Log line matches `[device-bridge] Device connected: <name> (<deviceId>) user=<uuid> platform=<platform>` (the `user=` segment was added by this phase).
**Why human:** Requires a running relay + livinityd + device agent.

---

## Gaps Summary

No gaps. All seven success criteria from the ROADMAP are satisfied at the code level:

1. Migration 0007 adds the FK with backfill and the relay schema mirrors it — the DB invariant will be enforced on next deployment.
2. The approve endpoint returns 401 without an authenticated session; createDeviceRecord throws when userId is absent; the token endpoint returns 500 without userId — no unauthenticated device registration is possible.
3. Both the platform REST endpoint (`WHERE user_id = $1`) and the tRPC route (`getDevicesForUser`) filter by caller identity before returning results.
4. The Redis cache includes `userId` in every entry written by `onDeviceConnected`; missing userId causes a hard reject (log + early return), preventing an unowned device from entering the cache.

All seven commits referenced in the summaries (da988f5, f4512e9, 68eab51, 1db5f9b, c23091c, 1adbfaf, 8dfe081) are confirmed present in the git log.

---

_Verified: 2026-04-24_
_Verifier: Claude (gsd-verifier)_
