---
phase: 48-live-ssh-session-viewer
plan: "01"
subsystem: livinityd-ssh-sessions
tags: [ssh-sessions, websocket, journalctl, rbac, admin, ring-buffer, fr-ssh-01]
requirements: [FR-SSH-01]
dependency-graph:
  requires:
    - "node:child_process (built-in)"
    - "node:stream (built-in, tests only)"
    - "node:events (built-in, tests only)"
    - "ws (already in livinityd deps)"
    - "livinityd.server.verifyToken (server/index.ts:118)"
    - "findUserById (database/index.ts:138)"
    - "getAdminUser (database/index.ts:166)"
    - "mountWebSocketServer (server/index.ts:225)"
  provides:
    - "WebSocket route /ws/ssh-sessions (admin-gated journalctl tail)"
    - "createSshSessionsWsHandler factory"
    - "makeJournalctlStream / realJournalctlStream factory pair"
    - "extractIp pure helper (IPv4 from 'from <ip>' patterns)"
    - "Wire format {timestamp, message, ip, hostname} JSON-per-event"
  affects:
    - "livos/packages/livinityd/source/modules/server/index.ts (one import + one mountWebSocketServer call)"
tech-stack:
  added: []
  patterns:
    - "DI factory (mirrors fail2ban-admin/active-sessions.ts spawn-of-execFile analog)"
    - "ENOENT graceful degrade → onMissing() callback (NOT throw)"
    - "Module-shared journalctl child + per-WS fan-out subscribers"
    - "Per-connection ring buffer (5000 events, oldest dropped)"
    - "RFC 6455 application close codes 4xxx (4403 non-admin / 4404 binary missing)"
    - "Bare tsx + node:assert/strict tests (no Vitest, no vi.mock — pitfall W-20)"
key-files:
  created:
    - livos/packages/livinityd/source/modules/ssh-sessions/index.ts
    - livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.ts
    - livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.test.ts
    - livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.ts
    - livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/index.ts
decisions:
  - "Module-shared journalctl child (NOT one-per-WS) — single subprocess fans out to N subscribers. Last-disconnect kills the child to avoid zombies."
  - "Ring buffer is module-shared (not per-WS). New clients replay the most-recent ≤5000 events on connect, then live-tail. Mirrors Phase 28 docker-logs MAX_LINES_PER_CONTAINER."
  - "RBAC re-verified at handler boundary (NOT at mountWebSocketServer level). The generic upgrade flow only checks token signature; role lookup must happen inside the per-handler callback."
  - "DI surface accepts findUserByIdFn/getAdminUserFn for tests so unit tests don't touch PostgreSQL or jwt.verify. Production uses dynamic import from '../database/index.js'."
  - "extractIp regex is `\\bfrom\\s+(\\d{1,3}(?:\\.\\d{1,3}){3})\\b` — matches Failed-password / Accepted-publickey / Disconnected / Invalid-user / any sshd 'from <ip>' form. IPv4 only (IPv6 deferred — same scope as Phase 46 ipSchema)."
  - "MinimalLogger contract has optional `warn` (livinityd workspace logger lacks it; console has it). `warnOrError` helper falls through to `error` when `warn` is absent."
metrics:
  duration: "~25m (plan-to-commit)"
  completed-at: "2026-05-01"
  source-loc-added: 1098
  test-count: 16
  test-pass-rate: "16/16 (100%)"
  commit-hash: "9bf91508"
  sacred-file-sha-pre: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  sacred-file-sha-post: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  byte-identical: true
---

# Phase 48 Plan 48-01: Live SSH Session Viewer — Backend Module + WS Route Mount Summary

**One-liner:** Admin-only WebSocket at `/ws/ssh-sessions` streaming `journalctl -u ssh -o json --follow --since "1 hour ago"` events with parsed IPs, RFC 6455 close codes (4403/4404), and a 5000-event ring buffer — backed by DI-factory unit tests (16/16 PASS) using bare `tsx` + `node:assert/strict`.

## Module File Layout

```
livos/packages/livinityd/source/modules/ssh-sessions/
├── index.ts                       (25 lines)  — public barrel
├── journalctl-stream.ts          (253 lines)  — DI factory wrapping `journalctl` spawn
├── journalctl-stream.test.ts     (189 lines)  — 8 tests (extractIp + factory + ENOENT)
├── ws-handler.ts                 (285 lines)  — admin-RBAC WS handler + ring buffer
└── ws-handler.test.ts            (335 lines)  — 8 tests (RBAC gates + ring buffer + cleanup)
                                  ────────────
                                   1087 lines total (source + tests)
```

Plus 1 modification to `livos/packages/livinityd/source/modules/server/index.ts`:
- Line 30 (new): `import {createSshSessionsWsHandler} from '../ssh-sessions/index.js'`
- Line ~1158 (new block): `this.mountWebSocketServer('/ws/ssh-sessions', ...)` — mirrors `/ws/agent` shape exactly.

## Test Counts

| File | Tests | Pass | Run command |
|------|-------|------|-------------|
| `journalctl-stream.test.ts` | 8 | 8/8 | `npx tsx journalctl-stream.test.ts` |
| `ws-handler.test.ts` | 8 | 8/8 | `npx tsx ws-handler.test.ts` |
| **Total** | **16** | **16/16** | |

### journalctl-stream.test.ts coverage

1. `extractIp` — Failed-password form → IP captured
2. `extractIp` — Accepted-publickey form → IP captured
3. `extractIp` — pam session line (no IP) → null
4. `extractIp` — Disconnected form → IP captured (any "from <ip>")
5. Factory — 3 NDJSON lines (Failed/Accepted/pam) → 3 events emitted (pam ip=null, NOT dropped)
6. Factory — malformed JSON lines silently skipped (no throw, no emit)
7. Factory — defensive `_SYSTEMD_UNIT === 'ssh.service'` filter drops non-ssh entries
8. Factory — `error` event with `{code: 'ENOENT'}` invokes `onMissing()` (no throw)

### ws-handler.test.ts coverage

1. Admin token → connection accepted, fan-out subscriber registered
2. Member token → close 4403 'admin role required', NO subscription
3. Guest token → close 4403
4. `findUserById` returns null (deleted user) → close 4403
5. ENOENT (binary missing) → close 4404 'journalctl binary missing on host'
6. Ring buffer — 5001 events emitted, second client gets exactly 5000 replayed (ev #2..#5001; ev #1 dropped)
7. Broadcast format — single `JSON.stringify({timestamp, message, ip, hostname})` per event
8. Cleanup — on `ws.on('close')` per-WS sub removed; if last subscriber, `stream.stop()` invoked (kills journalctl child)

## Encoded Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `RING_BUFFER_LIMIT` | `5_000` | `ws-handler.ts:46` | Max events retained in module-shared buffer; oldest dropped on overflow. Mirrors Phase 28 docker-logs `MAX_LINES_PER_CONTAINER`. |
| Close code `4403` | application-defined | `ws-handler.ts` (7 occurrences) | Non-admin role / missing token / role-lookup failure. RFC 6455 4xxx range. Mirrors v26.0 `authorizeDeviceAccess`. |
| Close code `4404` | application-defined | `ws-handler.ts` (3 occurrences) | `journalctl` binary missing on host (graceful degrade — Mini PC always has it but defensive). |
| Close code `1011` | RFC 6455 standard | `ws-handler.ts` (1 occurrence) | Internal handler error (role lookup threw). |
| journalctl argv | hardcoded array | `journalctl-stream.ts:118` | `['-u', 'ssh', '-o', 'json', '--follow', '--since', '1 hour ago']` — NO shell interpolation, NO user input concatenated (T-48-02 Tampering mitigation). |
| `extractIp` regex | `/\bfrom\s+(\d{1,3}(?:\.\d{1,3}){3})\b/` | `journalctl-stream.ts:91` | IPv4 only (IPv6 deferred to v30+). Matches Failed-password / Accepted-publickey / Disconnected / Invalid-user / pam (returns null for pam — line still emits). |

## Wave 2 (Plan 48-02) Starting Handoff

**WebSocket URL:** `ws(s)://<host>/ws/ssh-sessions?token=<JWT>`

**Auth requirements:**
- Admin role required at handshake. Non-admin → close `4403 'admin role required'`.
- Legacy `{loggedIn: true}` tokens (pre-multi-user) map to admin via `getAdminUser()`.
- Modern `{userId, role, sessionId}` tokens look up role via `findUserById(payload.userId)`.

**Wire format (JSON line per event):**

```ts
interface SshSessionEvent {
  timestamp: string  // microseconds-since-epoch (verbatim from journalctl __REALTIME_TIMESTAMP)
  message: string    // verbatim journalctl MESSAGE
  ip: string | null  // IPv4 extracted from "from <ip>" pattern; null if MESSAGE has no IP
  hostname?: string  // verbatim _HOSTNAME (e.g., "bruce-EQ")
}
```

**Connection lifecycle:**
1. Client opens `ws(s)://<host>/ws/ssh-sessions?token=<JWT>`
2. Server validates JWT signature (mountWebSocketServer flow), then re-verifies role (handler).
3. Non-admin → close 4403 + reason 'admin role required'.
4. ENOENT → close 4404 + reason 'journalctl binary missing on host'.
5. Admin → on connect, server replays the most-recent ≤5000 buffered events (each as one JSON line), then live-tails new events.
6. UI MUST handle: (a) replay bursts (rapid-fire on connect), (b) live trickle (low-rate during idle), (c) `ip: null` rows (render but not as clickable IP), (d) close codes 4403/4404 with operator-friendly messaging.

**UI rendering hints:**
- `Number(timestamp) / 1000` → ms-precision Date for display.
- `ip: null` rows are pam_unix / session-opened lines — show but don't link.
- `ip: '<ipv4>'` rows can deep-link to fail2ban admin (Phase 46) for ban/unban.
- Plan 48-02 may want to opt out of replay-on-connect (UI shows "live tail only" toggle); the buffer remains module-shared so flipping the toggle is a UI concern, not a backend protocol change.

**Test fixtures (from journalctl-stream.test.ts):**
```
{"__REALTIME_TIMESTAMP":"1714589412345678","_SYSTEMD_UNIT":"ssh.service","MESSAGE":"Failed password for invalid user attacker from 203.0.113.99 port 51234 ssh2","_HOSTNAME":"bruce-EQ"}
{"__REALTIME_TIMESTAMP":"1714589500000000","_SYSTEMD_UNIT":"ssh.service","MESSAGE":"Accepted publickey for bruce from 192.168.1.50 port 51999 ssh2: RSA SHA256:abc","_HOSTNAME":"bruce-EQ"}
{"__REALTIME_TIMESTAMP":"1714589501000000","_SYSTEMD_UNIT":"ssh.service","MESSAGE":"pam_unix(sshd:session): session opened for user bruce by (uid=0)","_HOSTNAME":"bruce-EQ"}
```

After parse:
```
{timestamp: '1714589412345678', message: 'Failed password ...', ip: '203.0.113.99', hostname: 'bruce-EQ'}
{timestamp: '1714589500000000', message: 'Accepted publickey ...', ip: '192.168.1.50', hostname: 'bruce-EQ'}
{timestamp: '1714589501000000', message: 'pam_unix(sshd:session): session opened ...', ip: null, hostname: 'bruce-EQ'}
```

## Sacred File SHA Verification

Per `D-D-40-01-RITUAL` and the v29.4 milestone Branch N invariant:

| Checkpoint | SHA | Source |
|------------|-----|--------|
| Pre-Plan 48-01 (HEAD before commit `9bf91508`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `git hash-object` against working tree |
| Post-Plan 48-01 (HEAD = `9bf91508`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `git hash-object` against working tree |
| `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` | (empty) | byte-identical, NO diff |

**Conclusion:** Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical pre/post Plan 48-01. D-D-40-01-RITUAL invariant upheld through Phase 48 Plan 01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Plan referenced `livinityd.verifyToken` which does not exist on Livinityd directly**

- **Found during:** Task 2 (ws-handler.ts implementation)
- **Issue:** The plan's `<interfaces>` block stated `payload = (await deps.livinityd.verifyToken(token))` but `verifyToken` is a method on the `Server` class (`server/index.ts:118`), not on `Livinityd` itself (`livos/packages/livinityd/source/index.ts:95`).
- **Fix:** Used `deps.livinityd.server.verifyToken(token)` — `livinityd.server` is exposed at `livos/packages/livinityd/source/index.ts:105` and points to the Server instance. This matches the actual livinityd public API.
- **Files modified:** `livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.ts`
- **Commit:** `9bf91508`

**2. [Rule 3 — Blocking issue] Plan's `MinimalLogger` contract incompatible with livinityd workspace logger**

- **Found during:** Task 2 typecheck pass
- **Issue:** Plan's logger contract was `{warn: (...args) => void; error?: (...args) => void; verbose?: (...args) => void}` — but the livinityd workspace logger (`utilities/logger.ts`) exposes `{log, verbose, error}` with NO `warn` method, AND its `error` signature is the stricter `(message: string, error?: unknown) => void`. Direct passthrough of `this.logger.createChildLogger('ssh-sessions')` failed `tsc` with TS2322.
- **Fix:** Made `warn` optional on `MinimalLogger`; added `warnOrError(logger, message, ...args)` helper that falls through to `logger.error` when `logger.warn` is undefined. Aligned both ws-handler.ts and journalctl-stream.ts logger contracts to `(message: string, ...args: unknown[]) => void`. No livinityd-wide refactor required.
- **Files modified:** `ws-handler.ts`, `journalctl-stream.ts`
- **Commit:** `9bf91508`

**3. [Rule 1 — Bug] Test 8 assertion checked the wrong subscriber set**

- **Found during:** Task 2 first test run
- **Issue:** Test 8 asserted `fake.subscribers === 0` post-close, but the fake stream's `subs` set tracks fan-out subscribers (always 1 in the handler design — the single internal closure that fans out to per-WS subs). Per-WS subs live in the handler's internal `state.subscribers` Set, which is not exposed to the fake.
- **Fix:** Re-shaped Test 8 to assert behavior (post-close emits do NOT reach the closed WS; `stream.stop()` was invoked exactly once on last-subscriber disconnect) instead of structural state.
- **Files modified:** `ws-handler.test.ts`
- **Commit:** `9bf91508`

### Documentation comment scrub (Rule 1 — false-positive grep)

- **Issue:** Acceptance criteria included `grep -ri "maxmind\|geoip\|geolite" livos/packages/livinityd/source/modules/ssh-sessions/` returns empty — but my header comments stated "no `maxmind`" / "no GeoIP" as negative D-NO-NEW-DEPS assertions, which would match the literal grep.
- **Fix:** Reworded to "no new third-party deps" / "no geo-IP enrichment" without using the literal triggers. Same intent; literal grep now returns empty.
- **Files modified:** `index.ts`, `journalctl-stream.ts`, `ws-handler.ts`
- **Commit:** `9bf91508`

### Auth Gates

None. Plan 48-01 is local source code only — no Mini PC SSH, no API keys, no UAT.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `livos/packages/livinityd/source/modules/ssh-sessions/index.ts` exists | FOUND |
| `livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.ts` exists | FOUND |
| `livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.test.ts` exists | FOUND |
| `livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.ts` exists | FOUND |
| `livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.test.ts` exists | FOUND |
| `livos/packages/livinityd/source/modules/server/index.ts` modified | FOUND (1 import + 1 mountWebSocketServer block) |
| Commit `9bf91508` exists | FOUND in `git log --oneline` |
| 16/16 tests pass | VERIFIED (`tsx journalctl-stream.test.ts` + `tsx ws-handler.test.ts`) |
| Sacred file byte-identical pre/post | VERIFIED (`git hash-object` = `4f868d318abff71f8c8bfbcf443b2393a553018b` both before and after) |
| `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` empty | VERIFIED |
| No new deps in `package.json` | VERIFIED (`git diff -- package.json` empty) |
| No `maxmind`/`geoip`/`geolite` literal in module | VERIFIED (`grep -ri` returns empty) |
| No Server4 IP `45.137.194.103` in module | VERIFIED (`grep -r` returns empty) |
| Acceptance: ≥6 exports in journalctl-stream.ts | VERIFIED (7 exports) |
| Acceptance: ≥1 re-export from journalctl-stream.js in barrel | VERIFIED (1 line) |
| Acceptance: ≥8 PASS Test markers per test file | VERIFIED (8 + 8) |
| Acceptance: 4403 literal ≥2 in ws-handler.ts | VERIFIED (7 occurrences) |
| Acceptance: 4404 literal ≥1 in ws-handler.ts | VERIFIED (3 occurrences) |
| Acceptance: `RING_BUFFER_LIMIT = 5_000` declared | VERIFIED |
| Acceptance: `mountWebSocketServer('/ws/ssh-sessions', ...)` in server/index.ts | VERIFIED |
| Acceptance: `createSshSessionsWsHandler` in server/index.ts ≥2 lines (import + use) | VERIFIED (2 occurrences) |
