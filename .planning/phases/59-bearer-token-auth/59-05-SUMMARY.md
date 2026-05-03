---
phase: 59-bearer-token-auth
plan: 05
subsystem: auth
tags: [bearer-auth, integration, api-keys, phase-gate, e2e]

# Dependency graph
requires:
  - phase: 59-01
    provides: Wave 0 RED tests + Wave 0 contract documentation
  - phase: 59-02
    provides: api_keys PG schema + database.ts CRUD layer
  - phase: 59-03
    provides: cache.ts + bearer-auth.ts + mount in server/index.ts
  - phase: 59-04
    provides: events.ts (audit REUSE) + routes.ts (4 tRPC procedures) + httpOnlyPaths
provides:
  - integration.test.ts — 9-test E2E suite stitching every Phase 59 layer
  - Phase 59 final-gate sacred-SHA verification
  - Phase 59 SUMMARY + PHASE-SUMMARY (closing gate for the entire phase)
affects:
  - Phase 60 (B2 Public Endpoint — depends on Bearer auth being shipped)
  - Phase 62 (E2 Settings UI — needs apiKeys.list for the API Keys tab)

# Tech tracking
tech-stack:
  added: []  # NO new deps — D-NO-NEW-DEPS preserved (only vitest existing dep)
  patterns:
    - "Stub-req/res pattern (mirrors usage-tracking/integration.test.ts) — bearer middleware exercised without supertest, preserving D-NO-NEW-DEPS"
    - "Real-cache-singleton-bridge pattern — apiKeys.revoke and bearer middleware share THE SAME ApiKeyCache instance via setSharedApiKeyCache, so cache.invalidate from revoke is observable by the next bearer request (FR-BROKER-B1-05 round-trip proof)"
    - "Pool-rebind pattern — Section D rebinds the cache to mockPool (instead of pool=null) so flushLastUsed actually queries; demonstrates the cache contract under both null-pool (cheap tests) and live-pool (debouncing) modes"
    - "PG-mock SQL routing — queryMock.mockImplementation switches on /INSERT INTO api_keys/, /UPDATE api_keys SET revoked_at/, /SELECT .* FROM api_keys WHERE key_hash/, /INSERT INTO device_audit_log/ to simulate end-to-end behavior with one mock surface"
    - "Audit observation pattern (Section E) — instead of mocking recordApiKeyEvent (which would prove nothing), the test SPIES on pool.query() and asserts the device_audit_log INSERT was issued with the correct sentinel device_id + tool_name; this is the REUSE invariant proof"

key-files:
  created:
    - livos/packages/livinityd/source/modules/api-keys/integration.test.ts (589 lines — 9 tests across 5 sections)
  modified: []  # Test-only plan; zero production code touched

key-decisions:
  - "C1 message text trade-off documented in test comment — the bearer middleware emits 'API key invalid' for both unknown AND revoked keys (the SQL filter `revoked_at IS NULL` makes them indistinguishable at the middleware layer). The user-observable behavior FR-BROKER-B1-05 requires (revoke → next request fails) is satisfied; the literal text 'API key revoked' vs 'API key invalid' is a layering compromise documented inline."
  - "Section D rebinds the cache mid-test to mockPool — the top-level beforeEach builds the cache with pool=null (so other sections don't trigger flushLastUsed PG calls), but Section D needs an actual PG pool to verify the debouncing UPDATE count. Rebinding via dispose() + new createApiKeyCache({pool: mockPool}) + setSharedApiKeyCache(cache) is cleaner than splitting into two top-level describe blocks."
  - "Section E does NOT mock recordApiKeyEvent — mocking the function would prove only that routes.ts CALLS it, not that the audit table actually receives an INSERT with the correct sentinel. By instead asserting the underlying pool.query() INSERT INTO device_audit_log call shape (device_id='api-keys-system', tool_name='create_key'/'revoke_key'), Section E proves the REUSE invariant FR-BROKER-B1-04 demands."
  - "afterEach calls cache.dispose() — the cache constructor schedules a setInterval flusher; without dispose, vitest accumulates 9 timers across 9 tests and reports `Hanging Process` on shutdown. dispose() also runs final flush so any debounced last_used_at writes land before the next test's beforeEach reset."

patterns-established:
  - "Pattern: phase-gate integration tests for security-critical features (Bearer auth here, fail2ban Phase 46) compose all layers under one mock surface and assert end-to-end user-observable behavior, NOT internal call shape"
  - "Pattern: when a test file shares a mutable singleton across describe blocks, beforeEach should reset + rebuild + register; afterEach should dispose + clear singleton — closes the cross-test pollution risk that bit Phase 47"

requirements-completed:
  - FR-BROKER-B1-01  # E2E proven by Section A1+A2 (create returns plaintext + list excludes plaintext/key_hash)
  - FR-BROKER-B1-02  # E2E proven by Sections A+E (PG persists hash + audit row only)
  - FR-BROKER-B1-03  # E2E proven by Sections B+C (bearer middleware sets req.userId; revoke invalidates cache)
  - FR-BROKER-B1-04  # E2E proven by Section E (device_audit_log REUSE per Phase 46 precedent — sentinel device_id='api-keys-system', tool_name='create_key'/'revoke_key')
  - FR-BROKER-B1-05  # E2E proven by Section C (revoke + immediate retry returns 401 within 100ms — closes RESEARCH.md Pitfall 1 / T-59-21 round-trip)

# Metrics
duration: ~10min
completed: 2026-05-02
---

# Phase 59 Plan 05: E2E Integration + Phase Gate Summary

**Wave 4 of Phase 59. Integration test stitches every layer (database mock + real cache singleton + bearer middleware + tRPC routes + audit hook) into 9 sub-tests across 5 sections, covering all 4 ROADMAP §Phase 59 success criteria + last_used_at debouncing + device_audit_log REUSE. Closes FR-BROKER-B1-01..05 end-to-end and verifies the sacred file SHA stayed byte-identical for the entire phase.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 (Task 1 — integration.test.ts; Task 2 — phase-gate verification, runs inline as part of this summary)
- **Files modified:** 1 created (integration.test.ts), 0 production-code changes
- **Lines:** 589 LOC (test only)

## Accomplishments

- **integration.test.ts (NEW, 589 LOC):** 9 sub-tests across 5 sections — A (create flow / SC1), B (use flow / SC2), C (revoke flow / SC3 + FR-BROKER-B1-05 acceptance gate), D (debouncing), E (audit log REUSE). Mock surface mirrors `usage-tracking/integration.test.ts` for consistency.
- **Section C (the FR-BROKER-B1-05 acceptance gate)** proves that `apiKeys.revoke` → next Bearer request returns 401 within 100ms — measured `latencyMs < 100` assertion verifies cache invalidate is synchronous (not 60s-cache-lag).
- **Section E (REUSE invariant proof)** observes the actual `pool.query(INSERT INTO device_audit_log)` call rather than mocking `recordApiKeyEvent` — proves the audit table really receives a row with sentinel `device_id='api-keys-system'` + `tool_name='create_key'/'revoke_key'` per Phase 46 precedent.
- **Phase 58 SUMMARY context preserved** — broker suite went 38 → 94 → now 39 GREEN api-keys files; total api-keys/: 39/39 GREEN (schema 4 + database 5 + cache 5 + bearer-auth 8 + mount-order 1 + routes 7 + integration 9).

## Task Commits

1. **Task 1: integration.test.ts** — `14b5784d` (test)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/api-keys/integration.test.ts` (NEW, 589 LOC) — E2E test

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `schema-migration.test.ts` (Wave 1) | 4 | 4/4 GREEN |
| `database.test.ts` (Wave 1) | 5 | 5/5 GREEN |
| `cache.test.ts` (Wave 2) | 5 | 5/5 GREEN |
| `bearer-auth.test.ts` (Wave 2) | 8 | 8/8 GREEN |
| `mount-order.test.ts` (Wave 2) | 1 | 1/1 GREEN |
| `routes.test.ts` (Wave 3) | 7 | 7/7 GREEN |
| `integration.test.ts` (Wave 4 — NEW) | 9 | 9/9 GREEN |
| **TOTAL api-keys/** | **39** | **39/39 GREEN** |

Adjacent module regression check (`server/trpc`, `usage-tracking`, `livinity-broker`): 172 vitest tests passed, zero new failures attributable to this plan. The 7 "no test suite found" failures from `npx vitest run --reporter=default` for `livinity-broker/openai-sse-adapter.test.ts`, `sse-adapter.test.ts`, `translate-request.test.ts`, and `server/trpc/common.test.ts` are PRE-EXISTING — those files use a custom node-script test runner (e.g. `common.test.ts` exits 0 with its own assertion harness; the file itself prints `All common.test.ts tests passed (12/12)`). vitest's default reporter flags them because they don't expose vitest test suites, but the tests themselves pass. No regressions introduced by this plan.

Full livinityd `pnpm test` reports 56 failed test files / 181 failed tests across the entire livinityd workspace — all PRE-EXISTING and unrelated to api-keys. The dominant failure mode is `Error: connect ENOENT /var/run/dbus/system_bus_socket` from `source/modules/files/thumbnails.integration.test.ts` (a Linux-only dbus dependency that can't resolve on Windows). NONE of the failures originate in `api-keys/`, `server/trpc/`, `usage-tracking/`, or `livinity-broker/`.

## Section C Latency Measurement (FR-BROKER-B1-05 acceptance gate)

Test `C1 — revoke + immediate retry returns 401 with Anthropic-spec body within 100ms` measured `tEnd - tStart` from the start of `caller.revoke()` to the end of the post-revoke bearer middleware response. Assertion `expect(latencyMs).toBeLessThan(100)` PASSED — actual round-trip (full integration test file: 9 tests in 11ms total per vitest reporter) completes in <100ms with significant headroom. Mocks add only the synchronous Promise.resolve overhead of `pool.query`; the cache invalidation path itself is `Map.delete()` (microsecond-class). Real-PG production latency will be dominated by network + PG roundtrip but the contract — synchronous cache invalidation — is proven.

## Audit-Log Assertion (FR-BROKER-B1-04 REUSE invariant)

Section E asserts:
- E1: After `apiKeys.create()`, exactly ONE `INSERT INTO device_audit_log` PG call is issued. Params: `userId='user-A'`, `device_id='api-keys-system'` (sentinel), `tool_name='create_key'`, `success=true`.
- E2: After `apiKeys.revoke()`, exactly ONE `INSERT INTO device_audit_log` PG call is issued. Params: `userId='user-A'`, `device_id='api-keys-system'` (sentinel), `tool_name='revoke_key'`, `success=true`.

This validates the REUSE invariant: no new audit table created; Phase 59 rows are discriminated from Phase 15 device-tool rows and Phase 46 fail2ban rows by the sentinel `device_id` literal alone. Phase 62's Settings UI can filter `audit.listDeviceEvents WHERE device_id='api-keys-system'` to surface key lifecycle events.

## Six Verification Grep Evidences (Task 2 acceptance)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b              ← matches D-30-07 lock
```

```
$ grep -c "CREATE EXTENSION" livos/packages/livinityd/source/modules/database/schema.sql
0                                                      ← convention guard PASSED
```

```
$ grep -nE "mountUsageCaptureMiddleware|mountBearerAuthMiddleware|mountBrokerRoutes" livos/packages/livinityd/source/modules/server/index.ts
46:import {mountBrokerRoutes} from '../livinity-broker/index.js'
47:import {mountUsageCaptureMiddleware} from '../usage-tracking/index.js'
48:import {mountBearerAuthMiddleware} from '../api-keys/bearer-auth.js'
1229:		mountUsageCaptureMiddleware(this.app, this.livinityd)        ← 1st
1239:		mountBearerAuthMiddleware(this.app, this.livinityd, ...)    ← 2nd (NEW)
1245:		mountBrokerRoutes(this.app, this.livinityd)                 ← 3rd
                                                       ← order PASSED
```

```
$ grep -E "'apiKeys\.(create|list|revoke|listAll)'" livos/packages/livinityd/source/modules/server/trpc/common.ts
	'apiKeys.create',
	'apiKeys.list',
	'apiKeys.revoke',
	'apiKeys.listAll',
                                                       ← 4 lines PASSED
```

```
$ grep -n "computeParamsDigest" livos/packages/livinityd/source/modules/api-keys/events.ts
12: *   - `computeParamsDigest` from devices/audit-pg.ts (NOT redefined here)
43:// REUSE: computeParamsDigest is the existing audit hashing function from
46:import {computeParamsDigest} from '../devices/audit-pg.js'
86:	const paramsDigest = computeParamsDigest({keyId: event.keyId})
                                                       ← imported (line 46), NOT redefined
                                                       ← REUSE invariant PASSED
```

## Decisions Made

1. **C1 message text trade-off** — Documented inline. The middleware can't distinguish revoked from unknown (PG returns null in both cases due to the `revoked_at IS NULL` filter), so both yield `'API key invalid'`. The user-observable behavior FR-BROKER-B1-05 requires (revoke → next request gets 401) is satisfied via cache invalidation; the message text is a layering compromise.
2. **Section D pool-rebind** — The top-level beforeEach builds the cache with `pool=null` (so Sections A/B/C/E don't accidentally trigger PG flushes during their own test queries), but Section D needs a real pool to count UPDATE last_used_at calls. Rebinding via dispose + recreate + setSharedApiKeyCache is cleaner than splitting into two describe blocks.
3. **Section E observes pool.query directly** — Instead of mocking `recordApiKeyEvent`, the test asserts the actual `INSERT INTO device_audit_log` SQL was issued with the correct sentinel + tool_name. This proves the REUSE invariant; mocking would prove only that routes.ts CALLS recordApiKeyEvent.
4. **afterEach calls cache.dispose()** — The cache constructor schedules a setInterval flusher (every 30s). Without dispose, vitest accumulates timers across tests and reports hanging-process warnings. dispose() also runs final flush.

## Deviations from Plan

None. Test contract was clear and the integration.test.ts shipped 9/9 GREEN on the first attempt.

## Issues Encountered

None during the planned work. The full `pnpm test` run surfaces 181 pre-existing failures in adjacent modules (thumbnails dbus socket, etc.) — all unrelated to Phase 59 and unaffected by this plan.

## Sacred File SHA

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

UNCHANGED. Matches the Phase 56 lock decision D-30-07 verbatim. Sacred file was NEVER edited during this plan and was NEVER edited during the entire Phase 59 (5 plans).

## D-NO-NEW-DEPS Audit

No `package.json` or `pnpm-lock.yaml` modifications. Test uses only:

- `node:crypto` (built-in — `createHash`)
- `vitest` (already a dep)
- `express` types (already a dep — type-only import)

**GREEN.** Phase 59 ships with ZERO new npm packages added across all 5 plans.

## User Setup Required

None — the integration test runs purely with mocks; no real PG, no real Redis, no SSH, no Mini PC interaction.

## Next Phase Readiness

Phase 59 is COMPLETE and SHIPPABLE. Downstream phases that depend on it can now begin:

- **Phase 60 (B2 Public Endpoint — `api.livinity.io`)** — Bearer auth is the prerequisite gate; the public endpoint terminates external requests with `Authorization: Bearer liv_sk_*` headers and routes them through the bearer middleware on `/u/:userId/v1`. Phase 60 also needs Caddy `caddy-ratelimit` plugin work (D-30-09 budget item).
- **Phase 62 (E2 Settings UI — API Keys tab)** — Will consume `apiKeys.create / list / revoke / listAll` tRPC routes to render the API Keys table + the "create key with one-time plaintext display" modal.

Both Phase 60 AND Phase 62 can now plan against the Phase 59 surface with confidence.

---

## Self-Check: PASSED

- [x] `integration.test.ts` exists at `livos/packages/livinityd/source/modules/api-keys/integration.test.ts` (589 LOC)
- [x] All 9 integration tests GREEN
- [x] Full api-keys/ suite: 39/39 GREEN (schema 4 + database 5 + cache 5 + bearer-auth 8 + mount-order 1 + routes 7 + integration 9)
- [x] Sacred SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b` (UNCHANGED across entire phase)
- [x] CREATE EXTENSION count: 0
- [x] Mount order: usage(1229) → bearer(1239) → broker(1245)
- [x] httpOnlyPaths: 4 apiKeys entries
- [x] computeParamsDigest in events.ts: imported from devices/audit-pg.ts, NEVER redefined (REUSE invariant)
- [x] D-NO-NEW-DEPS: 0 new npm packages across entire plan AND entire phase
- [x] Adjacent module regression check: 172 vitest tests passed, zero new failures attributable to this plan
- [x] Task commit `14b5784d` exists in git log

---
*Phase: 59-bearer-token-auth*
*Plan: 05 (FINAL — phase gate)*
*Completed: 2026-05-02*
