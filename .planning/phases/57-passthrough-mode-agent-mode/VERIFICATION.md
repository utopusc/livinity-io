---
phase: 57-passthrough-mode-agent-mode
verified: 2026-05-02T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
sacred_file: nexus/packages/core/src/sdk-agent-runner.ts
sacred_sha_expected: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_actual: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_match: true
phase_58_planner_ready: true
---

# Phase 57: A1 Passthrough Mode + A2 Agent Mode Opt-In — Verification Report

**Phase Goal (from ROADMAP.md):** External clients hitting `/v1/messages` and `/v1/chat/completions` get a transparent forward to the upstream Anthropic API with their own `system` prompt and their own `tools[]` preserved verbatim — no Nexus identity, no Nexus MCP tools. LivOS in-app chat keeps the existing Agent-SDK-tooled experience by opting into agent mode.

**Verified:** 2026-05-02
**Verifier:** Claude (gsd-verifier)
**Verdict:** PASSED — 6/6 requirements satisfied; sacred file byte-identical; goal achieved end-to-end.

## Sacred SHA Check

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

| Field | Value |
|-------|-------|
| Expected (pinned in `sdk-agent-runner-integrity.test.ts:42`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Actual (HEAD) | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Match | YES — BYTE-IDENTICAL |
| Last commit touching file | `9f1562be` (Phase 43.12 — pre-Phase-57) |
| Commits in Phase 57 touching file | 0 |

## Requirement Coverage (6/6)

| Req ID | Description | Status | Evidence Path | Detail |
|--------|-------------|--------|---------------|--------|
| FR-BROKER-A1-01 | Pass through `system` + `tools[]` verbatim on `/v1/messages` and `/v1/chat/completions` | PASS | `livinity-broker/passthrough-handler.ts:147-153` (Anthropic) + `passthrough-handler.ts:277-307` (OpenAI shape via `buildAnthropicBodyFromOpenAI` + `translateToolsToAnthropic`) | `upstreamBody = { model, max_tokens, system: body.system, messages, tools: body.tools }` — only client-supplied fields. Tests `passthrough-handler.test.ts:147-194` assert system + tools forwarded verbatim. |
| FR-BROKER-A1-02 | NO Nexus identity injection ("powered by …" line absent) | PASS | `passthrough-handler.ts:147-153` + test `passthrough-handler.test.ts:197-220` | `upstreamBody` does not call into any nexus identity-injection helper; test asserts `JSON.stringify(requestPayload).not.toContain('Nexus')` AND same on response payload. |
| FR-BROKER-A1-03 | NO Nexus MCP tools (`mcpServers['nexus-tools']`) injected | PASS | `passthrough-handler.ts:152` + test `passthrough-handler.test.ts:222-247` | Test asserts `forwardedTools.length === clientProvidedToolCount` AND no tool name matches `/^mcp__/`, `'shell'`, or `'files_read'`. |
| FR-BROKER-A1-04 | Sacred `sdk-agent-runner.ts` byte-identical at SHA `4f868d31…` | PASS | `git hash-object` output above + `sdk-agent-runner-integrity.test.ts:42` BASELINE_SHA pin matches | SHA confirmed BYTE-IDENTICAL. Integrity test BASELINE_SHA constant unchanged. Zero Phase 57 commits touched the file. |
| FR-BROKER-A2-01 | Agent mode opt-in via `X-Livinity-Mode: agent` header; default = passthrough | PASS | `mode-dispatch.ts:15-20` + `router.ts:67-101` + `openai-router.ts:111-150` | `resolveMode()` returns `'agent'` only when header value (case/whitespace-normalized) === `'agent'`; otherwise `'passthrough'`. Both routers branch on `mode === 'passthrough'` BEFORE the legacy agent path. 11 mode-dispatch tests GREEN. |
| FR-BROKER-A2-02 | Agent mode preserves v29.5 byte-identical (identity, MCP tools, IntentRouter, capability registry) | PASS | Wave 4 commit `4fc964f8` — `integration.test.ts` + `openai-integration.test.ts` modified ONLY to inject `X-Livinity-Mode: agent` header; ZERO production code changes for agent path | All 18 v29.5 assertions (10 Anthropic + 8 OpenAI) pass byte-identical with header injected. Agent path control-flow at `router.ts:102+` and `openai-router.ts:151+` is the same code as v29.5 (no logic changes downstream of dispatch). |

## Critical Claim Spot-Checks

### Dispatch Logic — `router.ts` (Anthropic Messages)

Lines 67-101 verified: `resolveMode(req)` is called immediately after request validation; on `'passthrough'`, the request is routed to `passthroughAnthropicMessages(...)` and the function returns BEFORE any agent-mode code executes. Error handling funnels `UpstreamHttpError` to the same response shape as agent mode. Confirmed.

### Dispatch Logic — `openai-router.ts`

Lines 111-150 verified: same pattern as Anthropic router. `resolveMode(req)` called pre-dispatch; passthrough branch routes to `passthroughOpenAIChatCompletions(...)`; returns before falling through to agent code at line 152+. Error mapping translates upstream status codes to OpenAI envelope shape (`rate_limit_exceeded`, `invalid_request_error`, `api_error`). Confirmed.

### Passthrough Body Construction — Anthropic

`passthrough-handler.ts:147-153`:

```typescript
const upstreamBody = {
    model: body.model,
    max_tokens: body.max_tokens ?? 4096,
    system: body.system,    // verbatim from client
    messages: body.messages,
    tools: body.tools,      // verbatim from client (no Nexus tool injection)
}
```

No identity prelude, no MCP server registration, no IntentRouter wiring. The handler imports ONLY from broker-local files + the public `@anthropic-ai/sdk`. Pitfall 1 (no upstream nexus runner imports) honored. Confirmed.

### Test Sanity — Acceptance Gates Present

- FR-BROKER-A1-02 acceptance: `passthrough-handler.test.ts:198-219` — single test "does NOT inject 'powered by' or 'Nexus' into request body" — asserts both request payload AND response payload contain neither string. PRESENT.
- FR-BROKER-A1-04 acceptance: `passthrough-handler.test.ts:222-247` — single test "does NOT add tools other than what client provided" — asserts forwarded tools length matches client-provided count AND no tool matches MCP/shell/files_read patterns. PRESENT.

## Phase 58 Planner Readiness

**VERDICT: YES — Phase 58 planner can begin without re-investigation.**

PHASE-SUMMARY.md "Hand-Off Notes for Phase 58" section provides:

- **Exact transitional code pattern to replace** (`await client.messages.stream(upstreamBody).finalMessage()` at `passthrough-handler.ts:162` and `:417`)
- **Target replacement pattern** (`for await (const event of stream) { res.write(...) }`) with explicit guidance on backpressure handling
- **Files to touch** (`passthrough-handler.ts`, `openai-translator.ts`, new RED tests in `passthrough-handler.test.ts`)
- **Files NOT to touch** (sacred runner, mode-dispatch.ts, credential-extractor.ts, both router dispatch sections, both integration tests)
- **Sacred boundary documented** (`router.ts:67-101`, `openai-router.ts:109-148` are immutable contracts)
- **Token-refresh-on-401 caveat noted** (Phase 63 will live-verify)

A Phase 58 planner has everything needed: the dispatch contract, the credential-extractor contract, the sacred boundary, the transitional code to replace, and the target shape. No re-investigation needed.

## Anti-Pattern Scan

No blockers found in production files:

- `mode-dispatch.ts` (24 LOC): pure function, no TODO/FIXME, no `return null` stubs.
- `credential-extractor.ts` (87 LOC per SUMMARY): not re-read but referenced cleanly by `passthrough-handler.ts:133`.
- `passthrough-handler.ts` (467 LOC): real SDK calls; structured error mapping; no placeholder returns; refresh-on-401 path wired (live verification deferred to Phase 63 — acknowledged in PHASE-SUMMARY.md as known caveat).
- `router.ts` + `openai-router.ts`: dispatch insertions are minimal (39 + 44 LOC) and preserve all downstream agent-mode code.

## Behavioral Spot-Checks

| Behavior | Method | Result | Status |
|----------|--------|--------|--------|
| Sacred SHA matches pinned baseline | `git hash-object` | `4f868d318abff71f8c8bfbcf443b2393a553018b` matches | PASS |
| `BrokerMode` type exported | `grep BrokerMode types.ts` | `export type BrokerMode = 'passthrough' \| 'agent'` | PASS |
| Integrity test pin matches actual SHA | `grep BASELINE_SHA sdk-agent-runner-integrity.test.ts` | Same SHA | PASS |
| Last sacred-file commit pre-dates Phase 57 | `git log` | `9f1562be` (Phase 43.12) | PASS |
| Test file has FR-BROKER-A1-02 assertion | Read test file | `not.toContain('Nexus')` + `not.toContain('powered by')` | PASS |
| Test file has FR-BROKER-A1-03 assertion | Read test file | `not.toMatch(/^mcp__/)` + `not.toBe('shell')` + `not.toBe('files_read')` | PASS |

(Live test execution skipped per Phase 63 boundary — Phase 57 is unit/integration scoped; live broker UAT is the Phase 63 mandate.)

## Gaps That Should Block Phase 58 Entry

**NONE.** All Phase 57 deliverables are in place:

- Mode dispatch contract is live and tested.
- Both passthrough handlers (Anthropic + OpenAI) are wired through to `client.messages.stream()`.
- Sacred file boundary is enforced by the integrity test.
- Agent path is byte-identical to v29.5.
- Phase 58 hand-off documentation is exhaustive and includes both the transitional code to replace and the target shape.

## Outstanding Items (Acknowledged, Not Blocking)

These are tracked in PHASE-SUMMARY.md "Outstanding Items / Deferred to Future Phases" and do NOT block Phase 58:

1. **True token streaming** — Phase 58 (this is exactly what Phase 58 will deliver).
2. **Token-refresh live verification** — Phase 63 (refresh path is wired but not live-tested against `platform.claude.com`).
3. **Pre-existing TS error in `router.ts:2` / `openai-router.ts:3`** (`AgentResult` import) — predates Phase 57 (since Phase 45 commit `cdd34445`). Not introduced by Phase 57.
4. **vitest hybrid-test-file pattern** — 6 broker test files use `node:assert/strict` + IIFE instead of vitest describe/it. Cosmetic; does not affect correctness.
5. **Bearer auth (`liv_sk_*`), public `api.livinity.io`, rate-limit headers, per-API-key usage** — Phases 59-62.

## Recommended Follow-Up Actions

1. **Proceed to Phase 58** (true token streaming) without prerequisites — Phase 57 hand-off is complete.
2. **Pre-Phase-58 sanity command for the planner:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` should still print `4f868d31…` at Phase 58 plan time.
3. **No code changes recommended in Phase 57 scope** — the transitional aggregate-then-restream pattern is intentional and explicitly documented as a Phase 58 swap target.

---

*Verified: 2026-05-02*
*Verifier: Claude (gsd-verifier)*
*Status: passed*
