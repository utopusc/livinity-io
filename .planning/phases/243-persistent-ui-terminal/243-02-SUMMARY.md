---
phase: 243
plan: 02
subsystem: livinityd
tags: [ws, pty, terminal, caddy, feature-flag, tdd]
requires:
  - Plan 243-01 (PtySession + metadata module) — SHIPPED
  - ws@^8.16.0 (pre-existing in livos/packages/livinityd/package.json)
provides:
  - createPtyTerminalWsHandler factory (cookie-auth + flag-gate + protocol)
  - isTerminalPanelEnabled flag check
  - TERMINAL_PANEL_REDIS_KEY const = 'livos:v43:terminal_panel'
  - /livos/terminal/ws WebSocket endpoint mounted in livinityd
  - @livos_terminal_ws Caddy matcher (unconditional, RFC 6455 compliant)
affects:
  - Plan 243-03 (xterm.js panel consumes /livos/terminal/ws)
  - Plan 243-04 (Mini PC deploy + flag flip)
tech-stack:
  added: []
  patterns:
    - Cookie-only WS auth (LIVINITY_PROXY_TOKEN, NO ?token= fallback)
    - DI-friendly factory seam (sessionFactory + flagChecker + write/deleteMetadataFn)
    - Caddy named-matcher constant (LIVOS_TERMINAL_WS_HANDLE) emitted in 3 site blocks
    - Default-OFF feature flag (Redis key literal-string equality)
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/feature-flag.ts
    - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/feature-flag.test.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel re-exports)
    - livos/packages/livinityd/source/modules/server/index.ts (mountWebSocketServer call)
    - livos/packages/livinityd/source/modules/domain/caddy.ts (LIVOS_TERMINAL_WS_HANDLE + 3 emit sites)
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts (+5 assertions, 74 → 79)
decisions:
  - L-243-C honored — matcher is path-only, NO Referer regex (RFC 6455 forbids Referer on WS upgrade)
  - L-243-D honored — feature flag default-OFF; only literal string 'true' opens the gate
  - L-243-B honored — handler hardcodes username:'bruce' before sessionFactory call
  - Cookie-only auth (no ?token= query-string fallback) — clean break from legacy /terminal handler
  - safeSend helper avoids JSON.stringify litter and never throws out of handler
  - Redis metadata writes are fire-and-log: observability, not auth (warn on failure, never propagate)
  - getAdminUserFn DI seam mirrors ssh-sessions pattern for legacy {loggedIn:true} token resolution
  - PtySession.start failures close with WS code 1011 ('server error' per RFC 6455 4xxx vs 1xxx scheme)
  - Bad-message-shape replies with {type:'error'} but does NOT close the WS (graceful tolerance, test 13)
metrics:
  duration: ~30 min
  completed: 2026-05-28
  tasks: 3
  commits: 5
  tests_added: 17
  tests_passing: 112
---

# Phase 243 Plan 02: /livos/terminal/ws WebSocket endpoint Summary

One-liner: cookie-authed + feature-flag-gated WS handler at `/livos/terminal/ws` brokers between xterm.js (243-03) and PtySession (243-01), wired through livinityd's `mountWebSocketServer` and exposed by a new unconditional `@livos_terminal_ws` Caddy matcher emitted in 3 site blocks.

## What Was Built

### New module files (livos/packages/livinityd/source/modules/pty-sessions/)

- **feature-flag.ts** — `TERMINAL_PANEL_REDIS_KEY = 'livos:v43:terminal_panel'` drift-locked literal + `isTerminalPanelEnabled(redis)` returning `(await redis.get(KEY)) === 'true'`. Default-OFF: missing key / anything other than literal `'true'` closes the gate.
- **ws-handler.ts** — `createPtyTerminalWsHandler(deps)` factory returning the async `(ws, request)` handler. DI surface includes `sessionFactory`, `flagChecker`, `getAdminUserFn`, `writeMetadataFn`, `deleteMetadataFn` — all test-injectable so the handler runs fully synchronously in vitest without touching node-pty / ws / Redis.

### Wired into existing surfaces

- **pty-sessions/index.ts** (modified) — Barrel re-exports `createPtyTerminalWsHandler`, `isTerminalPanelEnabled`, `TERMINAL_PANEL_REDIS_KEY` + 3 types (`CreateHandlerDeps`, `PtySessionLike`, `TerminalFlagRedisClient`).
- **server/index.ts** (modified) — One new `mountWebSocketServer('/livos/terminal/ws', ...)` block immediately after the Phase 48 `/ws/ssh-sessions` mount. Constructs a child logger scope `'pty-terminal'` and passes `this.livinityd.ai.redis` through to the handler.
- **domain/caddy.ts** (modified) — New `LIVOS_TERMINAL_WS_HANDLE` template constant (40-line block) declared immediately after `LIV_ASSISTANT_SUBRESOURCE_HANDLE`. Interpolated into 3 emit sites: apex `:80` no-domain fallback (line 467), main domain block (line 501), multi-user wildcard subdomain block (line 532).
- **domain/caddy.test.ts** (modified) — 5 new assertions appended to the file (matcher presence + `:8080` backend + ordering-before-catch-all + no-Referer-regex + multi-site emission). Test count delta: 74 → 79.

### Wire Protocol (operator reference)

Inbound (Client → Server):
- `{type:'init', cols, rows, cwd?}` — required first message; spawns PtySession via `sessionFactory({username:'bruce', cols, rows, cwd?})`.
- `{type:'data', data}` — forwards to `session.write(data)` (silently ignored before init).
- `{type:'resize', cols, rows}` — forwards to `session.resize(cols, rows)` (silently ignored before init).
- `{type:'close'}` — calls `session.kill()` (exit forwarder closes WS via `ws.close(1000)`).

Outbound (Server → Client):
- `{type:'ready', sessionId}` — once after `session.start()` succeeds.
- `{type:'data', data:<chunk>}` — for every PtySession `'data'` event.
- `{type:'exit', code, signal}` — when PtySession `'exit'` fires; immediately followed by `ws.close(1000)`.
- `{type:'error', message}` — for unparseable JSON / missing fields / spawn errors.

Close codes:
- `4403` — missing/invalid cookie OR feature flag !== `'true'`.
- `1011` — spawn failure (`session.start()` threw).
- `1000` — clean exit from PtySession.

## Drift-Locks

| Anchor | Location | Test |
|---|---|---|
| `TERMINAL_PANEL_REDIS_KEY === 'livos:v43:terminal_panel'` | `feature-flag.ts` line 22 | `feature-flag.test.ts` case 1 |
| Path string `/livos/terminal/ws` | `server/index.ts` line 1345 + 3× in `caddy.ts` (constant body + assertions) | `caddy.test.ts` 5 new cases (matcher + emit count) |
| Handler always passes literal `'bruce'` to PtySession | `ws-handler.ts` `spawnOpts.username = 'bruce'` line 264 | `ws-handler.test.ts` case 4 |
| Caddy matcher has NO `header_regexp Referer` (L-243-C unconditional) | `LIVOS_TERMINAL_WS_HANDLE` constant | `caddy.test.ts` "does NOT contain header_regexp Referer" case |
| Caddy matcher reverse_proxies to `127.0.0.1:8080` (NOT `:3020`) | `LIVOS_TERMINAL_WS_HANDLE` constant body | `caddy.test.ts` ":8080 (NOT :3020 AionUi)" case |

## Test Counts

| File | Pass | Notes |
|---|---|---|
| `pty-sessions/__tests__/metadata.test.ts` | 6/6 | from Plan 243-01 |
| `pty-sessions/__tests__/session.test.ts` | 10/10 | from Plan 243-01 |
| `pty-sessions/__tests__/feature-flag.test.ts` | 4/4 | NEW — drift-lock + default-OFF + literal-true |
| `pty-sessions/__tests__/ws-handler.test.ts` | 13/13 | NEW — 3 auth gates + 3 init/spawn + 3 inbound routing + 2 event forwarding + 2 error paths |
| `domain/caddy.test.ts` | 79/79 | +5 from baseline 74 (Phase 237) — all Phase 237 assertions still GREEN |
| **TOTAL** | **112/112** | combined `vitest run` of the 5 files |

## Commits

5 atomic commits, conventional TDD prefixes:

| # | Hash | Subject |
|---|---|---|
| 1 | `91c5ef84` | `test(243-02): RED - terminal_panel feature flag tests (4 cases failing)` |
| 2 | `64315c6a` | `feat(243-02): GREEN - terminal_panel feature flag (4/4 tests pass)` |
| 3 | `e3a84c6d` | `test(243-02): RED - pty-sessions WS handler tests (13 cases failing)` |
| 4 | `36663bc2` | `feat(243-02): GREEN - pty-sessions WS handler with cookie auth + protocol (13/13 tests pass)` |
| 5 | `102cb6c2` | `feat(243-02): wire /livos/terminal/ws mount + Caddy block + barrel re-export` |

## Verification (Success Criteria)

- **SC-01** GREEN — `pnpm vitest run source/modules/pty-sessions/__tests__/ source/modules/domain/caddy.test.ts` → **112/112 PASS** (4 + 13 + 6 + 10 + 79)
- **SC-02** GREEN — `pnpm tsc --noEmit` → **zero new errors** in pty-sessions / server / domain (baseline 21 pre-existing, post-change 21)
- **SC-03** GREEN — `grep -c "mountWebSocketServer.*livos/terminal/ws"` → **1** mount call (path string appears 2× total counting one comment ref)
- **SC-04** GREEN — `LIVOS_TERMINAL_WS_HANDLE` constant emitted in **3 site blocks** (apex `:80` fallback, main domain, multi-user wildcard subdomain)
- **SC-05** GREEN — L-243-C honored: `awk '/LIVOS_TERMINAL_WS_HANDLE/,/^}\x60/' caddy.ts | grep -c "Referer"` → **0**
- **SC-06** GREEN — L-243-D honored: `feature-flag.test.ts` case 1 drift-locks the literal `'livos:v43:terminal_panel'` and cases 2-3 drift-lock default-OFF semantics
- **SC-07** GREEN — L-243-B honored: `ws-handler.test.ts` case 4 asserts `sessionFactory` is called with `username: 'bruce'` (hardcoded literal, not interpolated from any message field)
- **SC-08** GREEN — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across all 5 commits (pre-commit hook PASS on every commit; final `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` confirmed)

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in declared order.

Minor implementation choices within plan latitude:
- **Bad-message-shape after init**: handler tolerates unknown `type` values with `{type:'error',message:'bad message shape'}` reply — same as before-init unparseable JSON path (test 13 verifies). No `ws.close` triggered.
- **caddy.test.ts case 2 slice scoping**: initial draft sliced 400 chars forward from `handle @livos_terminal_ws {` which leaked into the following `@liv` handle body (and that body has `:3020` because it routes to AionUi). Fixed by scoping the slice to end at `@liv path /liv` — keeps the assertion strictly within the new handle body.

## Authentication Gates

None encountered during execution — all work was code/test, no Mini PC SSH, no LLM round-trips, no auth-token-required tools.

## Threat Surface

All threats from `<threat_model>` are addressed in code:
- **T-243-02-01 (Spoofing — JWT cookie):** `livinityd.server.verifyProxyToken` signs with HS256 + secret from `/data/secrets/jwt`. Tests 1+2 drift-lock the rejection (`ws.close(4403, 'unauthorized')`).
- **T-243-02-02 (Elevation — feature flag default-off):** `feature-flag.ts` returns `false` on any non-`'true'` value. Test 3 drift-locks. Operator MUST `redis-cli SET livos:v43:terminal_panel true` to enable.
- **T-243-02-03 (Elevation — username injection):** handler hardcodes literal `'bruce'` (`PtySpawnOptions.username: 'bruce'` at line 264 of ws-handler.ts). Type-system guarantees the literal. 243-01's runtime guard adds a second layer.
- **T-243-02-04 (Tampering — malformed JSON):** every inbound `JSON.parse` is wrapped in try/catch; bad shapes get `{type:'error'}` reply with no PTY mutation. Test 13 drift-locks.
- **T-243-02-05 (DoS — flood):** ACCEPTED. v43 MVP single-user. Deferred to v44+.
- **T-243-02-06 (Info disclosure — frame headers):** `header_down -X-Frame-Options` + `-Content-Security-Policy` on the Caddy handle block (mirrors @liv_ws).
- **T-243-02-07 (Repudiation — audit log):** ACCEPTED. `logger.createChildLogger('pty-terminal')` provides journalctl visibility on `livos.service`.
- **T-243-02-08 (Info disclosure — spoofable Referer):** Not applicable to new matcher (unconditional). Documented carry-over only.

No new threat surface beyond the plan's register.

## Known Stubs

None. WS endpoint is fully wired and consumed-ready for Plan 243-03 (xterm.js panel).

## TDD Gate Compliance

- **Task 1:** RED commit `91c5ef84` (test only, 4 failures — module missing) → GREEN commit `64315c6a` (impl, 4/4 pass). Gate sequence PASS.
- **Task 2:** RED commit `e3a84c6d` (test only, 13 failures — module missing) → GREEN commit `36663bc2` (impl, 13/13 pass). Gate sequence PASS.
- **Task 3:** Non-TDD (wiring + caddy assertions on existing impl). Commit `102cb6c2`. caddy.test.ts uses additive assertions (74 → 79); pty-sessions barrel adds re-exports only. No RED required.

## Next

Plan 243-03 will mount an xterm.js panel as a new LivOS dock entry (hidden behind `livos:v43:terminal_panel` flag) and wire its WS client to `wss://<host>/livos/terminal/ws` with the `init`/`data`/`resize`/`close` protocol drift-locked above.

## Self-Check: PASSED

- FOUND `livos/packages/livinityd/source/modules/pty-sessions/feature-flag.ts`
- FOUND `livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts`
- FOUND `livos/packages/livinityd/source/modules/pty-sessions/__tests__/feature-flag.test.ts`
- FOUND `livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts`
- FOUND barrel re-exports in `livos/packages/livinityd/source/modules/pty-sessions/index.ts` (createPtyTerminalWsHandler, isTerminalPanelEnabled, TERMINAL_PANEL_REDIS_KEY)
- FOUND mount block in `livos/packages/livinityd/source/modules/server/index.ts` line 1345 (`this.mountWebSocketServer('/livos/terminal/ws', ...)`)
- FOUND `LIVOS_TERMINAL_WS_HANDLE` constant in `livos/packages/livinityd/source/modules/domain/caddy.ts` line 439 + 3 emit sites (lines 467, 501, 532)
- FOUND 5 new assertions appended to `livos/packages/livinityd/source/modules/domain/caddy.test.ts`
- FOUND commit `91c5ef84` (RED flag) in git log
- FOUND commit `64315c6a` (GREEN flag) in git log
- FOUND commit `e3a84c6d` (RED ws) in git log
- FOUND commit `36663bc2` (GREEN ws) in git log
- FOUND commit `102cb6c2` (wiring) in git log
- PRESERVED Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- VERIFIED `grep -c "mountWebSocketServer.*livos/terminal/ws" server/index.ts` → 1
- VERIFIED `grep -c "@livos_terminal_ws" caddy.ts` → 2 (constant body matcher + handle line; 3 emit interpolations bring runtime Caddyfile output to ≥3)
- VERIFIED L-243-C: `awk '/LIVOS_TERMINAL_WS_HANDLE/,/^}\x60/' caddy.ts | grep -c Referer` → 0
- VERIFIED 112/112 vitest cases PASS in combined `vitest run` over the 5 test files
- VERIFIED zero new tsc errors (baseline 21 pre-existing, post-change 21)
