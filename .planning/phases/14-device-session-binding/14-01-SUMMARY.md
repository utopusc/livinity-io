---
phase: 14-device-session-binding
plan: 01
subsystem: platform/web auth + platform/relay handshake
tags: [device-session, jwt-binding, session-id-claim, handshake-validation, expiry-watchdog, phase-14]
requirements_completed: [SESS-01, SESS-02]
requirements_partial: false
dependency_graph:
  requires:
    - Phase 11 userId propagation (devices.user_id FK + tunnel event carries userId)
    - Existing sessions table (platform/relay/src/schema.sql, shared with platform/web)
    - Existing device_grants table (platform/web/src/db/migrations/0004_create_devices_tables.sql)
  provides:
    - sessionId claim in every device JWT (approve → grant → token → relay handshake → DeviceConnection)
    - Handshake-time DB cross-check (sessions.id must exist+unexpired, session.user_id must match JWT userId, devices.user_id must match JWT userId)
    - DeviceConnection.tokenExpiresAt field (immutable, sourced from JWT exp * 1000)
    - Token expiry watchdog (60s cadence, close code 4401 "token_expired")
    - SESSION_EXPIRY_CHECK_INTERVAL_MS env-backed config entry
  affects:
    - Plan 14-02 (revocation pub/sub — consumes DeviceConnection.sessionId as the lookup key; DeviceRegistry.getBySessionId() already exists)
    - Phase 16 (admin force-disconnect — will reuse the watchdog iteration pattern with close code 4403)
tech-stack:
  added: []
  patterns:
    - "JWT claim embedding at issuer (platform/web) + validation at consumer (platform/relay)"
    - "Three-way handshake binding: JWT signature + sessions table + devices table"
    - "Periodic watchdog (setInterval + generator iteration) for stateless-token expiry enforcement"
    - "Numbered WebSocket close codes partitioned by cause (1008 policy, 4401 token-aged, 4403 reserved for session-revoked)"
key-files:
  created:
    - platform/web/src/db/migrations/0008_device_grants_session_id.sql
    - .planning/phases/14-device-session-binding/14-01-SUMMARY.md
  modified:
    - platform/web/src/lib/device-auth.ts
    - platform/web/src/app/api/device/approve/route.ts
    - platform/web/src/app/api/device/token/route.ts
    - platform/relay/src/device-auth.ts
    - platform/relay/src/device-registry.ts
    - platform/relay/src/index.ts
    - platform/relay/src/config.ts
decisions:
  - "Use sessions.id UUID (primary key) for the JWT claim, not sessions.token (opaque cookie value). Rationale: JWT is signed but payload is base64-decodable by anyone holding it — we don't want to leak the cookie's session secret. Relay looks up sessions by id (indexed PK), not by token."
  - "device_grants.session_id is nullable with no FK. Rationale: grant lifecycle is INSERT-pending → UPDATE-approved → DELETE-consumed; INSERT happens before user auth so session_id is NULL there. No FK avoids ON DELETE CASCADE coupling between logout and grant cleanup (the 15-min grant expiry already handles orphans)."
  - "60s watchdog cadence (not per-connection setTimeout). Rationale: 24h token lifetime means 60s slack is 0.07% — acceptable. Per-connection timers would leak if a cleanup path was missed. Iteration via allConnections() generator is O(n) at negligible cost for <10^4 devices."
  - "Five distinct 1008 close reasons (session_invalid, session_expired, session_user_mismatch, device_not_found, device_ownership_mismatch). Rationale: log observability during forensics — indistinguishable close reasons would force log-grep on the relay message just before close."
  - "Close code 4401 (not 4403) for token_expired. Rationale: 4401 = 'refresh and reconnect' (401-like), 4403 reserved for Plan 14-02 session_revoked = 'stop reconnecting' (403-like). Client agent can distinguish at the close event."
  - "Removed nanoid() from onDeviceConnect but KEPT in onTunnelConnect. Rationale: tunnel session IDs remain relay-generated (Phase 10 contract unchanged); only the device bridge sessionId semantics changed to be JWT-sourced."
metrics:
  duration_seconds: 237
  tasks_completed: 3
  files_created: 2
  files_modified: 7
  commits: 3
  completed_date: 2026-04-24
---

# Phase 14 Plan 01: Session JWT validation at handshake + expiry watchdog — Summary

**One-liner:** Every DeviceBridge WebSocket is now bound at handshake to the approving user's sessions.id UUID (carried as a required JWT claim + cross-checked against sessions and devices tables), and a 60s server-side watchdog closes any bridge whose token has expired with WS close code 4401 "token_expired".

## What Was Changed

### platform/web — JWT issuer side
**`platform/web/src/db/migrations/0008_device_grants_session_id.sql` (new)** — Adds `session_id UUID` column (nullable) to `device_grants` plus a partial index on non-null values. No FK to sessions(id) — documented trade-off in file header.

**`platform/web/src/lib/device-auth.ts`** — Four coordinated changes:
- `DeviceTokenPayload` interface gains `sessionId: string` field.
- `GrantStatus` interface gains `sessionId?: string` field.
- `getGrantByDeviceCode` SELECT includes `session_id`; maps to `sessionId` in the returned object.
- `approveGrant` signature becomes `(userCode, userId, sessionId)`; UPDATE now sets both `user_id` and `session_id` atomically.
- `signDeviceToken` required no code change — jsonwebtoken serializes the new payload field transparently.

**`platform/web/src/app/api/device/approve/route.ts`** — After `getSession()` succeeds, runs a second query `SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW()` to obtain the session row's UUID, then passes it as the third arg to `approveGrant`.

**`platform/web/src/app/api/device/token/route.ts`** — Rejects any approved grant with `!grant.sessionId` (400 invalid_grant). Embeds `sessionId: grant.sessionId` into the `signDeviceToken` payload.

### platform/relay — JWT consumer side
**`platform/relay/src/device-auth.ts`** — `DeviceTokenPayload` gains required `sessionId: string` claim; `verifyDeviceToken` now returns null for tokens lacking sessionId (in addition to the existing userId/deviceId/deviceName/platform presence checks).

**`platform/relay/src/device-registry.ts`** — `DeviceConnectionOptions` + `DeviceConnection` gain immutable `readonly tokenExpiresAt: number` field (epoch ms from JWT `exp * 1000`). The existing `sessionId` field's semantics change: it now carries the JWT's sessionId claim (the user's sessions.id UUID) rather than a relay-generated nanoid.

**`platform/relay/src/index.ts`** — Two sections modified:
1. `onDeviceConnect` handshake (after the existing JWT verify and deviceId-match check) now:
   - Queries `SELECT id, user_id, expires_at FROM sessions WHERE id = $1` with `tokenPayload.sessionId`. Closes `1008 session_invalid` if missing, `1008 session_expired` if past expires_at, `1008 session_user_mismatch` if session.user_id ≠ tokenPayload.userId.
   - Queries `SELECT user_id FROM devices WHERE device_id = $1 AND revoked = false`. Closes `1008 device_not_found` if missing, `1008 device_ownership_mismatch` if devices.user_id ≠ tokenPayload.userId.
   - Computes `tokenExpiresAt = tokenPayload.exp * 1000` and passes into the `new DeviceConnection({...})` alongside `sessionId: tokenPayload.sessionId`.
   - Removed: `const sessionId = nanoid();` (device-side only — onTunnelConnect is unchanged).
   - Converted the ws.on('message', ...) handler to async (required for await on pool queries).
2. `startSessionExpiryWatchdog` function added before `server.listen`: iterates `deviceRegistry.allConnections()` every `SESSION_EXPIRY_CHECK_INTERVAL_MS`, closes any `connection.tokenExpiresAt <= Date.now()` with `ws.close(4401, 'token_expired')`. The interval handle is stored in `sessionExpiryInterval` and `clearInterval`'d inside `shutdown()`.

**`platform/relay/src/config.ts`** — Adds `SESSION_EXPIRY_CHECK_INTERVAL_MS: envInt('SESSION_EXPIRY_CHECK_INTERVAL_MS', 60_000)`.

## Invariant Grep Audit

| # | Invariant | Command / Result | Status |
|---|-----------|------------------|--------|
| A | Watchdog wired at startup (definition + invocation = 2 references) | `grep -c "startSessionExpiryWatchdog" platform/relay/src/index.ts` → **2** | PASS |
| B | Watchdog iterates allConnections and checks tokenExpiresAt | `awk '/function startSessionExpiryWatchdog/,/^}$/' index.ts \| grep -c "tokenExpiresAt"` → **2** (comparison + log message) | PASS |
| C | Watchdog closes with 4401 token_expired | `grep -q "ws.close(4401, 'token_expired')" index.ts` | PASS |
| D | Watchdog cleared on shutdown | `awk '/function shutdown/,/process.on..SIGINT../' index.ts \| grep -q "clearInterval(sessionExpiryInterval)"` | PASS |
| E | Config has SESSION_EXPIRY_CHECK_INTERVAL_MS with 60_000 default | `grep -q "SESSION_EXPIRY_CHECK_INTERVAL_MS: envInt('SESSION_EXPIRY_CHECK_INTERVAL_MS', 60_000)" config.ts` | PASS |
| F | No residual nanoid() on onDeviceConnect path | `awk '/function onDeviceConnect/,/^}$/' index.ts \| grep -c "nanoid"` → **0** | PASS |
| G | onTunnelConnect still uses nanoid (Phase 10 regression guard) | `awk '/function onTunnelConnect/,/^}$/' index.ts \| grep -c "const sessionId = nanoid();"` → **1** | PASS |
| H | ≥8 Phase 14 SESS markers across modified files | `grep -rn "Phase 14 SESS" platform/relay/src platform/web/src/lib platform/web/src/app/api/device platform/web/src/db/migrations \| wc -l` → **20** | PASS |
| I | TypeScript clean | `cd platform/relay && npx tsc --noEmit` → **exit 0, no output**; `cd platform/web && npx tsc --noEmit \| grep -E "(device-auth\|approve/route\|token/route)\.ts.*error TS"` → **zero matching lines** | PASS |
| J | Watchdog uses `<=` (not `<`) so exactly-at-now also closes | `awk '/function startSessionExpiryWatchdog/,/^}$/' index.ts \| grep -q "connection.tokenExpiresAt <= now"` | PASS |

**All 10 invariants (A–J) PASS.**

## Verification Results

- `cd platform/relay && npx tsc --noEmit` — exit 0, zero output (no type errors).
- `cd platform/web && npx tsc --noEmit` — no new errors in the four touched files (`device-auth.ts`, `approve/route.ts`, `token/route.ts`, migration is SQL not TS).
- Grep audit confirms all required patterns: `ADD COLUMN IF NOT EXISTS session_id UUID` in migration, `sessionId: string` in both DeviceTokenPayload interfaces (web + relay), `!payload.sessionId` guard in relay verifier, `SELECT id, user_id, expires_at FROM sessions WHERE id = $1` and `SELECT user_id FROM devices WHERE device_id = $1 AND revoked = false` in handshake, `tokenPayload.exp * 1000` for tokenExpiresAt, `ws.close(4401, 'token_expired')` in watchdog, `clearInterval(sessionExpiryInterval)` in shutdown.
- DeviceConnection.sessionId now carries the JWT sessionId claim (stable user session UUID); no more relay-generated nanoid for device bridges. DeviceRegistry.getBySessionId() is already in place and will be used by Plan 14-02 for revocation lookups.

## Deviations from Plan

**1. [Rule 3 — Blocking] `ws.on('message', (data) => ...)` had to become `async (data) => ...`**
- **Found during:** Task 2.
- **Issue:** The plan inserts two `await pool.query(...)` calls into the handshake block, but the existing handler is a sync arrow function. Without `async`, the `await` keyword is a compile error.
- **Fix:** Changed the handler signature from `(data) =>` to `async (data) =>`. No other control-flow changes (all paths still `return` after ws.close()).
- **Files modified:** `platform/relay/src/index.ts` (single-word change on the handler signature).
- **Commit:** `d6b66e3` (bundled with the Task 2 handshake changes — this is a prerequisite for the plan's own `await pool.query(...)` inserts).

**2. [Rule 3 — Blocking] Plan comment contained the word "nanoid" which broke invariant F**
- **Found during:** Task 3 invariant audit (F expected 0 nanoid matches inside onDeviceConnect).
- **Issue:** The plan's literal comment wording was `// (no longer a relay-generated nanoid). Plan 14-02 uses this for revocation pub/sub matching.` — this made invariant F count 1, failing "no residual nanoid() on device handshake path".
- **Fix:** Rephrased the comment to `// (no longer a relay-generated id). Plan 14-02 uses this for revocation pub/sub matching.` Semantic meaning preserved; only the banned substring removed.
- **Files modified:** `platform/relay/src/index.ts` (comment reword).
- **Commit:** Rolled into Task 2 commit `d6b66e3` (fixed before Task 3's audit).

No Rule 1 (bug), Rule 2 (missing critical functionality), or Rule 4 (architectural) deviations were needed.

## Commits

| Task | Message | Hash | Files |
|------|---------|------|-------|
| 1 | `feat(14-01): embed sessionId claim in device JWT at approve/token flow` | `e93608c` | migration 0008, web device-auth.ts, approve route, token route |
| 2 | `feat(14-01): relay handshake validates sessionId + ownership, records tokenExpiresAt` | `d6b66e3` | relay device-auth.ts, device-registry.ts, index.ts (handshake block + async handler) |
| 3 | `feat(14-01): token expiry watchdog closes expired device bridges with 4401` | `677d8ba` | relay config.ts, index.ts (watchdog + shutdown clear) |

## Self-Check

- [x] Migration 0008 file exists with ALTER TABLE + CREATE INDEX statements.
- [x] `platform/web/src/lib/device-auth.ts` DeviceTokenPayload has sessionId; approveGrant takes 3 args; getGrantByDeviceCode selects session_id.
- [x] `platform/web/src/app/api/device/approve/route.ts` queries sessions.id and passes to approveGrant.
- [x] `platform/web/src/app/api/device/token/route.ts` rejects grants with missing sessionId and embeds sessionId claim in signed JWT.
- [x] `platform/relay/src/device-auth.ts` DeviceTokenPayload has required sessionId; verifyDeviceToken rejects tokens without it.
- [x] `platform/relay/src/device-registry.ts` DeviceConnection has immutable tokenExpiresAt field assigned in constructor.
- [x] `platform/relay/src/index.ts` onDeviceConnect queries sessions AND devices tables with five distinct 1008 close reasons.
- [x] `platform/relay/src/index.ts` passes tokenPayload.sessionId (not nanoid) + tokenExpiresAt to DeviceConnection.
- [x] `platform/relay/src/config.ts` has SESSION_EXPIRY_CHECK_INTERVAL_MS (60s default).
- [x] `platform/relay/src/index.ts` startSessionExpiryWatchdog runs every interval, closes expired bridges with 4401 'token_expired'.
- [x] Watchdog interval cleared inside shutdown() before stopBandwidthFlush.
- [x] onTunnelConnect unchanged (nanoid count still 1 — regression guard for Phase 10).
- [x] All three task commits exist in git log and SUMMARY.md references match: `e93608c`, `d6b66e3`, `677d8ba`.
- [x] 20 "Phase 14 SESS" markers across modified files (≥8 required).
- [x] Zero new TypeScript errors in either workspace.

**Self-check evidence:**
```
git log --oneline -5
677d8ba feat(14-01): token expiry watchdog closes expired device bridges with 4401
d6b66e3 feat(14-01): relay handshake validates sessionId + ownership, records tokenExpiresAt
e93608c feat(14-01): embed sessionId claim in device JWT at approve/token flow
```
All three expected hashes present.

## User Setup Required

**No user action at execute time.**

**Deploy order for rollout:**
1. Apply migration 0008 to production Postgres: the `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` pair is idempotent and safe to re-run. Nullable column + partial index means zero blocking impact on existing rows.
2. Deploy platform/web (the JWT issuer). After this, every new approveGrant() call persists session_id and every new /api/device/token response carries a sessionId claim.
3. Deploy platform/relay (the JWT consumer). After this, all new handshakes REQUIRE the sessionId claim — any in-flight device using a pre-Plan-14-01 JWT will fail verifyDeviceToken and get 4002 'Invalid device token', forcing them to re-auth via the /api/device/token endpoint which by that point is already issuing sessionId-bearing tokens (hence the order: web first, then relay).

**Token rotation implication:** Every currently-connected device agent will be forcibly re-authed within 24h (natural token expiry) or within ~60s after their token hits its nominal expiry (watchdog 4401). Agents handle 4401 by polling /api/device/token with their existing device_code — but device_codes are one-shot (consumed on first successful /api/device/token), so in practice all active agents will require a fresh `/device/register` + user approval the first time their pre-migration token expires. This is the intended cost of tightening the binding.

## Self-Check: PASSED
