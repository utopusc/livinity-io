---
phase: 59-bearer-token-auth
plan: 02
subsystem: database
tags: [bearer-auth, api-keys, postgres, schema-migration, sha-256, pg-twin]

# Dependency graph
requires:
  - phase: 59-01
    provides: Six failing test files including schema-migration.test.ts (4 tests) + database.test.ts (5 tests) — the GREEN contract this wave satisfies
  - phase: 22 (existing — docker_agents)
    provides: docker/agents.ts twin pattern — token_hash + revoked_at + cleartext-once shape directly mirrored
  - phase: 44 (existing — broker_usage)
    provides: schema.sql append precedent (line 316-337 broker_usage block; api_keys appended below it at lines 339-360)
provides:
  - api_keys PG table — 8 columns + FK CASCADE + UNIQUE(key_hash) + 2 indexes (one partial WHERE revoked_at IS NULL)
  - api-keys/database.ts — 6 exported functions (createApiKey, findApiKeyByHash, listApiKeysForUser, listAllApiKeys, revokeApiKey, hashKey) + ApiKeyRow type
  - api-keys/index.ts — public surface barrel for the api-keys module
  - liv_sk_<base64url-32> token format locked in code (39 chars total)
  - SHA-256-of-FULL-plaintext hash strategy (T-59-08 — prefix-collision resistant)
  - Plaintext-returned-once contract enforced by SELECT_COLS excluding key_hash
affects:
  - 59-03 (Wave 2 — cache + bearer-auth middleware: imports findApiKeyByHash, hashKey)
  - 59-04 (Wave 3 — events + tRPC routes: imports createApiKey, listApiKeysForUser, listAllApiKeys, revokeApiKey)
  - 59-05 (Wave 4 — integration + UAT)

# Tech tracking
tech-stack:
  added: []  # NO new deps — D-NO-NEW-DEPS preserved (only node:crypto built-in used)
  patterns:
    - "PG-twin pattern: api-keys/database.ts mirrors docker/agents.ts shape (Phase 22) for maintainer continuity"
    - "SELECT_COLS-excludes-secret-column pattern: key_hash deliberately omitted from rowToApiKey output to defend against accidental exposure"
    - "Schema-comment-avoids-banned-token pattern: comment uses `pgcrypto extension declaration` instead of literal `CREATE EXTENSION pgcrypto` so the T4 convention guard regex stays GREEN"
    - "Idempotent-revoke pattern: UPDATE WHERE revoked_at IS NULL preserves first-revoke timestamp; rowCount returned for tRPC NOT_FOUND mapping"

key-files:
  created:
    - livos/packages/livinityd/source/modules/api-keys/database.ts (179 lines — 6 functions + ApiKeyRow type)
    - livos/packages/livinityd/source/modules/api-keys/index.ts (17 lines — barrel)
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql (lines 339-360 appended — api_keys block + 2 indexes)

key-decisions:
  - "Schema comment phrasing rewritten to avoid the literal token `CREATE EXTENSION` (Rule 1 deviation): the EXACT block in the plan's <interfaces> section contained the phrase inside a comment, which broke the T4 convention guard regex (/CREATE EXTENSION/g treats comment text the same as code). Replaced with `pgcrypto extension declaration` — preserves the documentation intent while passing the lock-in test."
  - "Token hash strategy: SHA-256 hex of the FULL plaintext (including `liv_sk_` prefix), matching docker/agents.ts hashToken precedent. Rationale: prefix-collision resistant (T-59-08); Node built-in (D-NO-NEW-DEPS); 64-char fixed width fits CHAR(64) UNIQUE column exactly."
  - "listAllApiKeys is auth-agnostic at this layer; Wave 3's tRPC route binds it to adminProcedure. Mirrors usage.queryUsageAll → usage.getAll pattern (Phase 44)."
  - "All functions degrade safely when getPool() returns null (returns [] / null / {rowCount:0}) — matches docker/agents.ts:103-104 precedent. createApiKey is the one exception that throws (callable contract — caller MUST get a row or know the call failed)."

patterns-established:
  - "Pattern: SELECT_COLS const that EXCLUDES sensitive columns (key_hash here, password_hash elsewhere) — the column list itself becomes a security gate; database.test.ts T5 asserts the absence as a regression guard"
  - "Pattern: rowToX mapper functions return only what callers should see (idiomatic separation of PG row shape from app-layer DTO shape)"

requirements-completed:
  - FR-BROKER-B1-01
  - FR-BROKER-B1-02

# Metrics
duration: ~3min
completed: 2026-05-02
---

# Phase 59 Plan 59-02: api_keys PG layer Summary

**api_keys table appended to schema.sql + 6-function PG CRUD layer (database.ts) shipped — turns Wave 0's 9 RED tests GREEN with zero new npm deps and the sacred file untouched.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T03:18:08Z
- **Completed:** 2026-05-03T03:20:56Z
- **Tasks:** 2/2
- **Files modified:** 1 (schema.sql)
- **Files created:** 2 (database.ts, index.ts)

## Accomplishments

- `api_keys` table added (FK CASCADE on user_id, UNIQUE on key_hash, partial active-only index on key_hash WHERE revoked_at IS NULL)
- `database.ts` ships 6 PG functions + `ApiKeyRow` interface, structurally twinned to `docker/agents.ts` for maintainer continuity
- `liv_sk_<32 base64url>` token format (39 chars) implemented — generated via `randomBytes(24).toString('base64url').slice(0, 32)` then prepended with `liv_sk_`
- SHA-256-of-FULL-plaintext hashing locked in (T-59-08 prefix-collision mitigation)
- `key_hash` deliberately excluded from `SELECT_COLS` so callers can never echo the hash to clients (defended by `database.test.ts` T5)
- Plaintext returned ONCE via `{row, plaintext}` tuple from `createApiKey` — never persisted, never logged from this module (T-59-05 mitigation)
- 9/9 Wave 1 tests GREEN — no scope creep into Wave 2-3 territory
- D-NO-NEW-DEPS green: zero `package.json` mutations
- Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every checkpoint

## Schema Diff (lines added — schema.sql 339-360)

```sql
-- =========================================================================
-- API Keys (Phase 59 FR-BROKER-B1-01..05) — Per-user `liv_sk_*` Bearer tokens.
-- Cleartext returned ONCE on create. SHA-256 hash stored. Revocation is soft
-- (revoked_at NOT NULL means revoked). Mirrors docker_agents shape (Phase 22).
-- gen_random_uuid() works WITHOUT a pgcrypto extension declaration (matches
-- existing convention: 14 other tables use gen_random_uuid() with no extension
-- line). RESEARCH.md Open Question 1 verdict: omit the extension line.
-- =========================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      CHAR(64) NOT NULL UNIQUE,
  key_prefix    VARCHAR(16) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

Exact column list for `api_keys`: `id (UUID PK gen_random_uuid)`, `user_id (UUID FK→users.id ON DELETE CASCADE)`, `key_hash (CHAR(64) UNIQUE)`, `key_prefix (VARCHAR(16))`, `name (VARCHAR(64))`, `created_at (TIMESTAMPTZ DEFAULT NOW)`, `last_used_at (TIMESTAMPTZ NULLABLE)`, `revoked_at (TIMESTAMPTZ NULLABLE)`. Indexes: `idx_api_keys_user_id`, `idx_api_keys_active` (partial, WHERE revoked_at IS NULL).

## Test Pass Count

| File | Tests | Status |
|------|-------|--------|
| `schema-migration.test.ts` | T1, T2, T3, T4 | 4/4 GREEN |
| `database.test.ts` | T1, T2, T3, T4, T5 | 5/5 GREEN |
| **Wave 1 total** | **9** | **9/9 GREEN** |

`mount-order.test.ts`, `cache.test.ts`, `bearer-auth.test.ts`, `routes.test.ts` remain RED (waiting for Waves 2-3) — exactly as planned.

## Token Hash Strategy + Rationale

**Strategy:** `crypto.createHash('sha256').update(plaintext, 'utf-8').digest('hex')` over the FULL plaintext including the `liv_sk_` prefix.

**Rationale:**
1. **D-NO-NEW-DEPS preserved** — `node:crypto` is a built-in; no bcrypt / argon2 / scrypt npm package needed.
2. **Prefix-collision resistant** (T-59-08) — hashing the full plaintext means two distinct keys with the same body but different prefixes (impossible today, but a theoretical regression vector) cannot collapse to the same hash.
3. **Twin parity with docker/agents.ts** — Phase 22 already uses SHA-256 hex for token_hash; reusing the pattern keeps both modules verifiable by the same mental model.
4. **Fixed width fits CHAR(64) UNIQUE** — SHA-256 hex is exactly 64 chars; the schema column is CHAR(64) NOT NULL UNIQUE.
5. **Bcrypt would be wrong here** — bcrypt is for password verification (slow on purpose, salted, single-use comparison). API keys are looked up by hash on every request — they need fast deterministic lookup, which SHA-256 provides. Constant-time hash comparison can still be applied at the candidate-row level if needed (Wave 2 may add `crypto.timingSafeEqual`).

## Task Commits

Each task committed atomically:

1. **Task 1: Append api_keys schema block to schema.sql** — `8c4305d3` (feat)
2. **Task 2: Implement api-keys/database.ts + index.ts (PG CRUD layer)** — `bcf41817` (feat)

**Plan metadata commit:** appended after this summary write.

## D-NO-NEW-DEPS Audit

GREEN. `git diff master~2 master -- livos/packages/livinityd/package.json` returned empty. Zero new npm dependencies. The only crypto used is `node:crypto` (`createHash`, `randomBytes`) — a Node.js built-in.

## Sacred File Audit

| Checkpoint | SHA | Status |
|------------|-----|--------|
| Plan start (pre-Task 1) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | baseline |
| Post-Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |
| Post-Task 2 / plan end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |

`nexus/packages/core/src/sdk-agent-runner.ts` untouched per D-30-07.

## Decisions Made

- **Schema comment rewrite (Rule 1 deviation — see below):** the EXACT block from the plan's `<interfaces>` section had `CREATE EXTENSION pgcrypto` inside a comment, which the T4 convention guard regex (`/CREATE EXTENSION/g`) flagged as a violation. Comment was rewritten to use `pgcrypto extension declaration` — same documentation intent, passes the test.
- **Token hash strategy: SHA-256 of FULL plaintext** (see "Token Hash Strategy" section above for full rationale).
- **`listAllApiKeys` left auth-agnostic** at the database.ts layer; Wave 3 binds the tRPC route to adminProcedure. Avoids coupling DB code to RBAC plumbing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Schema comment contained literal `CREATE EXTENSION` text, breaking T4 convention guard**

- **Found during:** Task 1 (Append api_keys schema block to schema.sql)
- **Issue:** The plan's `<interfaces>` section instructed "Use the EXACT block" which included a header comment line `-- gen_random_uuid() works without `CREATE EXTENSION pgcrypto` (matches…`. After the append, T4 of `schema-migration.test.ts` (the convention guard `expect(sql.match(/CREATE EXTENSION/g)).toBeNull()`) failed because the regex is whitespace-/comment-insensitive — it matches the literal string anywhere in the file, including inside a SQL comment.
- **Fix:** Rewrote the comment to say `WITHOUT a pgcrypto extension declaration` instead of `without `CREATE EXTENSION pgcrypto``. Same documentation intent, no banned token. The plan's `<done>` block requires `grep -c "CREATE EXTENSION" returns 0`, which the rewrite satisfies. Both the verbatim-block instruction and the convention-guard test were in tension; the convention-guard test is the locked-in invariant (Wave 0 T4 explicitly closes RESEARCH.md Open Question 1), so the test wins.
- **Files modified:** `livos/packages/livinityd/source/modules/database/schema.sql`
- **Verification:** `npx vitest run schema-migration.test.ts` → 4/4 GREEN; `grep -c "CREATE EXTENSION" schema.sql` → 0
- **Committed in:** `8c4305d3` (Task 1 commit — single commit, fix applied before commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Cosmetic comment edit only. Documentation intent preserved (the comment still explains why no extension is declared). All `<done>` criteria satisfied. No scope creep.

## Issues Encountered

- Initial Task 1 verify step caught the comment-vs-guard tension immediately. Fixed by rewriting the comment line; no other issues encountered.
- Typecheck shows pre-existing TS errors in `bearer-auth.test.ts`, `cache.test.ts`, `routes.test.ts` (`Cannot find module './bearer-auth.js' / './cache.js' / './routes.js'`) — these are the Wave 0 RED tests waiting for Waves 2-3 implementations. Out of scope for Wave 1; documented as expected RED state in Wave 0 SUMMARY.

## User Setup Required

None — no external service configuration required. PG schema is applied idempotently by livinityd's existing boot sequence (`initDatabase` in `database/index.ts:51-86` runs `schemaSql` on every startup).

## Hand-off to Wave 2 (cache + middleware)

Wave 2 (Plan 59-03) is unblocked. The PG layer is complete and verified. Wave 2 must:

1. Create `livos/packages/livinityd/source/modules/api-keys/cache.ts`:
   - In-memory `Map<key_hash, {userId, revoked, lastSeen}>` with 60s positive TTL + 5s negative TTL (CONTEXT.md decision).
   - Background flusher: writes debounced `last_used_at` updates every 30s in batch (CONTEXT.md `last_used_at` debouncing section).
   - Explicit `cache.invalidate(key_hash)` for revoke-time synchronous propagation (Wave 0 routes.test.ts T4 contract).
2. Create `livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts`:
   - Express middleware that extracts `Authorization: Bearer liv_sk_*`, calls `hashKey()`, looks up via cache → `findApiKeyByHash()`, sets `req.userId` on success, returns Anthropic-spec 401 JSON on revoked/unknown.
3. Create `livos/packages/livinityd/source/modules/api-keys/mountBearerAuthMiddleware()` that `server/index.ts` calls between the broker_usage capture middleware (line 1228) and broker routes (line 1234) — see Wave 0 mount-order.test.ts contract.

Wave 2 imports from this wave: `findApiKeyByHash`, `hashKey`, `ApiKeyRow` (all already re-exported via `api-keys/index.ts`).

## Threat Flags

None — no new security-relevant surface introduced beyond what the plan's `<threat_model>` already covers (T-59-05, T-59-06, T-59-07, T-59-08, T-59-09 — all mitigated by the implemented design).

## Next Phase Readiness

- Wave 1 complete and committed; Wave 2 unblocked.
- All Wave 0 RED tests targeting the PG layer (`schema-migration.test.ts` T1-T4, `database.test.ts` T1-T5) are now GREEN.
- Wave 0 RED tests for cache/middleware/routes (`mount-order.test.ts`, `cache.test.ts`, `bearer-auth.test.ts`, `routes.test.ts`) remain correctly RED — they describe the contract Waves 2-3 must satisfy.
- Sacred file invariant preserved.
- D-NO-NEW-DEPS preserved.

## Self-Check: PASSED

Verified files exist on disk:
- FOUND: livos/packages/livinityd/source/modules/database/schema.sql (modified — api_keys block lines 339-360)
- FOUND: livos/packages/livinityd/source/modules/api-keys/database.ts
- FOUND: livos/packages/livinityd/source/modules/api-keys/index.ts

Verified commits exist:
- FOUND: 8c4305d3 (Task 1)
- FOUND: bcf41817 (Task 2)

Sacred SHA verified: 4f868d318abff71f8c8bfbcf443b2393a553018b (unchanged across all checkpoints)

Test gate verified: 9/9 Wave 1 tests GREEN (4 schema-migration + 5 database)

D-NO-NEW-DEPS verified: zero package.json mutations across both task commits

---
*Phase: 59-bearer-token-auth*
*Completed: 2026-05-02*
