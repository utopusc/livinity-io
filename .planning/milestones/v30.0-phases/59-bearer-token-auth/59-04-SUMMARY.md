---
phase: 59-bearer-token-auth
plan: 04
subsystem: auth

tags: [bearer-auth, trpc, api-keys, audit-log, device-audit-log-reuse]

requires:
  - phase: 59-bearer-token-auth-01
    provides: schema-migration api_keys table + Wave 0 RED tests (routes.test.ts, common.test.ts)
  - phase: 59-bearer-token-auth-02
    provides: api_keys PG CRUD (createApiKey, listApiKeysForUser, listAllApiKeys, revokeApiKey, hashKey) + index.ts barrel
  - phase: 59-bearer-token-auth-03
    provides: ApiKeyCache (60s/5s TTL, invalidate hook) + Bearer middleware mounted on /u/:userId/v1 + Livinityd.apiKeyCache singleton field
provides:
  - apiKeysRouter (tRPC) with create / list / revoke / listAll procedures
  - recordApiKeyEvent (REUSE device_audit_log; sentinel device_id='api-keys-system')
  - getSharedApiKeyCache / setSharedApiKeyCache singleton accessor (mirrors getPool() shape)
  - 4 new entries in httpOnlyPaths (apiKeys.create / list / revoke / listAll)
  - revokeApiKey extended to RETURN key_hash for synchronous cache invalidation
affects: [59-05 e2e-integration, 60 public-broker-endpoint, 62 settings-ui]

tech-stack:
  added: []
  patterns:
    - "REUSE device_audit_log + sentinel device_id pattern (Phase 46 precedent) — no new audit table per phase"
    - "Process-wide singleton accessor pattern (mirrors getPool from database/index.ts) for sharing the cache between bearer middleware mount and tRPC route handlers"
    - "Inlined procedures in router(...) literal so source-string regex defense-in-depth check (e.g. /listAll:\\s*adminProcedure/) catches role-demotion regressions at unit-test time"

key-files:
  created:
    - livos/packages/livinityd/source/modules/api-keys/events.ts
    - livos/packages/livinityd/source/modules/api-keys/routes.ts
  modified:
    - livos/packages/livinityd/source/modules/api-keys/database.ts (revokeApiKey extended with RETURNING key_hash)
    - livos/packages/livinityd/source/modules/api-keys/cache.ts (singleton accessors get/setSharedApiKeyCache + resetSharedApiKeyCacheForTests)
    - livos/packages/livinityd/source/modules/api-keys/index.ts (barrel re-exports apiKeysRouter, recordApiKeyEvent, ApiKeyAuditEvent, cache singleton accessors)
    - livos/packages/livinityd/source/index.ts (Livinityd ctor calls setSharedApiKeyCache(this.apiKeyCache))
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (mount apiKeys namespace)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (4 new httpOnlyPaths entries)
    - livos/packages/livinityd/source/modules/server/trpc/common.test.ts (Tests 11+12 added; 12/12)

key-decisions:
  - "Extended revokeApiKey signature with RETURNING key_hash rather than separate SELECT round-trip — keeps the route handler atomic (one PG hop, not two), no race window between SELECT and UPDATE."
  - "Process-wide singleton (get/setSharedApiKeyCache) to bridge cache between bearer middleware mount and tRPC routes — mirrors getPool() from database/index.ts; routes.ts calls getSharedApiKeyCache() lazily so test mocks via vi.mock work without singleton plumbing"
  - "Procedures inlined in router(...) literal so source-string regex (routes.test.ts T6: /listAll:\\s*adminProcedure/) sees the gate at the definition site — extracting to const xProc = ... would defeat the defense-in-depth check"
  - "Dropped NIL_UUID fallback path from twin pattern (fail2ban-admin/events.ts) — Phase 59 always has a valid userId from ctx.currentUser.id (route-side privateProcedure gate); leaving it would silently mask a missing-userId regression"

patterns-established:
  - "Pattern: tRPC router shared mutable singleton via module-level let + setter — preferred over context-injection when the singleton is constructed once at boot and read by many routes"
  - "Pattern: defense-in-depth source-string regex for procedure-type gates — bind procedure literals (privateProcedure / adminProcedure) at the router(...) site so RBAC regressions are caught at unit-test time"
  - "Pattern: belt-and-suspenders response projection — DB SELECT_COLS excludes key_hash AND route handler maps to explicit public shape (T-59-18 mitigation; future SELECT-cols change can't silently leak fields)"

requirements-completed:
  - FR-BROKER-B1-04
  - FR-BROKER-B1-05  # route side — bearer middleware (Wave 2) returns Anthropic-spec 401 envelope on revoked keys; integration round-trip verified by Wave 4

duration: ~30 min
completed: 2026-05-02
---

# Phase 59 Plan 04: tRPC apiKeys Router + Audit Hook Summary

**Four-procedure `apiKeys` tRPC router (create/list/revoke/listAll), `recordApiKeyEvent` REUSING `device_audit_log` per Phase 46 precedent, 4 entries added to `httpOnlyPaths`, and a process-wide cache singleton bridge so `apiKeys.revoke` invalidates the SAME `ApiKeyCache` the bearer middleware reads from — closing RESEARCH.md Pitfall 1 (revocation lag).**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-02T20:41:00Z (approx)
- **Completed:** 2026-05-02T20:48:00Z (approx)
- **Tasks:** 2 (both completed)
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- **events.ts (NEW, 100 LOC):** `recordApiKeyEvent` REUSES `computeParamsDigest` from `devices/audit-pg.ts` (no redefinition; verified by grep `function computeParamsDigest` returns 0 in events.ts). Sentinel `device_id='api-keys-system'` distinguishes Phase 59 rows from Phase 15 device-tool rows and Phase 46 fail2ban rows. Fire-and-forget contract: PG INSERT primary, JSON belt-and-suspenders write to `/opt/livos/data/security-events/<ts>-<uuid8>-<action>.json`.
- **routes.ts (NEW, 230 LOC):** `apiKeysRouter` with 4 procedures, all inlined into the `router(...)` literal so the defense-in-depth source-string regex `/listAll:\s*adminProcedure/` (T6) sees the gate at the definition site. `apiKeys.create` returns plaintext ONCE in the flat shape `{id, plaintext, prefix, name, created_at, oneTimePlaintextWarning: true}`. `apiKeys.list` maps to public shape (key_hash projected out at TWO layers: DB SELECT_COLS + route map). `apiKeys.revoke` calls `getSharedApiKeyCache().invalidate(keyHash)` AFTER successful UPDATE for IMMEDIATE propagation. `apiKeys.listAll` is `adminProcedure`-gated.
- **revokeApiKey signature extension:** `database.ts revokeApiKey` now returns `{rowCount, keyHash?}` via `RETURNING key_hash`. Wave 1 callers continue to work (extra field is optional).
- **Cache singleton bridge:** `cache.ts` exports `get/setSharedApiKeyCache` (mirrors `getPool()` shape). `Livinityd` ctor calls `setSharedApiKeyCache(this.apiKeyCache)` once at boot so the routes hit the SAME instance the bearer middleware mounted onto `/u/:userId/v1`.
- **`server/trpc/index.ts`:** `apiKeys` namespace mounted on `appRouter`.
- **`httpOnlyPaths`:** 4 new entries added — `apiKeys.create`, `apiKeys.list`, `apiKeys.revoke`, `apiKeys.listAll`. Same WS-reconnect-survival reason as Phase 45/46/47 clusters; HTTP delivery prevents WS-reconnect-replay confusion that would lose the cleartext token returned by `apiKeys.create`.
- **`common.test.ts`:** Tests 11+12 added (mirrors Phase 47 Tests 8+9 pattern). Now 12/12 GREEN.

## Task Commits

1. **Task 1: events.ts + routes.ts + revokeApiKey extension + cache singleton** — `f29128a6` (feat)
2. **Task 2: mount apiKeys + 4 httpOnlyPaths entries + Tests 11/12** — `c3091d1f` (feat)

_Both tasks were single-commit (no separate test/feat/refactor split — Wave 0 RED tests authored in 59-01 already existed; this plan flipped them GREEN by writing production code)._

## Files Created/Modified

- `livos/packages/livinityd/source/modules/api-keys/events.ts` (NEW, 100 LOC) — `recordApiKeyEvent` REUSE pattern
- `livos/packages/livinityd/source/modules/api-keys/routes.ts` (NEW, 230 LOC) — `apiKeysRouter`
- `livos/packages/livinityd/source/modules/api-keys/database.ts` — `revokeApiKey` extended with `RETURNING key_hash`
- `livos/packages/livinityd/source/modules/api-keys/cache.ts` — singleton accessors appended (47 new LOC)
- `livos/packages/livinityd/source/modules/api-keys/index.ts` — 4 new barrel re-exports
- `livos/packages/livinityd/source/index.ts` — import + `setSharedApiKeyCache(this.apiKeyCache)` ctor call
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — import + namespace mount
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — 4 new entries (with header comment block)
- `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` — Tests 11+12 + final-message bump to (12/12)

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `routes.test.ts` (Wave 0) | 7 | 7/7 GREEN |
| `cache.test.ts` (Wave 0) | 5 | 5/5 GREEN — no regression |
| `bearer-auth.test.ts` (Wave 0) | 8 | 8/8 GREEN — no regression |
| `mount-order.test.ts` (Wave 0) | 1 | 1/1 GREEN — no regression |
| `database.test.ts` (Wave 1) | 5 | 5/5 GREEN — no regression |
| `schema-migration.test.ts` (Wave 1) | 4 | 4/4 GREEN — no regression |
| **TOTAL api-keys** | **30** | **30/30 GREEN** |
| `common.test.ts` (server/trpc) | 12 | 12/12 GREEN |

`npx tsc --noEmit`: 350 errors total (down from Wave 2 baseline 427; all pre-existing in unrelated files: user/, widgets/, file-store.ts). Zero new errors in any of the files touched by this plan.

## Grep Evidence

```
$ grep -c "^\s*'apiKeys\." livos/packages/livinityd/source/modules/server/trpc/common.ts
4
```

(4 namespaced entries — matches plan acceptance criteria.)

```
$ grep "function computeParamsDigest" livos/packages/livinityd/source/modules/api-keys/events.ts
(no match — REUSE invariant preserved; computeParamsDigest is imported from devices/audit-pg.js, not redefined)
```

```
$ grep "apiKeys" livos/packages/livinityd/source/modules/server/trpc/index.ts
import apiKeys from '../../api-keys/routes.js'
	apiKeys,
```

(import + namespace mount both present.)

## Anthropic 401 Envelope (route-side FR-BROKER-B1-05 status)

The 401 envelope itself is wired in Wave 2's `bearer-auth.ts` (line 69-72), shape:

```json
{
  "type": "error",
  "error": {"type": "authentication_error", "message": "API key invalid"}
}
```

Wave 3 closes the loop: `apiKeys.revoke` calls `cache.invalidate(keyHash)` synchronously, so the next bearer-authed request hashing the same plaintext will hit cache MISS → PG SELECT (filters `revoked_at IS NULL`) → null → 401 envelope. Full revoke→401 round-trip verified by Wave 4 integration test (next plan).

## Plain-Text Key Handling (D-30-05 audit)

- **`apiKeys.create` response:** Returns `{id, plaintext, prefix, name, created_at, oneTimePlaintextWarning: true}`. Plaintext field present.
- **`apiKeys.list` response:** Returns `[{id, key_prefix, name, created_at, last_used_at, revoked_at}]`. NO `plaintext`. NO `key_hash`. Verified by routes.test.ts T2 (`expect(row).not.toHaveProperty('plaintext')` + `expect(row).not.toHaveProperty('keyHash')` + `expect(row).not.toHaveProperty('key_hash')`).
- **`apiKeys.listAll` response:** Returns `[{id, user_id, username, key_prefix, name, created_at, last_used_at, revoked_at}]`. NO `plaintext`. NO `key_hash`. Same projection as `list`, plus the admin JOIN field `username` and the cross-user `user_id`.
- **DB layer:** `database.ts SELECT_COLS = 'id, user_id, key_prefix, name, created_at, last_used_at, revoked_at'` — `key_hash` deliberately excluded at SQL projection level.
- **Belt-and-suspenders:** Response is mapped to an explicit shape in the route handler too — even if a future `SELECT_COLS` regression added `key_hash`, the route map projection would still strip it (T-59-18 layer 2).

## Audit Hook Implementation

- **File:** `livos/packages/livinityd/source/modules/api-keys/events.ts:74-115`
- **REUSE invariant:** `computeParamsDigest` imported from `devices/audit-pg.ts` (line 47), not redefined.
- **Sentinel:** `SENTINEL_DEVICE_ID = 'api-keys-system'` (line 39).
- **Action verbs:** `'create_key' | 'revoke_key'`.
- **Fire-and-forget contract:** Both PG INSERT and JSON write are wrapped in independent try/catch — caller never sees a thrown error.
- **Call sites:** `routes.ts:115` (create) and `routes.ts:206` (revoke). Both use `void recordApiKeyEvent(...)` to make the fire-and-forget intent explicit.

## Decisions Made

1. **Extended `revokeApiKey` with `RETURNING key_hash`** — alternative was a separate SELECT before the UPDATE, but that opens a TOCTOU window (key revoked or rotated between SELECT and UPDATE) AND doubles the PG round-trips. `RETURNING` is atomic and one round-trip. Wave 1 callers compatibly extended (extra optional field, same `rowCount`).
2. **Process-wide singleton (`getSharedApiKeyCache`/`setSharedApiKeyCache`)** — mirrors `getPool()` from `database/index.ts`. Alternative was injecting cache through `ctx`, but that requires plumbing through `createContextExpress`/`createContextWss` and the cache is a process singleton anyway (single-process invariant per RESEARCH.md A3). Test mocks via `vi.mock('./cache.js', ...)` work cleanly because the mock returns a fresh object whose `getSharedApiKeyCache` is a no-arg function — no singleton state to reset between tests.
3. **Procedures inlined in `router(...)` literal** — required for the `routes.test.ts` T6 source-string regex `/listAll:\s*adminProcedure/` to match. Extracting to `const listAllProc = adminProcedure...` would have left the regex matching only the `*Proc` declaration, but the router could then be re-bound to a different procedure type without the test catching it. Defense-in-depth: bind the gate at the router-definition site so RBAC regressions surface at unit-test time.
4. **Dropped NIL_UUID fallback path** — fail2ban's `events.ts` carries a fallback for missing-user cases (pre-auth IP bans). Phase 59's `recordApiKeyEvent` is only called from inside `privateProcedure` handlers where `ctx.currentUser.id` is guaranteed non-empty by the auth middleware. Carrying the fallback would silently mask a missing-userId regression — preferred to let the PG INSERT throw on an empty userId so the audit-write failure is logged and the bug surfaces.
5. **`ctx.logger ?? console` fallback in revoke handler** — the `Context` type Merge over WSS+Express makes `logger` optional at the type level even though both transports actually supply it. One-line fallback eliminates the only typecheck error introduced by this plan, with zero runtime change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Contract] Cache singleton accessor named `getSharedApiKeyCache`, not `getApiKeyCache`/`setApiKeyCache` per the plan's `<action>` step 2-A**
- **Found during:** Task 1 (reading routes.test.ts mock setup before writing routes.ts)
- **Issue:** The Wave 0 test (`routes.test.ts:51-60`) mocks `./cache.js` exporting `getSharedApiKeyCache`. The plan's `<action>` proposed `getApiKeyCache`/`setApiKeyCache` names. Since the test contract takes precedence (Wave 0 is the SPEC), I named the singleton accessor `getSharedApiKeyCache`/`setSharedApiKeyCache` to match.
- **Fix:** Used the test-contract name (`getSharedApiKeyCache`) throughout — added to `cache.ts`, exported from `index.ts` barrel, called from `routes.ts`, and registered from `Livinityd` ctor via `setSharedApiKeyCache(this.apiKeyCache)`.
- **Files modified:** `cache.ts`, `index.ts`, `routes.ts`, `source/index.ts`
- **Verification:** routes.test.ts 7/7 GREEN; cache.test.ts 5/5 GREEN (no regression — pre-existing tests don't exercise the singleton).
- **Committed in:** `f29128a6` (Task 1 commit)

**2. [Rule 1 - Source-string regex match] Procedures originally extracted to `*Proc` constants for readability; T6 regex required them inlined**
- **Found during:** Task 1 (running routes.test.ts after first draft)
- **Issue:** First draft extracted procedures to `const createProc = privateProcedure...mutation(...)`, then bound `router({create: createProc, ..., listAll: listAllProc})`. T6's regex `/listAll:\s*adminProcedure/` failed because the source said `listAll: listAllProc` instead.
- **Fix:** Rewrote routes.ts to inline all four procedures into the `router({create: privateProcedure.input(...).mutation(...), ...})` literal. Documented the convention in routes.ts header comment so future maintainers don't refactor it back.
- **Files modified:** `routes.ts` (full rewrite of router export section)
- **Verification:** routes.test.ts 7/7 GREEN (T6 now matches the inlined `listAll: adminProcedure.input(...).query(...)`).
- **Committed in:** `f29128a6` (Task 1 commit)

**3. [Rule 1 - TypeScript strictness] `ctx.logger.error?.(...)` failed typecheck because `ctx.logger` itself is optional in the `Context` Merge type**
- **Found during:** Task 2 (running `npx tsc --noEmit` after wiring everything)
- **Issue:** `Context` is `Merge<ContextWss, ContextExpress>` and `logger` is optional in the merged type even though both branches supply it at runtime. `ctx.logger.error?.(...)` errored TS18048.
- **Fix:** Replaced with `const log = ctx.logger ?? console; log.error(...)` — one-line fallback preserves runtime behavior and eliminates the only new TS error from this plan.
- **Files modified:** `routes.ts` (~5 LOC inside the cache.invalidate try/catch)
- **Verification:** `npx tsc --noEmit | grep api-keys` returns nothing; routes.test.ts 7/7 still GREEN.
- **Committed in:** `c3091d1f` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 test-contract naming, 1 source-string regex shape, 1 TS strictness)
**Impact on plan:** None on contract or behavior. Naming choice (deviation 1) follows the test (which is the SPEC). Inlining choice (deviation 2) is required for the defense-in-depth check to actually defend. TS fix (deviation 3) is a one-liner with zero runtime change.

## Issues Encountered

None during planned work. All three deviations were anticipated by the test contract (Wave 0 RED tests) — they surfaced naturally on the first GREEN attempt and were repaired with surgical edits.

## Sacred File SHA

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches Phase 56 lock decision D-30-07. UNCHANGED across both Task 1 and Task 2 commits.

## D-NO-NEW-DEPS Audit

No `package.json` or `pnpm-lock.yaml` modifications. Production code uses only:

- `node:crypto` (built-in — `randomUUID`)
- `node:fs` (built-in — `promises`)
- `node:path` (built-in)
- `pg` (already a dep — used via `getPool()`)
- `@trpc/server` (already a dep — `TRPCError`, procedure builders)
- `zod` (already a dep — input validation)

GREEN.

## User Setup Required

None — no external service configuration required. The audit log path (`/opt/livos/data/security-events/`) is auto-created by `recordApiKeyEvent` via `fs.mkdir({recursive: true})`.

## Next Phase Readiness

Wave 4 (Plan 59-05: E2E integration test + phase gate) can now consume:

- **`apiKeysRouter`** mounted on `appRouter` at `apiKeys.*` — UI / CLI clients can mint, list, revoke keys via tRPC.
- **`recordApiKeyEvent`** called fire-and-forget on every successful create/revoke — audit trail visible via the existing `audit.listDeviceEvents` query (filter `device_id='api-keys-system'`).
- **`getSharedApiKeyCache().invalidate(keyHash)`** — synchronous propagation guaranteed.
- **`httpOnlyPaths` includes all 4 entries** — UI mutations route through HTTP and survive `systemctl restart livos`.

Wave 4 still needs to:

- Write end-to-end integration test that mints a key, makes a Bearer-authenticated broker request, revokes, makes another Bearer request, and asserts the second one returns the Anthropic-spec 401 envelope WITHIN the 100ms target (T-59-21 round-trip verification).
- Run the full `api-keys/` suite + Wave 4's new integration test as a single phase-gate verification.
- Update STATE.md / ROADMAP.md to mark Phase 59 complete.

---

## Self-Check: PASSED

- [x] `events.ts` exists at `livos/packages/livinityd/source/modules/api-keys/events.ts` (100 LOC)
- [x] `routes.ts` exists at `livos/packages/livinityd/source/modules/api-keys/routes.ts` (230 LOC)
- [x] `routes.test.ts` 7/7 GREEN
- [x] Wave 0+1+2 regression: api-keys/ 30/30 GREEN (schema 4 + database 5 + cache 5 + bearer-auth 8 + mount-order 1 + routes 7)
- [x] `common.test.ts` 12/12 GREEN (Tests 11+12 added for Phase 59 entries)
- [x] `apiKeys` namespace mounted in `server/trpc/index.ts` (line 66 region)
- [x] 4 new entries in `httpOnlyPaths` (verified by grep `^\s*'apiKeys\.`)
- [x] `function computeParamsDigest` returns 0 in `events.ts` (REUSE invariant preserved)
- [x] `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` (UNCHANGED)
- [x] `git log --oneline | grep '59-04'` returns Task 1 (`f29128a6`) + Task 2 (`c3091d1f`)
- [x] No new npm dependencies added

---
*Phase: 59-bearer-token-auth*
*Completed: 2026-05-02*
