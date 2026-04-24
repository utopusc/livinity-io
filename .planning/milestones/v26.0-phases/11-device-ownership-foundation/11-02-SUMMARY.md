---
phase: 11-device-ownership-foundation
plan: 02
subsystem: devices, tunnel, multi-user
tags: [devices, relay-protocol, tunnel, trpc, rest-endpoint, ownership, multi-user]

# Dependency graph
requires:
  - phase: 11-01-device-ownership-foundation
    provides: devices.user_id FK + createDeviceRecord userId guard (OWN-01 + OWN-02 DB side)
  - phase: 07-multi-user-foundation
    provides: ctx.currentUser resolution via isAuthenticated middleware
  - phase: 10-device-registration
    provides: OAuth Device Grant approve/token flow + relay DeviceRegistry
provides:
  - "Relay->LivOS device_connected tunnel event carries userId (protocol-level ownership propagation)"
  - "Redis livos:devices:{id} cache entries include userId field (every entry, guarded on write)"
  - "DeviceBridge.getDevicesForUser(userId) method for per-user cache queries"
  - "tRPC devices.list filters by ctx.currentUser.id with legacy single-user fallback"
  - "tRPC devices.rename/remove/auditLog enforce FORBIDDEN device_not_owned check"
  - "GET /api/devices REST endpoint (platform/web) returns only session user's devices"
affects:
  - 12-device-authorization-middleware
  - 13-shell-tool-default-device
  - 14-session-binding-jwt
  - 15-audit-log
  - 16-admin-cross-user-listing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defence-in-depth: protocol field + cache field + tRPC filter + REST filter all enforce the same ownership invariant at different layers"
    - "Fail-closed: onDeviceConnected REFUSES to cache a device event that lacks userId (prevents cross-user leakage if a stale relay forwards legacy messages)"
    - "Legacy fallback: ctx.currentUser undefined -> return all (matches requireRole's legacy single-user fallback for unmigrated v6.x deployments)"
    - "Error code standardization: FORBIDDEN device_not_owned (Phase 12 authorizeDeviceAccess helper will consume the same code)"

key-files:
  created:
    - platform/web/src/app/api/devices/route.ts
  modified:
    - platform/relay/src/protocol.ts
    - platform/relay/src/index.ts
    - livos/packages/livinityd/source/modules/platform/tunnel-client.ts
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts
    - livos/packages/livinityd/source/modules/devices/routes.ts

key-decisions:
  - "onDeviceConnected hard-rejects missing userId (log + early return) rather than falling back to a placeholder. Reason: we'd rather drop a device registration on a stale relay than leak a device to every user."
  - "tRPC list keeps the legacy 'return all' branch when ctx.currentUser is undefined. Reason: matches the requireRole middleware's same legacy fallback on trpc.ts — single-user deployments that haven't migrated to multi-user still work."
  - "remove still enforces confirmName even after the ownership check. Reason: safety UX is orthogonal to authorization — an admin renaming then removing their OWN device should still have to confirm the name to avoid fat-fingered deletes."
  - "devices.list downgraded from adminProcedure to privateProcedure (not just filtered). Reason: Phase 16 will add a separate adminListAll endpoint; today's list should be usable by every authenticated user to see their own devices without any role restriction."
  - "Response shape is {devices: [...]} wrapper rather than bare array. Reason: future pagination/metadata can add fields (nextCursor, total) without breaking clients."

patterns-established:
  - "Tunnel protocol ownership propagation: relay reads owner from DeviceAuth token, forwards it in device_connected to LivOS, LivOS caches it — no Postgres roundtrip required by livinityd"
  - "Grep-visible ownership markers: every ownership-sensitive branch tagged with 'Phase 11 OWN-03' comment for later audit/refactor"

requirements-completed: [OWN-02, OWN-03]

# Metrics
duration: 3min
completed: 2026-04-24
---

# Phase 11 Plan 02: Device Registration Binding + Per-User Listing Summary

**Ownership invariant now holds end-to-end: relay forwards userId in every device_connected event, LivOS caches it in Redis and in-memory, tRPC devices routes filter and authorize by ctx.currentUser.id, and a new platform REST endpoint exposes the same filter to the browser — unauthenticated requests get 401 everywhere that matters.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-24T16:41:08Z
- **Completed:** 2026-04-24T16:44:30Z
- **Tasks:** 4/4
- **Files modified:** 5
- **Files created:** 1

## Task Commits

Each task committed atomically on `master`:

1. **Task 1: Forward userId in relay TunnelDeviceConnected** — `1db5f9b` (feat)
2. **Task 2: Mirror userId in LivOS tunnel-client + DeviceBridge cache + getDevicesForUser** — `c23091c` (feat)
3. **Task 3: tRPC devices routes filter by owner + ownership checks** — `1adbfaf` (feat)
4. **Task 4: GET /api/devices platform REST endpoint** — `8dfe081` (feat)

## Files Created/Modified

### Created

- `platform/web/src/app/api/devices/route.ts` (55 lines)
  - Next.js App Router GET handler; reads `liv_session` cookie -> `getSession()` -> `SELECT ... WHERE user_id = $1 AND revoked = false ORDER BY created_at DESC`
  - 401 Authentication required when no cookie; 401 Invalid session when cookie is stale/invalid
  - Returns `{devices: [{deviceId, deviceName, platform, createdAt, lastSeen, revoked}]}`

### Modified

- `platform/relay/src/protocol.ts` (+2 lines)
  - `TunnelDeviceConnected` gains `userId: string` with `/** Owner user ID (from device JWT) — Phase 11 OWN-03 */` doc comment
  - `TunnelDeviceDisconnected` explicitly left unchanged (disconnect handler looks up existing cache entry for ownership)
- `platform/relay/src/index.ts` (+1 line)
  - `onDeviceConnect` populates `userId: tokenPayload.userId` in the `TunnelDeviceConnected` event object literal (line ~430)
  - Inline comment: `// Phase 11 OWN-03: forward owner to LivOS for per-user filtering`
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` (+1 line)
  - Internal `TunnelDeviceConnected` interface gains `userId: string  // Phase 11 OWN-03: device owner forwarded from relay`
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` (+30 lines, -7 lines)
  - `ConnectedDevice` interface gains `userId: string`
  - `onDeviceConnected` signature adds `userId: string` to event type
  - New guard rejects missing/empty-string userId: `this.logger.error('[device-bridge] Refusing device_connected without userId: deviceId=...'); return`
  - Connect log now includes `user=${userId}`
  - In-memory cache stores `{userId, deviceId, ...}` and Redis `JSON.stringify({userId, deviceId, deviceName, platform, tools, connectedAt: Date.now()})`
  - `getDeviceFromRedis` return type gains `userId: string`
  - `getAllDevicesFromRedis` return type gains `userId: string` and internal array typing updated
  - New public method `getDevicesForUser(userId: string)` — filters `getAllDevicesFromRedis()` by `d.userId === userId`
- `livos/packages/livinityd/source/modules/devices/routes.ts` (+58 lines, -11 lines, complete rewrite)
  - Import switched from `adminProcedure` to `privateProcedure` (file has ZERO `adminProcedure` references)
  - `list` calls `bridge.getDevicesForUser(ctx.currentUser.id)` when currentUser present; falls back to `getAllDevicesFromRedis()` when undefined (legacy single-user mode)
  - `auditLog`, `rename`, `remove` all fetch device from Redis first, throw `FORBIDDEN` `device_not_owned` if `device.userId !== ctx.currentUser.id`
  - `remove` still performs `confirmName` safety check after ownership check (unchanged behavior)

## The Three New Invariants Enforced

1. **Protocol-level ownership forwarding**
   Every `device_connected` tunnel message now carries `userId` (relay) / mirrored in `TunnelDeviceConnected` (LivOS). Missing `userId` gets dropped at the LivOS side with an error log.

2. **Cache-level ownership**
   Every `livos:devices:{deviceId}` Redis blob AND every `ConnectedDevice` in-memory entry includes `userId`. No entry can be created without one.

3. **Query-level ownership**
   - `GET /api/devices` (platform/web) → `WHERE user_id = $1` against Postgres `devices` table
   - `devices.list` (livinityd tRPC) → `getDevicesForUser(ctx.currentUser.id)` against Redis
   - `devices.rename` / `devices.remove` / `devices.auditLog` → `FORBIDDEN device_not_owned` on userId mismatch

## OWN-02 Status: Pre-existing, Now Explicitly Tested

The existing OAuth Device Grant flow already enforced OWN-02:
- `POST /api/device/approve` returns 401 when no `liv_session` cookie (platform/web/src/app/api/device/approve/route.ts lines 7-15)
- `POST /api/device/token` only issues a device JWT when `grant.userId` is present — missing userId yields 500 with no device record created
- `createDeviceRecord` (hardened in Plan 11-01) throws when userId is falsy, non-string, or empty string

This plan did NOT modify those endpoints. OWN-02 was already correct; it is now also explicitly verified by Plan 11-02's `must_haves.truths` section which will be confirmed by the verifier.

## Line-level Evidence

Verified via grep checks (all tasks' automated verification gates passed):

| File | Required string | Present |
| ---- | --------------- | ------- |
| platform/relay/src/protocol.ts | `Phase 11 OWN-03` | yes |
| platform/relay/src/protocol.ts | `userId: string` in TunnelDeviceConnected | yes |
| platform/relay/src/protocol.ts | TunnelDeviceDisconnected unchanged | verified |
| platform/relay/src/index.ts | `userId: tokenPayload.userId` | yes |
| livinityd/.../tunnel-client.ts | `userId: string  // Phase 11 OWN-03` | yes |
| livinityd/.../device-bridge.ts | `ConnectedDevice` has `userId: string` | yes |
| livinityd/.../device-bridge.ts | `Refusing device_connected without userId` | yes |
| livinityd/.../device-bridge.ts | `getDevicesForUser(userId:` | yes |
| livinityd/.../device-bridge.ts | `JSON.stringify({userId, deviceId` in Redis set | yes |
| livinityd/.../devices/routes.ts | `privateProcedure` (ZERO occurrences of adminProcedure) | yes |
| livinityd/.../devices/routes.ts | `getDevicesForUser` | yes |
| livinityd/.../devices/routes.ts | `device_not_owned` | yes |
| livinityd/.../devices/routes.ts | `Phase 11 OWN-03` | yes |
| platform/web/src/app/api/devices/route.ts | `export async function GET` | yes |
| platform/web/src/app/api/devices/route.ts | `WHERE user_id = $1` | yes |
| platform/web/src/app/api/devices/route.ts | `revoked = false` | yes |
| platform/web/src/app/api/devices/route.ts | `Authentication required` / 401 on missing cookie | yes |
| platform/web/src/app/api/devices/route.ts | `SESSION_COOKIE_NAME` + `session.userId` | yes |

### TypeScript compilation

- `cd platform/relay && npx tsc --noEmit` → **exit 0, zero errors**
- `cd platform/web && npx tsc --noEmit` → **exit 0, zero errors**
- `cd livos/packages/livinityd && npx tsc --noEmit` → 4 pre-existing errors in `tunnel-client.ts` (sendMessage `Record<string, unknown>` generic type mismatch at lines 543/555/620/630) — all present on master before this plan (verified via `git stash` + rerun). **Zero new errors introduced; zero errors in any of the 3 LivOS files modified (tunnel-client TunnelDeviceConnected area, device-bridge.ts, devices/routes.ts).**

## Decisions Made

See `key-decisions` in frontmatter. Summary:

1. **Hard-reject missing userId** (not soft-fallback) — prevents cross-user leakage from stale relay
2. **Legacy fallback preserved** — unmigrated single-user deployments still work
3. **confirmName + ownership both enforced on remove** — safety and authorization are orthogonal
4. **privateProcedure, not adminProcedure** — Phase 16 will add a separate admin endpoint for cross-user listing
5. **`{devices: [...]}` response wrapper** — backwards-compatible with future pagination

## Deviations from Plan

None — plan executed exactly as written.

Minor non-deviations worth noting:
- Pre-existing TypeScript errors in `livos/packages/livinityd` (ai/routes.ts `ctx.livinityd` undefined, skill template files, tunnel-client sendMessage generic) are baseline errors unrelated to this plan. They were present before Plan 11-02 and remain unchanged. No new errors introduced.
- `httpOnlyPaths` in `common.ts` already listed `devices.rename` and `devices.remove` (lines 85-86); no change needed since the routes' transport requirements are unchanged by adding ownership checks.
- CRLF line-ending warnings from Git on Windows are cosmetic; no functional impact.

## Issues Encountered

None — all four tasks completed on first attempt, every verification grep check passed, every TypeScript compile gate that matters was clean.

## User Setup Required

None at execute time. At deploy time:

1. **Relay deploy** (platform/relay): rebuild/redeploy relay container — the protocol change is backwards-compat only if relay is deployed BEFORE or WITH livinityd (otherwise LivOS's strict userId guard will reject legacy events). Recommended: deploy relay first.
2. **Platform/web deploy**: Next.js build + restart to expose `GET /api/devices`.
3. **Livinityd deploy** (livos): `pnpm --filter livinityd build` + PM2 restart livos to pick up the new tunnel-client, device-bridge, and tRPC routes.

No DB migration, no Redis flush, no user action required.

## Preview: Phase 12

Phase 12 will add `authorizeDeviceAccess(userId: string, deviceId: string): Promise<boolean>` used by the DeviceBridge tool dispatcher to check ownership on EVERY tool call (not just list/rename/remove). This plan's ownership checks on `rename`/`remove`/`auditLog` are an incremental preview — Phase 12 centralizes the check and extends it to `executeOnDevice`.

## Unblocks

- **Phase 12 (device-authorization-middleware)** — has guaranteed `cached device.userId` to read; can now write `authorizeDeviceAccess` without defensive null handling
- **Phase 13 (shell-tool-default-device)** — can read `getDevicesForUser(userId)` to pick a default device
- **Phase 14 (session-binding-jwt)** — can verify JWT.deviceId belongs to JWT.userId via the Redis cache
- **Phase 15 (audit-log)** — can scope audit queries to the caller's devices (already enforced on `auditLog` tRPC)
- **Phase 16 (admin-cross-user-listing)** — can add `adminListAll` as a separate `adminProcedure` without conflict (the old `devices.list` is now user-scoped)

## Self-Check: PASSED

Verified:

- File `platform/relay/src/protocol.ts` FOUND (modified)
- File `platform/relay/src/index.ts` FOUND (modified)
- File `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` FOUND (modified)
- File `livos/packages/livinityd/source/modules/devices/device-bridge.ts` FOUND (modified)
- File `livos/packages/livinityd/source/modules/devices/routes.ts` FOUND (modified)
- File `platform/web/src/app/api/devices/route.ts` FOUND (created)
- Commit `1db5f9b` FOUND in git log (Task 1)
- Commit `c23091c` FOUND in git log (Task 2)
- Commit `1adbfaf` FOUND in git log (Task 3)
- Commit `8dfe081` FOUND in git log (Task 4)
- All 18 grep-based acceptance checks: PASS
- TypeScript compile: platform/relay clean, platform/web clean, livinityd has only pre-existing baseline errors (no new errors in modified files)

---
*Phase: 11-device-ownership-foundation*
*Completed: 2026-04-24*
