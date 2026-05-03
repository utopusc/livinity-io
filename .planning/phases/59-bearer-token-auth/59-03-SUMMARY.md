---
phase: 59-bearer-token-auth
plan: 03
subsystem: auth

tags: [bearer-auth, middleware, cache, express, sha-256, debouncer]

requires:
  - phase: 59-bearer-token-auth-02
    provides: api_keys PG CRUD (createApiKey, findApiKeyByHash, hashKey, revokeApiKey, listApiKeysForUser)
provides:
  - ApiKeyCache (60s positive / 5s negative TTL, invalidate hook, last_used_at debouncer)
  - createBearerMiddleware (Express handler — Anthropic-spec 401 envelope, defense-in-depth crypto.timingSafeEqual)
  - mountBearerAuthMiddleware on /u/:userId/v1 (between usage capture and broker handler)
  - cli.ts cleanShutdown dispose hook so pending last_used_at writes survive SIGTERM/SIGINT
affects: [59-04 trpc-routes, 59-05 audit-events, 60 public-endpoint, 62 settings-ui]

tech-stack:
  added: []
  patterns:
    - "Hot-path middleware cache: in-process Map with TTL + lazy expiry (no proactive sweep), reservation-pattern coalescing for write debouncing"
    - "Anthropic-spec error envelope: {type:'error',error:{type:'authentication_error',message:'API key invalid'}} — uniform across revoked / unknown so SDK clients surface a clean message"
    - "Express middleware module augmentation via declare global namespace Express"

key-files:
  created:
    - livos/packages/livinityd/source/modules/api-keys/cache.ts
    - livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts
  modified:
    - livos/packages/livinityd/source/modules/api-keys/index.ts (re-exports cache + middleware)
    - livos/packages/livinityd/source/modules/server/index.ts (mount call between line 1229 and 1245)
    - livos/packages/livinityd/source/index.ts (apiKeyCache field on Livinityd; dispose in stop())
    - livos/packages/livinityd/source/cli.ts (dispose hook in cleanShutdown)
    - livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts (vi.mock node:crypto so spy works)

key-decisions:
  - "Reservation pattern for last_used_at debouncing: lastFlushedAt set BEFORE await pool.query so concurrent flushes (background 30s + explicit dispose) coalesce to one write per key per minute"
  - "ApiKeyCache constructed in Livinityd ctor (not start()) — getPool() resolved lazily inside flushLastUsed so the cache field is always-defined for the bearer middleware"
  - "MinimalLogger.warn made optional with verbose/error fallback (emitWarn helper) so the native Livinityd logger (no .warn) wires cleanly"
  - "vi.mock('node:crypto', ...) added to bearer-auth.test.ts to make the namespace spy-able (Node ESM namespace exports are non-configurable per spec; minimal change to let T8 actually test what it claims)"

patterns-established:
  - "Pattern: in-process auth cache with synchronous invalidate() hook for Wave 3 revoke route — preserves immediate-revocation property without 60s TTL lag"
  - "Pattern: Bearer middleware fall-through (no header / non-liv_sk_ → next() without setting req.userId) keeps legacy URL-path resolver working in parallel during the transition"

requirements-completed:
  - FR-BROKER-B1-03

duration: ~25 min
completed: 2026-05-02
---

# Phase 59 Plan 03: Bearer Auth Middleware + Cache Summary

**In-memory ApiKeyCache (60s/5s TTL, invalidate, last_used_at debouncer) + Bearer middleware mounted between usage-capture and broker handler with Anthropic-spec 401 envelope and crypto.timingSafeEqual defense-in-depth.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-02T20:25:00Z (approx)
- **Completed:** 2026-05-02T20:38:00Z (approx)
- **Tasks:** 2 (both completed)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **ApiKeyCache (cache.ts, 247 LOC):** Map-based positive (60s) / negative (5s) TTL cache with lazy expiry, synchronous `invalidate(keyHash)` hook for Wave 3's revoke mutator, and a 30s background last_used_at flusher disposed on graceful shutdown.
- **Bearer middleware (bearer-auth.ts, 184 LOC):** Express handler that parses `Authorization: Bearer liv_sk_*`, hashes via SHA-256, queries cache → PG, sets `req.userId/authMethod/apiKeyId` on success, returns 401 Anthropic-shape on invalid/revoked, falls through cleanly on missing/non-Bearer headers.
- **Mount slot (server/index.ts:1239):** Inserted `mountBearerAuthMiddleware` between `mountUsageCaptureMiddleware` (1229) and `mountBrokerRoutes` (1245); ordering asserted by mount-order.test.ts.
- **Lifecycle wiring:** `apiKeyCache` field constructed in `Livinityd` ctor; disposed in both `stop()` (graceful) and `cli.ts cleanShutdown` (SIGTERM/SIGINT) so pending writes survive process exit.

## Task Commits

1. **Task 1: ApiKeyCache + 30s flusher + dispose** — `3108da7c` (feat)
2. **Task 2: Bearer middleware + mount + dispose hook** — `c26d45fe` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/api-keys/cache.ts` (NEW, 247 LOC) — `ApiKeyCache` class + `createApiKeyCache` factory
- `livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts` (NEW, 184 LOC) — `createBearerMiddleware` + `mountBearerAuthMiddleware`
- `livos/packages/livinityd/source/modules/api-keys/index.ts` — added barrel exports for cache + middleware
- `livos/packages/livinityd/source/modules/server/index.ts` — import + mount call between line 1229 and 1245 (one new mount line)
- `livos/packages/livinityd/source/index.ts` — `apiKeyCache: ApiKeyCache` field, ctor instantiation, dispose in `stop()`
- `livos/packages/livinityd/source/cli.ts` — `livinityd.apiKeyCache?.dispose().catch(() => {})` before `process.exit(0)`
- `livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts` — `vi.mock('node:crypto', ...)` shim so T8's `vi.spyOn` can install (Wave 0 test infrastructure repair)

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `cache.test.ts` (Wave 0) | 5 | 5/5 GREEN |
| `bearer-auth.test.ts` (Wave 0) | 8 | 8/8 GREEN |
| `mount-order.test.ts` (Wave 0) | 1 | 1/1 GREEN |
| `database.test.ts` (Wave 1) | 5 | 5/5 GREEN — no regression |
| `schema-migration.test.ts` (Wave 1) | 4 | 4/4 GREEN — no regression |
| **TOTAL api-keys** | **23** | **23/23 GREEN** |

`pnpm/npx tsc --noEmit`: 427 errors before, 427 after (all pre-existing in unrelated files: user/, widgets/, file-store.ts). Zero new errors in cache.ts / bearer-auth.ts / index.ts / cli.ts / server/index.ts mount slot.

## Mount-Order Evidence

```
$ grep -n "mountUsageCaptureMiddleware\|mountBearerAuthMiddleware\|mountBrokerRoutes" \
       livos/packages/livinityd/source/modules/server/index.ts
46:import {mountBrokerRoutes} from '../livinity-broker/index.js'
47:import {mountUsageCaptureMiddleware} from '../usage-tracking/index.js'
48:import {mountBearerAuthMiddleware} from '../api-keys/bearer-auth.js'
1229:		mountUsageCaptureMiddleware(this.app, this.livinityd)
1239:		mountBearerAuthMiddleware(this.app, this.livinityd, this.livinityd.apiKeyCache)
1245:		mountBrokerRoutes(this.app, this.livinityd)
```

Strict ordering at runtime: usage capture → bearer → broker. Asserted by `mount-order.test.ts` T1 (positional check on the source string).

## Anthropic 401 Envelope

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "API key invalid"
  }
}
```

Sent on: cache HIT negative, cache MISS + PG null (unknown), cache MISS + PG null (revoked — indistinguishable per CONTEXT.md spec), and PG-throw fail-closed (T-59-15). Status 401, `Content-Type: application/json`. Identical to the existing `livinity-broker/auth.ts` shape (lines 62-67) so SDK clients see one error format.

## cli.ts Dispose Hook

```diff
 function cleanShutdown(signal: string) {
 	if (isShuttingDown) return
 	isShuttingDown = true
 	livinityd.logger.log(`Received ${signal}, exiting immediately to release port`)
+	// Phase 59 — flush pending api_keys.last_used_at writes before exit so
+	// audit-visible "last seen" timestamps don't get lost on SIGTERM/SIGINT
+	// (RESEARCH.md Pitfall 2). Best-effort: if dispose throws or the process
+	// is killed by PM2 before it resolves, we still exit — never block here.
+	livinityd.apiKeyCache?.dispose().catch(() => {})
 	process.exit(0)
 }
```

Best-effort: `.catch(() => {})` so a dispose failure NEVER blocks `process.exit(0)`. Optional chaining `?.` covers the test/early-error path where livinityd might not yet be constructed.

## Cache TTL Implementation Evidence

```
const POSITIVE_TTL_MS = 60_000 // 60s — see CONTEXT.md last_used_at debounce window
const NEGATIVE_TTL_MS = 5_000 //  5s — caps brute-force PG QPS
const FLUSH_INTERVAL_MS = 30_000 // 30s background last_used_at flusher
```

Verified by `cache.test.ts` T1 (60s positive expiry boundary) and T2 (5s negative expiry boundary).

## Decisions Made

1. **Reservation pattern in `flushLastUsed`** — `lastFlushedAt.set(keyHash, now)` happens BEFORE `await pool.query`, not after. Closes the race where the 30s background flusher and an explicit dispose flush overlap and would otherwise both write the same key. Required for T5 to be GREEN; matches the "≤1 PG write/min/key" debounce contract from CONTEXT.md.
2. **Cache constructed in `Livinityd` ctor (not `start()`)** — keeps the field always-defined so the bearer middleware mount call on the constructed Server doesn't need null checks. Construction is side-effect-free; the 30s `setInterval` is `.unref()`ed and uses lazy `getPool()` so it no-ops until DB is ready.
3. **`MinimalLogger.warn` optional** — added `verbose`/`error` fallback via `emitWarn()` because the native `Livinityd` logger exposes `log`/`verbose`/`error` but not `warn`. Avoids forcing an upstream logger refactor for one cache.
4. **`vi.mock('node:crypto', ...)` shim in bearer-auth.test.ts** — minimal repair to let T8's `vi.spyOn(crypto, 'timingSafeEqual')` actually install. Documented as Rule 1 deviation below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Wave 0 bearer-auth.test.ts T8 spy could not install on Node ESM namespace export**
- **Found during:** Task 2 (running bearer-auth.test.ts after writing the middleware)
- **Issue:** `vi.spyOn(crypto, 'timingSafeEqual')` threw `TypeError: Cannot redefine property: timingSafeEqual`. Root cause: `import * as crypto from 'node:crypto'` returns a frozen ESM namespace object whose properties are non-configurable per spec, so `Object.defineProperty` (used internally by `vi.spyOn`) fails. This is a known vitest+ESM limitation on Node built-ins (Node 24).
- **Fix:** Added a top-of-file `vi.mock('node:crypto', async () => { const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto'); return {...actual, default: actual} })` shim. Returns a plain JS object whose properties ARE configurable, while delegating every method (createHash, timingSafeEqual, etc.) to the real implementation. Also switched the production `bearer-auth.ts` import to namespace shape (`import * as crypto from 'node:crypto'`) so the spy intercepts THIS module's call sites.
- **Files modified:** `livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts`, `livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts`
- **Verification:** T8 GREEN; all 7 prior tests still GREEN; no behavior change to module contract.
- **Committed in:** `c26d45fe` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (test infrastructure bug — not a contract change)
**Impact on plan:** None — middleware behavior matches the plan exactly. Test repair was the minimum surgical change to let T8 actually test what it claims (defense-in-depth `crypto.timingSafeEqual` invocation).

## Issues Encountered

None during planned work. The T8 issue was a Wave 0 contract authoring bug, handled via Rule 1 inline.

## Sacred File SHA

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches Phase 56 lock decision D-30-07. UNCHANGED across both Task 1 and Task 2 commits.

## D-NO-NEW-DEPS Audit

No `package.json` or `pnpm-lock.yaml` modifications. Production code uses only:
- `node:buffer` (built-in)
- `node:crypto` (built-in)
- `pg` (already a dep — used via `getPool()`)
- `express` (already a dep — type-only import)

GREEN.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Wave 3 (Plan 59-04: tRPC routes + audit hook) can now consume:
- `livinityd.apiKeyCache.invalidate(keyHash)` — to call from `apiKeys.revoke` mutator so revocation propagates IMMEDIATELY rather than waiting for the 60s positive TTL.
- `req.userId / req.authMethod / req.apiKeyId` — already augmented on `Express.Request` so any downstream handler in the broker chain can read identity from the Bearer middleware.
- `findApiKeyByHash`, `createApiKey`, `revokeApiKey`, `listApiKeysForUser`, `listAllApiKeys` — all exported from the api-keys barrel for the tRPC router.

Wave 3 still needs to:
- Add `apiKeysRouter` (create / list / revoke / listAll) under `apiKeys` namespace in tRPC `_app.ts`
- Add `apiKeys.create`, `apiKeys.revoke`, `apiKeys.list`, `apiKeys.listAll` to `httpOnlyPaths` in `trpc/common.ts`
- Wire the audit hook (device_audit_log, `device_id='api-keys-system'`) on create/revoke (RESEARCH.md Specific Idea — REUSE Phase 46 pattern)
- Make `routes.test.ts` GREEN (currently RED — Wave 3's Wave 0 tests)

---

## Self-Check: PASSED

- [x] cache.ts exists at `livos/packages/livinityd/source/modules/api-keys/cache.ts` (247 LOC)
- [x] bearer-auth.ts exists at `livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts` (184 LOC)
- [x] cache.test.ts 5/5 GREEN
- [x] bearer-auth.test.ts 8/8 GREEN
- [x] mount-order.test.ts 1/1 GREEN
- [x] Wave 1 regression: schema 4/4 + database 5/5 GREEN
- [x] mount call inserted in server/index.ts between line 1229 and 1245
- [x] cli.ts cleanShutdown calls `livinityd.apiKeyCache?.dispose()` before `process.exit(0)`
- [x] `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` (UNCHANGED)
- [x] `git log --oneline | grep '59-03'` returns Task 1 (`3108da7c`) + Task 2 (`c26d45fe`)
- [x] No new npm dependencies added

---
*Phase: 59-bearer-token-auth*
*Completed: 2026-05-02*
