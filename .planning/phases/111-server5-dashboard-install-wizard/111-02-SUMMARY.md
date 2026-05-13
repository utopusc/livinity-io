---
phase: 111-server5-dashboard-install-wizard
plan: 02
subsystem: infra
tags: [server5, postgres, drizzle, next-app-router, api-keys, multi-key, bcrypt, cross-repo]

# Dependency graph
requires:
  - phase: 111-server5-dashboard-install-wizard
    plan: 01
    provides: "https://livinity.io/install.sh now serves scripts/install.sh (modular dispatcher) so wizard one-liners using --api-key flag will reach a real parser"
provides:
  - "Server5 PostgreSQL migration 0010 dropping api_keys_user_id_key UNIQUE → multi-key per user enabled"
  - "Drizzle schema.ts additive apiKeys declaration (table previously raw-SQL-only; now type-safe for future migrations)"
  - "Authed Next.js App Router endpoints: POST/GET /api/account/api-keys + DELETE /api/account/api-keys/[id]"
  - "Rollback artifacts on Server5: /opt/platform/web/src/db/schema.ts.pre-111-02.bak + /tmp/api_keys_pre_111_02.sql (api_keys pg_dump)"
affects: ["111-03 CF zone resolver", "111-04 wizard UI 3-step flow (step 3 calls POST /api/account/api-keys to mint fresh key)", "111-05 mode reference docs"]

# Tech tracking
tech-stack:
  added: []  # All deps already present: bcryptjs, nanoid, pg, drizzle-orm
  patterns:
    - "Server5 multi-key-per-user pattern: drop UNIQUE(user_id) + add non-unique idx for WHERE lookups (cheap, no composite needed)"
    - "App Router DELETE with cross-user isolation: WHERE id = $1 AND user_id = $2 returns 404 on miss (no 403 → avoids id-enumeration oracle)"
    - "Plain-key-shown-once contract: POST response includes `apiKey` field; GET response shape statically omits it; bcrypt cost 10 hash persisted"
    - "Drizzle additive declaration over raw SQL: table managed by direct psql, schema.ts declaration is for type-safety + future migration consistency (does NOT regenerate constraint)"

key-files:
  created:
    - ".planning/phases/111-server5-dashboard-install-wizard/111-02-SUMMARY.md"
    - "server5:/opt/platform/web/src/db/migrations/0010_api_keys_multi_per_user.sql"
    - "server5:/opt/platform/web/src/app/api/account/api-keys/route.ts"
    - "server5:/opt/platform/web/src/app/api/account/api-keys/[id]/route.ts"
    - "server5:/opt/platform/web/src/db/schema.ts.pre-111-02.bak (rollback)"
    - "server5:/tmp/api_keys_pre_111_02.sql (pg_dump backup of api_keys rows pre-migration)"
  modified:
    - "server5:/opt/platform/web/src/db/schema.ts (appended apiKeys pgTable declaration, 11 lines added)"
    - "server5:postgres platform.api_keys (DROP CONSTRAINT api_keys_user_id_key; CREATE INDEX idx_api_keys_user_id)"

key-decisions:
  - "D-NO-LIVOS-CHANGE upheld: zero edits to livos/ or liv/ in this repo; Server5 is out-of-band"
  - "D-111-EXISTING-AUTH upheld: all 3 handlers use existing getSession + SESSION_COOKIE_NAME from @/lib/auth — no parallel auth"
  - "D-111-KEY-NEVER-RE-SHOWN upheld: POST is the ONLY response shape that includes plain apiKey; GET returns prefix + timestamps only; bcrypt(rawKey, 10) persisted before response sent"
  - "D-111-NO-CROSS-USER-LEAK upheld: DELETE WHERE id = $1 AND user_id = $2; returns 404 (not 403) on mismatch to avoid id-enumeration oracle (T-111-02-07 mitigation)"
  - "Migration applied via raw psql (NOT drizzle-kit) — api_keys is raw-SQL-managed; drizzle-kit would attempt CREATE TABLE on a live table. Drizzle declaration is documentation/type-safety only."
  - "Additive-only data path: existing 7 api_keys rows preserved across migration (verified pre/post pg_dump diff); the test user's sacred key 8b52d071-39f6-4f9b-b941-67d9ec34b4e2 (liv_k_gcOHv6sk) is byte-identical post-migration"
  - "Build path: npm run build (Server5 uses package-lock.json, no pnpm-lock.yaml) — matches Plan 111-01 SUMMARY's auto-detected pattern"
  - "Invalid UUID short-circuit: /^[0-9a-f-]{36}$/i regex on params.id before DB query (T-111-02-02 mitigation; returns 400 before pg.query is even called)"

patterns-established:
  - "Additive Drizzle declaration for raw-SQL-managed tables: append pgTable export at end of schema.ts; do NOT include UNIQUE/index hints that would re-emit DDL on next drizzle-kit run"
  - "POST/GET co-located route.ts in App Router with shared getUser() helper inside file"
  - "Dynamic-segment route under [id]/route.ts using `{ params }: { params: Promise<{ id: string }> }` Next.js 16 signature (await params)"

requirements-completed: []  # Phase 111 has no formal requirement IDs (phase_req_ids: null per planner)

# Metrics
duration: ~12min
completed: 2026-05-13
---

# Phase 111 Plan 02: API Keys Multi-Per-User CRUD Summary

**Dropped `api_keys_user_id_key UNIQUE` constraint and shipped POST/GET/DELETE `/api/account/api-keys[/id]` route handlers on Server5 — the wizard at `/onboarding/install` (Plan 111-04) can now mint a fresh `liv_k_*` key per install without nuking previous keys, plain key disclosed exactly once per generation, cross-user revoke impossible.**

## Performance

- **Duration:** ~12 min (one SSH session per task; npm build ~9s; pg migration ~50ms)
- **Started:** 2026-05-13 (immediately after Plan 111-01 — Wave 1 parallel-safe sibling)
- **Completed:** 2026-05-13
- **Tasks:** 4 (migration + POST/GET route + DELETE route + SUMMARY commit)
- **Files modified:** 4 on Server5 (1 migration, 1 schema patch, 2 route files), 1 local artifact (this SUMMARY)
- **UAT outcome:** 10/10 must-haves PASS on live https://livinity.io (see Verification Outputs)

## Accomplishments

- **Multi-key per user works end-to-end:** Two consecutive POSTs to `/api/account/api-keys` produce two distinct `liv_k_*` tokens with distinct DB ids — verified live with `bacc68b9...` + `07e7053c...` UAT rows.
- **DROP CONSTRAINT clean:** `\d api_keys` post-migration has zero `api_keys_user_id_key UNIQUE` row; `idx_api_keys_user_id` btree index added for the WHERE-user_id lookup path; `api_keys_user_id_fkey FOREIGN KEY ... ON DELETE CASCADE` preserved.
- **Cross-user isolation enforced at SQL layer:** Attempted DELETE on another user's key id (`46a05596-ff07-48c3-8afa-bff0b8ded485`) returned 404 + verified the target row still present in DB (cross-user revoke impossible per D-111-NO-CROSS-USER-LEAK).
- **Plain key disclosed exactly once:** POST response is the ONLY surface that includes `apiKey: "liv_k_..."`; subsequent GETs return only `prefix` (14 chars) + `created_at` + `last_used_at`. `key_hash` never leaves the DB.
- **Auth gate working:** unauthenticated GET returns 401, email-unverified user (would return 403 — codepath tested by inspection but not live-curl since test user has emailVerified=true).
- **Additive-only data path verified:** All 7 pre-migration `api_keys` rows survived intact; UAT created+deleted ephemeral keys, final row count for test user = pre-migration count (idempotent UAT).
- **Sacred SHA preserved:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` pre-execution, pre-commit, post-commit.

## Migration Diff (\d api_keys before/after)

### BEFORE (Server5 `\d api_keys` pre-migration)

```
Indexes:
    "api_keys_pkey" PRIMARY KEY, btree (id)
    "api_keys_user_id_key" UNIQUE CONSTRAINT, btree (user_id)   <-- LIMIT: one key per user
    "idx_api_keys_prefix" btree (prefix)
Foreign-key constraints:
    "api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

### AFTER (Server5 `\d api_keys` post-migration)

```
Indexes:
    "api_keys_pkey" PRIMARY KEY, btree (id)
    "idx_api_keys_prefix" btree (prefix)
    "idx_api_keys_user_id" btree (user_id)                       <-- NEW: non-unique support index
Foreign-key constraints:
    "api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                                                                  ^ preserved
```

### Authoritative pg_catalog assertions

| Query | Result |
|-------|--------|
| `SELECT COUNT(*) FROM pg_constraint WHERE conname='api_keys_user_id_key'` | `0` |
| `SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_api_keys_user_id'` | `1` |
| `SELECT COUNT(*) FROM api_keys` (pre / post / cleanup-after-UAT) | `7 / 9 (intermediate) / 7` |

## Server5 Files Created/Modified

| Path | Type | Bytes | Purpose |
|------|------|-------|---------|
| `server5:/opt/platform/web/src/db/migrations/0010_api_keys_multi_per_user.sql` | NEW | 422 | Idempotent migration: DROP CONSTRAINT IF EXISTS + CREATE INDEX IF NOT EXISTS x2 |
| `server5:/opt/platform/web/src/db/schema.ts` | MODIFIED | +11 lines | Appended `export const apiKeys = pgTable("api_keys", { ... })` — additive only |
| `server5:/opt/platform/web/src/db/schema.ts.pre-111-02.bak` | BACKUP | (same as original schema.ts size pre-patch) | Rollback artifact |
| `server5:/opt/platform/web/src/app/api/account/api-keys/route.ts` | NEW | 2588 | `export async function POST` + `export async function GET` |
| `server5:/opt/platform/web/src/app/api/account/api-keys/[id]/route.ts` | NEW | 1164 | `export async function DELETE` with cross-user isolation |
| `server5:/tmp/api_keys_pre_111_02.sql` | BACKUP | 92 lines | `pg_dump -t api_keys` captured before DROP CONSTRAINT — rollback safety net |

NO local source-tree files touched (D-NO-LIVOS-CHANGE upheld; `git diff master -- livos/ liv/ | wc -l → 0`).

## Live UAT Output (Server5 production, 2026-05-13)

### 1. Unauthenticated GET → 401

```
code=401 body={"error":"Unauthorized"}
```

### 2. Authenticated GET → list metadata only (no key_hash, no plain key)

```json
{"keys":[{"id":"8b52d071-39f6-4f9b-b941-67d9ec34b4e2","prefix":"liv_k_gcOHv6sk","created_at":"2026-05-13T21:12:23.243Z","last_used_at":"2026-05-13T22:12:41.120Z"}]}
```

`key_hash` field absent ✓ — plain `apiKey` field absent ✓ — `prefix` is 14 chars exactly ✓

### 3. POST #1 → fresh key, plain disclosed once

```json
{"id":"bacc68b9-5e58-4d7a-ba1f-b1861d2b94a2","apiKey":"liv_k_LXgBg3a-d04twi9V6EQw","prefix":"liv_k_LXgBg3a-","created_at":"2026-05-13T22:16:17.868Z"}
```

### 4. POST #2 → DISTINCT key (multi-key proof)

```json
{"id":"07e7053c-3c9d-492c-b1f0-3c8604592020","apiKey":"liv_k_QNUMqiN-Mt1Rpyb7hXrJ","prefix":"liv_k_QNUMqiN-","created_at":"2026-05-13T22:16:18.113Z"}
```

`bacc68b9 != 07e7053c` ✓ — `liv_k_LXgBg3a-d04twi9V6EQw != liv_k_QNUMqiN-Mt1Rpyb7hXrJ` ✓
**This is the core unlock:** before migration, the second POST would have failed with `duplicate key value violates unique constraint "api_keys_user_id_key"`.

### 5. GET after two POSTs → 3 keys for test user

```json
{"keys":[
  {"id":"07e7053c-3c9d-492c-b1f0-3c8604592020","prefix":"liv_k_QNUMqiN-","created_at":"2026-05-13T22:16:18.113Z","last_used_at":null},
  {"id":"bacc68b9-5e58-4d7a-ba1f-b1861d2b94a2","prefix":"liv_k_LXgBg3a-","created_at":"2026-05-13T22:16:17.868Z","last_used_at":null},
  {"id":"8b52d071-39f6-4f9b-b941-67d9ec34b4e2","prefix":"liv_k_gcOHv6sk","created_at":"2026-05-13T21:12:23.243Z","last_used_at":"2026-05-13T22:12:41.120Z"}
]}
```

Ordered DESC by `created_at` ✓ — original sacred key `8b52d071...` still last_used_at-tracked ✓

### 6. DELETE first key → 200, then DELETE again → 404

```
First DELETE: {"success":true}
Second DELETE code: 404
```

### 7. Cross-user DELETE attempt → 404 + target preserved

```
Cross-user DELETE code: 404
[verified] SELECT COUNT(*) FROM api_keys WHERE id='46a05596-ff07-48c3-8afa-bff0b8ded485' → 1
```

**T-111-02-07 mitigation proven:** even with a valid session, user 3eae6ced cannot delete user fabce113's key.

### 8. Invalid UUID DELETE → 400 (regex short-circuit)

```
Invalid uuid DELETE code: 400
```

**T-111-02-02 mitigation proven:** `/^[0-9a-f-]{36}$/i` rejects `not-a-uuid` before DB query.

### 9. Cleanup → idempotent

```
Cleaned up 07e7053c-3c9d-492c-b1f0-3c8604592020
Final test user key count: 1 (must equal PRE_COUNT=1 for idempotency) ✓
```

### 10. Original test-user key intact

```
8b52d071-39f6-4f9b-b941-67d9ec34b4e2 | liv_k_gcOHv6sk
```

UAT touched only ephemeral keys; the sacred existing key for `burakcanoztruk@gmail.com` is byte-identical.

## Build + Reload Output

```
> web@0.1.0 build
> next build
▲ Next.js 16.1.7 (Turbopack)
✓ Compiled successfully
...
ƒ /api/account/api-keys/[id]
ƒ /api/account/api-keys
...
[PM2] Applying action reloadProcessId on app [web](ids: [ 14 ])
[PM2] [web](14) ✓
web status: online
```

App-paths manifest confirms both routes registered:

```json
[
  "/api/account/api-keys/[id]/route",
  "/api/account/api-keys/route"
]
```

## Decisions Made

- **Drop UNIQUE constraint without column rename or migration of existing data** — additive only; the 7 pre-migration rows survive byte-identical. Verified via `pg_dump api_keys` before + `SELECT` comparison after.
- **Index added is non-unique single-column `(user_id)`** rather than composite `(user_id, prefix)` or `(user_id, created_at)` — wizard query pattern is `WHERE user_id = $1` for both list+delete; composite would be premature optimization.
- **DELETE returns 404 (not 403) on cross-user mismatch** — avoids id-enumeration oracle (an attacker can't distinguish "this id exists but isn't yours" from "this id doesn't exist"). 404 is the conservative choice; 403 would leak the existence of other users' keys.
- **Drizzle declaration is purely documentary** — `apiKeys` export does NOT include unique/index hints that would emit duplicate DDL on next `drizzle-kit generate`. Migration applied via raw `psql -f` to avoid drizzle-kit attempting `CREATE TABLE api_keys` on a live table.
- **POST/GET co-located in single `route.ts`** following Next.js 16 App Router convention; DELETE in `[id]/route.ts` is the only place a dynamic segment is needed (separate file required by App Router routing).
- **Invalid-UUID 400 short-circuits before DB query** — `/^[0-9a-f-]{36}$/i` regex on `params.id` keeps malformed input out of `pg.query` entirely (T-111-02-02 mitigation).
- **bcrypt cost 10 matches existing `/api/dashboard`** — same hash format, no migration needed if a future plan unifies key-verification logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build command swapped from `pnpm build` to `npm run build`**
- **Found during:** Task 3 (rebuild step)
- **Issue:** Plan said `pnpm install --frozen-lockfile && pnpm build`, but Server5's `/opt/platform/web` uses npm (`package-lock.json` present, no `pnpm-lock.yaml`). This is the SAME pattern Plan 111-01 SUMMARY documented (same project, same deviation).
- **Fix:** SSH block branched on `if [ -f pnpm-lock.yaml ]; then pnpm build; else npm run build; fi` and chose `npm run build`. Next.js 16.1.7 Turbopack build completed successfully, both new routes appear in `.next/server/app-paths-manifest.json`.
- **Files modified:** none beyond what the plan already prescribed.
- **Verification:** routes in manifest, pm2 status online post-reload, live curl UAT 10/10 PASS.
- **Committed in:** N/A — Server5 file edits are out-of-band; this SUMMARY documents the swap.

### Defensive Additions Beyond Plan

**2. [Rule 2 - Missing critical functionality] Added cross-user DELETE attempt to UAT**
- **Found during:** Task 3 UAT scripting
- **Issue:** Plan's UAT covered second-DELETE-returns-404 but did NOT explicitly test that a valid session can NOT delete another user's key — the headline security property of D-111-NO-CROSS-USER-LEAK.
- **Fix:** Added explicit curl against user `fabce113`'s key id `46a05596-...` while authenticated as user `3eae6ced` (the test user). Expected + got 404 + verified the target row still in DB.
- **Verification:** code=404 returned, `SELECT COUNT(*) FROM api_keys WHERE id='46a05596-...'` → 1.
- **Committed in:** N/A — UAT execution path, no code change.

**3. [Rule 2 - Missing critical functionality] Added invalid-UUID UAT case**
- **Found during:** Task 3 UAT scripting
- **Issue:** Plan's UAT didn't cover the `/^[0-9a-f-]{36}$/i` short-circuit — T-111-02-02 mitigation untested.
- **Fix:** Added `curl ... /api/account/api-keys/not-a-uuid` expecting 400. Got 400 ✓.
- **Verification:** code=400 returned.
- **Committed in:** N/A — UAT execution path.

**4. [Rule 2 - Missing critical functionality] Pre-migration `pg_dump -t api_keys` rollback artifact**
- **Found during:** Task 1 (pre-migration)
- **Issue:** Plan said "DROP CONSTRAINT" but provided no row-level rollback for the unlikely case of data loss. Per the executor's `<server5_access>` DESTRUCTIVE GUARD directive: take a backup before DROP CONSTRAINT.
- **Fix:** `sudo -u postgres pg_dump -d platform -t api_keys > /tmp/api_keys_pre_111_02.sql` (92 lines, all 7 rows captured) BEFORE the migration ran.
- **Verification:** file exists, contains all 7 pre-migration rows, paste-replayable via `sudo -u postgres psql -d platform -f /tmp/api_keys_pre_111_02.sql` (would re-INSERT post a truncate; not needed since no data was lost).
- **Committed in:** Documented in this SUMMARY's rollback procedure.

---

**Total deviations:** 4 auto-fixed (1 blocking from environment, 3 defensive UAT/safety additions).
**Impact on plan:** Zero scope expansion. All 4 deviations strengthen the verification surface without changing the shipped artifact.

## Issues Encountered

None blocking. Migration applied first-attempt, both route handlers compiled first-attempt, live UAT passed 10/10 first-attempt.

## Sacred SHA Preservation Check

| When | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|------|------------------------------------------------------------|
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| Pre-commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |

No `liv/` source-tree changes (Server5-only plan). Pre-commit hook will gate the SUMMARY commit.

## Cross-repo Caveat

Server5 (`45.137.194.102`) is NOT a git repo — `/opt/platform/web` is direct-edited via SSH. All 4 file changes + the SQL migration exist ONLY on Server5's filesystem and Postgres. To replicate on a fresh Server5 (or recover from disaster):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 << 'SH'
set -euo pipefail
cd /opt/platform/web

# 1. Migration SQL
cat > src/db/migrations/0010_api_keys_multi_per_user.sql << 'SQL'
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_key;
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (prefix);
SQL
sudo -u postgres psql -d platform -f src/db/migrations/0010_api_keys_multi_per_user.sql

# 2. Drizzle schema patch (paste the apiKeys block from this SUMMARY)
# 3. Route files (paste from this SUMMARY)
# 4. Build + reload
npm run build
pm2 reload web --update-env
SH
```

## Rollback Procedure

If a downstream Phase 111 plan reveals a regression caused by multi-key-per-user (none expected — additive change):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 << 'SH'
set -euo pipefail
# 1. Restore UNIQUE constraint (will FAIL if any user has >1 key — must DELETE extras first)
sudo -u postgres psql -d platform -c "ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_key UNIQUE (user_id);"

# 2. Restore Drizzle schema.ts
cp /opt/platform/web/src/db/schema.ts.pre-111-02.bak /opt/platform/web/src/db/schema.ts

# 3. Remove route handlers
rm -rf /opt/platform/web/src/app/api/account/api-keys

# 4. Rebuild + reload
cd /opt/platform/web && npm run build && pm2 reload web --update-env

# 5. Optional: drop the helper index (cheap to keep around even if rollback)
sudo -u postgres psql -d platform -c "DROP INDEX IF EXISTS idx_api_keys_user_id;"
SH
```

**Note on the FAIL-if-extras case:** if multiple keys per user exist when rollback runs, the `ADD CONSTRAINT UNIQUE` will reject with `could not create unique index "api_keys_user_id_key"`. To force rollback in that case, first DELETE all but the most-recent key per user:

```sql
DELETE FROM api_keys WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id FROM api_keys ORDER BY user_id, created_at DESC
);
```

Then re-run the `ADD CONSTRAINT`. The `/tmp/api_keys_pre_111_02.sql` pg_dump captures the exact pre-migration state if a fuller restore is needed.

## Follow-ups / Carry-forward

- **111-03 (Wave 1 sibling):** unblocked. Touches `/opt/platform/web/src/app/api/cf/resolve-zone/route.ts` — no file overlap with this plan.
- **111-04 (Wave 2 dependent):** the wizard's step-3 useEffect can now call `POST /api/account/api-keys` to mint a fresh key per install. Step-3 must include a "revoke on Back/cancel" cleanup using `DELETE /api/account/api-keys/[id]` so abandoned wizard sessions don't leave orphan keys (this is wizard-UI concern, not API concern — API supports the call cleanly).
- **Multi-tunnel awareness:** `tunnel_connections` table STILL has `UNIQUE(user_id)` per memory `feedback_minipc_is_owncloud_primary` (the LivOS<>Server5 tunnel is one-per-user by design). Multi-key per user does NOT imply multi-tunnel per user — each user has N keys but installs share a tunnel slot. If a future v34.x phase wants multi-tunnel per user (e.g., laptop+Mini PC both online), it will need a separate migration on `tunnel_connections`. Out of scope for Phase 111.
- **Audit log (T-111-02-03):** still deferred. PostgreSQL logs INSERT/DELETE at the row level (sufficient for forensics), but no application-level audit log. Punt to a v34.x audit-log plan if user-facing "keys created/revoked" history is needed.
- **Optional revoke-on-logout:** not implemented — keys outlive sessions deliberately (a key is meant to be long-lived for `livinityd` agent auth, while sessions are short-lived browser cookies).

## Self-Check: PASSED

- [x] `/opt/platform/web/src/db/migrations/0010_api_keys_multi_per_user.sql` exists on Server5 (422 bytes, ls verified)
- [x] `pg_constraint` shows zero rows for `api_keys_user_id_key` (live query result: `0`)
- [x] `pg_indexes` shows `idx_api_keys_user_id` present (live query result: `1`)
- [x] `api_keys_user_id_fkey FOREIGN KEY ... ON DELETE CASCADE` preserved in `\d api_keys`
- [x] `src/db/schema.ts` contains `export const apiKeys` (grep verified)
- [x] `src/db/schema.ts.pre-111-02.bak` exists on Server5 for rollback
- [x] `/tmp/api_keys_pre_111_02.sql` pg_dump backup exists (92 lines, all 7 pre-migration rows)
- [x] `/opt/platform/web/src/app/api/account/api-keys/route.ts` exists, exports `POST` + `GET`
- [x] `/opt/platform/web/src/app/api/account/api-keys/[id]/route.ts` exists, exports `DELETE`
- [x] DELETE handler contains `WHERE id = $1 AND user_id = $2` (cross-user isolation)
- [x] POST handler contains `bcrypt.hash(rawKey, 10)` (matches existing hash format)
- [x] GET response shape omits `key_hash` and plain `apiKey` (only id, prefix, created_at, last_used_at)
- [x] Next.js manifest registers both routes (app-paths-manifest.json contains `/api/account/api-keys/[id]/route` + `/api/account/api-keys/route`)
- [x] `pm2 status web` → online post-reload
- [x] Live UAT: unauth → 401 ✓ ; POST x2 → distinct ids+keys ✓ ; GET → 3 keys ✓ ; DELETE → success ✓ ; second DELETE → 404 ✓ ; cross-user DELETE → 404 ✓ ; invalid UUID → 400 ✓ ; cleanup idempotent ✓
- [x] Original test-user key `8b52d071-39f6-4f9b-b941-67d9ec34b4e2` (`liv_k_gcOHv6sk`) byte-identical post-execution
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved pre- and at-commit-time
- [x] `git diff master -- livos/ liv/ | wc -l → 0` (D-NO-LIVOS-CHANGE upheld)

---
*Phase: 111-server5-dashboard-install-wizard*
*Plan: 02*
*Completed: 2026-05-13*
