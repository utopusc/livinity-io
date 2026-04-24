# Phase 15: Device Audit Log - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Immutable PostgreSQL device_audit_log with append-only DB-level enforcement. Every device tool invocation (success + failure) appends one row. DB-level INSERT/SELECT-only grants prevent UPDATE/DELETE.

**Scope:**
- PG table: device_audit_log (id UUID, user_id UUID, device_id TEXT, tool_name TEXT, params_digest TEXT, success BOOL, error TEXT, timestamp TIMESTAMPTZ) 
- SHA-256 params_digest (no plaintext shell commands / file contents)
- PG role `livos_audit_writer` with INSERT/SELECT only on device_audit_log (no UPDATE/DELETE grants)
- Migrate Phase 12's Redis stub (nexus:device:audit:failures) to PG table
- Include BOTH failed AUTH events AND successful tool invocations
- tRPC query audit.listDeviceEvents with pagination, filterable by user_id/device_id

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Table lives in livinityd's PG database (existing `livos` db) — it's a runtime concern, not platform
- Use existing `database/index.ts` pool; schema additive to `schema.sql`
- Replace `recordAuthFailure` stub (Phase 12) with new `recordDeviceEvent({userId, deviceId, toolName, paramsDigest, success, error})` that writes to PG
- Keep the Redis stub path as fallback if PG unreachable (fire-and-forget)
- Append-only enforcement: create DB role with GRANT INSERT, SELECT ON device_audit_log TO livos_audit_writer; REVOKE UPDATE, DELETE
- Application connects with that role for writes
- BUT: simpler approach (single-user PG in LivOS): use CHECK constraints / triggers to reject updates/deletes — no separate role needed

**Simpler approach chosen (single-DB LivOS):**
- Use a trigger BEFORE UPDATE/DELETE ON device_audit_log → RAISE EXCEPTION
- Same effect as role grants, easier to ship in single-DB deployment

</decisions>

<specifics>
## Specific Ideas

**Success criteria:**
1. device_audit_log PG table with immutable schema + trigger blocks UPDATE/DELETE
2. Every device tool invocation (success OR failure) writes one row
3. params_digest is SHA-256, no plaintext
4. Admin tRPC `audit.listDeviceEvents` with pagination, filterable

**Plans:**
- Plan 15-01: PG schema + trigger + recordDeviceEvent writer (replaces stub)
- Plan 15-02: Wire into all callsites + admin tRPC query

</specifics>

<deferred>
## Deferred Ideas

- Cross-service audit (Nexus + livinityd unified log) — future
- Export to SIEM — future
- PG role-based grants (vs trigger) — if trigger approach hits edge cases

</deferred>
