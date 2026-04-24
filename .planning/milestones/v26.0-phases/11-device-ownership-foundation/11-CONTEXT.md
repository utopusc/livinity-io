# Phase 11: Device Ownership Foundation - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Every device in PostgreSQL is owned by exactly one user, registration binds new devices to their creator, and users only see their own devices.

This is the foundation phase of v26.0 — it unblocks every downstream phase (authorization middleware, shell isolation, session binding, audit log, admin override) by establishing the database-level source of truth for device ownership.

**Scope:**
- Schema migration: add `user_id` column (non-null, FK to users.id) to the `devices` table in PostgreSQL
- Backfill migration: assign legacy device rows (pre-v26.0, user_id NULL) to the admin user as historical owner
- Device registration flow: OAuth Device Grant pairing writes the authenticated user's id into `user_id`
- Device list endpoints: `/api/devices` (Nexus REST) and `devices.list` (tRPC) filter by `ctx.currentUser.id` so each user only sees their own devices
- DeviceRegistry (Redis cache) stays in sync with DB user_id on device connect/disconnect events

**Explicitly out of scope (handled in later phases):**
- Per-tool authorization (shell/files/screenshot ownership verification) → Phase 12
- Shell tool default-device behavior → Phase 13
- Session binding via JWT → Phase 14
- Audit log writes → Phase 15
- Admin cross-user listing → Phase 16

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

**Established project conventions to follow:**
- PostgreSQL schema is at `livos/packages/livinityd/source/modules/database/schema.sql`
- Migration pattern: additive schema changes committed to schema.sql; DB pool initialized by livinityd startup (no separate migration runner exists, changes apply on next boot via `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` idioms)
- Device records currently live in the `devices` table (or equivalent — verify during planning)
- Nexus REST endpoints at `nexus/packages/core/src/api.ts`
- tRPC routes at `livos/packages/livinityd/source/modules/devices/routes.ts` (or similar — verify)
- DeviceRegistry at `livos/packages/livinityd/source/modules/devices/device-bridge.ts` (confirmed from codebase grep)
- `ctx.currentUser` resolved via `is-authenticated.ts` middleware (from v7.0 multi-user work)

**Backfill strategy:**
- Adopt admin user (created during v7.0 multi-user migration) as historical owner for all pre-v26.0 device records
- Rationale: simplest upgrade path, preserves existing device functionality for admin, members who added devices before v26.0 can be handled by admin reassigning ownership via a future admin tool (not in scope)

</decisions>

<code_context>
## Existing Code Insights

- Multi-user schema already exists: users, sessions, user_preferences, user_app_access, user_app_instances, invites, channel_identity_map (from v7.0 + v25.0)
- Existing device tables in the codebase need to be verified — plan-phase research should locate the exact devices table definition
- JWT-based currentUser resolution is battle-tested since v7.0
- Nexus core talks to livinityd database via HTTP (no direct imports) — be careful with PG-side schema changes vs Nexus-side device ID caching

</code_context>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. Every row in the devices table has a non-null user_id foreign key to users.id; migration backfills user_id for any pre-existing device records (assigned to the admin user as the legacy owner)
2. When a user pairs a new device via the OAuth Device Grant flow, the resulting device record is written with user_id equal to the authenticated user's id — attempting to register a device with no authenticated user is rejected with 401
3. GET /api/devices (Nexus REST) and devices.list (tRPC) return only devices owned by the calling user (admin users see their own list by default; cross-user listing is a Phase 16 feature)
4. DeviceRegistry Redis cache stays in sync with DB user_id on device connect/disconnect

**Implementation sketch (for plan-phase to refine):**
- Plan 11-01: Database schema — add user_id column + FK + index + backfill migration
- Plan 11-02: Registration + filtering — OAuth device pairing writes user_id; list endpoints filter by currentUser; DeviceRegistry includes user_id in cache

</specifics>

<deferred>
## Deferred Ideas

- Device transfer between users (admin tool) — deferred to v27.0 or later
- Per-tool authorization checks — Phase 12
- Admin cross-user device listing — Phase 16

</deferred>
