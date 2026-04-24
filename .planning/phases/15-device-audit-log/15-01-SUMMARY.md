---
phase: 15-device-audit-log
plan: 01
subsystem: livinityd/devices
tags: [audit, security, postgresql, schema, append-only, device-security]
requirements_completed: [AUDIT-01, AUDIT-02]
requirements_partial: true
dependency_graph:
  requires:
    - phase: 12-device-access-authorization
      why: "Reuses recordAuthFailure from audit-stub.ts as PG-outage fallback; keeps Phase 12 AuthResult/AuthFailReason types for event.error labels"
    - phase: 7-multi-user
      why: "Depends on the livinityd PG pool (getPool) and the livos database initialized by initDatabase()"
  provides:
    - "device_audit_log PG table with append-only DB-level enforcement (AUDIT-02)"
    - "recordDeviceEvent(redis, event, logger?) fire-and-forget writer with SHA-256 params_digest"
    - "computeParamsDigest(params) deterministic digest helper for tests + admin queries"
    - "devices barrel export surface ready for Plan 15-02 callsite migration"
  affects:
    - "Plan 15-02 will import recordDeviceEvent from '../devices' barrel to wire DeviceBridge.executeOnDevice + routes.ts#ensureOwnership + /internal/device-tool-execute"
    - "Future admin tRPC audit.listDeviceEvents query (Plan 15-02) reads from device_audit_log"
tech_stack:
  added: []
  patterns:
    - "Append-only audit via BEFORE UPDATE OR DELETE trigger raising RAISE EXCEPTION"
    - "SHA-256 params hashing using node:crypto (zero new deps)"
    - "Fire-and-forget writer with automatic fallback to legacy sink on primary failure"
    - "Idempotent schema migrations via IF NOT EXISTS + CREATE OR REPLACE + DO-block trigger guard"
key_files:
  created:
    - path: livos/packages/livinityd/source/modules/devices/audit-pg.ts
      purpose: "PG-backed device audit writer with Redis-stub fallback"
      lines: 109
  modified:
    - path: livos/packages/livinityd/source/modules/database/schema.sql
      purpose: "Appended device_audit_log table, 3 indexes, audit_log_immutable() function, guarded trigger"
      change: "+40 lines (new section after channel_identity_map)"
    - path: livos/packages/livinityd/source/modules/devices/index.ts
      purpose: "Extended barrel to surface recordDeviceEvent + computeParamsDigest + DeviceAuditEvent type; kept recordAuthFailure for internal fallback"
      change: "+17/-11 lines"
decisions:
  - "Nil-UUID ('00000000-0000-0000-0000-000000000000') fallback for missing_user pre-auth rows — allows UUID NOT NULL column while still auditing failures before user resolution"
  - "NO foreign key from user_id to users(id) — deleted-user audit history must remain queryable for incident review"
  - "Redis-stub fallback on PG failure — audit is fire-and-forget but never silently dropped"
  - "params_digest stored as TEXT (hex) not BYTEA — admin queries render readable 64-char strings without conversion"
  - "Trigger-based append-only (simpler for single-DB LivOS) chosen over separate PG role grants per CONTEXT.md decision"
  - "Barrel retains recordAuthFailure export for audit-pg.ts internal fallback + to avoid Plan 15-02 flag-day migration"
metrics:
  duration_seconds: 108
  duration_human: "1m 48s"
  tasks_completed: 3
  files_touched: 3
  commits:
    - hash: "97bed22"
      task: 1
      message: "feat(15-01): add device_audit_log schema + immutability trigger"
    - hash: "0f9923c"
      task: 2
      message: "feat(15-01): add recordDeviceEvent PG writer with Redis-stub fallback"
    - hash: "87e8408"
      task: 3
      message: "feat(15-01): surface recordDeviceEvent as primary audit export from devices barrel"
  completed_at: "2026-04-24T18:08:01Z"
---

# Phase 15 Plan 01: Device Audit Log Schema + Writer Summary

Append-only PostgreSQL device_audit_log table (AUDIT-01/02) with DB-level immutability trigger and a fire-and-forget recordDeviceEvent writer that SHA-256 hashes tool params, falling back to the Phase 12 Redis stub on PG outage.

## What Changed

### 1. PostgreSQL schema (schema.sql)

Appended a new section after `channel_identity_map`:

- **`device_audit_log` table** — 8 columns: `id UUID PK`, `user_id UUID NOT NULL` (no FK), `device_id TEXT`, `tool_name TEXT`, `params_digest TEXT` (SHA-256 hex, 64 chars), `success BOOLEAN`, `error TEXT NULL`, `timestamp TIMESTAMPTZ DEFAULT NOW()`
- **Three non-unique indexes** on `user_id`, `device_id`, `timestamp DESC` for admin query filterability
- **`audit_log_immutable()` PL/pgSQL function** — raises `'device_audit_log is append-only'` with `insufficient_privilege` errcode
- **`device_audit_log_no_modify` trigger** — `BEFORE UPDATE OR DELETE ON device_audit_log FOR EACH ROW`, created via a `DO`-block guard that checks `pg_trigger` for existence (older PG lacks `CREATE TRIGGER IF NOT EXISTS`)

All DDL is idempotent — re-running `schema.sql` on livinityd startup is a no-op.

### 2. Writer module (audit-pg.ts, new)

- `DeviceAuditEvent` interface: `{userId, deviceId, toolName, params, success, error?}`
- `computeParamsDigest(params)` — deterministic SHA-256 hex via `node:crypto.createHash`; null/undefined params digest the empty string; non-serializable params fall back to `'[unserializable]'`
- `recordDeviceEvent(redis, event, logger?)` — fire-and-forget:
  1. Resolves pool via `getPool()` from `../database/index.js`
  2. Computes digest, INSERTs one row with nil-UUID substitution for empty `userId` (pre-auth failures)
  3. On PG failure (pool null OR query throws), logs error and delegates to `recordAuthFailure` from `./audit-stub.js` so audit data is still captured
  4. Never throws — matches the Phase 12 contract

No 3rd-party dependencies added (uses stdlib `node:crypto`).

### 3. Devices barrel (index.ts)

- Added `recordDeviceEvent`, `computeParamsDigest`, `DeviceAuditEvent` exports from `./audit-pg.js`
- Retained `recordAuthFailure`, `AUTH_FAILURES_REDIS_KEY`, `AUTH_FAILURES_MAX_ENTRIES`, `AuthFailureEntry` exports from `./audit-stub.js` — still used by `audit-pg.ts` internal fallback and required to avoid a Plan 15-02 flag-day migration
- Preserved `authorizeDeviceAccess`, `AuthResult`, `AuthFailReason`, `DeviceBridge` exports
- Ordering: authorize → Phase 15 PG primary → Phase 12 stub → DeviceBridge

## Requirements Coverage

| ID       | Status                 | What's done                                                                                                                  | What's pending                                                                          |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AUDIT-01 | Partial (writer ready) | `recordDeviceEvent` writer exists, writes one row per invocation with user/device/tool/digest/success/error                  | Plan 15-02: wire into DeviceBridge.executeOnDevice, ensureOwnership, /internal/device-tool-execute callsites |
| AUDIT-02 | Satisfied (DB-level)   | `device_audit_log_no_modify` BEFORE UPDATE OR DELETE trigger raises `'device_audit_log is append-only'` at the DB level     | None — enforcement is complete and covers any future application path                  |

**`requirements_partial: true`** — the writer and schema are deployed, but the three callsites currently still call `recordAuthFailure` (Phase 12 Redis stub) directly. Plan 15-02 migrates those callsites and adds the admin tRPC `audit.listDeviceEvents` query.

## Decisions Made

1. **Nil-UUID sentinel for missing_user rows.** `user_id UUID NOT NULL` cannot accept `''`; pre-auth failures (where no JWT was resolved) get the all-zero UUID `00000000-0000-0000-0000-000000000000`. Since there's no FK to `users(id)`, this synthetic value doesn't need to match any row. Admin queries can filter missing-user entries via `WHERE user_id = '00000000-...'::uuid`.

2. **No FK on user_id.** CONTEXT.md specifies historical audit rows must survive user deletion. Adding a `REFERENCES users(id) ON DELETE CASCADE` would erase forensic history on user removal — unacceptable for AUDIT-01's "every invocation recorded" promise.

3. **Redis-stub fallback path on PG failure.** A PG restart / connection blip must not cause audit data loss. The writer catches all INSERT errors and delegates to the existing Phase 12 `recordAuthFailure` (capped Redis list, 1000 entries). This guarantees audit is best-effort but never silently dropped.

4. **Trigger-based append-only vs role-based grants.** CONTEXT.md explicitly chose the trigger approach for the single-DB LivOS deployment — simpler to ship, same effect. The trigger runs `BEFORE UPDATE OR DELETE`, so even a direct `psql` session as the `livos` superuser gets blocked.

5. **params_digest as TEXT (hex) not BYTEA.** 64-char hex strings render directly in admin UIs without encoding conversion; storage cost difference is negligible at audit-log scale (~100 bytes/row).

6. **Barrel keeps recordAuthFailure export.** `audit-pg.ts` imports it directly from `./audit-stub.js` (not via the barrel, avoiding circular deps), but Plan 15-02's migration may want to temporarily re-route callsites through the barrel. Keeping the export avoids forcing an atomic flag-day swap.

## Deviations from Plan

None — plan executed exactly as written. No auto-fix rules triggered, no authentication gates encountered, no architectural questions arose. All regex invariants, tsc checks, and dynamic-import verification passed on first execution.

## Preview: Plan 15-02

Plan 15-02 will:
1. Migrate `DeviceBridge.executeOnDevice` (success + auth failure paths) from `recordAuthFailure` → `recordDeviceEvent`
2. Migrate `routes.ts#ensureOwnership` (tRPC auth failures) → `recordDeviceEvent`
3. Migrate `server/index.ts` `/internal/device-tool-execute` (Nexus REST path) → `recordDeviceEvent`
4. Add admin-only tRPC query `audit.listDeviceEvents` with pagination + filter-by-userId + filter-by-deviceId
5. (Optional) Add a maintenance tRPC mutation to REVOKE UPDATE/DELETE grants for additional defense-in-depth

## Self-Check: PASSED

Verified artifacts exist and commits are in the history:

- **File:** `livos/packages/livinityd/source/modules/database/schema.sql` — FOUND (modified, +40 lines)
- **File:** `livos/packages/livinityd/source/modules/devices/audit-pg.ts` — FOUND (new, 109 lines)
- **File:** `livos/packages/livinityd/source/modules/devices/index.ts` — FOUND (modified, +17/-11 lines)
- **Commit:** `97bed22` (Task 1 schema) — FOUND in git log
- **Commit:** `0f9923c` (Task 2 audit-pg.ts) — FOUND in git log
- **Commit:** `87e8408` (Task 3 barrel) — FOUND in git log
- **Invariants:** 9/9 schema.sql regex checks passed; 7/7 barrel runtime exports resolved; 0 new tsc errors across touched files
