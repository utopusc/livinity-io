---
phase: 12-device-access-authorization
plan: 01
subsystem: livinityd/devices
tags: [authorization, device-access, audit-log, helper-extraction, phase-12]
requirements_completed: [AUTHZ-01, AUTHZ-02]
requirements_partial: true # full coverage lands in Plan 12-02 (callsite wiring)
dependency_graph:
  requires:
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts # Redis cache entry shape (Phase 11 OWN-03)
    - ioredis # Redis client type + list ops
  provides:
    - authorizeDeviceAccess # ownership-check helper for Plan 12-02 callsites
    - recordAuthFailure # fire-and-forget audit writer for Plan 12-02 callsites
    - AuthResult / AuthFailReason types # structured error contract for all callers
    - AuthFailureEntry type + AUTH_FAILURES_REDIS_KEY constant # schema for Phase 15 PG migration
    - devices/index.ts barrel # single-root import path for Plan 12-02 + Phase 15 swap
  affects:
    - Plan 12-02 (device-routed callsite wiring) # next consumer
    - Phase 15 (device_audit_log PG table) # will replace audit-stub.ts behind same import path
tech_stack:
  added: [] # zero new deps — pure TypeScript + existing ioredis
  patterns:
    - "Structured non-throwing auth helper (authorized + optional reason) — callers surface failures as TRPCError/HTTP 403/tool result"
    - "Barrel export as swap point — Phase 15 can replace audit-stub.ts with PG-backed writer without touching any callsite"
    - "LPUSH + LTRIM(0, MAX-1) newest-at-head (distinct from device-bridge.ts onAuditEvent which uses RPUSH + LTRIM(-MAX, -1) newest-at-tail)"
key_files:
  created:
    - livos/packages/livinityd/source/modules/devices/authorize.ts # 67 lines, authorizeDeviceAccess + AuthResult + AuthFailReason
    - livos/packages/livinityd/source/modules/devices/audit-stub.ts # 52 lines, recordAuthFailure + AuthFailureEntry + constants
    - livos/packages/livinityd/source/modules/devices/index.ts # 21 lines, barrel re-exports
  modified: []
decisions:
  - "authorize.ts does NOT import from device-bridge.ts (prevents circular dep when Plan 12-02 makes device-bridge import authorize)"
  - "DEVICE_REDIS_PREFIX='livos:devices:' duplicated in authorize.ts rather than imported — keeps the helper leaf-node in the import graph"
  - "'missing_user' reason returns BEFORE touching Redis — guards against the Phase 11 legacy 'return all' fallback leaking into v7.0 multi-user deployments"
  - "Malformed JSON in Redis cache collapses to reason='device_not_found' (same defensive pattern as device-bridge.ts:440-442) — never throws"
  - "audit-stub.ts uses LPUSH + LTRIM(0, 999) newest-at-HEAD; device-bridge.ts onAuditEvent uses RPUSH + LTRIM(-1000, -1) newest-at-TAIL. Chosen intentionally: admin-UI in Phase 15 reads failures newest-first via LRANGE 0 N-1"
  - "Barrel does NOT re-export the default router from routes.ts — tRPC assembly imports it by path in server/trpc/index.ts line 22; rewiring that import is out of scope for this plan"
  - "source/index.ts line 22 deep import of DeviceBridge from './modules/devices/device-bridge.js' preserved — no churn to the main entry point"
metrics:
  duration_minutes: 2
  completed_date: "2026-04-24"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 12 Plan 01: Extract authorizeDeviceAccess helper + stub audit log

**One-liner:** Created `authorizeDeviceAccess` ownership-check helper with 4-branch AuthResult contract, plus fire-and-forget `recordAuthFailure` stub audit writer to Redis list `nexus:device:audit:failures` (capped 1000), exposed via a new `devices/index.ts` barrel — zero callsites touched, that is Plan 12-02's job.

## What Was Built

Three new files in `livos/packages/livinityd/source/modules/devices/`:

### 1. `authorize.ts` (67 lines)

Pure Redis-backed ownership check. Reads one key (`livos:devices:{deviceId}`) and returns a structured `AuthResult`:

```typescript
export async function authorizeDeviceAccess(
  redis: Redis,
  userId: string | undefined | null,
  deviceId: string,
): Promise<AuthResult>
```

Four result branches:

| Branch                                              | Condition                                                          | Reason code         |
| --------------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| `{authorized: true}`                                | Redis entry exists and `entry.userId === userId`                   | —                   |
| `{authorized: false, reason: 'missing_user'}`       | `userId` is falsy / empty string / non-string (guarded BEFORE Redis) | `missing_user`      |
| `{authorized: false, reason: 'device_not_found'}`   | No Redis key for `deviceId`, OR Redis value is malformed JSON      | `device_not_found`  |
| `{authorized: false, reason: 'device_not_owned'}`   | Redis entry exists, `entry.userId !== userId`                      | `device_not_owned`  |

Guarantees:
- Never throws — callers decide how to surface failures (tRPC `FORBIDDEN`, HTTP 403, agent tool error-result).
- Zero imports from `device-bridge.ts` — keeps the helper as a leaf node so Plan 12-02 can safely make DeviceBridge import it without creating a cycle.
- `missing_user` check short-circuits BEFORE the Redis GET — defensive against v7.0 sessions whose `ctx.currentUser` somehow arrives empty.
- Uses the same `'device_not_owned'` string literal the existing Phase 11 routes.ts uses for TRPCError messages — client-side error handling is unchanged.

### 2. `audit-stub.ts` (52 lines)

Fire-and-forget Redis writer for failed-authorization events.

```typescript
export const AUTH_FAILURES_REDIS_KEY = 'nexus:device:audit:failures'
export const AUTH_FAILURES_MAX_ENTRIES = 1000

export async function recordAuthFailure(
  redis: Redis,
  entry: Omit<AuthFailureEntry, 'timestamp'>,
  logger: {error: (...args: unknown[]) => void} = console,
): Promise<void>
```

`AuthFailureEntry` schema: `{timestamp (ISO 8601), userId, deviceId, action, error}`.

Guarantees:
- Never throws — `try/catch` swallows any `lpush`/`ltrim` error to `logger.error` so audit cannot block the caller's 403 response.
- Sequential `lpush` then `ltrim(0, 999)` (not `Promise.all`) — trim only runs after push succeeds.
- Imports `AuthFailReason` as a type-only import from `./authorize.js`; no runtime circular risk.

### 3. `index.ts` (21 lines)

Barrel re-export of the Phase 12 helpers plus the existing `DeviceBridge`:

```typescript
export {authorizeDeviceAccess} from './authorize.js'
export type {AuthResult, AuthFailReason} from './authorize.js'
export {recordAuthFailure, AUTH_FAILURES_REDIS_KEY, AUTH_FAILURES_MAX_ENTRIES} from './audit-stub.js'
export type {AuthFailureEntry} from './audit-stub.js'
export {DeviceBridge} from './device-bridge.js'
```

Plan 12-02 callsites will import from `../devices` (the barrel) rather than `../devices/authorize` — this lets Phase 15 swap `audit-stub.ts` for a PostgreSQL `device_audit_log` writer behind the barrel without touching any callsite.

## LPUSH-vs-RPUSH Decision (audit-stub)

Two coexisting Redis-list audit patterns in this module, chosen intentionally:

| Writer                                        | Ops                                | Order                  | Reason                                                                                  |
| --------------------------------------------- | ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `DeviceBridge.onAuditEvent` (per-device log)  | `RPUSH` + `LTRIM(-1000, -1)`       | newest at **tail**     | `getAuditLog` reads `LRANGE 0 -1` then `.reverse()` — existing Phase 11 behavior        |
| `recordAuthFailure` (this plan, stub failure log) | `LPUSH` + `LTRIM(0, 999)`      | newest at **head**     | Phase 15 admin-UI will read failures newest-first via plain `LRANGE 0 N-1` (no reverse) |

Both are correct; using different conventions matches each consumer's natural read pattern.

## No Callsites Touched

Explicitly out of scope for this plan. Plan 12-02 will wire these helpers into:

- `livos/packages/livinityd/source/modules/devices/routes.ts` — replace the 3 inline `if (device.userId !== ctx.currentUser.id)` checks at lines 45, 67, 91.
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — add ownership check in `executeOnDevice` before forwarding to the tunnel.
- The Nexus `/internal/device-tool-execute` callback (elsewhere in the repo) — add ownership check before dispatching the proxy tool.

Verified no regression: existing deep imports `source/index.ts:22` (`./modules/devices/device-bridge.js`) and `server/trpc/index.ts:22` (`../../devices/routes.js`) still resolve and compile cleanly.

## Verification Results

- `wc -l` on each file: authorize.ts=67, audit-stub.ts=52, index.ts=21 (all meet min-line thresholds).
- `npx tsc --noEmit` in livos/packages/livinityd: **zero NEW errors** in `modules/devices/` (pre-existing baseline errors in unrelated files — `skills/*.ts`, `ai/routes.ts`, etc. — carried from v25.0 and unchanged by this plan).
- Barrel smoke test (`npx tsx` dynamic import): resolved 5 runtime exports as expected — `AUTH_FAILURES_MAX_ENTRIES, AUTH_FAILURES_REDIS_KEY, DeviceBridge, authorizeDeviceAccess, recordAuthFailure`. Types are erased at runtime as expected.
- Regression grep: both pre-existing deep imports still present.

## Requirements Status

| ID       | Coverage                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| AUTHZ-01 | **Partial** — helper exists and is exported, but only becomes load-bearing once Plan 12-02 wires callsites |
| AUTHZ-02 | **Partial** — audit writer exists and is exported, but no callsite emits failures yet (Plan 12-02)         |
| AUTHZ-03 | **Not started** — covered by Plan 12-02                                                                    |

This is a deliberate split: Plan 12-01 creates the helpers atomically so Plan 12-02 can be a surgical wiring pass with a much smaller blast radius per commit.

## Deviations from Plan

None — plan executed exactly as written. Three tasks, three atomic commits, EXACT file contents as specified in the plan's `<action>` blocks.

A note on acceptance-criteria grep counts: the plan specified exact counts for reason-code string occurrences that would only be satisfied if the `AuthFailReason` type union were removed. Since the plan's EXACT file content (the authoritative source) includes the type union, the actual grep counts are:

- `device_not_owned`: 2 (1 in type union + 1 in return statement) — plan said exactly 1
- `device_not_found`: 3 (1 in type union + 2 in return statements) — plan said exactly 2
- `missing_user`: 2 (1 in type union + 1 in return statement) — plan said exactly 1
- `throw`: 1 (in the JSDoc "Deliberately does NOT throw") — plan said 0

The semantic intent (each reason used exactly once as a runtime return value; helper does not throw) is satisfied. The plan's EXACT content (which takes precedence) was followed verbatim. No code changes were made to chase the off-by-N grep criteria.

## Commits

| Task | Commit    | Files created                                             |
| ---- | --------- | --------------------------------------------------------- |
| 1    | `9fd9c40` | `livos/packages/livinityd/source/modules/devices/authorize.ts`  |
| 2    | `0654d57` | `livos/packages/livinityd/source/modules/devices/audit-stub.ts` |
| 3    | `feb144f` | `livos/packages/livinityd/source/modules/devices/index.ts`      |

## Known Stubs

- `audit-stub.ts` is itself an intentional, declared stub. Phase 15 (AUDIT-01 / AUDIT-02) will replace the Redis-list writer with an append-only PostgreSQL `device_audit_log` table using INSERT/SELECT-only DB role grants. The barrel export (`devices/index.ts`) is the swap point: Phase 15 will rename the file's exports without touching any callsite. This is the documented design, not deferred work.

No UI-facing stubs introduced by this plan. No hardcoded empty arrays/objects flowing to rendering. No placeholder text.

## Preview: Plan 12-02

Callsites should import from the barrel:

```typescript
import {authorizeDeviceAccess, recordAuthFailure} from '../devices'
// not '../devices/authorize' or '../devices/audit-stub'
```

Expected wiring pattern for each callsite:

```typescript
const result = await authorizeDeviceAccess(redis, userId, deviceId)
if (!result.authorized) {
  void recordAuthFailure(redis, {userId: userId ?? '', deviceId, action: 'devices.rename', error: result.reason!})
  throw new TRPCError({code: 'FORBIDDEN', message: result.reason!}) // or HTTP 403 / tool-result error
}
// ...proceed with device operation
```

Note the `void` on `recordAuthFailure` — the promise is fire-and-forget, and the helper guarantees it will not throw. The 403/error is returned immediately without awaiting the audit write.

## Self-Check: PASSED

- All 3 created files exist on disk ✓
- SUMMARY.md exists on disk ✓
- All 3 task commits exist in git history (9fd9c40, 0654d57, feb144f) ✓
- `npx tsc --noEmit` in livos/packages/livinityd shows no errors in `modules/devices/` ✓
- Barrel smoke test resolves all 5 expected runtime exports ✓
- No regression to existing deep imports (source/index.ts:22, server/trpc/index.ts:22) ✓
