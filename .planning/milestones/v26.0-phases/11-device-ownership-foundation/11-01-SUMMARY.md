---
phase: 11-device-ownership-foundation
plan: 01
subsystem: database
tags: [postgres, drizzle, foreign-key, devices, device-auth, migration]

# Dependency graph
requires:
  - phase: 07-multi-user-foundation
    provides: users table (authoritative FK target)
  - phase: 10-device-registration
    provides: devices + device_grants tables (platform/web + relay)
provides:
  - "DB-enforced invariant: every devices row is bound to an existing users row"
  - "ON DELETE RESTRICT semantics prevent silent orphaning or cascade-loss of device audit trail"
  - "idx_devices_user_id guaranteed for per-user device queries"
  - "Application-layer guard in createDeviceRecord rejects missing userId with traceable OWN-02 error"
affects:
  - 11-02-device-registration-filtering
  - 12-device-authorization-middleware
  - 13-shell-tool-default-device
  - 14-session-binding-jwt
  - 15-audit-log
  - 16-admin-cross-user-listing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent Postgres migrations via DO $$ ... END $$ + pg_constraint existence guards"
    - "Defence-in-depth: application-layer guard + DB FK enforce same invariant"
    - "Drizzle schema documents DB-level constraints in comments when target table is not a Drizzle entity"

key-files:
  created:
    - platform/web/src/db/migrations/0007_device_user_id_fk.sql
  modified:
    - platform/web/src/db/schema.ts
    - platform/web/src/lib/device-auth.ts
    - platform/relay/src/schema.sql

key-decisions:
  - "ON DELETE RESTRICT (not CASCADE): user deletion with active devices fails loudly; operators must revoke devices first, preserving audit history"
  - "Backfill strategy: oldest user by created_at (relay users table lacks a role column, so no literal admin query is possible; oldest user is the deployment's owning account by convention)"
  - "No Drizzle .references() on devices.user_id: the users table is managed by platform/relay/src/schema.sql, not Drizzle — adding a Drizzle users entity would fragment the users schema. Constraint documented via comment instead."
  - "Constraint name devices_user_id_fkey follows Postgres default naming convention so later migrations/Drizzle introspection can reference it by name."
  - "Application-layer guard in createDeviceRecord complements the FK — provides clearer error messages and early rejection at the JS boundary rather than only at PG error time."

patterns-established:
  - "Idempotent FK addition pattern: UPDATE (backfill NULLs) -> ALTER SET NOT NULL -> DO block guarded by pg_constraint check -> CREATE INDEX IF NOT EXISTS"
  - "Mirror pattern: any schema change in platform/web migration must be mirrored in platform/relay/src/schema.sql (both services share the same Postgres; relay applies its schema on every container startup)"

requirements-completed: [OWN-01]

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 11 Plan 01: Device Ownership Foundation Summary

**DB-level FK constraint `devices_user_id_fkey` with ON DELETE RESTRICT — every device row is now hard-bound to a users row in both platform/web and platform/relay schemas, backed by a defense-in-depth guard in createDeviceRecord.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-24T16:35:39Z
- **Completed:** 2026-04-24T16:37:35Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments
- New migration `0007_device_user_id_fk.sql` adds FK + backfill + index idempotently
- Relay `schema.sql` mirrors the same FK constraint (applied on every container startup)
- Drizzle `schema.ts` documents the FK in a JSDoc comment (single source of truth remains relay/src/schema.sql)
- `createDeviceRecord` rejects missing userId with OWN-02-tagged error message

## The Invariant Now Enforced

**Every row in platform `devices` table has `user_id UUID NOT NULL` with FK constraint `devices_user_id_fkey` referencing `users(id) ON DELETE RESTRICT`.**

Concrete consequences:
- INSERT with random/invalid user_id -> Postgres rejects with FK violation
- DELETE FROM users WHERE id = X -> fails with FK violation if device rows reference X (forces explicit revoke-first workflow)
- INSERT with NULL user_id -> NOT NULL rejects before FK check
- App-layer: `createDeviceRecord(undefined, ...)` -> throws `Error: createDeviceRecord called with missing userId — device registration requires an authenticated user (OWN-02)`

No existing `devices` rows were observed to need backfilling in the running deployments (schema.ts has had `.notNull()` since Phase 10). The defensive `UPDATE devices SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;` was added for pre-NOT-NULL deployments where a row could theoretically still exist with NULL; on current envs it is a no-op.

## Task Commits

Each task committed atomically on `master`:

1. **Task 1: Create migration 0007_device_user_id_fk.sql** - `da988f5` (feat)
2. **Task 2: Mirror FK in platform/relay/src/schema.sql** - `f4512e9` (feat)
3. **Task 3: Drizzle schema comment + createDeviceRecord guard** - `68eab51` (feat)

**Plan metadata commit:** (see final commit below)

## Files Created/Modified

### Created
- `platform/web/src/db/migrations/0007_device_user_id_fk.sql` (33 lines)
  - Idempotent migration: UPDATE backfill, ALTER SET NOT NULL, DO block adding FK with RESTRICT, CREATE INDEX IF NOT EXISTS

### Modified
- `platform/web/src/db/schema.ts` (+6 lines -1 line)
  - Added JSDoc block and inline comment on `user_id` line documenting the DB-level FK
  - Behavior unchanged: `export const devices` still includes `user_id: uuid('user_id').notNull()` and all other columns
- `platform/web/src/lib/device-auth.ts` (+7 lines)
  - `createDeviceRecord` now throws `Error` if `userId` is falsy, non-string, or empty string
  - Error message cites OWN-02 for grep traceability
- `platform/relay/src/schema.sql` (+24 lines)
  - New "Phase 11 OWN-01" block inserted AFTER the device/grant indexes and BEFORE the Custom Domains section
  - Contains defensive UPDATE backfill, ALTER SET NOT NULL, and DO block adding `devices_user_id_fkey` with RESTRICT
  - Existing `CREATE TABLE IF NOT EXISTS devices` and `CREATE INDEX IF NOT EXISTS idx_devices_user_id` preserved unchanged

## Line-level Evidence

Verified via grep checks:

| File | Required string | Present |
| ---- | --------------- | ------- |
| migrations/0007_device_user_id_fk.sql | `devices_user_id_fkey` | yes |
| migrations/0007_device_user_id_fk.sql | `REFERENCES users(id)` | yes |
| migrations/0007_device_user_id_fk.sql | `ON DELETE RESTRICT` | yes |
| migrations/0007_device_user_id_fk.sql | `ALTER COLUMN user_id SET NOT NULL` | yes |
| migrations/0007_device_user_id_fk.sql | `CREATE INDEX IF NOT EXISTS idx_devices_user_id` | yes |
| relay/src/schema.sql | `Phase 11 OWN-01` | yes |
| relay/src/schema.sql | `devices_user_id_fkey` | yes |
| relay/src/schema.sql | `REFERENCES users(id) ON DELETE RESTRICT` | yes |
| relay/src/schema.sql | Original `CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);` | preserved |
| relay/src/schema.sql | Block position AFTER index, BEFORE Custom Domains | verified (5171 < 5564 < 6391) |
| web/src/db/schema.ts | `FK -> users(id) ON DELETE RESTRICT` | yes |
| web/src/db/schema.ts | `user_id: uuid('user_id').notNull()` | preserved |
| web/src/db/schema.ts | Exports: `devices`, `deviceGrants`, `apps`, `installHistory`, `customDomains` | all preserved |
| web/src/lib/device-auth.ts | `throw new Error` in createDeviceRecord | yes |
| web/src/lib/device-auth.ts | Error message `createDeviceRecord called with missing userId` | yes |
| web/src/lib/device-auth.ts | Error message contains `OWN-02` | yes |
| web/src/lib/device-auth.ts | Signature `createDeviceRecord(userId: string, deviceInfo: {...}): Promise<string>` | preserved |

TypeScript compile check (`npx tsc --noEmit` in `platform/web`): exit code 0, zero errors.

## Decisions Made

See `key-decisions` in frontmatter. Summary:
1. RESTRICT (not CASCADE) — preserves audit history, forces explicit revoke-first workflow
2. Backfill to oldest user — relay users schema has no role column; oldest user is the deployment's de facto owner
3. Drizzle documents via comment rather than `.references()` — avoids fragmenting the users schema across Drizzle + relay SQL
4. Application-layer guard duplicates the DB constraint intentionally — clearer error + earlier rejection

## Deviations from Plan

None — plan executed exactly as written.

Three minor observations that did NOT trigger deviations:
- The relay schema already had individual CREATE INDEX lines after line 125 (up to line 128) before the blank line preceding `Custom Domains`. The plan said "after line 128" — the edit placed the new block exactly between the last CREATE INDEX (line 128) and the `Custom Domains` separator, matching the acceptance criterion "AFTER `CREATE INDEX IF NOT EXISTS idx_devices_user_id` and BEFORE the `Custom Domains` section".
- CRLF line-ending warnings from Git on Windows are cosmetic; no functional impact.
- `npx tsc --noEmit` in `platform/web` now produces zero errors, not just "no NEW errors" — the baseline was already clean.

## Issues Encountered

None — all three tasks completed on first attempt, every verification command passed, TypeScript compile is clean.

## User Setup Required

None — migration file is committed to the repo; actual `ALTER TABLE` runs at deploy time when platform/web and platform/relay next boot against their Postgres. No external service configuration required.

## Next Phase Readiness

- **Plan 11-02 (registration binding + filtering)** is unblocked: can now safely INSERT devices knowing the DB will reject orphan user_ids, and can filter list endpoints by `ctx.currentUser.id` with confidence that every row has a valid owner.
- **Phase 12 (authorization middleware)** is unblocked: can trust `devices.user_id` as the source of truth for per-device ownership checks without defensive NULL handling.
- **Deployment action required at release time:** running both platform/web migrations and restarting platform/relay container will apply the FK to the production DB. No pre-deploy data fix needed on current environments (no NULL user_ids observed).

## Self-Check: PASSED

Verified:
- File `platform/web/src/db/migrations/0007_device_user_id_fk.sql` FOUND
- File `platform/web/src/db/schema.ts` FOUND (modified)
- File `platform/web/src/lib/device-auth.ts` FOUND (modified)
- File `platform/relay/src/schema.sql` FOUND (modified)
- Commit `da988f5` FOUND in git log
- Commit `f4512e9` FOUND in git log
- Commit `68eab51` FOUND in git log
- All 17 grep-based acceptance checks: PASS
- TypeScript compile in platform/web: exit 0

---
*Phase: 11-device-ownership-foundation*
*Completed: 2026-04-24*
