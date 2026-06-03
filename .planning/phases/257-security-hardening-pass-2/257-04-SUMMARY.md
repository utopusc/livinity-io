---
phase: 257-security-hardening-pass-2
plan: 04
subsystem: livinityd-auth
tags: [security, auth, jwt, sessions, file-isolation, cookie-scope, LIVOS-005, LIVOS-006, LIVOS-023, LIVOS-028]
requires:
  - 256-04 is-authenticated.ts fail-closed (legacySingleUser / service-token / inactive-throw)
provides:
  - wired sessions table (jti revocation) on password-change / deactivation / deletion
  - fail-closed per-user file scoping for legacy/proxy tokens in multi-user mode
  - host-only LIVINITY_SESSION cookie (set path) + wide-domain logout flush
  - aud/iss-bound session+proxy JWTs with a warm-migrated separate proxy secret
affects:
  - livos/packages/livinityd/source/modules/jwt.ts
  - livos/packages/livinityd/source/modules/database/sessions.ts
  - livos/packages/livinityd/source/modules/database/schema.sql
  - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts
  - livos/packages/livinityd/source/modules/user/routes.ts
  - livos/packages/livinityd/source/modules/files/files.ts
tech-stack:
  added: []
  patterns:
    - jti-keyed session revocation (sessions table, DB-guarded, jti-present-guarded)
    - lazy-rekey warm migration (new proxy secret first, legacy session-secret fallback)
    - derived independent secret via sha256(sessionSecret + domain-tag) — no new secret file
    - fail-closed default scope in multi-user mode (empty Map for unidentified caller)
key-files:
  created:
    - livos/packages/livinityd/source/modules/database/sessions.ts
    - livos/packages/livinityd/source/modules/database/sessions.test.ts
    - livos/packages/livinityd/source/modules/jwt.test.ts
    - livos/packages/livinityd/source/modules/files/files.test.ts
  modified:
    - livos/packages/livinityd/source/modules/jwt.ts
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts
    - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.test.ts
    - livos/packages/livinityd/source/modules/user/routes.ts
    - livos/packages/livinityd/source/modules/files/files.ts
decisions:
  - "Derived proxy secret (sha256(sessionSecret+tag)) over a new secrets file — keeps WS-A file-isolated from WS-C's deploy-livinityd.sh (one-writer) while making proxy/session tokens non-interchangeable. 028 is Low; non-interchangeability is the goal, not separate storage."
  - "server/index.ts NOT edited (WS-C owns it) — server wrappers keep passing getJwtSecret(); jwt.ts derives the proxy secret internally and login recovers the jti via the existing verifyToken wrapper. signUserToken keeps returning a string so renewToken + the server wrapper are untouched."
  - "verify() enforces aud/iss only when PRESENT (warm migration) so outstanding pre-257-04 session tokens don't force a re-login; a WRONG aud/iss is still rejected. New tokens always carry the claims."
  - "getActiveBaseDirectories caches a redis-backed multiUserMode flag (30s unref'd poller) rather than reading redis per call, because it is a synchronous hot-path invoked on every file op."
metrics:
  duration: ~75min
  completed: 2026-06-03
---

# Phase 257 Plan 04: WS-A Session & Token Lifecycle Summary

JWT revocation via the wired `sessions` table (jti), fail-closed per-user file scoping for legacy/proxy tokens, a host-only `LIVINITY_SESSION` cookie, and aud/iss-bound session+proxy JWTs with a warm-migrated separate proxy secret — all preserving the 256-04 fail-closed/service-token/legacy-single-user paths and outstanding live proxy/PTY cookies.

## Findings — still-exists re-verification (all CONFIRMED OPEN before fix)

| Finding | Re-verified at | Status before fix |
|---------|----------------|-------------------|
| LIVOS-005 | `jwt.ts` signed user tokens with no jti; `sessions` table (schema.sql:16-26) never INSERTed/SELECTed; `is-authenticated.ts:71` did signature+exp only; `user/routes.ts` changePassword/toggleUserActive/deleteUser issued no revocation | OPEN — confirmed |
| LIVOS-006 | `files/files.ts:178-184` `getActiveBaseDirectories` returned `this.baseDirectories` (global admin tree) when `userInfo` was absent — unconditionally, regardless of multi-user mode | OPEN — confirmed |
| LIVOS-023 | `user/routes.ts:54-58` `sessionCookieDomain` widened to `.livinity.io`; applied to the LIVINITY_SESSION SET path at :208-213; proxy cookie already host-only; logout clear carried the wide domain | OPEN — confirmed (only the SESSION-set path widened) |
| LIVOS-028 | `jwt.ts:41-108` — all token types shared one secret, no aud/iss; proxy token a ~week-long cookie verified in pty ws-handler | OPEN — confirmed |

## What changed

### Task 1 — sessions table jti revocation (LIVOS-005) — commit `86571694`
- `schema.sql`: idempotent `DO $$ ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jti TEXT $$` + partial index `idx_sessions_jti WHERE revoked = FALSE` (matches the Phase 25/62 ALTER idiom; no drop/recreate).
- `database/sessions.ts` (new): `createSession` / `revokeSessionsForUser` / `isSessionActive`. Resolves `getPool()` internally but accepts an injectable query-runner so the unit test runs offline. Stores the jti as both `token_hash` (legacy NOT NULL UNIQUE) and `jti`.
- `jwt.ts`: `signUserToken` embeds `jti: crypto.randomUUID()`; `verify` returns `payload.jti`. Token return type unchanged (`string`) so the server wrapper + `renewToken` are untouched.
- `is-authenticated.ts`: jti revocation gate inside the `payload.userId` branch — `if (payload.jti && getPool()) { if (!await isSessionActive(payload.jti)) throw UNAUTHORIZED }`. A no-jti legacy token and the no-DB single-user path SKIP the check; every 256-04 line (inactive-throw, legacySingleUser, service-token fix-E, TRPCError rethrow) preserved.
- `user/routes.ts`: login records a session row (DB + jti only); changePassword / toggleUserActive(false) / deleteUser call `revokeSessionsForUser`. All session writes are no-ops when `getPool()` is null.

### Task 2 — fail-closed per-user file scoping (LIVOS-006) — commit `ca0d0eb5`
- `files.ts`: `getActiveBaseDirectories(userInfo?, opts?)` now FAILS CLOSED. In multi-user mode an absent `userInfo` (proxy/legacy token, no resolved identity) returns an **empty** `Map` instead of the global admin tree. Admin → global tree, member/guest → `users/<username>` subtree (both unchanged). Single-user (legacy) mode keeps the global-tree fallback (no regression).
- Cached `multiUserMode` flag from `livos:system:multi_user`, refreshed by a 30s unref'd poller; `userInfo`/`multiUser` overridable for unit tests. The signature gained optional params with defaults — all existing no-arg callers are unaffected.

### Task 3 — host-only SESSION cookie + aud/iss + warm-migrated dual proxy secret (LIVOS-023/028) — commit `667f1722`
- `user/routes.ts` (LIVOS-023): LIVINITY_SESSION SET path is host-only (dropped the `.livinity.io` domain). Removed the dead `sessionCookieDomain()` helper. **Logout clearCookie KEEPS the wide `.${dc.domain}`** so an already-logged-in browser can flush a previously-widened stale session cookie. Proxy cookie left untouched (already host-only).
- `jwt.ts` (LIVOS-028): session + proxy tokens carry aud (`livinityd` / `livinityd-proxy`) + iss (`livinityd`). `verify` rejects a wrong aud/iss but accepts a legacy no-aud token (warm migration). Proxy tokens signed with a **separate** secret derived via `sha256(sessionSecret + ':livinity-proxy-v1')`. `verifyProxyToken` **warm-migrates**: new proxy secret + proxy aud first, then falls back to the legacy session-secret/no-aud shape so outstanding ~week-long proxy cookies + live PTY sessions keep verifying.

## Tests
- `sessions.test.ts` — 4 cases (revoke round-trip, persist, expired-not-active, no-DB no-op).
- `is-authenticated.test.ts` — 20 cases total: 5 new WS-A (revoked jti → UNAUTHORIZED, active jti passes, no-jti legacy skip, no-DB skip, service-token skip) + all 256-04 WS-D + F5 service-token regression cases preserved.
- `files.test.ts` — 5 cases (empty/admin/member scopes, single-user fallback, instance-flag fallback).
- `jwt.test.ts` — 6 cases (aud/iss accept+reject, legacy no-aud accept, proxy secret separation, cross-type rejection, warm-migration legacy proxy verify, legacy sign() round-trip).
- **35/35 WS-A cases green.** Broader `server` + `user` module run: 128 tests pass (the 2 file-level failures are pre-existing/environmental — `drivelist.node` native-binding load on Windows + an empty `common.test.ts` placeholder — unrelated to WS-A).

## Regression confirmation — legacy / service-token / PTY-cookie paths NOT regressed
- **Legacy single-user (no DB):** `getPool()` null → jti check skipped (is-authenticated WS-A.T6); session writes no-op; `verify` accepts no-aud legacy session tokens (jwt T1b); `getActiveBaseDirectories` single-user mode keeps the global tree (files T4). 256-04 legacySingleUser flag untouched.
- **Service-token (X-Api-Key):** resolves no user JWT → no jti → never hits the revocation lookup (is-authenticated WS-A.T7); fix-E no-DB legacySingleUser path preserved (256-04 WS-D.T6 still green).
- **PTY / proxy cookie warm migration:** `verifyProxyToken` accepts the exact pre-257-04 proxy token shape (`{proxyToken:true}` signed with the session secret, no aud) via the legacy fallback (jwt T4) — outstanding ~week-long cookies + live PTY/terminal sessions do NOT 4403, no forced re-login. New proxy tokens use the derived secret + proxy aud (jwt T2). Cross-type rejection preserved (jwt T3).

## Deviations from Plan

**1. [Rule 3 - one-writer constraint] Derived proxy secret instead of generate-and-persist file.**
The plan offered two proxy-secret options. `getProxyJwtSecret()` reading a new `data/secrets/jwt-proxy` file would require editing the secret-reader in `server/index.ts` (owned by WS-C — one-writer-per-file). Chose the plan's explicit fallback: derive an independent 64-hex proxy secret via `sha256(sessionSecret + tag)` entirely inside `jwt.ts`. No server/index.ts edit, no installer edit — fully file-isolated. The verify path retains the legacy session-secret fallback for the grace window as mandated.

**2. [Adaptation] `signUserToken` keeps returning `string` (not `{token, jti}`).**
Returning `{token, jti}` would force a `server/index.ts` wrapper change (out of scope). Instead the jti is generated inside `jwt.signUserToken`, embedded, and login recovers it via the existing `ctx.server.verifyToken(apiToken)` (which now returns `payload.jti`). `renewToken` (`:243`) is untouched.

**3. [Note] `getActiveBaseDirectories` signature gained optional params.**
Added `(userInfo?, opts?)` with defaults to the AsyncLocalStorage store + the cached flag — the plan's Test 1 calls it as `getActiveBaseDirectories(undefined, {multiUser:true})`. All existing no-arg call sites (8 within files.ts) are behaviorally unchanged.

## Pre-existing issues (NOT in scope — logged, not fixed)
- `tsc --noEmit` reports the codebase's existing `ctx.X is possibly undefined` strict-null noise (40 in user/routes.ts + is-authenticated.ts at baseline; +2 from new `ctx.server`/`ctx.logger` lines that match the surrounding pre-existing style exactly). The project runs via `tsx` (no strict-null gate at runtime); no new error *class* introduced. `files.ts` tsc error count unchanged (1 → 1).
- `drivelist.node` native-binding load failure + empty `common.test.ts` — pre-existing Windows/environmental test-file failures, unrelated to WS-A.

## SC-A Status: MET
- LIVOS-005: password-change / deactivation / deletion revoke outstanding JWTs via the wired sessions table; is-authenticated rejects a revoked/expired jti.
- LIVOS-006: a proxy/legacy token cannot reach the admin (or another user's) file tree in multi-user mode — empty scope.
- LIVOS-023: SESSION set path host-only; proxy cookie unchanged; logout still flushes a previously-widened stale cookie.
- LIVOS-028: session+proxy JWTs aud/iss-bound with separate secrets, WARM-MIGRATED — no outstanding proxy cookie / live PTY session breaks, no forced re-login.
- All 256-04 fail-closed + service-token + legacy single-user paths preserved (no regression).

## Deploy note
CODE + TESTS ONLY — NO DEPLOY (Mini PC only; deploy is 257-07). The `schema.sql` ALTER is idempotent and applied on livinityd startup. After deploy, NEW logins/tokens carry jti+aud/iss; the warm-migration fallbacks cover all outstanding cookies until they roll over (ONE_WEEK).

## Self-Check: PASSED
- Created files all FOUND: sessions.ts, sessions.test.ts, jwt.test.ts, files.test.ts.
- Commits all FOUND: 86571694, ca0d0eb5, 667f1722.
- 35/35 WS-A vitest cases green; no file deletions in any commit; no sacred-SHA files touched.
