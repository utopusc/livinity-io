---
phase: 15-device-audit-log
plan: 02
subsystem: livinityd/devices + trpc
tags: [audit, security, postgresql, trpc, admin, pagination, device-security]
requirements_completed: [AUDIT-01, AUDIT-02]
requirements_partial: false
dependency_graph:
  requires:
    - phase: 15-device-audit-log
      plan: 01
      why: "Consumes recordDeviceEvent writer + device_audit_log PG table delivered by Plan 15-01"
    - phase: 12-device-access-authorization
      why: "Replaces the Phase 12 recordAuthFailure callsites in DeviceBridge.executeOnDevice + routes.ts#ensureOwnership with the PG-backed writer; preserves the Phase 12 FORBIDDEN/NOT_FOUND tRPC contract"
    - phase: 7-multi-user
      why: "adminProcedure (requireRole('admin')) enforcement comes from the Phase 7 RBAC middleware"
  provides:
    - "PG-backed audit row per device tool invocation (success OR failure) via executeOnDevice"
    - "PG-backed audit row for every tRPC devices.* auth denial via ensureOwnership"
    - "audit.listDeviceEvents adminProcedure query — paginated (limit/offset), filterable by userId + deviceId, ordered timestamp DESC"
    - "audit submodule mounted on appRouter — callable as trpc.audit.listDeviceEvents(...)"
    - "httpOnlyPaths entry so the admin query routes via HTTP (not WS) for reliability"
  affects:
    - "Phase 16 admin device management (admin.list_all, admin.force_disconnect) can reuse recordDeviceEvent with new toolName values — no schema changes required"
    - "Frontend audit UI (not in scope here) will call trpc.audit.listDeviceEvents with {total, limit, offset, events} pagination envelope"
tech_stack:
  added: []
  patterns:
    - "Audit wrapper via closure-captured auditedResolve — single sink resolves both timeout + tunnel-result paths"
    - "Parameterized SQL $N placeholders with values array; dynamic WHERE conditions built safely"
    - "adminProcedure gate enforces FORBIDDEN before query handler runs"
    - "Explicit Promise<T> generic to prevent PromiseLike<T> widening when the resolver callback reads resolved fields"
key_files:
  created:
    - path: livos/packages/livinityd/source/modules/devices/audit-routes.ts
      purpose: "Admin-only tRPC router with listDeviceEvents query over device_audit_log"
      lines: 109
  modified:
    - path: livos/packages/livinityd/source/modules/devices/device-bridge.ts
      purpose: "Migrated to recordDeviceEvent + added auditedResolve wrapper so ALL completions audit"
      change: "+22/-4 lines (imports, auth-denial branch, Promise wrapper)"
    - path: livos/packages/livinityd/source/modules/devices/routes.ts
      purpose: "Migrated ensureOwnership from recordAuthFailure to recordDeviceEvent"
      change: "+5/-2 lines (imports + audit call)"
    - path: livos/packages/livinityd/source/modules/server/trpc/index.ts
      purpose: "Mounted audit submodule in appRouter"
      change: "+2 lines (import + router entry)"
    - path: livos/packages/livinityd/source/modules/server/trpc/common.ts
      purpose: "Added audit.listDeviceEvents to httpOnlyPaths"
      change: "+2 lines"
decisions:
  - "Single audit sink — executeOnDevice is the sole source of audit truth for Nexus-driven tool calls. /internal/device-tool-execute handler deliberately NOT touched; it already delegates to executeOnDevice which now audits via PG."
  - "auditedResolve closure pattern — captures deviceId/toolName/params/deviceAuditedUserId at promise creation. Wrapping resolve (and storing the wrapped version in pendingRequests.resolve) means both timeout path AND onToolResult → pending.resolve() go through the audit wrapper → exactly one audit row per invocation on both completion paths."
  - "audit-routes.ts as a separate sibling of routes.ts (not merged into devices/routes.ts) — keeps the audit domain cleanly isolated for future Phase 16 admin expansion (admin.list_all, admin.force_disconnect, etc.)."
  - "Parameterized SQL ($N placeholders computed from values.length) for the optional userId + deviceId filters — zero user input interpolated into the query string. deviceId is validated as min(1) string, userId as zod UUID at the input boundary."
  - "Explicit Promise<ToolResult> generic in executeOnDevice — the default resolve callback type is (T | PromiseLike<T>) → void, which caused TS2339 when reading result.success/.error. Narrowing the generic to the concrete ToolResult type lets the wrapper access the shape without runtime branching."
  - "NO new audit write in /internal/device-tool-execute — Phase 12 deliberately avoided a duplicate here, and the principle still holds: Nexus-callback path enters executeOnDevice which handles the PG write."
metrics:
  duration_seconds: 153
  duration_human: "2m 33s"
  tasks_completed: 3
  files_touched: 5
  commits:
    - hash: "eb35103"
      task: 1
      message: "feat(15-02): migrate device-bridge + routes ensureOwnership to recordDeviceEvent"
    - hash: "3599e7e"
      task: 2
      message: "feat(15-02): add admin audit.listDeviceEvents tRPC query"
    - hash: "4a3b87d"
      task: 3
      message: "feat(15-02): mount audit router + httpOnlyPaths entry"
  completed_at: "2026-04-24T18:14:14Z"
---

# Phase 15 Plan 02: Wire callsites + admin tRPC audit query Summary

Wired the Phase 15 PG-backed `recordDeviceEvent` writer into both device-tool callsites (`DeviceBridge.executeOnDevice` + `routes.ts#ensureOwnership`) and exposed the device_audit_log to admins via a new `trpc.audit.listDeviceEvents` query — paginated, filterable by userId/deviceId, ordered timestamp DESC — closing AUDIT-01 (every invocation recorded) and proving AUDIT-02 (queryable for incident review) end-to-end.

## What Changed

### 1. DeviceBridge.executeOnDevice (device-bridge.ts)

Two callsites migrated and one added:

- **Import swap** — `recordAuthFailure` from `./audit-stub.js` → `recordDeviceEvent` from `./audit-pg.js` (direct import, not barrel, matches Phase 12 convention to avoid circular deps through the DeviceBridge barrel export).
- **Auth-denial branch** (around line 322) — `void recordDeviceEvent(this.redis, {userId, deviceId, toolName: 'device_tool_call:${toolName}', params, success: false, error: auth.reason})`. Fire-and-forget; never blocks the 403 response.
- **New `auditedResolve` wrapper** (new, around line 360) — wraps the promise's `resolve` callback so it audits on BOTH completion paths:
  - timeout path: `auditedResolve({success: false, output: '', error: 'Tool execution timed out after 30000ms'})`
  - tunnel-result path: `onToolResult` calls `pending.resolve(event.result)`, which IS `auditedResolve` since `pendingRequests.set(requestId, {resolve: auditedResolve, ...})`.
  - Either path emits exactly one `recordDeviceEvent` row with `success = result.success === true` and `error = result.error ?? null`.
- **Explicit Promise<ToolResult> generic** — narrowed the `new Promise(...)` generic so `result.success` / `result.error` don't trigger TS2339 from PromiseLike widening in the resolve callback.

### 2. routes.ts ensureOwnership

- **Import swap** — `recordAuthFailure` → `recordDeviceEvent` (via barrel `./index.js`; routes file is not in the DeviceBridge circular-dep cycle).
- **Audit call migrated** — same shape, but the Phase 12 `action` string becomes the `toolName` (e.g. `'devices.rename'`, `'devices.auditLog'`). `params: {}` since the mutation body is not processed before auth denial.
- **TRPCError throws preserved** — `NOT_FOUND` for `device_not_found`, `FORBIDDEN` for `device_not_owned`. Client-facing contract unchanged.
- **Legacy single-user fallback preserved** — `if (!ctx.currentUser) return` early-exit untouched (no audit for legacy deployments where the JWT has `{loggedIn: true}` without a user id).

### 3. audit-routes.ts (new, 109 lines)

`devices/audit-routes.ts` — sibling of `routes.ts`:

- **`listDeviceEvents` adminProcedure query** — zod input:
  - `userId?: string` (UUID-validated)
  - `deviceId?: string` (min(1))
  - `limit: number` (1..200, default 50)
  - `offset: number` (>=0, default 0)
- **Pool resolution** via `getPool()` from `../database/index.js`. Returns `SERVICE_UNAVAILABLE` if PG not initialized.
- **Parameterized WHERE** — builds `$1 AND $2` conditions dynamically from values array; zero string interpolation of user input.
- **Two SELECTs** — `SELECT COUNT(*)` for pagination total, then `SELECT ... FROM device_audit_log ... ORDER BY timestamp DESC LIMIT $N OFFSET $N`.
- **Response envelope** — `{total, limit, offset, events: DeviceAuditRow[]}`. Client computes `hasMore` as `offset + events.length < total`.
- **rowToAudit helper** — maps snake_case PG columns to camelCase TS fields (matches existing `rowToUser` / `rowToInvite` patterns in `database/index.ts`).
- **Admin-only gate** — `adminProcedure = privateProcedure.use(requireRole('admin'))`. Member-role callers get tRPC FORBIDDEN before the handler runs.

### 4. trpc/index.ts (+2 lines)

- Added `import audit from '../../devices/audit-routes.js'` next to the existing `devices` import
- Added `audit,` to the `router({...})` call at the end of the submodule list

### 5. trpc/common.ts (+2 lines)

- Added `'audit.listDeviceEvents'` to `httpOnlyPaths` under a "Device audit log (Phase 15 AUDIT-02)" banner so the admin query routes via HTTP and surfaces failures immediately (matching the Phase 12 devices.rename/remove pattern).

## Requirements Coverage

| ID       | Status    | How                                                                                                                                                                                                                     |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUDIT-01 | Satisfied | Every device tool invocation writes exactly one row to device_audit_log via executeOnDevice's auditedResolve (success + failure paths) + the auth-denial branch; tRPC devices.* auth failures audit via ensureOwnership |
| AUDIT-02 | Satisfied | DB-level immutability trigger (Plan 15-01) + admin-only tRPC query (this plan) exposes paginated/filterable audit rows; non-admin callers are blocked with FORBIDDEN                                                    |

Plan 15-01 marked AUDIT-01 as `partial` because the writer was ready but no callsites were wired. Plan 15-02 closes that gap: both requirements are now **fully satisfied**.

## Decisions Made

1. **Single audit sink — `executeOnDevice` is the sole source of truth for Nexus-driven device tool calls.** The `/internal/device-tool-execute` HTTP handler in `server/index.ts` was deliberately NOT changed. That handler already forwards to `executeOnDevice`, so auditing there would produce duplicate rows. Phase 12 made the same architectural choice for `recordAuthFailure`; Phase 15 preserves it.

2. **`auditedResolve` closure over the tunnel-result pipeline.** The tricky bit is that `onToolResult` (called from TunnelClient) calls `pending.resolve(event.result)`. Storing `auditedResolve` in `pendingRequests.set(requestId, {resolve: auditedResolve, ...})` means the tunnel-result path also goes through the audit wrapper. Timeout path and tunnel-result path converge on a single audit write per invocation.

3. **`audit-routes.ts` sibling, not merged into `devices/routes.ts`.** Keeps the audit domain cleanly isolated. Phase 16 will likely add `admin.forceDisconnect` + `admin.listAllDevices` admin routes; when that happens, the audit router grows naturally without bloating the device CRUD routes.

4. **Parameterized SQL for dynamic filters.** Building `WHERE user_id = $1 AND device_id = $2` from a `values[]` array + `conditions[]` array is safer than template-string interpolation. Zod validates `userId` as a UUID and `deviceId` as `min(1)` at the input boundary, but defense-in-depth demands no user input touches the SQL string.

5. **Explicit `Promise<ToolResult>` generic.** When `auditedResolve` was typed as `typeof resolve`, TypeScript widened it to `(value: T | PromiseLike<T>) → void`, and reading `result.success` failed with TS2339 because `PromiseLike<T>` lacks those fields. Narrowing the Promise generic to the concrete `ToolResult` type eliminates the widening.

6. **httpOnlyPaths entry for the admin query.** Matches the Phase 12 pattern for `devices.rename` / `devices.remove` — admin queries on a device-heavy route should surface "livinityd unavailable" as an HTTP error rather than hanging on a disconnected WS. (The UI's tRPC client routes paths in this list via HTTP transport.)

## End-to-End Verification

All Plan 15-02 automated checks passed:

**Compile-time (`npx tsc --noEmit`):**
- device-bridge.ts: 0 new errors (baseline + post-patch identical)
- routes.ts: 0 new errors
- audit-routes.ts: 0 errors (new file)
- trpc/index.ts: 2 pre-existing baseline errors (ctx.logger + WebSocketServer type conflict); 0 new
- trpc/common.ts: 0 new errors

**Migration grep:**
- `recordAuthFailure` fully removed from `device-bridge.ts` + `routes.ts` (0 matches in both files)
- `recordDeviceEvent(` appears 2× in `device-bridge.ts` (auth-denial branch + auditedResolve wrapper) — meets `>=2` requirement
- `recordDeviceEvent(` appears 1× in `routes.ts` (ensureOwnership denial branch)

**Router wiring:**
- `import audit from '../../devices/audit-routes.js'` at trpc/index.ts:23
- `audit,` in the `router({...})` call at trpc/index.ts:47
- `'audit.listDeviceEvents'` at common.ts:88

**SQL structure (audit-routes.ts):**
- 3 × `adminProcedure` refs (import + 1 usage on the query builder; grep counted 3 total)
- 2 × `FROM device_audit_log` (count query + page query)
- 1 × `ORDER BY timestamp DESC`

**Phase 15 end-to-end checks (Plan 15-01 + 15-02 combined)** — runtime checks listed in 15-02-PLAN.md `<verification>` section (trigger behavior, psql queries, curl admin + member calls) rely on a running livinityd + PG and will be executed during the phase verification pass.

## Deferred Items

**Out-of-scope pre-existing tsc errors** (not caused by this plan, logged here for visibility):
- `skills/*.ts` — 7 errors re. `"flash"` tier not in `"sonnet" | "haiku" | "opus"` union. Unrelated skills module; pre-existing.
- `source/modules/ai/routes.ts` — 20+ `ctx.livinityd is possibly undefined` errors. Unrelated AI routes; pre-existing Phase 7/8 technical debt.
- `trpc/index.ts` lines 54/68 — `ctx.logger` undefined check + `WebSocketServer` cross-import type mismatch. Pre-existing; unchanged by this plan.

None of these are in scope for Phase 15. Logged so they're not mistaken for regressions.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed TS2339 from PromiseLike<T> widening in auditedResolve**
- **Found during:** Task 1 typecheck after applying the plan's exact `auditedResolve: typeof resolve = (result) => ...` pattern
- **Issue:** TS's default Promise resolver signature is `(value: T | PromiseLike<T>) => void`, so `result.success` / `result.error` failed with TS2339 when I tried to read those fields on a `PromiseLike<ToolResult>` branch
- **Fix:** Declared a local `type ToolResult = {...}` alias, parameterized the promise as `new Promise<ToolResult>(...)`, typed `auditedResolve` explicitly as `(result: ToolResult) => void` so the field access resolves against the narrow type
- **Files modified:** livos/packages/livinityd/source/modules/devices/device-bridge.ts
- **Commit:** eb35103 (folded into Task 1 commit)

No other deviations. No auth gates encountered. No architectural questions raised.

## Preview: Phase 16

Phase 16 will add admin device management tRPC routes (`admin.listAllDevices`, `admin.forceDisconnect`). Those routes will reuse:
- `recordDeviceEvent` with new toolName values (`admin.list_all`, `admin.force_disconnect`) — zero schema changes
- The `audit-routes.ts` router as a home for any new audit-read queries (e.g. `audit.listAuthFailures`, `audit.exportCsv`)
- The `httpOnlyPaths` pattern for each new admin mutation

## Self-Check: PASSED

Verified artifacts exist and commits are in the history:

- **File:** `livos/packages/livinityd/source/modules/devices/audit-routes.ts` — FOUND (new, 109 lines)
- **File:** `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — FOUND (modified, +22/-4)
- **File:** `livos/packages/livinityd/source/modules/devices/routes.ts` — FOUND (modified, +5/-2)
- **File:** `livos/packages/livinityd/source/modules/server/trpc/index.ts` — FOUND (modified, +2)
- **File:** `livos/packages/livinityd/source/modules/server/trpc/common.ts` — FOUND (modified, +2)
- **Commit:** `eb35103` (Task 1 migrations) — FOUND in git log
- **Commit:** `3599e7e` (Task 2 audit-routes.ts) — FOUND in git log
- **Commit:** `4a3b87d` (Task 3 router mount + httpOnlyPaths) — FOUND in git log
- **Invariants:** 0 new tsc errors across 5 modified files; 0 `recordAuthFailure` refs remaining in device-bridge.ts + routes.ts; 2 + 1 `recordDeviceEvent(` callsites as specified; audit router mounted + httpOnlyPaths entry present
