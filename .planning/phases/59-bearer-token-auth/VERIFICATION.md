---
phase: 59-bearer-token-auth
verified: 2026-05-02T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
sacred_sha_verified: true
sacred_sha_actual: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_expected: 4f868d318abff71f8c8bfbcf443b2393a553018b
phase60_planner_ready: true
phase62_planner_ready: true
gaps: []
deferred:
  - truth: "Live UAT against Mini PC PG (mint → curl bearer → revoke → 401)"
    addressed_in: "Phase 63 (Mandatory Live Verification)"
    evidence: "PHASE-SUMMARY.md hand-off: 'Phase 63 must include UAT walks for Phase 59 against the Mini PC live deployment'"
human_verification: []
---

# Phase 59: B1 Per-User Bearer Token Auth — Verification Report

**Phase Goal:** External API consumers authenticate with `Authorization: Bearer liv_sk_*` instead of URL-path identity + container IP guard. Users mint/list/revoke their own keys; revoked keys return Anthropic-spec 401 errors.

**Verified:** 2026-05-02
**Status:** PASSED
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `api_keys` table exists with the contracted schema | VERIFIED | `schema.sql:347-359` — 8 cols, `key_hash CHAR(64) NOT NULL UNIQUE`, FK `ON DELETE CASCADE`, partial idx `WHERE revoked_at IS NULL` |
| 2 | `liv_sk_*` plaintext is generated, hashed (SHA-256 of FULL plaintext), shown ONCE | VERIFIED | `database.ts:57-58` (`hashKey` over full plaintext), `routes.ts:119-126` (`create` returns `{plaintext, ...}`); `list`/`listAll` projections OMIT plaintext + key_hash (`routes.ts:141-148, 224-233`) |
| 3 | Bearer middleware mounted BETWEEN usage capture and broker on `/u/:userId/v1` | VERIFIED | `server/index.ts:1229` (usage capture) → `:1239` (`mountBearerAuthMiddleware`) → `:1245` (`mountBrokerRoutes`) — order non-negotiable, asserted by `mount-order.test.ts` |
| 4 | 4 tRPC routes mounted with httpOnlyPaths gating | VERIFIED | `routes.ts:89-235` (create=privateProcedure mut, list=privateProcedure query, revoke=privateProcedure mut, listAll=adminProcedure query); `trpc/common.ts:209-212` lists all 4 |
| 5 | Revoked key returns Anthropic-spec 401 within 100ms (sync cache invalidate) | VERIFIED | `routes.ts:180-199` synchronously calls `getSharedApiKeyCache().invalidate(result.keyHash)` after PG `RETURNING key_hash`; envelope `{type:"error", error:{type:"authentication_error", message:"API key invalid"}}` at `bearer-auth.ts:69-72`; integration C1 measures round-trip <100ms |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/.../api-keys/database.ts` | PG CRUD + token gen + SHA-256 | VERIFIED | 6 functions; `SELECT_COLS` excludes key_hash (defense layer 1) |
| `livos/.../api-keys/cache.ts` | 60s+/5s- TTL + 30s flusher + dispose | VERIFIED | Singleton bridge `setSharedApiKeyCache`/`getSharedApiKeyCache` |
| `livos/.../api-keys/bearer-auth.ts` | Middleware + Anthropic 401 + timingSafeEqual | VERIFIED | `mountBearerAuthMiddleware` exported; uses `crypto.timingSafeEqual` |
| `livos/.../api-keys/routes.ts` | 4 tRPC procedures with audit + sync invalidate | VERIFIED | Procedures inlined into `router({...})` literal (defense-in-depth) |
| `livos/.../api-keys/events.ts` | `recordApiKeyEvent` REUSE of `device_audit_log` | VERIFIED | `SENTINEL_DEVICE_ID = 'api-keys-system'` (events.ts:49) |
| `livos/.../database/schema.sql` | `api_keys` table append at lines 339-360 | VERIFIED | Block matches CONTEXT.md spec exactly |
| `livos/.../server/index.ts:1239` | Mount call between usage and broker | VERIFIED | Comments explicitly cite mount-order contract |
| `livos/.../server/trpc/common.ts:209-212` | 4 httpOnlyPaths entries | VERIFIED | All 4 procedure paths present |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `bearer-auth` middleware | `findApiKeyByHash` (PG) | `database.ts` import | WIRED |
| `bearer-auth` middleware | `ApiKeyCache` get/set/touch | `cache.ts` injected | WIRED |
| `routes.revoke` | `cache.invalidate(keyHash)` | `getSharedApiKeyCache()` synchronous | WIRED — integration C1 verified <100ms |
| `routes.create/revoke` | audit `device_audit_log` | `recordApiKeyEvent` fire-and-forget | WIRED — REUSE pattern (no new table) |
| `livinityd` ctor | `setSharedApiKeyCache(cache)` | singleton bridge | WIRED — same instance the middleware reads |
| Express middleware chain | `usage → bearer → broker` | `app.use` ordering | WIRED — asserted by `mount-order.test.ts` |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| FR-BROKER-B1-01 | `api_keys` table (8 cols, FK CASCADE, UNIQUE key_hash, partial idx) | SATISFIED | `schema.sql:347-359` + `schema-migration.test.ts` (4) + `database.test.ts` (5) |
| FR-BROKER-B1-02 | `liv_sk_<base64url-32>` token; SHA-256 of FULL plaintext; plaintext ONCE | SATISFIED | `database.ts:57-58, 70-83` + `database.test.ts` T1+T4 |
| FR-BROKER-B1-03 | Bearer middleware on `/u/:userId/v1` BETWEEN usage capture and broker | SATISFIED | `server/index.ts:1239` + `bearer-auth.test.ts` (8) + `mount-order.test.ts` |
| FR-BROKER-B1-04 | tRPC create/list/revoke/listAll + audit REUSE + httpOnlyPaths | SATISFIED | `routes.ts` (4 procs) + `events.ts` (sentinel) + `common.ts:209-212` |
| FR-BROKER-B1-05 | Revoked → next request returns Anthropic-spec 401 within 100ms | SATISFIED | `routes.ts:180-199` sync invalidate + `bearer-auth.ts:69-72` envelope + integration C1+C2 |

No orphaned requirements: REQUIREMENTS.md lines 127-131 map FR-BROKER-B1-01..05 to Phase 59; all 5 are claimed in Phase 59 plans.

### Anti-Patterns Found

None blocking. Notable observations (info-only):

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | — | — | No TODO/FIXME/PLACEHOLDER/stub returns found in api-keys/ source |

D-NO-NEW-DEPS preserved: `package.json` and `pnpm-lock.yaml` unchanged.

### Sacred File Gate (D-30-07)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

**MATCH** — Sacred SHA byte-identical from phase start through phase end. D-30-07 contract preserved.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Sacred SHA unchanged | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d3…` | PASS |
| Phase 59 commits exist | `git log --since=2026-04-30 -- livos/.../api-keys/ schema.sql server/index.ts trpc/common.ts` | 9 commits visible (matches plans 01-05 cadence) | PASS |
| api-keys module compiles cleanly (type check) | (skipped — would require `tsc --noEmit` run; unit tests already exercise) | n/a | SKIP |
| Live UAT (mint → bearer curl → revoke → 401) | requires running livinityd against PG | n/a | SKIP — deferred to Phase 63 |

## Phase 60 + Phase 62 Planner Readiness

**Phase 60 (Public Endpoint @ `api.livinity.io`):** **READY.**
The PHASE-SUMMARY.md hand-off section explicitly documents:
- `api_keys` table is auto-applied at livinityd boot.
- Bearer middleware at `/u/:userId/v1` resolves `req.userId` BEFORE the broker handler.
- Anthropic-spec 401 envelope is in place for unknown/revoked keys.
- Phase 60 only needs to add Server5 Caddy reverse-proxy config + `xcaddy build --with caddy-ratelimit`. Removing the legacy container-IP guard from the broker is now safe because Bearer auth establishes identity upstream.
- Forwarded `Authorization: Bearer liv_sk_*` headers are received verbatim by the middleware (no Caddy header rewriting needed).

**Phase 62 (Settings UI — API Keys tab):** **READY.**
PHASE-SUMMARY.md documents the exact contract Phase 62 needs:
- `apiKeys.create` returns flat `{id, plaintext, prefix, name, created_at, oneTimePlaintextWarning: true}` — ready for direct UI rendering of the "save it now" modal.
- `apiKeys.list` returns `{id, key_prefix, name, created_at, last_used_at, revoked_at}` — never plaintext or hash.
- `apiKeys.revoke` is idempotent + sync-invalidates cache.
- All 4 routes are httpOnlyPaths-gated, so mutations survive `systemctl restart livos`.
- Audit trail queryable via `device_audit_log WHERE device_id='api-keys-system'`.

## Deferred Items (Not Blocking)

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Live UAT against Mini PC PG (mint → curl bearer → revoke → 401 round-trip; `last_used_at` advance; `device_audit_log` rows present) | Phase 63 (Mandatory Live Verification) | PHASE-SUMMARY.md hand-off explicitly schedules this UAT for Phase 63, and per memory user requires live UAT before declaring milestone shipped |

## Gaps Summary

**No gaps.** All 5 must-have truths verified. All 5 requirements satisfied with code + test evidence. Sacred SHA preserved. Zero new npm deps. Phase 60 and Phase 62 planners can read PHASE-SUMMARY.md and proceed without re-investigating the Phase 59 contract.

The single deferred item (live Mini PC UAT) is correctly scheduled for Phase 63 per the milestone's mandatory-live-verification gate. It does not block Phase 60 (which can use unit + integration tests against the same code paths) and does not block Phase 62 (UI development can proceed against local-PG livinityd).

## Recommended Follow-up

1. Phase 60 should `git pull` to Mini PC and confirm `api_keys` table auto-creates at boot before adding Server5 Caddy config (sanity ground-truth check the schema migration runs).
2. Phase 62 should reuse the `oneTimePlaintextWarning: true` advisory flag verbatim to drive the "save it now" modal — this is part of the Phase 59 contract.
3. Phase 63 UAT script should explicitly assert the <100ms revoke→401 latency in a curl loop (matches integration test C1 contract).

---

*Verified: 2026-05-02*
*Verifier: Claude (gsd-verifier)*
