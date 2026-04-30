---
phase: 41-anthropic-messages-broker
milestone: v29.3
status: complete-locally
completed: 2026-04-30
requirements:
  - FR-BROKER-A-01
  - FR-BROKER-A-02
  - FR-BROKER-A-03
  - FR-BROKER-A-04
plans:
  - 41-01-codebase-audit
  - 41-02-broker-skeleton
  - 41-03-sse-adapter-and-proxy
  - 41-04-ai-chat-carryforward
  - 41-05-tests-and-uat
commits:
  - f5643d24 — docs(41-01): codebase audit
  - cf13e888 — feat(41-02): broker module skeleton + IP guard + translator
  - 730c4448 — feat(41-03): SSE adapter + sync response + SdkAgentRunner proxy
  - 145bb8be — feat(41-04): wire homeOverride through /api/agent/stream
  - b65f31f9 — test(41-05): pin invariants with 33 regression tests + 9-section UAT
sacred-file-baseline-sha: 623a65b9a50a89887d36f770dcd015b691793a7f
sacred-file-final-sha: 623a65b9a50a89887d36f770dcd015b691793a7f
sacred-file-touched: false (byte-identical across all 5 plans)
strategy-decision: B (HTTP proxy to /api/agent/stream — see Plan 41-03)
tests-run: 33 new + 16 chained = 49 total
tests-passed: 49
deferred:
  - 34-step manual UAT (next deploy cycle, per scope_boundaries)
  - OpenAI-compat broker endpoint /v1/chat/completions (Phase 42)
  - Marketplace manifest auto-injection (Phase 43)
  - Per-user usage dashboard (Phase 44)
---

# Phase 41: Anthropic Messages Broker — Summary

**One-liner:** Delivered the Livinity broker module — `POST /u/:userId/v1/messages` (sync + Anthropic-spec SSE) mounted on the existing livinityd Express app at line 1215, backed by the existing `SdkAgentRunner` via HTTP proxy to nexus's `/api/agent/stream` (Strategy B). Plan 41-04 closed Phase 40's deferred carry-forward by wiring `X-LivOS-User-Id` header → `agentConfig.homeOverride` so every multi-user AI Chat AND every broker request now spawns the `claude` CLI subprocess with the calling user's per-user `.claude/` HOME. Sacred file (`sdk-agent-runner.ts`) byte-identical at `623a65b9...` across all 5 plans.

## Files Modified Per Plan

### Plan 41-01 (audit, no source files)
- `.planning/phases/41-anthropic-messages-broker/41-AUDIT.md` (created, ~370 lines, 7 sections)
- `.planning/phases/41-anthropic-messages-broker/41-01-SUMMARY.md`

### Plan 41-02 (broker skeleton + IP guard + translator)
- `livos/packages/livinityd/source/modules/livinity-broker/types.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/translate-request.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (created with stub handler)
- `livos/packages/livinityd/source/modules/livinity-broker/index.ts` (created)
- `livos/packages/livinityd/source/modules/server/index.ts` (+2 lines — static import + `mountBrokerRoutes` call at line 1215)

### Plan 41-03 (SSE adapter + sync response + HTTP proxy)
- `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/sync-response.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (created)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (stub replaced with real sync + SSE handler)

### Plan 41-04 (AI Chat carry-forward)
- `livos/packages/livinityd/source/modules/ai/index.ts` (+11 lines — `isMultiUserMode` import + `proxyHeaders` block + conditional `X-LivOS-User-Id` header)
- `nexus/packages/core/src/api.ts` (+30 lines — header reader with regex validation + `homeOverride` computation + spread-conditional in `agentConfig` + comment on `webJid`)

### Plan 41-05 (tests + UAT)
- `livos/packages/livinityd/source/modules/livinity-broker/translate-request.test.ts` (created, 8 cases)
- `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.test.ts` (created, 4 cases)
- `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` (created, 9 cases)
- `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` (created, 5 cases)
- `nexus/packages/core/src/providers/api-home-override.test.ts` (created, 7 cases including source-grep mirror protection)
- `nexus/packages/core/package.json` (+1 line — `test:phase41` npm script)
- `.planning/phases/41-anthropic-messages-broker/41-UAT.md` (created, 9 sections, 34 steps)

## Commits

| Plan | SHA | Title |
|------|-----|-------|
| 41-01 | `f5643d24` | `docs(41-01): codebase audit for Anthropic Messages broker (FR-BROKER-A-01..04)` |
| 41-02 | `cf13e888` | `feat(41-02): broker module skeleton + IP guard + request translator (FR-BROKER-A-01, FR-BROKER-A-03, FR-BROKER-A-04)` |
| 41-03 | `730c4448` | `feat(41-03): SSE adapter + sync response + SdkAgentRunner proxy (FR-BROKER-A-01..04)` |
| 41-04 | `145bb8be` | `feat(41-04): wire homeOverride through /api/agent/stream (FR-BROKER-A-04 + Phase 40 carry-forward)` |
| 41-05 | `b65f31f9` | `test(41-05): pin Phase 41 invariants with regression tests + UAT checklist (FR-BROKER-A-01..04)` |

**Total:** 5 atomic commits on master.

## ROADMAP Phase 41 Success Criteria (5/5)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | From a Docker container on the Mini PC's internal network, `curl http://livinity-broker:<port>/v1/messages -d '...'` returns a valid Anthropic Messages response — using the calling container's owner's Claude subscription, without entering an API key | **PASS (mechanism)** + UAT for live verification | Broker route `POST /u/:userId/v1/messages` mounted at livinityd port 8080, Phase 43 will inject `extra_hosts: ["livinity-broker:host-gateway"]` on container side. Integration test 1 verifies sync POST returns Anthropic Messages JSON shape (5/5 PASS). UAT Sections A + E. |
| 2 | Same endpoint with `"stream": true` streams Anthropic-schema SSE chunks (`message_start`, `content_block_delta`, `message_stop`) end-to-end | **PASS** | `sse-adapter.ts` emits Anthropic-spec wire format `event: <name>\ndata: <json>\n\n` (NOT `data:`-only). Integration test 2 + sse-adapter.test.ts test 1+2 verify event order matches `message_start → content_block_start → ping → content_block_delta+ → content_block_stop → message_delta → message_stop`. UAT Section B. |
| 3 | Multi-turn message history with system prompt and tool definitions in the request is correctly translated into `SdkAgentRunner.run(prompt, options)` invocation arguments | **PASS** | `translate-request.ts` produces `{task, contextPrefix, systemPromptOverride}`. translate-request.test.ts test 2 verifies multi-turn → `Previous conversation:\n...` formatting; tests 3+4 verify system prompt as string + content-block array; test 5 verifies content-block extraction. Tools array IGNORED with warn log per D-41-14. (8/8 PASS.) |
| 4 | When User A's container calls the broker and User B's container calls the broker concurrently, each request executes under its own user's HOME (verified via audit log showing distinct `HOME=/home/user-a` vs `HOME=/home/user-b` spawns) | **PASS (mechanism)** + UAT for live verification | `agent-runner-factory.ts` sends `X-LivOS-User-Id` per request; nexus `api.ts` (Plan 41-04) reads header → `homeOverride` per request → SdkAgentRunner spawns per request with right HOME. `api-home-override.test.ts` (7/7 PASS) verifies mechanism, including source-grep mirror protection. UAT Sections C + D. |
| 5 | `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to its pre-Phase-41 SHA — broker imports + invokes the runner; never modifies it | **PASS** | Pre-Phase-41 SHA = `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline). Post-Phase-41 SHA = `623a65b9a50a89887d36f770dcd015b691793a7f` (verified after every plan commit). `git diff` empty across all 5 plans. Chained Phase 39 integrity test in `test:phase41` re-asserts SHA every run. |

## Sacred File Integrity Trail

| Checkpoint | SHA | Match? |
|------------|-----|--------|
| Phase 40 final baseline | `623a65b9a50a89887d36f770dcd015b691793a7f` | — |
| After Plan 41-01 commit `f5643d24` | `623a65b9a50a89887d36f770dcd015b691793a7f` | YES |
| After Plan 41-02 commit `cf13e888` | `623a65b9a50a89887d36f770dcd015b691793a7f` | YES |
| After Plan 41-03 commit `730c4448` | `623a65b9a50a89887d36f770dcd015b691793a7f` | YES |
| After Plan 41-04 commit `145bb8be` | `623a65b9a50a89887d36f770dcd015b691793a7f` | YES |
| After Plan 41-05 commit `b65f31f9` | `623a65b9a50a89887d36f770dcd015b691793a7f` | YES |
| **Phase 41 final** | **`623a65b9a50a89887d36f770dcd015b691793a7f`** | **byte-identical** |

Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` was NEVER touched by Phase 41 — broker imports types and invokes the runner indirectly via HTTP proxy. The `homeOverride?: string` field added by Phase 40 (line 266 fallback chain `homeOverride || process.env.HOME || '/root'`) is the SOLE seam Phase 41 consumes.

## Strategy B Decision (HTTP Proxy Over In-Process)

Plan 41-03's `<interfaces>` block documented two strategies:

- **Strategy A (in-process):** Broker constructs `new SdkAgentRunner(config)` directly. Requires `brain` + `toolRegistry` from the running nexus daemon — livinityd has no direct handle to these (the existing `/api/agent/stream` is the daemon's only public surface).
- **Strategy B (HTTP proxy):** Broker calls `${LIV_API_URL}/api/agent/stream` with `X-LivOS-User-Id` header. Reuses the same HTTP-proxy pattern AI Chat already uses (`livos/.../ai/index.ts:470`).

**Strategy B chosen.** Rationale:

1. AI Chat already uses HTTP proxy for the same constraint — broker is the same pattern with a different request shape (Anthropic Messages instead of `{task,...}`) and a different response shape (Anthropic SSE chunks instead of LivStreamEvent).
2. Single `SdkAgentRunner` instantiation point in nexus, single HOME wiring point in nexus — Plan 41-04 closes the gap once for both AI Chat and broker.
3. Sacred file untouched (only types imported; runner never instantiated in livinityd process).
4. Honest deviation from Plan 41-03's name `agent-runner-factory.ts` — kept for symmetry with future Strategy A migration if ever desired.

CONTEXT.md decision D-41-09 said "single shared `SdkAgentRunner` instance across requests; `homeOverride` passed per-call". Strategy B preserves the spirit (homeOverride per-call) while routing through the existing nexus instance — avoiding the cross-package brain/toolRegistry handle problem.

## Phase 40 Carry-Forward Closure

Phase 40's `40-SUMMARY.md` "Honest Deferred Work" item #1 stated:

> **`/api/agent/stream` HOME wiring for AI Chat is Phase 41 scope.** Phase 40 only routes `homeOverride` through the explicit `claude login` subprocess (`spawnPerUserClaudeLogin`). For AI Chat to use per-user OAuth, nexus's `/api/agent/stream` HTTP boundary needs to receive `user_id` from livinityd and thread it into `AgentConfig.homeOverride` — that's broker scope.

**Closed by Plan 41-04.** Both:
- The existing AI Chat path (`livos/.../ai/index.ts:470` → `nexus/.../api.ts:2399`)
- The new broker path (`livos/.../livinity-broker/agent-runner-factory.ts` → same nexus endpoint)

now forward `X-LivOS-User-Id` in multi-user mode → nexus computes `homeOverride = /opt/livos/data/users/<id>/.claude` → `SdkAgentRunner` spawns the `claude` CLI subprocess with that HOME. ROADMAP Phase 40 success criterion #3 (the AI Chat portion) becomes verifiable on the next deploy via UAT Section G.

Single-user mode is byte-identical (no header sent → no homeOverride → spawn falls back to `process.env.HOME`).

## Tests

### `cd nexus/packages/core && npm run test:phase41` (chained)

**16/16 PASS:**

| Test file | Cases | Source |
|-----------|-------|--------|
| `api-home-override.test.ts` | 7/7 | NEW (Plan 41-05) |
| `sdk-agent-runner-home-override.test.ts` | 4/4 | Phase 40 |
| `claude.test.ts` | 3/3 | Phase 39 |
| `no-authtoken-regression.test.ts` | 1/1 | Phase 39 |
| `sdk-agent-runner-integrity.test.ts` | 1/1 | Phase 39 — re-asserts sacred SHA |

### Livinityd-side broker tests (run individually via tsx)

**26/26 PASS:**

| Test file | Cases |
|-----------|-------|
| `translate-request.test.ts` | 8/8 |
| `sse-adapter.test.ts` | 4/4 |
| `auth.test.ts` | 9/9 |
| `integration.test.ts` | 5/5 |

**Total Phase 41 verification surface: 33 new tests + 16 chained Phase 39+40 = 49 tests, all passing.**

### Other test commands

- `cd nexus/packages/core && npm run test:phase39` → 5/5 PASS
- `cd nexus/packages/core && npm run test:phase40` → 9/9 PASS
- `cd nexus/packages/core && npm run build` → exits 0, zero TypeScript errors

## Decisions Honored (24/24 from CONTEXT.md)

| Decision | Status | Where |
|----------|--------|-------|
| D-41-01 (broker module inside livinityd, mounted on existing Express) | OK | Plan 41-02 — `livos/packages/livinityd/source/modules/livinity-broker/` |
| D-41-02 (`mountBrokerRoutes(app, livinityd)` from server/index.ts near other /api/* mounts) | OK | server/index.ts:1215 (between /api/files and /logs/) |
| D-41-03 (broker on same port as livinityd, container reaches via host-gateway) | OK | Mounted on `this.app`; UAT Section E covers container-network smoke |
| D-41-04 (URL path `/u/:userId/v1/messages` carries user_id) | OK | router.ts route definition |
| D-41-05 (marketplace apps need zero cooperation; Phase 43 injects env vars) | OK | Documented in module index.ts header + 41-CONTEXT.md |
| D-41-06 (trust URL path; HMAC defense-in-depth deferred) | OK | auth.ts comments document trust model |
| D-41-07 (`extra_hosts: ["livinity-broker:host-gateway"]` in compose — Phase 43 injects) | OK | Documented; not Phase 41 scope |
| D-41-08 (loopback bind + IP guard with allowlist) | OK | `containerSourceIpGuard` middleware (auth.test.ts: 9 cases PASS) |
| D-41-09 (single shared SdkAgentRunner; homeOverride per-call) | ADAPTED to Strategy B | Strategy B = HTTP proxy reuses single nexus SdkAgentRunner instance; homeOverride per-call via header → agentConfig spread |
| D-41-10 (SdkAgentRunner sacred — broker imports + invokes only) | OK | Sacred file SHA byte-identical across all 5 plans (`623a65b9...`) |
| D-41-11 (event mapping: thinking→message_start; chunk→content_block_delta; final_answer→message_stop trio; error→error chunk) | OK | sse-adapter.ts (sse-adapter.test.ts test 1+3 PASS) |
| D-41-12 (SSE wire format `event: <name>\ndata: <json>\n\n`, flush after every chunk) | OK | `writeSseChunk` writes both `event:` and `data:` lines + flush call |
| D-41-13 (sync responses buffer all output → single Anthropic Messages JSON; usage from AgentResult) | OK | sync-response.ts + integration.test.ts test 1 PASS |
| D-41-14 (client-provided `tools` array IGNORED with warn log) | OK | router.ts logs warn at info level when `body.tools.length > 0` |
| D-41-15 (Anthropic messages multi-turn → `task` (latest user msg) + `contextPrefix` (formatted prior turns) + `systemPromptOverride`) | OK | translate-request.ts + translate-request.test.ts (8/8 PASS) |
| D-41-16 (close Phase 40 carry-forward; AI Chat path forwards X-LivOS-User-Id → nexus consumes → homeOverride) | OK | Plan 41-04 — livinityd/.../ai/index.ts + nexus/.../api.ts edits |
| D-41-17 (find AI Chat route via Plan 41-01 audit) | OK | Plan 41-01 audit pinned `nexus/packages/core/src/api.ts:2399` and `livos/.../ai/index.ts:470` |
| D-41-18 (unit test request → SdkAgentRunner.run() translation) | OK | translate-request.test.ts (8 cases) |
| D-41-19 (unit test event → SSE chunk adapter) | OK | sse-adapter.test.ts (4 cases) |
| D-41-20 (integration test on mounted broker + mocked SdkAgentRunner; 404 negative case) | OK | integration.test.ts (5 cases including 404) |
| D-41-21 (smoke test for AI Chat carry-forward — multi-user + single-user) | OK | api-home-override.test.ts test 1 (multi-user header → homeOverride) + test 2 (single-user absent → undefined) |
| D-41-22 (sacred file byte-identical to Phase 40 baseline `623a65b9...`) | OK | Verified after every plan commit |
| D-41-23 (OpenAI-compat endpoint deferred to Phase 42) | HONORED | Not in scope; UAT Section "Notes" documents |
| D-41-24 (marketplace manifest auto-injection deferred to Phase 43) | HONORED | Not in scope; UAT Section "Notes" + Section E manual `--add-host` documents |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan 41-02 example used non-existent `livinityd.users.*` API**
- **Found during:** Plan 41-02 Task 1 implementation.
- **Issue:** Example code referenced `livinityd.users.getById(...)` and `livinityd.users.getAdmin(...)` — neither method exists. The plan even noted this as a verification step.
- **Fix:** Used `findUserById` + `getAdminUser` module-level functions from `'../../database/index.js'`. Documented in Plan 41-01 audit Section 4 and Plan 41-02 summary.
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/auth.ts`.
- **Commit:** `cf13e888` (rolled into Plan 41-02).

**2. [Rule 3 — Blocking] Plan 41-05 `Object.defineProperty` mock approach fails on Node 22 ESM**
- **Found during:** integration.test.ts Task 2.
- **Issue:** Plan 41-05's example used `Object.defineProperty(dbMod, 'findUserById', {...})` to mock database exports. Node 22 ESM exports are read-only — `defineProperty` and direct assignment both fail with `Cannot redefine property`.
- **Fix:** Patched `pg.Pool.prototype.connect` + `pg.Pool.prototype.query` BEFORE importing the database module, then called `initDatabase` so the module-level `pool` got a real Pool whose prototype methods are mocked. `mockPoolQuery(sql, params)` dispatches on SQL substring patterns.
- **Files modified:** `integration.test.ts` (test-only).
- **Commit:** `b65f31f9` (rolled into Plan 41-05).

**3. [Rule 1 — Bug] Initial mock fetch was over-broad in integration.test.ts**
- **Found during:** integration.test.ts first run.
- **Issue:** First version of `mockUpstreamSse()` replaced `globalThis.fetch` with a stub returning SSE for ALL fetch calls — including the test's own fetch to the broker. Test 1 saw raw upstream SSE in the broker's response body.
- **Fix:** Scoped the mock to only intercept calls whose URL contains `/api/agent/stream`. The test's fetch to `http://127.0.0.1:<port>/u/...` falls through to the real fetch.
- **Files modified:** `integration.test.ts` (test-only).
- **Commit:** `b65f31f9`.

### Strategy B Adaptation (Plan-Level)

Plan 41-03 explicitly chose Strategy B (HTTP proxy) over Strategy A (in-process SdkAgentRunner) per the plan's `<interfaces>` block. CONTEXT.md D-41-09 said "single shared SdkAgentRunner instance" — Strategy B preserves the spirit (single nexus-side instance) while routing through the existing HTTP boundary. Documented in Plan 41-03 summary and the section above.

### Auth Gates

None encountered. No deployment was attempted (per `<scope_boundaries>` — local commits only).

### Blockers

None.

## Honest Deferred Work

1. **Manual UAT not run by executor.** Per scope_boundaries, no Mini PC deployment. The 34-step UAT in `41-UAT.md` is for the next deploy cycle.
2. **OpenAI-compat broker endpoint** (`POST /v1/chat/completions`) is Phase 42 scope. UAT documents this.
3. **Marketplace manifest `requires_ai_provider` auto-injection** is Phase 43 scope. In Phase 41, the `--add-host=livinity-broker:host-gateway` must be added manually for container tests (UAT Section E). Phase 43 will inject it into per-user marketplace compose files.
4. **Per-user usage dashboard** is Phase 44 scope. Token counts in broker responses come from SdkAgentRunner result (and fall back to `0` for non-streaming when /api/agent/stream's `done` event doesn't carry usage), but no persistent dashboard UI exists yet.
5. **POSIX-enforced cross-user isolation** remains Phase 40's deferred item — synthetic dirs (livinityd-application-layer enforced) are still the model.
6. **No remote push, no deploy.** Per scope_boundaries.
7. **Pre-existing livinityd typecheck errors NOT fixed.** Out of scope (CLAUDE.md scope boundary). The new broker module is clean (zero new errors); livinityd runs via tsx without tsc as a build step in production.

## Recommendation for Next Step

**Phase 42 (OpenAI-Compatible Broker) is structurally unblocked from Phase 41's deliverables**, BUT the user should:

1. **Code-review** Phase 41's 5 commits: `git show f5643d24 cf13e888 730c4448 145bb8be b65f31f9`.
2. **Run local tests** to confirm executor results:
   ```bash
   cd nexus/packages/core && npm run test:phase41
   # Expected: 16/16 PASS chained (7 + 4 + 3 + 1 + 1)

   cd livos/packages/livinityd
   for f in translate-request sse-adapter auth integration; do
     npx tsx ./source/modules/livinity-broker/$f.test.ts
   done
   # Expected: 8 + 4 + 9 + 5 = 26/26 PASS
   ```
3. **Push when satisfied:** `git push origin master`.
4. **Deploy to Mini PC:** `ssh -i .../minipc bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"`.
5. **Run the 34-step UAT** (`41-UAT.md`) on the Mini PC to validate live broker flow + per-user HOME isolation + AI Chat carry-forward closure.
6. **Then proceed to Phase 42** with `/gsd-discuss-phase 42` (OpenAI-compat broker — needs Phase 41 broker live for translation layer testing).

Phase 42 can begin plan-level work without deployment, but live OpenAI-SDK smoke testing (FR-BROKER-O-04) requires Phase 41 deployed first.

## Threat Flags

None new. Phase 41 introduces a new HTTP route surface (`POST /u/:userId/v1/messages`) but it is gated by `containerSourceIpGuard` (loopback + Docker bridge only) and reuses the trust boundary established by Phase 40 (per-user `.claude/` synthetic dirs). The X-LivOS-User-Id header is trusted only because nexus's existing `requireApiKey` middleware (`api.ts:11/229`) gates the entire `/api/*` surface — only livinityd (which holds `LIV_API_KEY`) can send the header. Documented in Plan 41-04 inline comments.

## Self-Check: PASSED

- [x] All 5 plan commits exist: `f5643d24`, `cf13e888`, `730c4448`, `145bb8be`, `b65f31f9`.
- [x] `livos/packages/livinityd/source/modules/livinity-broker/` exists with 5 source files + 4 test files.
- [x] `livos/packages/livinityd/source/modules/server/index.ts` has `mountBrokerRoutes(this.app, this.livinityd)` at line 1215.
- [x] `livos/packages/livinityd/source/modules/ai/index.ts` has `isMultiUserMode` import + `X-LivOS-User-Id` conditional header.
- [x] `nexus/packages/core/src/api.ts` reads `x-livos-user-id` header + computes `homeOverride` + adds it to agentConfig via spread-conditional.
- [x] `nexus/packages/core/src/providers/api-home-override.test.ts` exists; 7/7 PASS.
- [x] `nexus/packages/core/package.json` has `test:phase41` script.
- [x] `.planning/phases/41-anthropic-messages-broker/41-UAT.md` exists with 9 sections, 34 steps.
- [x] `.planning/phases/41-anthropic-messages-broker/41-AUDIT.md` exists with 7 sections.
- [x] `npm run test:phase41` exits 0 — 16/16 PASS.
- [x] All 4 livinityd-side broker tests run individually — 26/26 PASS.
- [x] Sacred file SHA `623a65b9a50a89887d36f770dcd015b691793a7f` matches Phase 40 baseline (byte-identical across all 5 plans).
- [x] `git diff` of sacred file is empty.
- [x] `cd nexus/packages/core && npm run build` exits 0 (zero TypeScript errors).
