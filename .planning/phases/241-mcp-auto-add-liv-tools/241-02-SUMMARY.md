---
phase: 241-mcp-auto-add-liv-tools
plan: 02
subsystem: livinityd / mcp-registrar
tags: [livinityd, mcp, aionui, http-client, abortcontroller, readiness-poll, tdd, vitest]

# Dependency graph
requires:
  - phase: 241
    plan: 01
    provides: types.ts (AionUiCreateMcpServerRequest, AionUiServerRecord, SeedLogger)
  - phase: 223
    provides: liv-assistant systemd service on port 3020 (AionUi 2.1.4) — consumed at runtime, not test
provides:
  - AionUiMcpClient class — 5 typed HTTP methods (listServers, findByName, createServer, toggleServer, syncToAgents)
  - AionUiSyncResult type — outer envelope + per-agent results for partial-failure visibility
  - waitForAionUiReady(baseUrl, logger, opts) — D-241-06 readiness poller with optional Pitfall-5 layered probe
  - ReadyPollOptions type — totalTimeoutMs / pollIntervalMs / perAttemptTimeoutMs / mcpServersProbe
  - Module barrel index.ts re-exports both APIs
affects: [241-03 (orchestrator consumes both APIs via DI), 241-04 (boot wire-up indirect)]

# Tech tracking
tech-stack:
  added: [] # zero new deps — Node 22 stdlib fetch/AbortController + vitest (already present)
  patterns:
    - "Single fetchJson chokepoint per HTTP client (AbortController + clearTimeout in finally — no listener leaks)"
    - "while(Date.now()<deadline) polling pattern (matches livinityd outbound-HTTP code style)"
    - "TDD: separate RED commit (failing tests) + GREEN commit (implementation) per task"
    - "vi.stubGlobal('fetch', vi.fn()) for unit tests + Response-as-unknown cast to dodge undici-types drift"

key-files:
  created:
    - livos/packages/livinityd/source/modules/mcp-registrar/aionui-client.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/ready-poll.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/aionui-client.test.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/ready-poll.test.ts
  modified:
    - livos/packages/livinityd/source/modules/mcp-registrar/index.ts # added two named exports

key-decisions:
  - "AionUiMcpClient.syncToAgents returns AionUiSyncResult (NOT void) so the 241-03 orchestrator can inspect per-agent partial failures without re-fetching"
  - "Per-call AbortController timeout funneled through ONE private fetchJson method — single chokepoint for timer-cleanup discipline (Pitfall: leaked Promise listeners)"
  - "ready-poll Pitfall-5 layered probe is opt-in (mcpServersProbe option) — default callers just probe /api/settings/client; orchestrator (241-03) opts in"
  - "Final-attempt-only warn log in ready-poll — keeps boot journal quiet during normal 6-8s AionUi tsx startup; one warn line only when the 60s budget is exhausted"
  - "TDD strict gate sequence per task: test (RED) commit precedes feat (GREEN) commit — 4 commits total for 2 tasks"

patterns-established:
  - "AionUi HTTP client shape: constructor(baseUrl, perCallTimeoutMs=5000); every method funnels through private fetchJson<T>(url, init) returning ApiEnvelope<T>"
  - "Readiness poll shape: while(Date.now()<deadline) + probeOnce() helper + sleep() helper; default 60_000ms total / 2_000ms interval / 1_500ms per-attempt"
  - "Test mock pattern: vi.stubGlobal + fetchMock.mockResolvedValueOnce / mockImplementationOnce; for abort tests, manually wire abortlistener that rejects with AbortError"
  - "Response-cast workaround: `new Response(...) as unknown as Response` to side-step undici-types vs Node global Response 'bytes' property drift (TS2741)"

requirements-completed: [] # plan 241-02 frontmatter requirements field is null

# Metrics
duration: 6min
completed: 2026-05-28
---

# Phase 241 Plan 02: AionUi HTTP client + readiness poller Summary

**AionUiMcpClient (5 probe-verified HTTP methods) + waitForAionUiReady (D-241-06 readiness loop with optional Pitfall-5 layered probe) — 4 new files (2 source + 2 test) under `livos/packages/livinityd/source/modules/mcp-registrar/`, 14 new unit tests green (28 cumulative for the module), zero new dependencies.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-28T00:28:42Z
- **Completed:** 2026-05-28T00:34:44Z
- **Tasks:** 2 (both TDD with separate RED + GREEN commits = 4 commits total for this plan)
- **Files created:** 4 (2 source + 2 test)
- **Files modified:** 1 (`index.ts` — added two named exports)

## Accomplishments

- **`AionUiMcpClient`** ships with 5 typed methods (`listServers`, `findByName`, `createServer`, `toggleServer`, `syncToAgents`) wrapping the 5 probe-verified Mini PC endpoints. Every method funnels through a single private `fetchJson<T>(url, init)` that owns the `AbortController` + `clearTimeout` pair — no timer references escape the try/finally block, so no Promise listener leaks. 9 vitest cases cover happy path + 4xx envelope error + abort/timeout + partial-failure exposure for each method.
- **`waitForAionUiReady`** ships as a pure async function implementing D-241-06 verbatim: 2_000 ms outer poll, 1_500 ms per-attempt abort, 60_000 ms total deadline. The Pitfall 5 mitigation (also probing `GET /api/mcp/servers` after `/api/settings/client` passes) is opt-in via `{mcpServersProbe: true}` so default callers don't pay the cost. Final-attempt-only `warn` log keeps the journal quiet during normal 6-8 s AionUi tsx boots. 5 vitest cases cover first-hit / ECONNREFUSED-retry / 60s-timeout / per-attempt-abort / Pitfall-5-layered-probe.
- **Zero new dependencies** — Node 22 stdlib `fetch` + `AbortController` + the existing vitest devDep.
- **Pitfall guards baked into the code AND the acceptance criteria:**
  - Pitfall 3 (wrong endpoint): zero references to `/api/extensions/mcp-servers` anywhere in the registrar module after the GREEN commit + post-commit doc-comment cleanup.
  - Pitfall 4 (`enabled` in createServer body): `JSON.stringify({enabled})` appears only inside `toggleServer` — never in the `createServer` payload.
- **Module barrel grows cleanly** — `index.ts` now re-exports `AionUiMcpClient`, `AionUiSyncResult`, `waitForAionUiReady`, `ReadyPollOptions` alongside the 241-01 symbols. Plans 241-03 / 241-04 can import everything from `./mcp-registrar/index.js`.

## Task Commits

Each task followed TDD (RED commit then GREEN commit) and was committed atomically:

1. **Task 1 RED: failing AionUiMcpClient tests (9 cases)** — `c375032d` (test)
2. **Task 1 GREEN: implement aionui-client.ts (5 methods, fetchJson chokepoint)** — `4b5630ef` (feat)
3. **Task 2 RED: failing waitForAionUiReady tests (5 cases)** — `c8100dff` (test)
4. **Task 2 GREEN: implement ready-poll.ts + Rule-3 typecheck fix in both test files** — `a369db0d` (feat)

**Plan metadata commit:** (added in final docs commit after this SUMMARY.md is written)

## Files Created

- `livos/packages/livinityd/source/modules/mcp-registrar/aionui-client.ts` — `AionUiMcpClient` class (5 methods + `AionUiSyncResult` export); ~145 lines
- `livos/packages/livinityd/source/modules/mcp-registrar/ready-poll.ts` — `waitForAionUiReady` + `ReadyPollOptions`; ~90 lines
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/aionui-client.test.ts` — 9 vitest cases (mocked global fetch + abort listener pattern)
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/ready-poll.test.ts` — 5 vitest cases (fake timers + URL-routed mock fetch for Pitfall 5)

## Files Modified

- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` — added `export {AionUiMcpClient, type AionUiSyncResult}` and `export {waitForAionUiReady, type ReadyPollOptions}` alongside the existing 241-01 re-exports. No removals.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Typecheck] Response-as-unknown cast to dodge undici-types drift**
- **Found during:** Task 2 post-implementation typecheck sweep
- **Issue:** `new Response(...)` triggered TS2741 "Property 'bytes' is missing" in both test files. Root cause: undici-types@6.21.0 (transitive dep in livos) ships a `Response` type that lacks the `bytes()` method present on Node 22's global `Response`. tsc resolves the imported type from undici-types while the runtime value uses the global, causing a structural mismatch only at the boundary of test helper return types.
- **Fix:** Cast `as unknown as Response` in both `jsonResponse()` helpers — same workaround already used by other Vitest test files in the repo. No source change to aionui-client.ts or ready-poll.ts.
- **Files modified:** `aionui-client.test.ts`, `ready-poll.test.ts`
- **Commit:** Bundled into Task 2 GREEN commit `a369db0d` (single-line test-helper fix; not worth a separate commit)

**2. [Documentation polish — non-blocking] aionui-client.ts doc-comment mentioned the Pitfall-3 endpoint by name**
- **Found during:** Post-Task-1-GREEN acceptance-criteria grep audit
- **Issue:** A documentation comment in `aionui-client.ts` referenced `/api/extensions/mcp-servers` by name as a WARNING ("NOT the /api/extensions/mcp-servers sibling — Pitfall 3"). The plan's acceptance criterion was a strict `grep -c "/api/extensions/mcp-servers" === 0` so even the cautionary mention failed it.
- **Fix:** Reworded the comment to "(NOT the /api/extensions/* sibling — Pitfall 3)" — preserves the developer-facing warning while satisfying the literal-grep gate. Same cleanup applied to the docstring header in `aionui-client.test.ts` after the Task-2 work.
- **Files modified:** `aionui-client.ts` (in Task-1 GREEN edit before commit), `aionui-client.test.ts` (in Task-2 GREEN edit before commit)
- **Commit:** Folded into the respective GREEN commits

No architectural changes. No authentication gates encountered. No checkpoints triggered.

## Verification

**Tests (all green — 28 cumulative across the module):**
```
cd livos/packages/livinityd && npx vitest run --no-coverage source/modules/mcp-registrar
✓ source/modules/mcp-registrar/__tests__/transform.test.ts      (9 tests) — from 241-01
✓ source/modules/mcp-registrar/__tests__/redis-catalog.test.ts  (5 tests) — from 241-01
✓ source/modules/mcp-registrar/__tests__/ready-poll.test.ts     (5 tests) — NEW (this plan)
✓ source/modules/mcp-registrar/__tests__/aionui-client.test.ts  (9 tests) — NEW (this plan)
Test Files  4 passed (4)
     Tests  28 passed (28)
```

**Typecheck (zero errors in mcp-registrar):**
```
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep -c mcp-registrar
0
```
(Pre-existing typecheck noise elsewhere in livinityd is out of scope.)

**Acceptance-criteria greps (all PASS):**

| Criterion | Grep | Expected | Actual |
|-----------|------|----------|--------|
| Probe-verified endpoints in aionui-client.ts | `grep -c "/api/mcp/servers\|/api/mcp/sync-to-agents\|/api/mcp/servers/.*/toggle"` | ≥3 | 12 |
| No wrong-endpoint references (Pitfall 3) anywhere in registrar | `grep -rl "/api/extensions/mcp-servers" mcp-registrar/` | 0 files | 0 files |
| No `agent-configs` calls (out of scope) anywhere in registrar | `grep -rl "/api/mcp/agent-configs" mcp-registrar/` | 0 files | 0 files |
| No stray `enabled` in createServer body (Pitfall 4) | `grep "enabled" aionui-client.ts \| grep -v "//\|toggleServer\|enabled:"` | 0 | 0 |
| ready-poll has exactly one outer poll loop | `grep -c "while (Date.now() < deadline)" ready-poll.ts` | 1 | 1 |
| ready-poll uses AbortController | `grep -c "AbortController" ready-poll.ts` | ≥1 | 2 |
| ready-poll cleans timers | `grep -c "clearTimeout" ready-poll.ts` | ≥1 | 1 |
| ready-poll defaults (60_000 / 2_000 / 1_500) | inline grep | present | all three present |

**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — PRESERVED through all 4 commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` reported on every commit).

## TDD Gate Compliance

Both tasks followed the strict RED → GREEN sequence with separate commits:

| Task | RED commit (test) | GREEN commit (feat) | Tests in RED | Tests in GREEN |
|------|--------------------|---------------------|--------------|----------------|
| 1 — AionUiMcpClient | c375032d | 4b5630ef | FAIL (`Failed to load url ../aionui-client.js`) | 9/9 PASS |
| 2 — waitForAionUiReady | c8100dff | a369db0d | FAIL (`Failed to load url ../ready-poll.js`) | 5/5 PASS |

No REFACTOR commits were needed — implementations passed cleanly on first GREEN.

## Next Steps

Plan 241-03 (`seedAionUiMcpConfig` orchestrator + sentinel logic + integration tests) can now proceed. It will:

1. Import `AionUiMcpClient`, `waitForAionUiReady`, `readSystemMcpCatalog`, `transformRedisToAionUi`, `SYSTEM_MCP_NAMES_SET`, and the shared `SeedLogger` / `SeedResult` types from `./mcp-registrar/index.js`
2. Wire them through the 7-stage seed pseudocode in 241-RESEARCH.md §Idempotency Strategy
3. Add 3-state integration tests (empty AionUi / partial AionUi / full AionUi) with the same fetch-mock pattern these tests established

Plan 241-04 (livinityd `source/index.ts` wire-up + Mini PC deploy) depends on 241-03 only.

## Self-Check: PASSED

Verified before commit:
- `livos/packages/livinityd/source/modules/mcp-registrar/aionui-client.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/ready-poll.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/aionui-client.test.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/__tests__/ready-poll.test.ts` → FOUND
- `livos/packages/livinityd/source/modules/mcp-registrar/index.ts` → FOUND (modified — added 2 named exports)
- Commit `c375032d` → FOUND (Task 1 RED)
- Commit `4b5630ef` → FOUND (Task 1 GREEN)
- Commit `c8100dff` → FOUND (Task 2 RED)
- Commit `a369db0d` → FOUND (Task 2 GREEN)
