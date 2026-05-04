---
phase: 57-passthrough-mode-agent-mode
plan: 05
subsystem: livinity-broker
tags: [broker, agent-mode, byte-identity, sacred-file-gate, integration-tests, phase-57, wave-4]

requires:
  - phase: 57-passthrough-mode-agent-mode
    plan: 01
    provides: "Wave 0 RED test scaffolding (mode-dispatch + credential-extractor + passthrough-handler) — established the dispatch contract Wave 4 verifies on the agent side"
  - phase: 57-passthrough-mode-agent-mode
    plan: 02
    provides: "resolveMode(req) header parser (Wave 1) — used by router.ts dispatch that Wave 4 exercises with X-Livinity-Mode: agent"
  - phase: 57-passthrough-mode-agent-mode
    plan: 03
    provides: "Anthropic Messages passthrough handler + router.ts mode dispatch at lines 67-101 (Wave 2) — Wave 4 proves the agent branch is byte-identical when explicitly opted in"
  - phase: 57-passthrough-mode-agent-mode
    plan: 04
    provides: "OpenAI Chat Completions passthrough handler + openai-router.ts mode dispatch at lines 109-148 (Wave 3) — Wave 4 proves the OpenAI agent branch is byte-identical when explicitly opted in"
provides:
  - "Agent-mode byte-identity proof — every v29.5 integration assertion (10 Anthropic + 8 OpenAI) passes byte-identical when X-Livinity-Mode: agent header is injected"
  - "Phase 57 final sacred file gate — SHA 4f868d318abff71f8c8bfbcf443b2393a553018b confirmed byte-identical across all 5 waves"
  - "Closing demonstration that the dispatch dichotomy works in production-like flow: agent branch = old path (untouched); passthrough branch = new path (Waves 2/3)"
affects:
  - 58 (Phase 58 — true token streaming for passthrough; agent-mode tests already passing means Phase 58 is unblocked to focus on SSE iteration only)
  - 63 (Phase 63 — live verification consumes both paths; agent path proven byte-identical here so Phase 63 can focus on passthrough live testing)

tech-stack:
  added: []
  patterns:
    - "Test-only header injection — Wave 4 modifies ZERO production files. The plan's whole point is to prove existing v29.5 assertions still hold when the agent path is explicitly opted-in via header. Diff is comment block + per-fetch header addition, no body changes."
    - "Per-request header injection (Approach B from plan) — both test files use `node:assert/strict` + per-test `fetch()` calls (no central helper), so the header is added inline at each fetch site. Net diff per file: 1 comment + N=8-10 header additions."
    - "Hybrid test-file pattern (carried from Wave 3) — both test files run via `npx tsx` (legacy node-script style with runTests() IIFE), AND via vitest (where vitest reports 'No test suite found' but the runTests() IIFE runs as import side-effect printing PASS lines via stdout). Both invocation styles work."

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts (+17 LOC, -10 LOC: 1 comment block + 10 header injections — net +7 lines)"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-integration.test.ts (+19 LOC, -8 LOC: 1 comment block + 8 header injections including 2 GET /v1/models — net +11 lines)"

key-decisions:
  - "Approach B (per-request header injection) over Approach A (centralized helper). Both test files use raw `fetch()` calls inline per test block — there is no shared helper to centralize. Adding one would have been a refactor (out of scope) and would have changed every test body. Per-request injection produces the smallest possible diff while satisfying the contract."
  - "GET /v1/models gets the header too — even though listModels (Phase 42.1) is a separate route that does NOT branch on X-Livinity-Mode, the plan's spirit is 'every broker request opts into agent mode'. Adding the header to GET /v1/models is a no-op (route ignores it) but keeps the test file consistent — every fetch to the broker mounts under /u/<id>/v1 carries the header."
  - "Lowercase header value 'x-livinity-mode' (not 'X-Livinity-Mode'). HTTP headers are case-insensitive per RFC 7230 §3.2; Express normalizes to lowercase on req.headers. The plan example used X-Livinity-Mode but Wave 1's resolveMode reads req.headers['x-livinity-mode']. Lowercase in test source matches what Express delivers, removes any normalization-mismatch surface."
  - "No conversion to vitest. The plan suggested in Wave 3 hand-off that a future wave could convert these node-script files to vitest describe/it. Wave 4 explicitly does NOT do that — it would have inflated the diff well above the ≤50-additions sanity check and changed the assertion mechanism (vitest expect vs node:assert/strict). Header injection alone is sufficient to satisfy FR-BROKER-A2-02."

requirements-completed:
  - FR-BROKER-A2-02
  - FR-BROKER-A1-04

duration: ~12min
completed: 2026-05-02
---

# Phase 57 Plan 05: Wave 4 — Agent Mode Byte-Identity Proof + Sacred File Final Verification Summary

**18 v29.5 broker integration assertions (10 Anthropic + 8 OpenAI) prove byte-identical pass under explicit `X-Livinity-Mode: agent` header injection — closing FR-BROKER-A2-02 and the Phase 57 sacred file SHA gate (`4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical from Wave 0 pre-flight through Wave 4 post-execute).**

## Performance

- **Duration:** ~12 min wall-clock execution
- **Started:** 2026-05-02T18:55:00Z (approx)
- **Completed:** 2026-05-02T19:07:00Z (approx)
- **Tasks:** 1 (header injection across 2 files + verification gauntlet)
- **Files modified:** 2 (both test files; ZERO production files)

## Accomplishments

- **integration.test.ts (+17 LOC, -10 LOC, net +7)** — 1 top-of-file Phase 57 comment block + 10 per-fetch `'x-livinity-mode': 'agent'` header injections covering: Test 1 (sync POST), Test 2 (SSE POST), Test 3 (404 unknown user), Test 4 (403 single-user non-admin), Test 5 (400 invalid body), Test 6 (429 + Retry-After:60), Test 6b (429 + HTTP-date Retry-After), Test 7 (parameterized 9-status-code Anthropic allowlist), Test 8 (OpenAI 429 + Retry-After:120), Test 9 (parameterized 9-status-code OpenAI allowlist).
- **openai-integration.test.ts (+19 LOC, -8 LOC, net +11)** — 1 top-of-file Phase 57 comment block + 8 per-fetch header injections covering: Test 1 (sync gpt-4 ChatCompletion), Test 2 (SSE [DONE]), Test 3 (client-tools-IGNORED + warn), Test 4 (unknown-model echoed), Test 5 (400 invalid messages), Test 6 (stream chunk content + [DONE]), Test 7 (GET /v1/models list), Test 8 (GET /v1/models 404 unknown user). Tests 7 + 8 needed the headers param added (the bare `fetch(url)` form became `fetch(url, {headers})`).
- **All 18 v29.5 assertions GREEN** — `npx tsx integration.test.ts` reports `All integration.test.ts tests passed (10/10)`; `npx tsx openai-integration.test.ts` reports `All openai-integration.test.ts tests passed (8/8)`.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical pre-flight, post-Task-1 commit, end-of-plan. `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty. `git status nexus/` clean.
- **Sacred file integrity test PASSES** — `npx tsx nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` outputs `PASS: sdk-agent-runner.ts integrity verified (SHA: 4f868d318abff71f8c8bfbcf443b2393a553018b)` and `All sdk-agent-runner-integrity.test.ts tests passed (1/1)`. BASELINE_SHA constant unchanged.
- **NO production code modified in Wave 4 (TESTS ONLY)** — `git diff --name-only HEAD~1 HEAD` shows only the two `*.test.ts` files. Zero edits to router.ts, openai-router.ts, passthrough-handler.ts, mode-dispatch.ts, credential-extractor.ts, openai-translator.ts.

## Task Commits

| Task | Subject | Commit |
|------|---------|--------|
| 1 | test(57-05): inject X-Livinity-Mode: agent header into v29.5 broker integration tests (Wave 4) | `4fc964f8` |

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` — MODIFIED (+17/-10). Top-of-file Phase 57 comment block (7 lines) + per-fetch `'x-livinity-mode': 'agent'` injection in 10 broker fetch calls. All assertions byte-identical.
- `livos/packages/livinityd/source/modules/livinity-broker/openai-integration.test.ts` — MODIFIED (+19/-8). Top-of-file Phase 57 comment block (7 lines) + per-fetch header injection in 8 broker fetch calls (6 POST `/u/<id>/v1/chat/completions` + 2 GET `/u/<id>/v1/models` which got their `headers` param added). All assertions byte-identical.

## Test Results

### Per-file test counts

| Test File | Cases | Status | Invocation |
|-----------|-------|--------|------------|
| integration.test.ts | 10/10 GREEN | PASS | `npx tsx integration.test.ts` |
| openai-integration.test.ts | 8/8 GREEN | PASS | `npx tsx openai-integration.test.ts` |
| sdk-agent-runner-integrity.test.ts | 1/1 GREEN | PASS | `npx tsx nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` |

### Full broker test suite (Phase gate)

| Test File | Style | Cases | Status |
|-----------|-------|-------|--------|
| mode-dispatch.test.ts | vitest | 11/11 | GREEN |
| credential-extractor.test.ts | vitest | 8/8 | GREEN (incl. Risk-A1 smoke gate) |
| passthrough-handler.test.ts | vitest | 8/8 | GREEN |
| openai-translator.test.ts | vitest (hybrid) | 11/11 | GREEN (+ 16 legacy node-script PASS via stdout) |
| auth.test.ts | tsx node-script | 15/15 | GREEN |
| integration.test.ts | tsx node-script | 10/10 | GREEN (Wave 4 with header) |
| openai-integration.test.ts | tsx node-script | 8/8 | GREEN (Wave 4 with header) |
| openai-sse-adapter.test.ts | tsx node-script | 12/12 | GREEN |
| sse-adapter.test.ts | tsx node-script | 4/4 | GREEN |
| translate-request.test.ts | tsx node-script | 8/8 | GREEN |

**Total broker tests GREEN: 95** (38 vitest + 57 legacy node-script). Vitest reports `Tests 38 passed (38)` AND `0 ✗/FAIL test markers`. The 6 "Failed Suites" load-failures are the documented hybrid-test-file pattern from Wave 3 — node-script files have no vitest `describe/it` blocks so vitest reports "No test suite found" at the suite-load layer, but the legacy `runTests()` IIFE runs as an import side-effect during vitest's module load and prints PASS lines via stdout. Same root cause as documented in 57-04-SUMMARY.md "Issues Encountered".

### Sacred File Integrity (FR-BROKER-A1-04 final gate)

| Checkpoint | SHA | Match | Source |
|------------|-----|-------|--------|
| Pre-flight (Wave 4 start) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | BASELINE | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` |
| After Task 1 commit `4fc964f8` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH | re-run `git hash-object` |
| End-of-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH | re-run `git hash-object` |
| BASELINE_SHA constant in integrity test | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH | `grep -q "4f868d31..." sdk-agent-runner-integrity.test.ts` |
| Sacred file integrity test (sdk-agent-runner-integrity.test.ts) | — | PASS | `npx tsx ...integrity.test.ts` → "All ... tests passed (1/1)" |
| `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` | — | EMPTY (0 lines) | FR-BROKER-A1-04 verbatim acceptance from ROADMAP.md success criterion 4 |
| `git status nexus/` | — | clean | no nexus modifications anywhere in this plan |

## Header Injection Diff Sanity Check

| File | Additions | Deletions | Total Δ | Diff style |
|------|-----------|-----------|---------|------------|
| integration.test.ts | 17 | 10 | net +7 | 1 comment block (+7 lines) + 10 header injections (each = -1 old headers line +1 new headers line) |
| openai-integration.test.ts | 19 | 8 | net +11 | 1 comment block (+7 lines) + 6 POST header swaps + 2 GET headers-param additions |

Both well within the plan's `≤50 additions, 0 deletions of test logic` sanity bound — the deletions are the OLD headers lines being REPLACED with the NEW headers lines (header swap, not test-body deletion). Zero changes to assertions, body fixtures, or test orchestration.

## Production Code Modification Audit (NEGATIVE — none expected)

```
$ git status livos/packages/livinityd/source/modules/livinity-broker/ --short | grep -E "\.ts$" | grep -v "test\.ts"
(empty — zero non-test .ts modifications in broker dir)

$ git status nexus/ --short
(empty — zero nexus modifications in this plan)

$ git diff HEAD~1 HEAD --name-only
livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts
livos/packages/livinityd/source/modules/livinity-broker/openai-integration.test.ts
(only the 2 test files — exactly the plan's `files_modified` frontmatter)
```

Zero production code modified. Only test files. T-57-18 (test-only wave accidentally modifies production code) MITIGATED.

## D-NO-NEW-DEPS Audit (Phase-Wide Final Verdict)

**STILL GREEN across all 5 Phase 57 waves.** Wave 4 added zero npm dependencies. Both test files import only from existing deps (`node:assert/strict`, `express`, `node:http`, `pg`) — no new imports of any kind. `pnpm-lock.yaml` unchanged this wave.

**Phase 57 cumulative dep impact:**
- Wave 0 added `@anthropic-ai/sdk@^0.80.0` to `livos/packages/livinityd/package.json` — this was a workspace-level reachability declaration ONLY (the same version was already in `pnpm-lock.yaml` via `@nexus/core` transitive). No new package version was downloaded from the npm registry. CONTEXT.md line 28 explicitly authorized this as "OK to reuse from broker — D-NO-NEW-DEPS preserved since same version is hoisted."
- Waves 1, 2, 3, 4: zero new deps.

D-NO-NEW-DEPS = GREEN.

## Decisions Made

- **Approach B (per-request header injection).** No central helper exists in either test file — all `fetch()` calls are inline per test block. Building one would have been a refactor (out of scope) and would have changed every test body. Per-fetch injection is the minimal-diff approach.
- **GET /v1/models gets the header anyway.** The listModels route doesn't branch on `X-Livinity-Mode` — adding the header is a no-op for that route. But the plan's contract says "every broker request" so consistency wins.
- **Lowercase header value 'x-livinity-mode'** (not the plan example's 'X-Livinity-Mode'). Express normalizes to lowercase on `req.headers`; Wave 1's resolveMode reads `req.headers['x-livinity-mode']`. Lowercase in test source matches the runtime shape.
- **No vitest conversion.** Wave 3's hand-off mentioned converting these node-script files to vitest as optional. Wave 4 explicitly does NOT — would inflate diff well beyond the sanity check, and `npx tsx` execution + the legacy `runTests()` IIFE pattern works fine alongside vitest.

## Deviations from Plan

None — plan executed exactly as written. Header injection diff sizes (17/19 LOC) match the plan's sanity check (≤50, 0 unintended deletions). All 18 v29.5 assertions GREEN. Sacred file SHA byte-identical pre-flight + post-execute. Sacred file integrity test PASSES. NO production code modified.

## Authentication Gates

None encountered. Wave 4 is test-only and the per-test mocked pg.Pool + monkey-patched `fetch` keep all credentials/network calls local — no real auth surfaces touched.

## Issues Encountered

- **None blocking.** The vitest "Failed Suites 6" output is the pre-existing hybrid-test-file pattern documented in Wave 3's SUMMARY: 6 broker test files use `node:assert/strict` + `runTests()` IIFE (not vitest describe/it blocks). Vitest reports `Error: No test suite found` at the suite-load layer, but the legacy `runTests()` IIFE still runs as an import side-effect during vitest's module load and prints its PASS lines via stdout. Same root cause as documented previously. The `✗/FAIL test marker` count in vitest output is `0` (verified with `grep -E "✗|✘" | wc -l`), satisfying the plan's acceptance criterion (zero per-test failures).

## Self-Check: PASSED

- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan
- [x] `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty (0 lines) — FR-BROKER-A1-04 verbatim acceptance
- [x] `git status nexus/packages/core/src/sdk-agent-runner.ts` shows no modifications
- [x] integration.test.ts contains `X-Livinity-Mode` header on every broker request: 10 occurrences (one per fetch)
- [x] integration.test.ts contains the value `'agent'` paired with the header: `grep -c "x-livinity-mode': 'agent'"` = 10
- [x] openai-integration.test.ts contains `X-Livinity-Mode: agent` similarly: 8 occurrences
- [x] integration.test.ts contains the Phase 57 explanation comment: `grep -q "Phase 57"` matches
- [x] openai-integration.test.ts contains the Phase 57 explanation comment: `grep -q "Phase 57"` matches
- [x] Diff size sanity check: integration.test.ts +17/-10 (well under 50 adds), openai-integration.test.ts +19/-8 (well under 50 adds). Deletions are header-line REPLACEMENTS, not test-body removals.
- [x] Full broker test suite GREEN: vitest 38 passed + 0 ✗ markers; legacy 57 passed via `npx tsx` per-file invocations; total 95 GREEN
- [x] Sacred file integrity test PASSES: `npx tsx nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` → "All sdk-agent-runner-integrity.test.ts tests passed (1/1)"
- [x] BASELINE_SHA constant in integrity test unchanged: `grep -q "4f868d31..." sdk-agent-runner-integrity.test.ts` exits 0
- [x] No edits to any non-test file: `git status livos/packages/livinityd/source/modules/livinity-broker/` shows zero non-test modifications
- [x] No edits to nexus/: `git status nexus/` shows zero modifications
- [x] No Edit/Write tool calls were made to `nexus/packages/core/src/sdk-agent-runner.ts` — verified by zero diff and SHA stability
- [x] Task 1 commit exists: `4fc964f8` (test(57-05): inject X-Livinity-Mode: agent header into v29.5 broker integration tests)
- [x] No accidental file deletions in commit: `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty

## Phase 57 Forensic Trail — Per-Wave Requirement Satisfaction

| Requirement | Description | Wave(s) Satisfied | Evidence |
|-------------|-------------|-------------------|----------|
| FR-BROKER-A1-01 | Pass through system + tools verbatim | Wave 2 (Anthropic) + Wave 3 (OpenAI) | passthrough-handler.ts upstreamBody = body; openai-translator.ts translateToolsToAnthropic |
| FR-BROKER-A1-02 | No Nexus identity injection | Wave 2 + Wave 3 | passthrough-handler.test.ts assertion #3 GREEN; no "powered by"/"Nexus" in upstreamBody |
| FR-BROKER-A1-03 | No Nexus MCP tools injected | Wave 2 + Wave 3 | passthrough-handler.test.ts assertion #4 GREEN; tools array forwarded verbatim |
| FR-BROKER-A1-04 | Sacred file untouched | Wave 0 + Wave 1 + Wave 2 + Wave 3 + Wave 4 (this) | SHA `4f868d31...` byte-identical at every wave checkpoint; integrity test PASS at end of every plan |
| FR-BROKER-A2-01 | Mode dispatch + opt-in agent path | Wave 1 (mode-dispatch.ts) + Wave 2 (router.ts insertion) + Wave 3 (openai-router.ts insertion) | resolveMode 11/11 GREEN; router.ts dispatch lines 67-101; openai-router.ts dispatch lines 109-148 |
| FR-BROKER-A2-02 | Agent mode preserves v29.5 behavior byte-identical | Wave 4 (this — byte-identity proof via existing integration tests with header) | All 18 v29.5 assertions GREEN with `X-Livinity-Mode: agent` header injected; tests 1-9 of Anthropic + 1-8 of OpenAI |

**Phase 57 verdict: 6/6 requirements SATISFIED. Sacred file UNTOUCHED across all 5 waves. Ready for Phase 58 (true token streaming).**

## Next Phase Readiness

- **Phase 58 (True Token Streaming) UNBLOCKED.** Phase 57 ships with transitional aggregate-then-restream SSE in passthrough mode (both Anthropic and OpenAI sides). Phase 58 should:
  - Replace `passthrough-handler.ts:passthroughAnthropicMessages` `await stream.finalMessage()` block with `for await (const event of client.messages.stream(...)) { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`) }` plus backpressure handling.
  - Replace `passthrough-handler.ts:passthroughOpenAIChatCompletions` aggregate-single-chunk pattern with true 1:1 Anthropic→OpenAI delta translation per FR-BROKER-C2-01.
  - Agent mode is BYTE-IDENTICAL TO v29.5 — Phase 58 doesn't need to touch it. Agent path flows through the sacred file unchanged.
- **Phase 63 (Mandatory Live Verification) UNBLOCKED for the agent-mode path.** Wave 4 proves that agent mode is byte-identical to v29.5 on every existing integration assertion — Phase 63's live testing for agent mode can rely on the existing v29.4/v29.5 UAT files (just adds the header). Live testing for passthrough mode (Bolt.diy "Who are you?" persona test) is the new surface Phase 63 must walk through.
- **No new RED test scaffolding gaps.** All 6 FR-BROKER-A1-01..04 + A2-01..02 have GREEN test coverage. Phase 58's RED tests will need to assert true-token-streaming-specific behaviors (per-event SSE forwarding, backpressure handling) — those are net-new contracts.

## Threat Flags

None — Wave 4 modifies only test files (no new network endpoints, no new auth surfaces, no schema changes). The threat surface scan confirms:
- Both modified files: monkey-patched `pg.Pool` + monkey-patched `fetch` ensure no real DB / no real network calls during test execution. Header value 'agent' is a literal — no injection surface.
- All Phase 57 cumulative threat flags from Waves 0-3 mitigated: T-57-01..16 all addressed in their respective wave summaries; Wave 4-specific T-57-17 (sacred file edited inadvertently) and T-57-18 (test-only wave modifies production code) MITIGATED via post-execute SHA check + git status filter.

---
*Phase: 57-passthrough-mode-agent-mode*
*Completed: 2026-05-02*
