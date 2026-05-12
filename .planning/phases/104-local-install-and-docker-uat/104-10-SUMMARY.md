---
phase: 104
plan: "10"
subsystem: livinityd
tags: [heartbeat, account, v34-seed, marketplace, livinity-io, server5]
type: v34-seed
requires:
  - 104-09 (Cloudflare Tunnel install mode + `--api-key liv_k_...` flag → `/etc/livos/secrets/api-key` (0600) + Redis pointer key `livos:account:api_key_path`)
provides:
  - livos/packages/livinityd/source/modules/account/api-key.ts — readApiKey({redis}) returns {apiKey, path} or null; redactedPreview() helper
  - livos/packages/livinityd/source/modules/account/device-id.ts — getOrCreateDeviceId(path) returns stable UUIDv4; persists `/var/lib/livos/device-id` (0600)
  - livos/packages/livinityd/source/modules/account/heartbeat-payload.ts — buildHeartbeatPayload({deviceId, mode, version, ...}) pure builder; detectPrimaryIPv4()
  - livos/packages/livinityd/source/modules/account/heartbeat-sender.ts — startHeartbeat({url, intervalSec, redis, version, logger}) → StopHandle; native fetch + 10s AbortController + self-rescheduling setTimeout + status matrix
  - livos/packages/livinityd/source/modules/account/index.ts — barrel export
  - livos/packages/livinityd/source/index.ts (EDIT) — heartbeat wired into Livinityd.start() AFTER ai.start(); guarded on Redis key; stopHeartbeat() in Livinityd.stop()
affects:
  - livos/packages/livinityd/source/index.ts (Livinityd class wiring — 2 minor edits: import block + start() guarded wire + stop() teardown)
tech-stack:
  added:
    - Node 18+ native `fetch` (global) — heartbeat POST
    - Node 18+ native `AbortController` (global) — 10s request timeout
    - `crypto.randomUUID()` (`node:crypto`, built-in) — stable per-box UUIDv4
  patterns:
    - Self-rescheduling `setTimeout` chain (no `setInterval`) — each tick fully resolves before the next is armed; slow Server5 cannot cause tick pile-up.
    - Log-once-per-restart semantics via boolean flags (`warned404`, `warnedMalformedKey`) — recurring conditions emit one warn then downgrade to verbose, preventing journal spam over the box's life.
    - Guarded boot wire — heartbeat is armed ONLY when `livos:account:api_key_path` Redis key is set; absent → verbose-skip with no warnings. Plain LAN-only installs get NO heartbeat traffic.
    - Pure builder pattern for the JSON envelope — `heartbeat-payload.ts` is I/O-free, fully unit-testable, trivially serializes to JSON.
    - Real-timer test pattern with sub-second interval (50ms) instead of `vi.useFakeTimers()` — avoids fake-timer ↔ self-rescheduling-setTimeout race.
key-files:
  created:
    - livos/packages/livinityd/source/modules/account/api-key.ts (88 lines)
    - livos/packages/livinityd/source/modules/account/api-key.test.ts (155 lines, 12 tests)
    - livos/packages/livinityd/source/modules/account/device-id.ts (76 lines)
    - livos/packages/livinityd/source/modules/account/device-id.test.ts (108 lines, 8 tests)
    - livos/packages/livinityd/source/modules/account/heartbeat-payload.ts (74 lines)
    - livos/packages/livinityd/source/modules/account/heartbeat-payload.test.ts (152 lines, 13 tests)
    - livos/packages/livinityd/source/modules/account/heartbeat-sender.ts (235 lines)
    - livos/packages/livinityd/source/modules/account/heartbeat-sender.test.ts (399 lines, 10 tests)
    - livos/packages/livinityd/source/modules/account/index.ts (18 lines, barrel)
    - .planning/phases/104-local-install-and-docker-uat/104-10-SUMMARY.md (this file)
  modified:
    - livos/packages/livinityd/source/index.ts (Livinityd class — boot + shutdown wire)
    - .planning/STATE.md (Phase 104 plan count 9 → 10 + 104-10 status block prepended)
    - .planning/ROADMAP.md (Phase 104 plan count + new 104-10 plan-row)
decisions:
  - D-104-10-V34-SEED: 104-10 ships the LivOS CLIENT only. Server5's `/api/devices/heartbeat` route is built in a separate v34.x phase (different repo). Until Server5 ships it, every POST returns 404 — sender treats this as the expected forward-compat state (warn once + retry silently).
  - D-104-RELAY-ZERO-DATA-PLANE preserved: heartbeat IS control-plane traffic (~12KB/day @ 60s interval, ~200 bytes/POST) — explicitly allowed by the Phase 104 invariant. Data-plane (Master Chrome streams, agent payloads, file uploads) STILL stays LAN-direct. Documented at top of `heartbeat-sender.ts`.
  - D-NO-NEW-DEPS preserved: Node 18+ built-ins only (`fetch`, `AbortController`, `crypto.randomUUID`, `fs/promises`, `os`). `livos/packages/livinityd/package.json` UNTOUCHED.
  - Guarded boot wire: heartbeat is armed ONLY when 104-09 wrote `livos:account:api_key_path`. Plain LAN-only installs without `--api-key` get NO heartbeat traffic and NO log spam. This preserves D-104-DEFAULT-MODE's "no Server5 touch unless operator opts in" spirit.
  - Self-rescheduling setTimeout (not setInterval): each tick fully resolves before the next is armed → slow Server5 cannot cause tick pile-up → no resource leak risk.
  - Log-once-per-restart for 404: prevents journal spam over the box's life (a single livinityd restart can run for weeks; 60s intervals = ~10K 404s without dedup).
  - 401 → stop heartbeat (NOT continue retrying): a revoked key is a known-bad state; spamming Server5 burns the user's marketplace rate-limit on a guaranteed-failure path. Operator must rotate the file at `/etc/livos/secrets/api-key` AND restart livinityd to re-arm. Documented in source.
  - API key flows via `X-Api-Key` HTTP header ONLY, never embedded in the body — keeps the body content safe to log at warn-level for debugging.
  - `redactedPreview()` is the only safe-for-logs key-value surface: produces `liv_k_<6-chars>***`. Enforced by a dedicated SECURITY test that greps every captured log entry across the full happy-path POST flow for the raw secret tail.
metrics:
  duration: "~75min"
  completed: "2026-05-12T03:20:00.000Z"
  commits: 3
  tests_added: 43
  test_files: 4
  source_files: 5
---

# Phase 104 Plan 10: LivOS Heartbeat Client (v34 seed) Summary

First client-side piece of v34 — LivOS ↔ livinity.io account integration. When the operator installs LivOS with `install.sh --mode tunnel --api-key liv_k_...` (or any mode + `--api-key`, since 104-09 made the flag orthogonal), livinityd's boot path arms a background heartbeat-sender. Every 60s it POSTs a ~200-byte JSON envelope to `https://livinity.io/api/devices/heartbeat` authenticating with `X-Api-Key: liv_k_...`. When Server5 ships the matching `/api/devices/heartbeat` route in a separate v34.x phase, the `devices.last_seen` column updates and the "is your box online" dashboard widget lights up — with ZERO LivOS-side code change required.

## One-Liner

A native-fetch heartbeat client with 10s AbortController timeout, self-rescheduling setTimeout, log-once-per-restart status handling, and guarded boot-wire so plain LAN-only installs get ZERO Server5 traffic and ZERO log spam — preserving D-104-RELAY-ZERO-DATA-PLANE for the data-plane while ~12KB/day of control-plane heartbeat is explicitly allowed.

## What Shipped

### Task 1 — account/ module (commit `dc3d4044`)

`livos/packages/livinityd/source/modules/account/` (NEW directory, 9 files):

**`api-key.ts`** (88 lines): Reads the marketplace API key written by 104-09's `--api-key liv_k_...` flag.

- `readApiKey(redis)` → `{apiKey, path} | null`. Reads Redis pointer key `livos:account:api_key_path` (104-09 set this), then reads the file at that path. Returns null on: missing Redis key, missing file, empty file, whitespace-only file, content not starting with `liv_k_`. NEVER throws — caller treats null as "skip this round, don't crash".
- `redactedPreview(apiKey)` → `string`: produces `liv_k_<6-chars>***` for log lines. Never returns more than 15 chars total. Returns `<malformed>` for non-`liv_k_*` inputs.
- Re-exports the canonical Redis key name as `REDIS_KEY_API_KEY_PATH = 'livos:account:api_key_path'` for callers (Livinityd boot guard).

**`device-id.ts`** (76 lines): Stable per-box UUIDv4 for the heartbeat payload.

- `getOrCreateDeviceId(path = '/var/lib/livos/device-id')` → `string`. First call: generates UUIDv4 via `crypto.randomUUID()` (Node built-in), persists with mode 0600 (best-effort `chmod` retry), returns. Subsequent calls: reads, validates against UUID v4 regex, returns. Regenerates if the on-disk content is malformed (operator-edited → silent re-pair). Uses `mkdir({recursive: true})` so the parent dir is auto-created.

**`heartbeat-payload.ts`** (74 lines): Pure builder for the JSON envelope.

- `buildHeartbeatPayload({deviceId, mode, version, hostname?, ip?, uptime?, nodeVersion?})` → `HeartbeatPayload`. Pure function. Defaults: `hostname = os.hostname()`, `ip = detectPrimaryIPv4()`, `uptime = floor(process.uptime())`, `nodeVersion = process.version`.
- `detectPrimaryIPv4()` → `string | null`. Walks `os.networkInterfaces()`, returns the first non-internal IPv4. Never returns loopback.
- Payload shape: `{device_id, hostname, mode, version, ip, uptime, node_version}` — forward-compat with Server5's `devices` table column names (104-09 audit).

**`heartbeat-sender.ts`** (235 lines): The main module.

- `startHeartbeat({url, intervalSec?, redis, version, logger?, deviceIdPath?, fetchImpl?})` → `StopHandle` (callable to stop). Uses `globalThis.fetch` (Node 18+) — no axios dep. Defaults: `intervalSec = 60`. Internally:
  - 10s `AbortController` timeout per POST so a hung Server5 cannot leak fetch promises into livinityd.
  - Self-rescheduling `setTimeout` (NOT `setInterval`) — each tick fully resolves before the next is armed. Slow Server5 cannot pile up ticks.
  - Reads API key fresh each tick (file may rotate mid-run; we auto-recover without livinityd restart).
  - Status matrix:
    - 2xx → log verbose, continue
    - 401 → log error ONCE, STOP heartbeat (revoked key — don't spam)
    - 404 → log warn ONCE per restart (`warned404` flag), then verbose; expected pre-Server5-route ship
    - 429 → log warn, continue (server controls cadence)
    - 5xx → log warn, continue
    - other 4xx → log warn, continue
    - network err / timeout / DNS fail → log warn, continue
  - First tick fires AFTER `intervalMs`, NOT immediately on start (avoids thundering-herd on fleet update.sh deploys).
  - API key flows via `X-Api-Key` header only; NEVER embedded in body. Body is JSON `Content-Type: application/json`. Cosmetic `User-Agent: LivOS-heartbeat/<version>` helps Server5 access logs.
- Returns `stop()` function for graceful shutdown — clears the pending timeout, sets `stopped = true` so any in-flight tick short-circuits before scheduling further intervals.

**`index.ts`** (18 lines): Barrel export — `readApiKey`, `redactedPreview`, `REDIS_KEY_API_KEY_PATH`, `getOrCreateDeviceId`, `DEVICE_ID_PATH`, `buildHeartbeatPayload`, `detectPrimaryIPv4`, `startHeartbeat`, all relevant types.

**Tests (4 vitest files, 43 tests, 3.34s total):**

- `api-key.test.ts` (12 tests): `redactedPreview` shape + safe-tail-length + malformed input; Redis key constant value; happy path; null branches (Redis unset, ENOENT, empty, malformed-prefix, Redis transient error); export-surface security guardrail (only 3 exports — no raw-key serializer).
- `device-id.test.ts` (8 tests): UUIDv4 v4-shape; idempotent re-reads; malformed-file regeneration; recursive parent-dir mkdir; mode 0600 (POSIX-only assert); statistical uniqueness across paths; whitespace tolerance on pre-existing file; chmod retry-path is non-fatal.
- `heartbeat-payload.test.ts` (13 tests): full shape contract; every input override (hostname / uptime / ip / nodeVersion); default behaviors; JSON serialization roundtrip; control-plane <1KB budget guard; `detectPrimaryIPv4` validity + no-loopback.
- `heartbeat-sender.test.ts` (10 tests): happy path with header+body capture; 404 log-once + verbose-suppression; 401 stop+error + no further POSTs; 5xx warn+retry; 429 warn+retry; network-err warn+retry; missing-API-key warn-once + no POST; `stop()` lifecycle; SECURITY raw-key-tail-never-logged across full happy-path; first-tick-after-interval (not immediate).

### Task 2 — Livinityd boot + shutdown wire (commit `d5769318`)

`livos/packages/livinityd/source/index.ts` (EDIT, +87 lines):

**Imports block:**
```ts
import {startHeartbeat, REDIS_KEY_API_KEY_PATH, type StopHandle as HeartbeatStopHandle} from './modules/account/index.js'
```

**Class field:**
```ts
private stopHeartbeat?: HeartbeatStopHandle
```

**`Livinityd.start()`** (NEW guarded block AFTER `seedDefaultAliases()`, BEFORE the streaming subsystem block — placement chosen so Redis is connected and we're past Phase-61 broker bootstrap but before per-display stream wiring):

```ts
try {
  const apiKeyPath = await this.ai.redis.get(REDIS_KEY_API_KEY_PATH)
  if (apiKeyPath) {
    const heartbeatLogger = (() => { ... adapter ... })()
    const url = process.env.LIVOS_HEARTBEAT_URL ?? 'https://livinity.io/api/devices/heartbeat'
    const intervalSec = Number(process.env.LIVOS_HEARTBEAT_INTERVAL_SEC ?? '60')
    this.stopHeartbeat = startHeartbeat({url, intervalSec, redis: this.ai.redis, version: this.version, logger: heartbeatLogger})
    this.logger.log(`Heartbeat sender wired (...)`)
  } else {
    this.logger.verbose(`Heartbeat sender NOT armed (no --api-key at install time)`)
  }
} catch (err) {
  this.logger.error('Failed to wire heartbeat sender (non-fatal)', err)
}
```

**`Livinityd.stop()`** (NEW early call AFTER `backups.stop()`, BEFORE WebApp/Xvfb teardown — placement chosen so the setTimeout chain unwinds while redis + fetch are still healthy):

```ts
try {
  this.stopHeartbeat?.()
} catch (err) {
  this.logger.error('Failed to stop heartbeat sender', err)
}
```

### Task 3 — SUMMARY + STATE + ROADMAP (this commit)

This document. STATE.md gets a new "## 104-10 Status" block prepended above 104-09's; ROADMAP.md gets plan count `9 plans → 10 plans` + new `104-10-PLAN.md` plan-row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fake-timer ↔ self-rescheduling-setTimeout race in heartbeat-sender.test.ts**
- **Found during:** Task 1 — first vitest run on heartbeat-sender.test.ts (9 of 10 tests failed; only happy-path 404 + missing-API-key passed because they finished within the available microtask flushes).
- **Issue:** Initial test pattern used `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(60000)` + 2× `await Promise.resolve()` to drive each tick of the production code's `setTimeout(() => void sendOnce().finally(() => schedule()), intervalMs)` chain. The microtask flush count was insufficient — `sendOnce()`'s `await readApiKey()` + `await getOrCreateDeviceId()` + `await fetchImpl()` + `await response.text()` chain needs MANY more event-loop turns than 2 `Promise.resolve()`s provide. Result: assertions fired BEFORE the async fetch resolved → false negatives.
- **Fix:** Rewrote all 10 heartbeat-sender tests to use REAL timers with a sub-second interval (`intervalSec: 0.05` = 50ms) + `await sleep(N * 50ms)` to wait wall-clock for N intervals to fire. Slower per-test (50-550ms each) but eliminates the timing race entirely. Total suite time: 3.34s for all 43 tests — acceptable for unit-test feedback.
- **Production code is correct** — the self-rescheduling setTimeout chain is the right shape for production (slow Server5 cannot pile up ticks). The test-side timing-mock pattern was the bug, not the implementation.
- **Files modified:** `livos/packages/livinityd/source/modules/account/heartbeat-sender.test.ts` (in-place inside Task 1)
- **Commit:** `dc3d4044` (Task 1 — single commit)

**2. [Rule 1 - Bug] `RequestInfo` global type unavailable in livinityd's `@tsconfig/node22` setup**
- **Found during:** Task 1 — `npx tsc --noEmit` after writing tests showed 2× `error TS2552: Cannot find name 'RequestInfo'`.
- **Issue:** The DOM `RequestInfo` type isn't exposed by `@tsconfig/node22` (Node-only ambient types). Production code uses `string` URL (matches what `startHeartbeat` actually passes), so the DOM type wasn't needed.
- **Fix:** Replaced `RequestInfo | URL` with `string | URL` in test-helper signatures. No runtime change.
- **Files modified:** `livos/packages/livinityd/source/modules/account/heartbeat-sender.test.ts` (in-place inside Task 1)
- **Commit:** `dc3d4044` (Task 1 — same commit as Fix #1)

### Auto-added Functionality

**1. [Rule 2 - Correctness] `redactedPreview()` helper + dedicated SECURITY test**
- **Rationale:** Plan listed "API key never logged in plaintext" as a success-criterion bullet point. To make this actually enforceable rather than aspirational, shipped a dedicated `redactedPreview()` helper in `api-key.ts` (always returns `liv_k_<6-chars>***`, never more than 15 chars total) + a dedicated test that runs the full happy-path POST flow with real `fetchImpl` capture and then greps every captured log entry for the raw secret tail. If any log line contains the unredacted tail, the test fails.
- **Files added:** Logic in `api-key.ts:redactedPreview`; test in `heartbeat-sender.test.ts:'SECURITY: API key value is NEVER logged in plaintext'`.

**2. [Rule 2 - Robustness] Log-once-per-restart 404 handling**
- **Rationale:** Plan said "404 → log warn once per restart". To make this actually robust against journal spam over the box's life (a livinityd process can run weeks; 60s ticks × weeks × 404s = 10K+ duplicate log lines), implemented an explicit `warned404` boolean flag + downgrade-to-verbose for subsequent 404s. Same pattern applied to `warnedMalformedKey`.
- **Files added:** State flags in `heartbeat-sender.ts`; dedicated test in `heartbeat-sender.test.ts:'404 from Server5: logs warn ONCE per restart, keeps retrying silently'`.

**3. [Rule 2 - Lifecycle] `stop()` short-circuits in-flight ticks**
- **Rationale:** Plan said "register cleanup on SIGTERM/SIGINT: call stopHeartbeat() before exit". To prevent late-tick log lines after stop() is called (e.g. a setTimeout that fires AFTER the cleanup but before the process exits), the `stopped` flag is checked at the top of `sendOnce()` AND at the top of `schedule()`. Either path short-circuits cleanly.
- **Files added:** State flag in `heartbeat-sender.ts:sendOnce` + `schedule`; dedicated test in `heartbeat-sender.test.ts:'stop() prevents further POSTs from being scheduled'`.

No architectural changes (Rule 4) needed; no authentication gates encountered (heartbeat sender treats 401 as a known stop-state, not a checkpoint); no checkpoint:* tasks in this plan.

## Threat Surface Scan

New network egress surface: livinityd now makes outbound POST to `https://livinity.io/api/devices/heartbeat` every 60s (only when 104-09 wrote the API key file).

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-network-endpoint | `livos/packages/livinityd/source/modules/account/heartbeat-sender.ts` | New egress to `https://livinity.io` (configurable via `LIVOS_HEARTBEAT_URL`). 10s AbortController timeout. ~12KB/day egress at default 60s interval. ZERO inbound — outbound POST only, no callback / no server / no listening socket. |
| threat_flag: new-secret-read | `livos/packages/livinityd/source/modules/account/api-key.ts` | Reads `/etc/livos/secrets/api-key` (104-09 wrote this) at every heartbeat tick. File is mode 0600. Read is via `fs.readFile`, no shell. Key value travels in HTTP `X-Api-Key` header only — NEVER embedded in body, NEVER logged in plaintext, NEVER on any subprocess argv. Refused on disk content not starting with `liv_k_` (refuses to send malformed keys to Server5). |
| threat_flag: new-filesystem-write | `livos/packages/livinityd/source/modules/account/device-id.ts` | Writes `/var/lib/livos/device-id` (mode 0600, recursive mkdir of parent dir). UUIDv4 content only — no secret material. Idempotent: subsequent reads return the existing UUID. |

## Sacred SHA Verification

`liv/packages/core/src/sdk-agent-runner.ts` git-hash-object value verified UNTOUCHED at `f3538e1d811992b782a9bb057d1b7f0a0189f95f` across all 3 plan-10 commits (pre-commit hook `.husky/pre-commit` + `scripts/check-sacred.sh` fired and passed on every commit).

## Verification Snippets

```bash
# Sacred SHA preserved (run after every commit):
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f

# Account module tests pass (3.34s):
cd livos/packages/livinityd && npx vitest run source/modules/account --reporter dot
# Expected: Test Files 4 passed (4), Tests 43 passed (43)

# Heartbeat module structure:
ls livos/packages/livinityd/source/modules/account/
# Expected: api-key.test.ts, api-key.ts, device-id.test.ts, device-id.ts,
#           heartbeat-payload.test.ts, heartbeat-payload.ts,
#           heartbeat-sender.test.ts, heartbeat-sender.ts, index.ts

# NO new npm deps:
git diff HEAD~3 -- livos/packages/livinityd/package.json
# Expected: (no output — package.json unchanged)

# D-104-RELAY-ZERO-DATA-PLANE comment present:
grep -c "RELAY-ZERO-DATA-PLANE" livos/packages/livinityd/source/modules/account/heartbeat-sender.ts
# Expected: at least 1

# Forward-compat 404 handling present:
grep -c "404" livos/packages/livinityd/source/modules/account/heartbeat-sender.ts
# Expected: at least 2 (one comment block + one branch)
```

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/account/api-key.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/device-id.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/heartbeat-payload.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/heartbeat-sender.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/index.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/api-key.test.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/device-id.test.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/heartbeat-payload.test.ts`: FOUND
- File `livos/packages/livinityd/source/modules/account/heartbeat-sender.test.ts`: FOUND
- File `livos/packages/livinityd/source/index.ts` modified: confirmed (boot + shutdown wire)
- Commit `dc3d4044`: FOUND in git log (Task 1 — account/ module)
- Commit `d5769318`: FOUND in git log (Task 2 — Livinityd wire)
- Tests: `npx vitest run source/modules/account` → 43 PASS, 0 FAIL
- Sacred SHA `f3538e1d…` matches `git hash-object liv/packages/core/src/sdk-agent-runner.ts`
- `package.json` UNTOUCHED (no new npm deps)
- D-104-RELAY-ZERO-DATA-PLANE comment block present in `heartbeat-sender.ts`
- 404 forward-compat path present in source + verified by dedicated test
- SECURITY: raw API key tail NEVER appears in test-captured log entries (asserted by dedicated test)
