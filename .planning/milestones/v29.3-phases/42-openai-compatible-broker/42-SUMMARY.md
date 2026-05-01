---
phase: 42-openai-compatible-broker
milestone: v29.3
status: complete-locally
completed: 2026-04-30
requirements:
  - FR-BROKER-O-01
  - FR-BROKER-O-02
  - FR-BROKER-O-03
  - FR-BROKER-O-04
plans:
  - 42-01-codebase-audit
  - 42-02-openai-translator-and-sync-handler
  - 42-03-openai-sse-adapter-and-streaming-branch
  - 42-04-tests-and-test-script
  - 42-05-uat
commits:
  - 033fe701 — docs(42-01): codebase audit
  - 94fe7f86 — feat(42-02): OpenAI translator + sync /v1/chat/completions handler
  - eba26933 — feat(42-03): OpenAI SSE adapter + streaming /v1/chat/completions branch
  - e4f3a11c — test(42-04): pin Phase 42 invariants — 32 new tests + test:phase42 script
  - aa0f1837 — docs(42-05): manual UAT checklist with openai Python SDK smoke test
sacred-file-sha-pre-phase: 623a65b9a50a89887d36f770dcd015b691793a7f
sacred-file-sha-post-phase: 623a65b9a50a89887d36f770dcd015b691793a7f
sacred-file-touched: false (Phase 42 is purely additive on top of Phase 41 broker module; nexus untouched)
phase-41-sse-adapter-touched: false (new openai-sse-adapter.ts created instead, per audit decision)
tests-run-livinityd: 32 (16 translator + 10 SSE adapter + 6 integration)
tests-run-nexus-chained: 9 (4 home-override + 5 Phase 39 chain)
total-tests-passing: 32 livinityd + 9 nexus chained = 41 verified
deferred:
  - Manual UAT (operator runs `openai` Python SDK smoke test + 9-section checklist on next deploy)
  - Tool / function calling support (D-42-12 — IGNORED forever in v29.3 scope; Phase 41 D-41-14 carry-forward)
  - Marketplace manifest auto-injection (Phase 43)
  - Per-user usage dashboard (Phase 44)
---

# Phase 42: OpenAI-Compatible Broker — Summary

**One-liner:** Marketplace AI apps speaking OpenAI Chat Completions format (MiroFish, CrewAI, LangChain, etc.) can now hit `http://livinity-broker:8080/u/<user_id>/v1/chat/completions` and get a valid OpenAI-format response (sync or SSE-streamed) backed by Claude through Phase 41's HTTP-proxy infrastructure. Pure in-process TypeScript translation — no LiteLLM sidecar, no new container, no nexus changes.

## Files Modified Per Plan

### Plan 42-01 (audit, no source files)
- `.planning/phases/42-openai-compatible-broker/42-AUDIT.md` (created — extension points for Phase 41 broker module)

### Plan 42-02 (OpenAI translator + sync handler)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-types.ts` (NEW — TypeScript types for OpenAI Chat Completions request/response)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` (NEW — bidirectional format conversion + model alias table)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` (NEW — Express handler for /v1/chat/completions sync; SSE returns 501 stub for Plan 03)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (modified — `registerOpenAIRoutes()` call added inside Phase 41 router)

### Plan 42-03 (SSE adapter + streaming branch)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` (NEW — OpenAI Chat Completions streaming chunks: `data:`-only format, `[DONE]` terminator, `finalize()` in finally block)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` (modified — replaced 501 stub with SSE branch wired to new adapter)

### Plan 42-04 (tests + test:phase42 script)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.test.ts` (NEW — 16 tests: model alias, request translation, response translation, edge cases)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts` (NEW — 10 tests: chunk format, role-on-first, [DONE] terminator, error/finalize paths)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-integration.test.ts` (NEW — 6 tests: sync request, SSE stream, tool ignore, unknown model, error shape, content chunks)
- `nexus/packages/core/package.json` (modified — `test:phase42` npm script chains test:phase41)

### Plan 42-05 (UAT)
- `.planning/phases/42-openai-compatible-broker/42-UAT.md` (NEW — 9-section manual UAT including verbatim Python SDK smoke test from D-42-13)

## Commits

| Plan | SHA | Title |
|------|-----|-------|
| 42-01 | `033fe701` | `docs(42-01): codebase audit — extension points for Phase 42 OpenAI broker` |
| 42-02 | `94fe7f86` | `feat(42-02): OpenAI translator + sync /v1/chat/completions handler (FR-BROKER-O-01, FR-BROKER-O-03)` |
| 42-03 | `eba26933` | `feat(42-03): OpenAI SSE adapter + streaming /v1/chat/completions branch (FR-BROKER-O-02, FR-BROKER-O-04)` |
| 42-04 | `e4f3a11c` | `test(42-04): pin Phase 42 invariants — 32 new tests + test:phase42 script (FR-BROKER-O-01..04)` |
| 42-05 | `aa0f1837` | `docs(42-05): manual UAT checklist with openai Python SDK smoke test (FR-BROKER-O-04)` |

**Total:** 5 atomic commits on master.

## ROADMAP Phase 42 Success Criteria (4/4)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | curl `/v1/chat/completions` from container returns OpenAI-format response backed by Claude, using subscription, without API key | **PASS (mechanism)** + UAT for live | Sync handler in openai-router.ts; integration test 1 (`POST gpt-4 → OpenAI ChatCompletion shape`) PASS; UAT Section B-1 |
| 2 | Same endpoint with stream=true returns OpenAI-format SSE chunks consumable by official `openai` Python SDK | **PASS (format-verified)** + UAT for live SDK round-trip | openai-sse-adapter.ts + 10/10 SSE format tests; integration test 6 + 2 (PASS); UAT Section D documents verbatim Python SDK snippet |
| 3 | Model name aliasing: gpt-4/gpt-4o/claude-sonnet-4-6 all resolve to default Anthropic model; unknown logs warning + falls through | **PASS** | resolveModelAlias() in openai-translator.ts; 5 alias tests + integration test 4 (unknown → warn + 200 + echoed model) PASS |
| 4 | Bidirectional translation handles role mapping, tool/function-call format, multi-turn history with semantics preserved | **PASS (in-scope subset)** + honest deferral on tools | Translator tests 1-13 cover system extraction, role preservation, multi-turn, multi-system messages, content shape (string vs array). **Tools intentionally IGNORED with warn log per D-42-12** (carries D-41-14 forward) — integration test 3 verifies tools array doesn't reach Anthropic + warn emitted. Tool calling support is out of v29.3 scope. |

## Sacred File Integrity Trail

| Checkpoint | sdk-agent-runner.ts SHA | Phase 41 sse-adapter.ts | Match? |
|------------|--------------------------|---------------------------|--------|
| Phase 41 final baseline | `623a65b9a50a89887d36f770dcd015b691793a7f` | unchanged from Phase 41 | — |
| Plan 42-02 post-commit | `623a65b9...` | unchanged | YES |
| Plan 42-03 post-commit | `623a65b9...` | unchanged | YES |
| Plan 42-04 post-commit | `623a65b9...` | unchanged | YES |
| Plan 42-05 post-commit | `623a65b9...` | unchanged | YES |

**Phase 42 was zero-touch on sacred files.** All work additive on Phase 41's broker module via NEW openai-* files. Phase 41 sse-adapter.ts feature-frozen (separate openai-sse-adapter.ts created per Plan 42-01 audit decision — clean separation between Anthropic `event:`+`data:` SSE format and OpenAI `data:`-only format).

## Tests

### `npm run test:phase42` (chains everything)
- 4 sdk-agent-runner-home-override tests (Phase 40)
- 5 Phase 39 chain tests
**= 9 nexus tests PASS**

### Phase 42 livinityd tests (run via tsx directly)
- `openai-translator.test.ts` — 16/16 PASS (model alias, request/response translation, edge cases)
- `openai-sse-adapter.test.ts` — 10/10 PASS (chunk format, [DONE] terminator, role-on-first, finalize paths)
- `openai-integration.test.ts` — 6/6 PASS (sync, SSE, tool-ignore, unknown-model, error shape, content chunks)
**= 32 livinityd tests PASS**

**Total verified across all phases:** 41 (32 Phase 42 + 9 nexus chained from Phase 39+40)

## Decisions Honored (20/20 from CONTEXT.md)

All D-42-01..D-42-20 implemented:
- D-42-01 (in-process TS, no LiteLLM) ✅
- D-42-02 (file structure: openai-translator + openai-router in same module) ✅
- D-42-03 (same /u/:userId/v1 prefix via Phase 41 router) ✅
- D-42-04 (reuse Phase 41 IP guard + middleware) ✅
- D-42-05/06/07 (request translation: system extraction, role mapping, content shape, tool ignore) ✅
- D-42-08/09/10 (response shape: chatcmpl-uuid id, created timestamp, finish_reason mapping, usage shape) ✅
- D-42-11 (hardcoded model alias table; echo caller's model name) ✅
- D-42-12 (tools/function_call IGNORED with warn) ✅
- D-42-13 (verbatim Python SDK snippet in 42-UAT.md Section D) ✅
- D-42-14 (automated SSE format unit test) ✅
- D-42-15 (sacred file 623a65b9... untouched) ✅
- D-42-16/17/18 (translator + SSE adapter + integration tests) ✅ — 32 tests total
- D-42-19/20 (Phase 43/44 deferrals documented) ✅

## Honest Deferred Work

1. **Manual UAT not run by executor.** 9-section UAT in 42-UAT.md including the official `openai` Python SDK smoke test. Operator runs after deploy — verifies live broker on Mini PC.

2. **Tool / function calling forever ignored in v29.3.** D-41-14 + D-42-12 carry the same decision: client-provided `tools`/`tool_choice`/`function_call` arrays are dropped with warn log. Marketplace apps cannot inject tools mid-conversation. If MiroFish or another anchor app needs tool calling, that's a v30+ conversation.

3. **Marketplace manifest auto-injection** is Phase 43 scope (FR-MARKET-01..02). Phase 42 ships the OpenAI endpoint; Phase 43 wires marketplace apps' env vars (`LLM_BASE_URL=http://livinity-broker:8080/u/<id>/v1`) so apps reach it without user action.

4. **Per-user usage dashboard** is Phase 44 scope. Broker logs token counts internally but does NOT yet persist them to a dashboard table.

5. **No remote push, no deploy.** Per scope_boundaries.

## Recommendation for Next Step

**Phase 43 (Marketplace Integration — Anchor: MiroFish) is structurally unblocked.** Both Anthropic-format (Phase 41) and OpenAI-compat (Phase 42) broker endpoints are live; Phase 43 wires marketplace app manifests to inject the env vars that point apps at the broker.

Recommended sequence:
1. **Code-review** Phase 42's 5 commits (`git show 033fe701..aa0f1837`)
2. **Run local tests:** `cd nexus/packages/core && npm run test:phase42` (9/9) + each livinityd test directly via tsx (32/32)
3. **Push when satisfied:** `git push origin master` (will push 25+ commits ahead of origin)
4. **Deploy to Mini PC:** `ssh -i ... bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"`
5. **Run 42-UAT.md** on Mini PC (9 sections including official `openai` Python SDK smoke test)
6. **Then proceed to Phase 43** with `/gsd-discuss-phase 43`

Phase 43 + 44 plan-level work can proceed in parallel without Mini PC deployment of Phase 42 — but live UAT validation should happen before Phase 44 dashboard surface (which depends on broker traffic flowing).

## Threat Flags

None new. Phase 42 is purely additive translation logic on top of Phase 41's already-secured broker. Same IP guard (loopback + Docker bridge), same user_id URL-path resolution, same tool-ignore policy. No new auth surface, no new file system access, no new network endpoints reachable externally.
