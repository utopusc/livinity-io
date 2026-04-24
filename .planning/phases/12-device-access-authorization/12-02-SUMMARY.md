---
phase: 12-device-access-authorization
plan: 02
subsystem: livinityd/devices
tags: [authorization, device-access, audit-log, trpc, rest-defense-in-depth, phase-12]
requirements_completed: [AUTHZ-01, AUTHZ-02, AUTHZ-03]
requirements_partial: false
dependency_graph:
  requires:
    - livos/packages/livinityd/source/modules/devices/authorize.ts # Plan 12-01 helper
    - livos/packages/livinityd/source/modules/devices/audit-stub.ts # Plan 12-01 helper
    - livos/packages/livinityd/source/modules/devices/index.ts # Plan 12-01 barrel
  provides:
    - DeviceBridge.executeOnDevice(tool, params, expectedUserId) # 3-arity, ownership-gated
    - /internal/device-tool-execute HTTP 403 on device_not_owned / missing_user
    - /internal/device-tool-execute HTTP 404 on device_not_found
    - tRPC devices.{auditLog,rename,remove} uniform FORBIDDEN 'device_not_owned' via ensureOwnership
    - Nexus proxy-tool userId propagation via callbackUrl query string (no Nexus changes)
  affects:
    - Phase 13 (device-id parameter defaults) # shell tool is a device tool, auth path already wired
    - Phase 15 (PG-backed device_audit_log) # recordAuthFailure swaps behind the barrel
tech_stack:
  added: [] # zero new deps; pure wiring of existing helpers
  patterns:
    - "userId-in-callbackUrl query string — propagates caller userId from device registration through Nexus Tool.execute to livinityd /internal/device-tool-execute without modifying Nexus's Tool signature"
    - "Gate upstream, map downstream — ownership check lives inside DeviceBridge.executeOnDevice; HTTP handler only translates AuthResult.reason to HTTP status codes (no duplicate audit write)"
    - "Direct import of authorize.js/audit-stub.js from device-bridge.ts (not the barrel) to prevent circular dep since barrel re-exports DeviceBridge"
key_files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts # +36/-2: imports, redis public readonly, executeOnDevice 3-arity + auth gate, callbackUrl userId
    - livos/packages/livinityd/source/modules/devices/routes.ts # +43/-30: ensureOwnership helper replaces 3 inline checks
    - livos/packages/livinityd/source/modules/server/index.ts # +23/-2: expectedUserId query read + 403/404 status mapping
decisions:
  - "userId propagates via callbackUrl query string (not POST body) — Nexus's registered Tool.execute hardcodes the POST body as {tool, params} and cannot be extended without modifying Nexus; callbackUrl is set per-tool-registration by livinityd and fully under our control"
  - "DeviceBridge.redis visibility: private -> public readonly — routes.ts ensureOwnership() needs direct access to call authorizeDeviceAccess(bridge.redis, ...) without a type escape hatch; readonly preserves encapsulation of writes"
  - "Gate at executeOnDevice, not at HTTP handler — a single authorization checkpoint inside the bridge means every caller (HTTP /internal endpoint + any future internal invoker) is automatically gated; the HTTP handler only maps AuthResult reasons to HTTP status codes"
  - "HTTP handler does NOT call recordAuthFailure — executeOnDevice already does, avoiding a duplicate audit row on every rejection"
  - "/internal/device-tool-execute missing expectedUserId is a hard fail (403 missing_user) — closed-by-default in v26.0 multi-user deployments; the legacy tRPC fallback for ctx.currentUser=undefined does NOT exist at the HTTP boundary"
  - "Phase 11 confirmName safety check on devices.remove is orthogonal to authorization — ensureOwnership runs FIRST, confirmName runs AFTER; this means an unauthorized caller never reveals the actual device name via an error response"
  - "Reconciliation for AUTHZ-03 literal text: the requirement says 'Nexus REST /api/devices/*' but no such endpoints exist in nexus/packages/core/src/api.ts — the actual defense-in-depth target is /internal/device-tool-execute on livinityd (the only HTTP endpoint Nexus calls into for device tool execution). AUTHZ-03 is enforced there."
  - "Proxy-tool userId is captured at REGISTRATION time and sent in every invocation — safe because each proxy tool is per-device and each device has exactly one owner (Phase 11 OWN-01); onDeviceDisconnected already unregisters tools so an ownership transfer would re-register with the new userId"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-24"
  tasks_completed: 4
  tasks_total: 4
  files_created: 0
  files_modified: 3
---

# Phase 12 Plan 02: Apply authorizeDeviceAccess to all device-routed callsites

**One-liner:** Wired Plan 12-01's `authorizeDeviceAccess` + `recordAuthFailure` helpers into all three device-routed paths — DeviceBridge.executeOnDevice (now 3-arity with `expectedUserId`), tRPC devices.{auditLog,rename,remove} via a single `ensureOwnership` helper, and `/internal/device-tool-execute` with HTTP 403/404 status mapping — closing AUTHZ-01 (consistent check), AUTHZ-02 (audit on failure), and AUTHZ-03 (defense-in-depth at the HTTP boundary).

## What Was Changed

Three files modified, zero files created. All new logic is wiring of Plan 12-01 helpers.

### 1. `device-bridge.ts` (+36 / -2)

- Added direct imports from `./authorize.js` and `./audit-stub.js` (NOT the barrel — the barrel re-exports `DeviceBridge`, which would create a cycle once `DeviceBridge` imports `authorize`).
- Changed `private redis: Redis` to `public readonly redis: Redis` so `routes.ts#ensureOwnership` can call `authorizeDeviceAccess(bridge.redis, ...)` without a type escape hatch. `readonly` preserves write encapsulation.
- Extended `executeOnDevice(proxyToolName, params)` signature to `executeOnDevice(proxyToolName, params, expectedUserId)`. The new parameter is `string | undefined | null` to match the `AuthResult` contract of `authorize.ts`.
- Inserted an `authorizeDeviceAccess(this.redis, expectedUserId, deviceId)` call BEFORE the in-memory `this.connectedDevices.get(deviceId)` lookup. The Redis cache is authoritative (it also catches cross-instance leakage where an LivOS instance hasn't yet received the `device_connected` event but another instance has already cached the device).
- On auth rejection: fire-and-forget `recordAuthFailure` with `action: device_tool_call:<toolName>`, then return `{success: false, output: '', error: auth.reason}`. No `sendTunnelMessage` is ever called for an unauthorized invocation.
- In `onDeviceConnected`, changed the proxy-tool registration payload's `callbackUrl` from `${baseUrl}/internal/device-tool-execute` to `${baseUrl}/internal/device-tool-execute?expectedUserId=${encodeURIComponent(userId)}` — embedding the device owner's userId in the URL at registration time.

### 2. `routes.ts` (+43 / -30)

- Imports `authorizeDeviceAccess` and `recordAuthFailure` from the `./index.js` barrel (the swap point for Phase 15's PG-backed audit log).
- New `ensureOwnership(ctx, deviceId, action)` helper — the single entry point for per-request ownership checks in tRPC routes. Short-circuits on `!ctx.currentUser` (preserves Phase 11 legacy single-user fallback), calls `authorizeDeviceAccess`, fires `recordAuthFailure` on rejection, maps `AuthResult.reason` to `TRPCError`:
  - `device_not_found` -> `NOT_FOUND 'Device not found'`
  - `device_not_owned` / `missing_user` -> `FORBIDDEN 'device_not_owned'` (preserves exact Phase 11 client-contract string)
- Replaced the three inline `if (device.userId !== ctx.currentUser.id)` blocks in `auditLog`, `rename`, `remove` with a single `await ensureOwnership(ctx, input.deviceId, 'devices.<action>')` call each.
- `remove` still performs the `confirmName` safety check — BUT it now runs AFTER ownership has been verified (the plan's Phase 11 decision: safety UX is orthogonal to authorization, and running ownership first prevents an unauthorized caller from learning the actual device name through the error message).
- `list` route unchanged — still uses `getDevicesForUser` for authenticated users and the `getAllDevicesFromRedis` fallback for legacy single-user mode.

### 3. `server/index.ts` (+23 / -2)

- `/internal/device-tool-execute` handler now reads `expectedUserId` from `req.query` (type-guarded to `string`, defaulting to `''` for safety).
- Forwards to `bridge.executeOnDevice(tool, params, expectedUserId)` — the 3-arity signature from Task 1.
- Maps `executeOnDevice`'s structured error codes to HTTP statuses:
  - `device_not_owned` / `missing_user` -> `HTTP 403` with body `{success: false, output: '', error: <reason>, code: <reason>}`
  - `device_not_found` -> `HTTP 404` with `code: 'device_not_found'`
  - anything else -> `HTTP 200` with existing shape (successful tool calls + business-level errors)
- Does NOT call `recordAuthFailure` — `executeOnDevice` already audited the rejection, so double-logging is avoided.

## End-to-End userId Propagation

For the agent-tool-loop path (the path Phase 11 did NOT cover):

```
Device connects -> livinityd DeviceBridge.onDeviceConnected(userId=owner)
  -> POST Nexus /api/tools/register with
       callbackUrl = /internal/device-tool-execute?expectedUserId=<owner>
  -> Nexus ToolRegistry creates a Tool whose execute(params) POSTs
     to that callbackUrl with body {tool, params}
  -> User (of any auth level) prompts agent; agent invokes the proxy tool
  -> Nexus Tool.execute fetches the callbackUrl (carrying the owner's userId
     in the query string)
  -> livinityd /internal/device-tool-execute reads req.query.expectedUserId
  -> bridge.executeOnDevice(tool, params, expectedUserId)
  -> authorizeDeviceAccess(redis, expectedUserId, deviceId) — hits Redis cache
  -> if authorized: sendTunnelMessage(device_tool_call)
  -> if not: recordAuthFailure; 403/404 response
```

The key insight: the proxy tool's "caller userId" is definitionally the device's owner (each proxy tool is per-device, each device has exactly one owner per Phase 11 OWN-01). So capturing userId at REGISTRATION time and reusing it for every invocation is correct and does not require changes to Nexus's `Tool.execute(params)` signature.

## Reconciliation Note: AUTHZ-03

The AUTHZ-03 requirement literal says "Nexus REST /api/devices/\* endpoints must independently enforce ownership". The codebase has no such endpoints in `nexus/packages/core/src/api.ts` — Nexus does not expose a per-device REST surface. The actual defense-in-depth target is `/internal/device-tool-execute` on livinityd, which Nexus calls into. That is where AUTHZ-03 is enforced.

Specifically: `/internal/device-tool-execute` is now the only HTTP endpoint (across both services) that triggers a device tool call, and it enforces `authorizeDeviceAccess` via `executeOnDevice` regardless of which caller reached it — whether via Nexus's proxy-tool callback, a direct POST from a misconfigured internal script, or a future internal dispatcher. tRPC routes enforce ownership independently (via `ensureOwnership`). Two independent enforcement points = defense-in-depth satisfied.

This reconciliation is documented per the plan's instructions in the `<objective>` block.

## Deviations from Plan

None — plan executed exactly as written.

- Task 1's "Change B" and "Change C" applied verbatim, plus the Task 2-required `redis: public readonly` visibility change was folded into Task 1's commit as the plan instructs.
- Task 2's routes.ts rewrite used the "cleaner version" of `ensureOwnership` (with `DeviceBridge` field public) as the plan directs — not the `@ts-expect-error` version.
- Task 3's handler replacement applied verbatim.
- Task 4 is verification-only; confirmed all 10 grep invariants hold.

No auto-fixes (Rules 1-3) were needed — the plan specified exact file content and every compile-time concern was anticipated. No architectural decisions (Rule 4) arose.

## Verification Results

### Typecheck (`npx tsc --noEmit` in livos/packages/livinityd)

Zero NEW errors in any Phase 12 file. Pre-existing baseline errors (tracked from 11-02-SUMMARY) persist unchanged in:

- `server/index.ts:52` (express router type), `153/620` (Apps.docker), `758` (ws constructor), `1320-1329` (possibly-undefined guards)
- `server/trpc/*.ts:16/25/51/54/60/68` (ctx possibly-undefined)

None of these are at or near the Phase 12 edits (lines 965-996 in server/index.ts).

### Grep audit (all 10 checks from Task 4)

| # | Check | Result |
| - | ----- | ------ |
| A | `userId !==` outside authorize.ts | 0 hits (authorize.ts:62 is the only ownership comparison; two `typeof userId !== 'string'` string-guards in authorize.ts:45 and device-bridge.ts:196, both for input validation, not ownership) |
| B | `'device_not_owned'` in routes.ts | 1 hit (single TRPCError in ensureOwnership) |
| C | `executeOnDevice(` callsites | 1 definition (device-bridge.ts:299) + 1 callsite (server/index.ts:981, 3 args) |
| D | `import.*authorizeDeviceAccess` | 2 hits — routes.ts (barrel), device-bridge.ts (direct); server/index.ts does NOT import |
| E | `recordAuthFailure(` | 3 hits — 1 definition (audit-stub.ts:35) + 2 callsites (device-bridge.ts:319, routes.ts:32) |
| F | `type: 'device_tool_call'` | 1 hit at device-bridge.ts:341, DOWNSTREAM of the authorize gate at line 314 |
| G | `Phase 11 OWN-03` markers | 6 hits preserved across 3 files |
| H | `Phase 12 AUTHZ` markers | 10 hits across 5 files |
| I | tsc no new errors | confirmed (zero new errors in Phase 12 files) |
| J | `public readonly redis` | device-bridge.ts:168 (was `private redis`) |

## Known Stubs

None introduced by this plan.

Plan 12-01's `audit-stub.ts` remains in place as Phase 12's Redis-backed audit writer — that is the declared, intentional stub documented in Plan 12-01's Summary, to be replaced in Phase 15 (AUDIT-01/AUDIT-02) with an append-only PostgreSQL `device_audit_log` table. Phase 15 swaps the implementation behind the barrel without touching any callsite. No UI-facing stubs, no hardcoded empty data flowing to rendering, no placeholder text.

## Commits

| Task | Commit    | Description                                                                                       |
| ---- | --------- | ------------------------------------------------------------------------------------------------- |
| 1    | `55f5df1` | feat(12-02): extend executeOnDevice with ownership check + userId propagation                     |
| 2    | `76d423a` | refactor(12-02): replace inline ownership checks with authorizeDeviceAccess                       |
| 3    | `49a9e47` | feat(12-02): enforce device ownership at /internal/device-tool-execute                            |
| 4    | `5f79303` | chore(12-02): end-to-end grep audit — all Phase 12 invariants hold                                |

## Preview: Phase 13

The shell tool's `device_id` parameter now flows through the same `authorizeDeviceAccess` path automatically — the shell tool is a device tool, so its proxy tool's `/internal/device-tool-execute` callback already carries the owner's userId and gates on ownership. Phase 13 only needs to add:

1. "No `device_id` supplied" => execute locally on the LivOS host (not through the tunnel)
2. Parameter-schema documentation so the agent knows when to pass `device_id`

Zero additional authorization work required in Phase 13.

## Preview: Phase 15

`recordAuthFailure` Redis-list writer will be replaced with an append-only PostgreSQL `device_audit_log` writer using INSERT/SELECT-only DB role grants. Only `audit-stub.ts` is modified (the barrel export name is preserved); all Plan 12-02 callers are unaffected because they import from `../devices` (the barrel), not from `../devices/audit-stub`.

## Self-Check: PASSED

- All 3 modified files exist on disk and contain the expected changes (verified via targeted greps above)
- All 4 task commits exist in git history: `55f5df1`, `76d423a`, `49a9e47`, `5f79303`
- `npx tsc --noEmit` in livos/packages/livinityd shows no NEW errors in Phase 12 files (device-bridge.ts, routes.ts, server/index.ts handler block)
- Grep audit: 10/10 invariants hold
- All three AUTHZ requirements (AUTHZ-01, AUTHZ-02, AUTHZ-03) have a load-bearing wired callsite
