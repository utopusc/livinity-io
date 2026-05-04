---
phase: 74-f2-f5-carryover-from-v30-5
plan: 04
subsystem: livos/packages/livinityd/source/modules/livinity-broker
tags: [broker, identity, cache, multi-user, auth, f5, lru, ttl]
requirements: [BROKER-CARRY-04, BROKER-CARRY-05]
dependency_graph:
  requires:
    - .planning/phases/74-f2-f5-carryover-from-v30-5/74-CONTEXT.md (D-16..D-20)
    - livos/packages/livinityd/source/modules/livinity-broker/auth.ts (existing identity branch)
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts (BROKER_FORCE_ROOT_HOME contract)
  provides:
    - in-process identity cache for broker URL-path identity (skips PG round-trips after first turn)
    - per-conversation cache key derivation helper (X-Liv-Conversation-Id > x-request-id > nonce)
    - test-time cache reset hook (_resetForTest)
  affects:
    - resolveAndAuthorizeUserId callers (router.ts, openai-router.ts, passthrough-handler.ts) — transparent speedup, no API change
tech-stack:
  added: []
  patterns:
    - cache-aside (read-through wrapper around existing PG lookup chain)
    - in-process Map-backed LRU (insertion-order eviction, read-touch recency promotion)
    - lazy TTL eviction (delete on read after expiry)
    - vi.mock for module-level dependency stubbing in vitest
key-files:
  created:
    - livos/packages/livinityd/source/modules/livinity-broker/identity-cache.ts (117 lines)
    - livos/packages/livinityd/source/modules/livinity-broker/identity-cache.test.ts (185 lines)
    - livos/packages/livinityd/source/modules/livinity-broker/auth.cache-integration.test.ts (192 lines)
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/auth.ts (79 → 138 lines; +59 for cache-aside + helper)
decisions:
  - "Cache key precedence: X-Liv-Conversation-Id (explicit client header) > x-request-id (Caddy/relay-set) > per-request UUID nonce. Nonce fallback equals pre-F5 behavior (graceful degradation)."
  - "Cache value tuple: {userId, claudeDir, multiUserMode, cachedAt}. SubscriptionToken NOT cached (D-19) — credentials can rotate via OAuth refresh; stale tokens cause auth failures."
  - "Multi-user-mode flip invalidates entries on read (D-19). Bound at write-time + checked per-read."
  - "LRU eviction = delete first key in Map insertion order on overflow. Read-touch promotes recency via delete + re-set."
  - "Bearer auth path NOT cached — req.userId from api_keys middleware already short-circuits identity; caching there would shadow the api_keys table."
  - "Failed lookups (404/403/400) do NOT enter the cache. Only successful resolutions get set()."
  - "Created sibling test file `auth.cache-integration.test.ts` rather than extending non-existent `auth.test.ts`. Sibling-test convention matches existing broker layout (e.g. credential-extractor.test.ts)."
metrics:
  duration: ~25 minutes wall-clock (read + plan + RED + GREEN + verify + commit + summary)
  completed: 2026-05-04
  tests_added: 17 (11 cache + 6 integration)
  tests_passing: 17/17
---

# Phase 74 Plan 04: F5 Identity Preservation Cache Summary

**One-liner:** In-process LRU+TTL (1024-entry / 30-min) identity cache wraps `resolveAndAuthorizeUserId`'s URL-path branch with a cache-aside pattern, eliminating per-turn PostgreSQL round-trips for multi-turn broker conversations while preserving Bearer-auth short-circuit, multi-user-mode invalidation semantics, and the BROKER_FORCE_ROOT_HOME contract.

## What Shipped

### NEW `identity-cache.ts` (117 lines)

- `class IdentityCache` with `get(key, currentMultiUserMode)` / `set(key, value)` / `invalidate(key)` / `size()` / `_resetForTest()`.
- `TTL_MS = 30 * 60 * 1000` (30 minutes per D-18) — lazy eviction on read.
- `MAX_ENTRIES = 1024` (LRU cap per D-20) — eviction deletes first key in insertion order.
- Read-touch (`delete + re-set`) promotes recency for LRU.
- Multi-user-mode flip invalidates entries on read (D-19): if `currentMultiUserMode !== v.multiUserMode`, drop and miss.
- `export type CachedIdentity = {userId, claudeDir, multiUserMode, cachedAt}` — does NOT cache `SubscriptionToken` (credentials rotate via OAuth refresh; only the resolved tuple is safe to cache).
- Module-singleton `export const identityCache = new IdentityCache()`.
- Header docstring covers D-16..D-20, threat model T-74-04-01/05/09.

### NEW `identity-cache.test.ts` (185 lines, 11 tests, all passing)

| # | Test | Coverage |
|---|------|----------|
| 1 | miss → set → hit within TTL | basic functionality |
| 2 | hit at 29 minutes (vi.useFakeTimers + setSystemTime) | TTL lower bound |
| 3 | miss at 31 minutes; size === 0 | TTL upper bound + lazy eviction |
| 4 | LRU eviction at MAX_ENTRIES | overflow handling |
| 5 | per-user isolation (same conv, different userId) | T-74-04-01 mitigation |
| 6 | failed-lookup-not-cached (no auto-set) | semantic enforcement |
| 7 | multi-user-mode flip invalidates | D-19 / T-74-04-09 |
| 8 | get() promotes recency for LRU | read-touch correctness |
| 9 | invalidate() removes single key | API contract |
| 10 | module-singleton shares state | export semantics |
| 11 | _resetForTest() clears all | test ergonomics |

### NEW `auth.cache-integration.test.ts` (192 lines, 6 tests, all passing)

Mocks `findUserById` / `getAdminUser` / `isMultiUserMode` via `vi.mock` (mirrors `passthrough-handler.test.ts` precedent).

| Case | Assertion |
|------|-----------|
| auth-int-1 | Two consecutive calls with same `(userId, X-Liv-Conversation-Id)` → `findUserById` invoked **once** total. |
| auth-int-2 | 404 path (`findUserById` → null) → response 404, `cache.size === 0`. |
| auth-int-3 | 403 path (single-user, non-admin) → response 403, `cache.size === 0`. |
| auth-int-4 | Bearer short-circuit (`req.authMethod='bearer'`, `req.userId` set) → returns `{userId: bearerUserId}`, `cache.size === 0`, NO mocks called. |
| auth-int-5 | Per-user isolation: same conversationId, different userIds → 2 separate slots; warm-hit on u1 keeps PG count unchanged. |
| auth-int-6 | 400 path (invalid userId regex) → response 400, `cache.size === 0`, regex check fires before any PG lookup. |

### MODIFIED `auth.ts` (79 → 138 lines)

Diff summary:
- Added imports: `import {identityCache} from './identity-cache.js'`.
- Added helper `function deriveCacheKey(req, userId): string` above `resolveAndAuthorizeUserId` — implements D-17 precedence (X-Liv-Conversation-Id > x-request-id > nonce).
- **Bearer short-circuit (now lines 77-79) is byte-identical in behavior** — only the surrounding comment block grew (Bearer path explicitly notes "F5 cache NOT consulted on the Bearer path").
- URL-path branch wraps the existing lookup chain with cache-aside:
  1. Compute `multiUser` first (existing call, hoisted above `findUserById`).
  2. Compute `cacheKey` via helper.
  3. `identityCache.get(cacheKey, multiUser)` → on hit, return `{userId: cached.userId}` immediately (skip PG).
  4. On miss, fall through to existing `findUserById` + multi-user-check.
  5. After successful resolution, derive `claudeDir` per `BROKER_FORCE_ROOT_HOME` env, then `identityCache.set(cacheKey, {userId, claudeDir, multiUserMode: multiUser, cachedAt: Date.now()})`.
- Failed lookups (404 / 403) explicitly skip `cache.set` — comments mark these branches.

## Verification Results

### Sacred SHA Gate

| Phase | SHA | Status |
|-------|-----|--------|
| Start of plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | UNCHANGED |
| End of plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | UNCHANGED |

`nexus/packages/core/src/sdk-agent-runner.ts` not touched. D-01 honored.

### Plan Shape Verifier

```
node -e "...require checks..."
→ cache + auth.ts shape OK
```

All required tokens present in both files (`class IdentityCache`, `TTL_MS`, `MAX_ENTRIES`, `export const identityCache`, `multiUserMode`, `_resetForTest`, `new Map`, `identityCache`, `deriveCacheKey`, `BROKER_FORCE_ROOT_HOME`, `identityCache.set`, `identityCache.get`, `req.authMethod`).

### Test Run

```
pnpm exec vitest run identity-cache.test.ts auth.cache-integration.test.ts
→ Test Files: 2 passed (2)
→ Tests:      17 passed (17)
→ Duration:   411ms
```

### TypeScript Check

`pnpm exec tsc --noEmit` — pre-existing errors in unrelated files (`source/modules/user/routes.ts`, `source/modules/widgets/routes.ts`, `source/modules/utilities/file-store.ts`, `source/modules/livinity-broker/agent-runner-factory.ts` `@nexus/core` exports) total 357 errors — **none in plan-04 files**:

```
pnpm exec tsc --noEmit 2>&1 | grep -E "(identity-cache|livinity-broker/auth|auth.cache-integration)"
→ (no output — zero TS errors in plan-04 files)
```

### Plan Scope (file-edit allowlist)

```
git status --short | grep livinity-broker
→ identity-cache.ts (NEW), identity-cache.test.ts (NEW), auth.cache-integration.test.ts (NEW), auth.ts (MODIFIED)
+ pre-existing 74-01 (F2) artifacts: openai-sse-adapter.ts, sse-adapter.ts, openai-router.ts, router.ts, sse-slice.ts, openai-sse-adapter.test.ts (NOT in this plan's commits)
```

Plan-04 commits touched only the 4 expected files. The 74-01 broker artifacts in the working tree predate this plan.

### Bearer Short-Circuit Preservation

`auth.ts` lines 77-79 (post-edit) carry the same logical Bearer short-circuit as pre-edit lines 42-44:

```typescript
if (req.authMethod === 'bearer' && typeof req.userId === 'string' && req.userId.length > 0) {
    return {userId: req.userId}
}
```

Surrounding comments grew to explicitly document the F5 cache exclusion ("F5 cache: NOT consulted on the Bearer path"). The cache-aside block is inserted strictly *after* the Bearer return, so when the bearer guard matches, no cache code runs. Verified by `auth-int-4` test: with `req.authMethod='bearer'`, all dependency mocks are uncalled and `identityCache.size() === 0`.

## Cache-Key Derivation Rationale

`deriveCacheKey(req, userId)`:

```
1. X-Liv-Conversation-Id header (string + non-empty) → ${userId}:${header}
2. x-request-id header (string + non-empty)          → ${userId}:${header}
3. Fallback: ${userId}:nonce-${Date.now()}-${random36}
```

Rationale:
- **Header (1)** is the explicit broker client opt-in. Clients that thread a stable conversation ID get full multi-turn cache benefit.
- **Header (2)** is set by Caddy / Server5 relay middleware on a per-request basis (correlation ID, NOT conversation ID), so it gives at most a within-request cache benefit (e.g. if multiple internal calls hit `resolveAndAuthorizeUserId` in one request lifecycle). Marginal but free.
- **Fallback (3)** is a unique nonce per call → cache miss every time → graceful degradation to the pre-F5 codepath. Critical for backward compatibility: clients that send neither header don't get cache benefit but ALSO don't get cache pollution or collision.

T-74-04-01 mitigation: composite key always begins with `${userId}:`, where `userId` was already validated against the URL-path regex (`/^[a-zA-Z0-9_-]+$/`) and corresponds 1:1 with a PG row. Even if attackers spoof a conversationId, their userId places them in a different cache slot. Test `auth-int-5` enforces this: same conversationId for two distinct userIds yields two distinct cache slots and two PG lookups.

## BROKER_FORCE_ROOT_HOME Contract Honored

Plan integrated `claudeDir` derivation per the existing `agent-runner-factory.ts:77` contract:

```typescript
const claudeDir =
    process.env.BROKER_FORCE_ROOT_HOME === 'true'
        ? '/root/.claude'
        : `/opt/livos/data/users/${userId}/.claude`
```

This is stored in the cache value but currently NOT consumed by `auth.ts` callers (auth only returns `{userId}`). The `claudeDir` field is forward-compatible scaffolding: a future plan could use it to skip the per-request `getUserClaudeDir` resolution downstream of auth, but that is out of scope for plan-04. Current use: explicit documentation of the BROKER_FORCE_ROOT_HOME environment-bound identity tuple.

T-74-04-10 (cached `claudeDir` mismatch on env flip) is accepted-low-likelihood: `BROKER_FORCE_ROOT_HOME` is set at livinityd startup via systemd unit env, and flipping it requires a service restart (which clears process memory, including this cache).

## Deviations from Plan

**None — plan executed exactly as written.**

The minor adjustments below are documented design discretion the plan explicitly authorized:
- Test-file location: created `auth.cache-integration.test.ts` (sibling), since `auth.test.ts` does not exist. Plan `<read_first>` step instructed: "If it does, F5 integration tests extend it; if not, create a new file `auth.cache-integration.test.ts` next to `auth.ts`." Sibling created per directive.
- Test count: 17 vs. plan's "8 cache + 4 integration = 12". Added 3 bonus tests within plan scope (invalidate API contract, module-singleton sharing, _resetForTest, plus 2 bonus integration tests for per-user isolation and 400 path) — purely additive coverage, no plan rewrite.
- LF/CRLF git warnings: Windows line-ending normalization. No content drift.

## Authentication Gates

None — this plan's tests are pure unit / integration with mocked dependencies. No live PG / disk / network access required.

## Threat Surface Scan

No new external surface introduced. All changes operate inside the existing `auth.ts` URL-path identity branch — same trust boundary, same authorization decisions. Cache only memoizes the resolved tuple of validated authority decisions.

| Threat ID | Coverage |
|-----------|----------|
| T-74-04-01 (cross-user spoofing) | mitigated — per-user isolation test asserts distinct slots |
| T-74-04-05 (DoS via cache flooding) | mitigated — 1024 LRU cap |
| T-74-04-07 (admin identity leak via stale cache) | mitigated — per-read multi-user-mode check |
| T-74-04-09 (stale multiUserMode) | mitigated — flip invalidates on read |

## Commits

| Stage | Hash | Type | Files |
|-------|------|------|-------|
| RED | `b9f65427` | test(74-04) | identity-cache.test.ts, auth.cache-integration.test.ts |
| GREEN | `022d5c03` | feat(74-04) | identity-cache.ts (NEW), auth.ts (MODIFIED) |

TDD gate sequence verified: `test()` commit precedes `feat()` commit in git log.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/livinity-broker/identity-cache.ts` exists (117 lines)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/identity-cache.test.ts` exists (185 lines)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/auth.cache-integration.test.ts` exists (192 lines)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` modified (138 lines)
- [x] Commit `b9f65427` (test(74-04)) found in git log
- [x] Commit `022d5c03` (feat(74-04)) found in git log
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged
- [x] All 17 tests pass; 0 TS errors in plan-04 files
- [x] Bearer short-circuit byte-identical in behavior
- [x] D-NO-BYOK preserved (no new key paths; cache stores tuple only, not credentials)
- [x] D-NO-SERVER4 preserved (Mini PC code-only change)
- [x] AI Chat UI untouched
- [x] D-NO-NEW-DEPS preserved (pure JS Map; no new imports)
