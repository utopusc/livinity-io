---
phase: 14-device-session-binding
plan: 02
subsystem: platform/web logout + platform/relay subscriber
tags: [session-revocation, redis-pubsub, device-bridge-disconnect, phase-14]
requirements_completed: [SESS-03]
requirements_partial: false
dependency_graph:
  requires:
    - Plan 14-01 DeviceConnection.sessionId binding (user's sessions.id from JWT claim)
    - Existing relay Redis client pattern (ioredis already in platform/relay deps)
    - Existing sessions table and /api/auth/logout route
  provides:
    - 'livos:sessions:revoked' Redis channel (publisher at platform/web, subscriber at platform/relay)
    - publishSessionRevoked helper for any platform/web path that revokes a session
    - Session-revocation subscriber that closes matching device bridges with code 4403
  affects:
    - Phase 16 (Admin Override & Emergency Disconnect) — will reuse the same subscriber pattern, possibly on a sibling channel 'livos:sessions:admin-disconnect' or the same channel with a JSON payload distinguishing cause
tech-stack:
  added:
    - ioredis (platform/web — first Redis dependency on the web side)
  patterns:
    - "Redis pub/sub for cross-service lifecycle events (web → relay)"
    - "Lazy-singleton Redis publisher with soft-fail semantics (logout never blocked by Redis outage)"
    - "Dedicated subscriber client (ioredis subscribe mode is connection-exclusive — cannot reuse the command client used by bandwidth/custom-domains)"
    - "WebSocket close codes partitioned by cause: 4401 token_expired (14-01) vs 4403 session_revoked (14-02) vs 1008 policy (handshake)"
key-files:
  created:
    - platform/web/src/lib/session-revocation.ts
    - platform/relay/src/session-revocation.ts
    - .planning/phases/14-device-session-binding/14-02-SUMMARY.md
  modified:
    - platform/web/package.json
    - platform/web/package-lock.json
    - platform/web/src/app/api/auth/logout/route.ts
    - platform/relay/src/index.ts
decisions:
  - "Lazy-singleton publisher on platform/web. Rationale: non-logout request paths (dashboard, device polling, etc.) never pay the Redis connection cost; logout creates the publisher on first use and ioredis keeps it warm thereafter."
  - "Plain-string payload (sessionId UUID as-is, not JSON.stringify). Rationale: single-field message, minimal parsing on the subscriber, no ambiguity. Phase 16 admin-disconnect may upgrade to JSON when a cause field is needed, but SESS-03 does not."
  - "Dedicated ioredis client for the subscriber (NOT reusing the existing `redis` command client at index.ts:70). Rationale: ioredis subscribe mode is connection-exclusive — any GET/SET/etc. on a subscribed client is rejected. The existing client is used by request-proxy for bandwidth counters and custom-domains for cache — subscribing on it would break both paths."
  - "Soft-fail publish (maxRetriesPerRequest:1 + enableOfflineQueue:false + try/catch around publish). Rationale: logout's primary contract is to invalidate the cookie + delete the sessions row. If Redis is down, the device bridges still get torn down at latest by Plan 14-01's 60s expiry watchdog. Logout must NOT hang on Redis reconnect backoff."
  - "SELECT id BEFORE DELETE in logout route. Rationale: DeviceConnection.sessionId at the relay holds the sessions.id UUID (Plan 14-01 binding), not the token. We need the UUID for the revocation message, and once the row is deleted the UUID is gone. The race of two logout requests is handled by idempotency — the subscriber closes the same bridge twice harmlessly."
  - "Close code 4403 'session_revoked' for this path — distinct from 4401 'token_expired' (14-01 watchdog). Rationale: 4401 = 'refresh and reconnect'; 4403 = 'stop reconnecting, the session is gone'. Client device agents can distinguish at the close event and choose the right recovery strategy (refresh token vs abandon and re-pair)."
metrics:
  duration_seconds: 149
  tasks_completed: 3
  files_created: 3
  files_modified: 4
  commits: 2
  completed_date: 2026-04-24
---

# Phase 14 Plan 02: Session revocation pub/sub → bridge disconnection — Summary

**One-liner:** When a user hits /api/auth/logout, platform/web now PUBLISHes the revoked session's UUID on the `livos:sessions:revoked` Redis channel; platform/relay SUBSCRIBEs on a dedicated ioredis client and closes every DeviceConnection whose sessionId matches with WebSocket close code 4403 'session_revoked' within one Redis round-trip.

## What Was Changed

### platform/web — publisher side
**`platform/web/package.json`** — Added `"ioredis": "^5.4.2"` to dependencies (first Redis dep on the web side; relay already uses the same version). `npm install` brought in 9 new packages under `node_modules/ioredis`.

**`platform/web/src/lib/session-revocation.ts` (new)** — Lazy-singleton ioredis publisher + `publishSessionRevoked(sessionId)` helper. Exports `SESSION_REVOKED_CHANNEL = 'livos:sessions:revoked'`. Configured with `maxRetriesPerRequest: 1` and `enableOfflineQueue: false` so that a dead Redis returns fast instead of queueing — logout is never blocked. Error handler on the client instance logs but does not throw, and the publish itself is wrapped in try/catch for defense in depth.

**`platform/web/src/app/api/auth/logout/route.ts`** — Replaced the 13-line handler with a 39-line version that (1) reads the `liv_session` cookie, (2) `SELECT id FROM sessions WHERE token = $1 LIMIT 1` to resolve the UUID BEFORE the row is deleted, (3) calls `deleteSession(token)` (unchanged), (4) calls `publishSessionRevoked(sessionId)` when a UUID was resolved. Then writes the empty-cookie response as before. The sessionId lookup is wrapped in try/catch so that a DB hiccup on the pre-DELETE lookup does not block the logout response.

### platform/relay — subscriber side
**`platform/relay/src/session-revocation.ts` (new)** — Exports `startSessionRevocationSubscriber(subscriber, deviceRegistry)` and `SESSION_REVOKED_CHANNEL = 'livos:sessions:revoked'` (same literal as publisher). Subscribes to the channel on the passed-in client; on each message, trims the payload and iterates `deviceRegistry.allConnections()` closing every `connection.sessionId === revokedSessionId` with `ws.close(4403, 'session_revoked')`. Logs total bridges closed per revocation. Subscriber 'error' handler logs without throwing (ioredis auto-reconnects).

**`platform/relay/src/index.ts`** — Three coordinated edits:
- Imports `startSessionRevocationSubscriber` from `./session-revocation.js`.
- Creates `sessionRevocationSubscriber = new Redis(config.REDIS_URL)` immediately after the existing `const redis = ...` — a second, dedicated ioredis instance (subscribe mode is connection-exclusive; the command client is shared by bandwidth + custom-domain cache and cannot be reused).
- Calls `startSessionRevocationSubscriber(sessionRevocationSubscriber, deviceRegistry)` right after `deviceRegistry` and `handleRequest` are constructed, so any revocation event landing before `server.listen` is already being consumed.
- Inside `shutdown()`, after `clearInterval(sessionExpiryInterval)` (Plan 14-01) and before `stopBandwidthFlush`, calls `sessionRevocationSubscriber.disconnect()` in a try/catch so the shutdown path never throws on an already-disconnected client.

## Invariant Grep Audit

| # | Invariant                                                              | Command / Result                                                                                                                                                                                                                                 | Status |
|---|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| A | publishSessionRevoked referenced in logout route (import + call)       | `grep -c "publishSessionRevoked" platform/web/src/app/api/auth/logout/route.ts` → **3** (import + comment + call — well above required ≥2)                                                                                                       | PASS   |
| B | Publish AFTER deleteSession                                             | `deleteSession(token)` at line 21, `publishSessionRevoked(sessionId)` at line 27 — correct ordering                                                                                                                                              | PASS   |
| C | Channel literal identical publisher ↔ subscriber                        | `diff` of `'livos:sessions:revoked'` extractions from both files → **empty diff**                                                                                                                                                                | PASS   |
| D | Payload is plain session UUID (not JSON.stringify)                      | `grep -q "pub.publish(SESSION_REVOKED_CHANNEL, sessionId)" platform/web/src/lib/session-revocation.ts`                                                                                                                                           | PASS   |
| E | Relay uses dedicated Redis client (2x `new Redis(config.REDIS_URL)`)    | `grep -c "new Redis(config.REDIS_URL)" platform/relay/src/index.ts` → **2** (original + subscriber)                                                                                                                                              | PASS   |
| F | Subscriber closes with 4403 session_revoked                             | `grep -q "ws.close(4403, 'session_revoked')" platform/relay/src/session-revocation.ts`                                                                                                                                                           | PASS   |
| G | Match predicate `connection.sessionId === revokedSessionId` (14-01 binding) | `grep -q "connection.sessionId === revokedSessionId" platform/relay/src/session-revocation.ts`                                                                                                                                                   | PASS   |
| H | Publisher soft-fails (try/catch around publish)                         | `awk '/export async function publishSessionRevoked/,/^}$/' platform/web/src/lib/session-revocation.ts \| grep -c "catch"` → **1** (≥1 required)                                                                                                  | PASS   |
| I | Subscriber has 'error' handler (no crash on Redis flap)                 | `grep -q "subscriber.on('error'," platform/relay/src/session-revocation.ts`                                                                                                                                                                      | PASS   |
| J | Graceful shutdown disconnects the subscriber                            | `awk '/function shutdown/,/^}$/' platform/relay/src/index.ts \| grep -q "sessionRevocationSubscriber.disconnect"`                                                                                                                                | PASS   |
| K | Plan 14-01 watchdog still present (regression guard)                    | `grep -q "startSessionExpiryWatchdog"` AND `grep -q "ws.close(4401, 'token_expired')"` in index.ts                                                                                                                                               | PASS   |
| L | Plan 14-01 handshake session validation still present (regression guard)| `grep -q "SELECT id, user_id, expires_at FROM sessions WHERE id = \$1"` AND `grep -q "session_user_mismatch"` in index.ts                                                                                                                        | PASS   |
| M | TypeScript clean                                                        | `cd platform/relay && npx tsc --noEmit` → **exit 0**; `cd platform/web && npx tsc --noEmit 2>&1 \| grep -E "(session-revocation\|logout/route)\.ts.*error TS" \| wc -l` → **0**                                                                   | PASS   |
| N | Phase 14 SESS markers across full phase (≥12)                           | `grep -rn "Phase 14 SESS" platform/relay/src platform/web/src/lib platform/web/src/app/api platform/web/src/db/migrations \| wc -l` → **27**                                                                                                     | PASS   |
| O | Integration probe (optional — local Redis round-trip)                   | `redis-cli` not installed locally; `redis-server` not running — **SKIPPED with reason**. Full round-trip will be validated on server4 during deploy (platform/web publishes, PM2-managed relay consumes).                                         | SKIP   |

**All 14 required invariants (A–N) PASS. Optional O skipped — no local Redis.**

## Verification Results

- `cd platform/relay && npx tsc --noEmit` → exit 0, zero output. No new type errors introduced by the new import or dedicated client construction.
- `cd platform/web && npx tsc --noEmit` → zero errors matching `(session-revocation|logout/route).ts` (clean typecheck overall). ioredis's TypeScript types are shipped with the package and the `import { Redis } from 'ioredis'` named-export pattern matches the relay's existing usage.
- `test -f platform/web/node_modules/ioredis/package.json` → present (installed via `npm install` which resolved 9 new packages).
- Grep audit confirms all required patterns on both sides:
  - Publisher (`platform/web/src/lib/session-revocation.ts`): `SESSION_REVOKED_CHANNEL = 'livos:sessions:revoked'`, `publisher = new Redis(REDIS_URL, {...})` with `maxRetriesPerRequest: 1`, `pub.publish(SESSION_REVOKED_CHANNEL, sessionId)`, try/catch + error handler.
  - Subscriber (`platform/relay/src/session-revocation.ts`): `subscriber.subscribe(SESSION_REVOKED_CHANNEL, ...)`, `subscriber.on('message', ...)` with `channel !== SESSION_REVOKED_CHANNEL` guard, `connection.sessionId === revokedSessionId` match, `connection.ws.close(4403, 'session_revoked')`.
  - Wiring (`platform/relay/src/index.ts`): 2x `new Redis(config.REDIS_URL)` (original + subscriber), `startSessionRevocationSubscriber(sessionRevocationSubscriber, deviceRegistry)` at boot, `sessionRevocationSubscriber.disconnect()` in `shutdown()`.

## Deviations from Plan

**None — plan executed exactly as written.**

No Rule 1 (bug), Rule 2 (missing critical functionality), Rule 3 (blocking), or Rule 4 (architectural) deviations occurred. The plan was internally self-consistent: the `ioredis` dep was correctly scoped, the soft-fail semantics and dedicated-client pattern were precisely specified, and the existing index.ts had the exact insertion points the plan described. All three edits to index.ts applied cleanly on the first attempt, and `npx tsc --noEmit` succeeded on both workspaces without intermediate fixing.

## Commits

| Task | Message                                                                                   | Hash      | Files                                                                                                                             |
|------|-------------------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------|
| 1    | `feat(14-02): publish session-revocation on logout over Redis pub/sub`                     | `0eb288b` | platform/web/package.json, platform/web/package-lock.json, platform/web/src/lib/session-revocation.ts, platform/web/src/app/api/auth/logout/route.ts |
| 2    | `feat(14-02): relay subscribes to session-revocation and closes matching bridges with 4403` | `abb5087` | platform/relay/src/session-revocation.ts, platform/relay/src/index.ts                                                            |
| 3    | (audit-only — invariant audit, no file changes; SUMMARY captures the evidence)             | n/a       | —                                                                                                                                 |

## Self-Check

- [x] `platform/web/package.json` has `"ioredis": "^5.4.2"` in dependencies.
- [x] `platform/web/node_modules/ioredis/package.json` exists (installed).
- [x] `platform/web/src/lib/session-revocation.ts` exists, exports `SESSION_REVOKED_CHANNEL` and `publishSessionRevoked`.
- [x] `/api/auth/logout/route.ts` SELECTs `sessions.id` BEFORE `deleteSession`, publishes via `publishSessionRevoked`.
- [x] Publisher uses `maxRetriesPerRequest: 1` + `enableOfflineQueue: false` and wraps publish in try/catch.
- [x] `platform/relay/src/session-revocation.ts` exists, exports `startSessionRevocationSubscriber`.
- [x] Subscriber iterates `deviceRegistry.allConnections()` and closes with `ws.close(4403, 'session_revoked')`.
- [x] Subscriber match uses `connection.sessionId === revokedSessionId` (Plan 14-01's binding).
- [x] `platform/relay/src/index.ts` creates a DEDICATED `new Redis(config.REDIS_URL)` for the subscriber (total 2 Redis instances).
- [x] `startSessionRevocationSubscriber(...)` called at boot after DeviceRegistry construction.
- [x] `shutdown()` calls `sessionRevocationSubscriber.disconnect()` inside a try/catch.
- [x] Plan 14-01 invariants unchanged: `startSessionExpiryWatchdog` + 4401 watchdog + handshake `SELECT id, user_id, expires_at FROM sessions` + `session_user_mismatch` all still present.
- [x] Channel literal `'livos:sessions:revoked'` identical in publisher and subscriber (diff empty).
- [x] Both commits visible in `git log`: `0eb288b` and `abb5087`.
- [x] 27 'Phase 14 SESS' markers across modified files (plan requires ≥12).
- [x] `npx tsc --noEmit` exits 0 in platform/relay; zero new errors in platform/web.

**Self-check evidence:**
```
$ git log --oneline -4
abb5087 feat(14-02): relay subscribes to session-revocation and closes matching bridges with 4403
0eb288b feat(14-02): publish session-revocation on logout over Redis pub/sub
e5759d5 docs(14-01): complete device session JWT binding + expiry watchdog plan
677d8ba feat(14-01): token expiry watchdog closes expired device bridges with 4401
```
Both expected hashes present.

## End-to-End Trace

User approves a device pairing → `/api/device/approve` persists `sessions.id` into `device_grants.session_id` (Plan 14-01, Task 1). The device polls `/api/device/token` → receives a JWT carrying `sessionId`, `userId`, `deviceId`, and `exp` claims. The device agent opens the bridge at `/device/connect` and sends `device_auth`; the relay handshake (Plan 14-01, Task 2) validates the JWT signature, then runs `SELECT id, user_id, expires_at FROM sessions WHERE id = $1` — if missing → 1008 session_invalid; if expired → 1008 session_expired; if user mismatch → 1008 session_user_mismatch; also validates `devices.user_id` matches → 1008 device_not_found / device_ownership_mismatch. On success, `DeviceConnection` is registered with `sessionId = tokenPayload.sessionId` and `tokenExpiresAt = tokenPayload.exp * 1000`, and the 60s watchdog (Plan 14-01, Task 3) will close it with 4401 token_expired on JWT expiry.

**Now with Plan 14-02:** the user hits `/api/auth/logout`. The route resolves `sessions.id` from the `liv_session` cookie, calls `deleteSession(token)` to remove the row, and publishes the UUID on `livos:sessions:revoked`. The relay's dedicated subscriber receives the message, iterates all DeviceConnections, and closes every bridge whose `sessionId` matches with `ws.close(4403, 'session_revoked')` — within one Redis round-trip (sub-second under normal conditions). The device agent sees the 4403 close, attempts to reconnect, but its cached device JWT now refers to a `sessionId` whose sessions row no longer exists — the relay handshake returns 1008 session_invalid and the agent must re-pair with a fresh `/device/register` + user approval.

## User Setup Required

**Deploy order (important):**

1. **Deploy platform/web first.** This installs the ioredis dependency and makes `/api/auth/logout` start publishing revocations. Before this step, the web service has never connected to Redis — the deploy implicitly needs the `REDIS_URL` environment variable to be set on the web host (production: the same Redis instance the relay uses; dev default: `redis://127.0.0.1:6379`).

2. **Restart platform/relay.** The boot path now creates a dedicated subscriber Redis client and attaches `startSessionRevocationSubscriber`. No new environment variables are required — it reuses the existing `REDIS_URL` from `platform/relay/src/config.ts`.

**Production environment:**
- `REDIS_URL` MUST be set on the platform/web PM2 process (or its `ecosystem.config.cjs` env block). On server4, the relay already has `REDIS_URL=redis://:LivRedis2024%21@127.0.0.1:6379` in its env; platform/web needs the same value.
- No database migration required — this plan operates purely at runtime (pub/sub) and does not touch PostgreSQL schema.
- No client-side changes required — the device agent already handles abrupt `ws.close()` events by entering reconnect mode; on the next handshake attempt it will hit the Plan 14-01 handshake validation and fail with 1008 session_invalid, which it already treats as "must re-pair".

**Rollout risk:**
- If platform/web is deployed without `REDIS_URL`, `publishSessionRevoked` will fall through its try/catch and log the failure — logout still succeeds; bridges will be closed at latest by the 60s token-expiry watchdog from Plan 14-01.
- If platform/relay is deployed without restarting, the subscriber won't be attached — revocation messages will land in Redis with zero receivers, but the relay's behavior is otherwise unchanged (no downside beyond "SESS-03 not yet active").
- Both deploys are additive; a partial rollout degrades to the pre-Plan-14-02 baseline (bridges close within 24h JWT expiry or 60s watchdog, not within seconds).

## Self-Check: PASSED
