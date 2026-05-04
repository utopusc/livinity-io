---
phase: 57-passthrough-mode-agent-mode
type: phase-rollup
milestone: v30.0
status: COMPLETE
waves: 5
plans_executed: [01, 02, 03, 04, 05]
requirements:
  - FR-BROKER-A1-01
  - FR-BROKER-A1-02
  - FR-BROKER-A1-03
  - FR-BROKER-A1-04
  - FR-BROKER-A2-01
  - FR-BROKER-A2-02
sacred_file: nexus/packages/core/src/sdk-agent-runner.ts
sacred_sha_baseline: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_end_of_phase: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_match: true
total_commits: 13
total_test_files_created: 3
total_production_files_created: 3
total_files_modified: 4
total_loc_delta: "+1040 / -30"
total_tests_green: 95
d_no_new_deps: GREEN
started: 2026-05-02
completed: 2026-05-02
---

# Phase 57: A1 Passthrough Mode + A2 Agent Mode Opt-In — Phase Rollup

**The Livinity Broker now has dual-mode dispatch: passthrough (DEFAULT) forwards `/v1/messages` and `/v1/chat/completions` directly to api.anthropic.com via the Anthropic SDK with per-user OAuth subscription Bearer auth, preserving system prompt and tools verbatim; agent mode (OPT-IN via `X-Livinity-Mode: agent` header) keeps the existing Strategy B HTTP-proxy → nexus → sacred sdk-agent-runner.ts path byte-identical to v29.5. Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED across all 5 waves.**

## Phase 57 in 5 Bullets

1. **Passthrough mode shipped (Waves 2 + 3)** — broker `POST /u/<id>/v1/messages` and `POST /u/<id>/v1/chat/completions` now forward directly to api.anthropic.com (no Nexus identity, no Nexus MCP tools, system prompt + client tools verbatim), satisfying the v30.0 milestone goal of "real-API-key experience for external apps" (Bolt.diy / Open WebUI / Continue.dev / Cline).
2. **Mode dispatch is header-gated (Wave 1)** — `X-Livinity-Mode: agent` opts into the existing v29.5 path; default (header absent) = passthrough. Default flip is the documented breaking change for legacy internal callers.
3. **Agent mode preserved byte-identical (Wave 4)** — every v29.5 integration test assertion (10 Anthropic + 8 OpenAI = 18 total) passes byte-identical when the agent header is injected. FR-BROKER-A2-02 closed.
4. **Sacred file UNTOUCHED across all 5 waves** — SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at pre-flight + after every wave + at end-of-phase. Sacred file integrity test PASSES with same BASELINE_SHA constant. FR-BROKER-A1-04 closed.
5. **D-NO-NEW-DEPS preserved** — zero new npm packages downloaded; `@anthropic-ai/sdk@^0.80.0` added to `livinityd/package.json` was a workspace-level reachability declaration only (same version was already in `pnpm-lock.yaml` via `@nexus/core` transitive).

## Wave-by-Wave Breakdown

| Wave | Plan | Subject | Commits | Key Output | Tests |
|------|------|---------|---------|------------|-------|
| 0 | 57-01 | Test scaffolding + README + SDK reachability audit | `340ff587`, `d3dfb52f`, `87074b1d` | 26 RED tests + README + fixture credentials.json + @anthropic-ai/sdk in livinityd package.json | 0 GREEN (intentionally RED for downstream waves) |
| 1 | 57-02 | mode-dispatch.ts + credential-extractor.ts + Risk-A1 smoke gate | `8af8dc9e`, `04a87846`, `0d8ff251` | resolveMode (24 LOC) + readSubscriptionToken (87 LOC) + types.ts BrokerMode + Risk-A1 GREEN verdict | 19 GREEN (11 mode-dispatch + 7 credential-extractor + 1 Risk-A1) |
| 2 | 57-03 | passthrough-handler.ts (Anthropic) + router.ts dispatch | `364a723b`, `f48f6827`, `51fba6e5` | passthroughAnthropicMessages handler (227 LOC) + router.ts dispatch +39 LOC at lines 67-101 | 27 GREEN (Wave 1 + 8 passthrough-handler) |
| 3 | 57-04 | OpenAI passthrough handler + openai-router.ts dispatch + translator helpers | `a563672d`, `5fccc0e6`, `5f54d88b` | passthroughOpenAIChatCompletions handler (+232 LOC) + openai-translator.ts +109 LOC + openai-router.ts dispatch +44 LOC at lines 109-148 | 38 GREEN (Wave 2 + 11 openai-translator vitest) |
| 4 | 57-05 | Agent-mode byte-identity proof + sacred file final gate | `4fc964f8`, (this PHASE-SUMMARY commit) | integration.test.ts +17/-10 + openai-integration.test.ts +19/-8 (header injection only); ZERO production code modified | 95 GREEN (38 vitest + 57 legacy node-script across all 10 broker test files) |

## Total Commits

**13 commits in Phase 57** (10 task commits + 3 docs commits per wave + this PHASE-SUMMARY commit will be the 14th):

```
4fc964f8 test(57-05): inject X-Livinity-Mode: agent header into v29.5 broker integration tests (Wave 4)
5f54d88b docs(57-04): complete Wave 3 — OpenAI Chat Completions passthrough handler + router dispatch
5fccc0e6 feat(57-04): wire mode dispatch into openai-router.ts (Wave 3 — Task 2)
a563672d feat(57-04): add OpenAI passthrough translation helpers + handler (Wave 3 — Task 1)
51fba6e5 docs(57-03): complete Wave 2 — Anthropic Messages passthrough handler + router dispatch
f48f6827 feat(57-03): wire mode dispatch into broker router (Wave 2 — Task 2)
364a723b feat(57-03): implement passthroughAnthropicMessages handler (Wave 2 — Task 1)
0d8ff251 docs(57-02): complete Wave 1 — mode dispatch + credential extractor + Risk-A1 GATE PASSED
04a87846 feat(57-02): implement readSubscriptionToken + Risk-A1 smoke gate (Wave 1 — Task 2)
8af8dc9e feat(57-02): implement resolveMode dispatcher (Wave 1 — Task 1)
87074b1d docs(57-01): complete Wave 0 test scaffolding plan
d3dfb52f test(57-01): add 26 RED tests for passthrough mode (Wave 0 scaffolding)
340ff587 docs(57-01): scaffold passthrough README + fixture + SDK reachability
```

## LOC Delta (Phase 57 cumulative)

```
$ git diff --shortstat 87074b1d~1 HEAD -- livos/packages/livinityd/source/modules/livinity-broker/
12 files changed, 1040 insertions(+), 30 deletions(-)
```

Plus `livos/packages/livinityd/package.json` (+1 line for @anthropic-ai/sdk dep) and `livos/pnpm-lock.yaml` (regenerated).

## Final Test Count: 95 GREEN

| Source | Style | Count | Files |
|--------|-------|-------|-------|
| Phase 57-new vitest | vitest describe/it | 38 | mode-dispatch (11) + credential-extractor (8) + passthrough-handler (8) + openai-translator (11) |
| Pre-Phase-57 legacy | tsx node-script | 57 | auth (15) + integration (10, Wave 4 with header) + openai-integration (8, Wave 4 with header) + openai-sse-adapter (12) + sse-adapter (4) + translate-request (8) |
| **Total** | **mixed** | **95** | **10 test files** |

Plus the sacred file integrity test (`nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` — 1/1 GREEN) which is in nexus, not broker.

## Sacred File SHA History — All 5 Waves

| Wave | Plan | Commit Range | Sacred SHA | Match |
|------|------|--------------|------------|-------|
| Pre-flight | (start) | `87074b1d~1` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | BASELINE |
| Wave 0 end | 57-01 | `340ff587 → 87074b1d` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| Wave 1 end | 57-02 | `8af8dc9e → 0d8ff251` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| Wave 2 end | 57-03 | `364a723b → 51fba6e5` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| Wave 3 end | 57-04 | `a563672d → 5f54d88b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| Wave 4 end | 57-05 | `4fc964f8 → (this commit)` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | MATCH |
| **End-of-phase** | (final) | (HEAD) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | **BYTE-IDENTICAL TO BASELINE** |

The last commit that touched sacred sdk-agent-runner.ts is `9f1562be` (Phase 43.12, before Phase 57 even started). Confirmed via `git log --oneline -- nexus/packages/core/src/sdk-agent-runner.ts | head -5`. ZERO commits in Phase 57 (Waves 0-4) touched this file.

## Requirement Closure Map

| Req ID | Description | Status | Closed By Wave | Evidence |
|--------|-------------|--------|----------------|----------|
| FR-BROKER-A1-01 | Pass through system + tools verbatim | ✅ COVERED | 2 (Anthropic) + 3 (OpenAI) | passthrough-handler.test.ts assertions #1-2 + openai-translator vitest 11/11 GREEN |
| FR-BROKER-A1-02 | No Nexus identity injection | ✅ COVERED | 2 + 3 | passthrough-handler.test.ts assertion #3 GREEN; no "powered by"/"Nexus" in upstreamBody |
| FR-BROKER-A1-03 | No Nexus MCP tools injected | ✅ COVERED | 2 + 3 | passthrough-handler.test.ts assertion #4 GREEN; tools array forwarded verbatim |
| FR-BROKER-A1-04 | Sacred file untouched | ✅ COVERED | 0 + 1 + 2 + 3 + 4 (continuous) | SHA `4f868d31...` byte-identical at every wave boundary; integrity test PASS at end of every plan; `git diff -- nexus/packages/core/src/sdk-agent-runner.ts` empty |
| FR-BROKER-A2-01 | Mode dispatch + opt-in agent path | ✅ COVERED | 1 (mode-dispatch.ts) + 2 (router.ts insertion) + 3 (openai-router.ts insertion) | resolveMode 11/11 GREEN; router.ts dispatch lines 67-101; openai-router.ts dispatch lines 109-148 |
| FR-BROKER-A2-02 | Agent mode preserves v29.5 byte-identical | ✅ COVERED | 4 (this — byte-identity proof via existing integration tests with header) | All 18 v29.5 assertions GREEN with `X-Livinity-Mode: agent` header injected; tests 1-9 of Anthropic + 1-8 of OpenAI |

**6/6 requirements satisfied. 0/6 deferred. 0/6 partial.**

## D-NO-NEW-DEPS Audit (Phase-Wide)

**STILL GREEN.** Zero new npm packages downloaded across all 5 waves of Phase 57.

The sole `package.json` change in Phase 57 is `livos/packages/livinityd/package.json` line `"@anthropic-ai/sdk": "^0.80.0"` (Wave 0). The same version `0.80.0` was already in `livos/pnpm-lock.yaml` via `@nexus/core`'s transitive dependency. pnpm reused the already-hoisted store entry — no new package version was downloaded from the npm registry. CONTEXT.md line 28 explicitly authorized this as "OK to reuse from broker — D-NO-NEW-DEPS preserved since same version is hoisted."

## Hand-Off Notes for Phase 58 (True Token Streaming)

Phase 58's mandate per ROADMAP.md is "C1+C2 True Token Streaming (Anthropic + OpenAI)" — replace Phase 57's transitional aggregate-then-restream pattern with true SDK token streaming pass-through.

**What Phase 57 ships in passthrough SSE (transitional pattern that Phase 58 must replace):**

- **Anthropic SSE** (`passthrough-handler.ts:passthroughAnthropicMessages`):
  ```typescript
  // Current Phase 57 pattern (transitional):
  const finalMsg = await client.messages.stream(upstreamBody).finalMessage()
  // Then synthesize 6-event Anthropic SSE sequence:
  //   message_start → content_block_start → content_block_delta (one fat delta) →
  //   content_block_stop → message_delta → message_stop
  ```
  Phase 58 must replace with:
  ```typescript
  // Phase 58 target pattern (true streaming):
  const stream = client.messages.stream(upstreamBody)
  for await (const event of stream) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    // backpressure: await once res.write() returns false until 'drain'
  }
  ```
  The Anthropic SDK already produces upstream SSE events when iterated — Phase 58 just needs to forward each one verbatim instead of awaiting `.finalMessage()`.

- **OpenAI SSE** (`passthrough-handler.ts:passthroughOpenAIChatCompletions`):
  Currently emits ONE `chat.completion.chunk` SSE event with the complete message wrapped as a delta, then `data: [DONE]\n\n`. Phase 58 must iterate Anthropic SSE events from `client.messages.stream(...)` and translate EACH event to an OpenAI `chat.completion.chunk` per FR-BROKER-C2-01 (true 1:1 delta translation).

**What Phase 57 ships in agent mode (which Phase 58 must NOT touch):**

- Agent mode flows through the sacred sdk-agent-runner.ts via Strategy B HTTP-proxy → nexus → SdkAgentRunner. Sacred file SHA `4f868d31...` byte-identical. Agent mode block-level streaming is acceptable per Phase 51 deploy-layer fix and D-30-07 verdict.
- All 18 v29.5 integration assertions for agent mode are GREEN with the header injected. Phase 58 should NOT modify the agent path.

**Files Phase 58 will likely touch:**

- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` (replace `await stream.finalMessage()` blocks with `for await` event iteration in BOTH `passthroughAnthropicMessages` and `passthroughOpenAIChatCompletions`)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` (add a per-Anthropic-SSE-event → per-OpenAI-chunk translator function)
- New RED test scaffolding in `passthrough-handler.test.ts` for true token streaming assertions (per-event SSE forwarding, backpressure handling, [DONE] terminator preservation)

**Files Phase 58 should NOT touch:**

- `nexus/packages/core/src/sdk-agent-runner.ts` (sacred — D-30-07)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` mode dispatch (lines 67-101 — Wave 2's contract holds)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` mode dispatch (lines 109-148 — Wave 3's contract holds)
- `livos/packages/livinityd/source/modules/livinity-broker/mode-dispatch.ts` (Wave 1's contract holds)
- `livos/packages/livinityd/source/modules/livinity-broker/credential-extractor.ts` (Wave 1's contract holds)
- `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` + `openai-integration.test.ts` (Wave 4's byte-identity assertions hold)

**Token-refresh-on-401 caveat:** Phase 57 wired the token-refresh helper but did NOT live-test it (no real expired-token request was issued against api.anthropic.com / platform.claude.com). Phase 58 may incidentally exercise this if its true-streaming path triggers a long-running stream that crosses an expiry boundary — Phase 63 will be the formal live-verification gate.

## Hand-Off Notes for Phase 63 (Mandatory Live Verification)

- Agent mode is BYTE-IDENTICAL to v29.5 — Phase 63 can leverage the existing v29.4/v29.5 UAT files for agent-path verification (just needs `X-Livinity-Mode: agent` header added to the curl/Bolt.diy invocations).
- Passthrough mode is the NEW surface Phase 63 must walk through end-to-end:
  - Bolt.diy "Who are you?" persona test — system prompt "You are Bolt, a developer-focused assistant" should produce a Bolt-self-identifying response (proves no Nexus identity injection).
  - External tools forwarding test — request with `tools: [{...}]` should produce tool_use blocks invoking ONLY client-supplied tools (no Nexus MCP `shell` / `files_read` invocations).
  - Token refresh live test — issue a request with an expired `~/.claude/<userId>/.credentials.json` access_token; verify the broker calls platform.claude.com/v1/oauth/token with `grant_type=refresh_token` and retries with the new token.

## Outstanding Items / Deferred to Future Phases

- **True token streaming** — Phase 58 (per ROADMAP.md). Phase 57 ships transitional aggregate-then-restream.
- **Bearer token auth (`liv_sk_*`)** — Phase 59. Phase 57 keeps existing per-user URL-path identity + container IP guard.
- **Public `api.livinity.io` endpoint** — Phase 60. Phase 57 only modifies internal broker.
- **Rate-limit headers forwarding** — Phase 61.
- **Per-API-key usage tracking** — Phase 62.
- **Token-refresh live verification** — Phase 63 (the refresh path is wired in Phase 57 but not live-tested).
- **Pre-existing TS error in router.ts:2 / openai-router.ts:3** (`Module '@nexus/core' has no exported member 'AgentResult'`) — out of Phase 57 scope, present since Phase 45 commit `cdd34445`. Logged across Wave 2 + Wave 3 SUMMARY.md as deferred-item context for a future @nexus/core export audit. Did NOT block Phase 57 — new code generates ZERO new TS errors.
- **vitest hybrid-test-file pattern** — 6 broker test files (auth, integration, openai-integration, openai-sse-adapter, sse-adapter, translate-request) use `node:assert/strict` + `runTests()` IIFE not vitest describe/it. Vitest reports "No test suite found" at suite-load layer but the IIFE side-effect runs. Out of scope for Phase 57; could be unified in a future cleanup phase.

## Phase 57 Verdict

**STATUS: COMPLETE — 6/6 requirements satisfied; sacred file untouched; all 95 broker tests GREEN; D-NO-NEW-DEPS preserved; ready for Phase 58.**

---
*Phase: 57-passthrough-mode-agent-mode*
*Closed: 2026-05-02*
*Total wall-clock duration: ~53 min across 5 plans (Wave 0: 22min + Wave 1: 5min + Wave 2: 6min + Wave 3: 8min + Wave 4: 12min)*
