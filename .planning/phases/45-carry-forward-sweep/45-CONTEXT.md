# Phase 45: Carry-Forward Sweep — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true)

<domain>
## Phase Boundary

Roll up four v29.3 audit-found integration gaps so the milestone starts on a green CI baseline before any new feature lands.

**Requirements:** FR-CF-01, FR-CF-02, FR-CF-03, FR-CF-04 (see `.planning/REQUIREMENTS.md`)

**Success Criteria:**
1. When Anthropic upstream returns HTTP 429 with `Retry-After: 60`, marketplace app receives HTTP 429 (NOT 500) with `Retry-After: 60` header preserved verbatim — verified via integration test mocking nexus 429 response.
2. When Anthropic upstream returns HTTP 502, marketplace app receives HTTP 502 (NOT remapped to 429) — strict 429-only allowlist verified via parameterized test over status codes `[400, 401, 403, 429, 500, 502, 503, 504, 529]`.
3. `git show <c2-commit> --stat -- nexus/packages/core/src/sdk-agent-runner.ts` returns empty (audit-only commit; source byte-identical) AND `BASELINE_SHA` constant in `sdk-agent-runner-integrity.test.ts` equals current `4f868d31...` with audit comment listing every v43.x drift commit.
4. After killing livinityd via `systemctl restart livos` while Settings tab is open, all three routes (`claudePerUserStartLogin`, `usage.getMine`, `usage.getAll`) resolve within 2s of WS reconnect without UI hang — verified via restart-livinityd-mid-session integration test.
5. Running an OpenAI streaming chat completion via `/u/:userId/v1/chat/completions` produces a `broker_usage` row with non-zero `prompt_tokens` AND `completion_tokens` — verified via verbatim openai Python SDK smoke test from Phase 42 UAT.
6. `npm run test:phase45` passes including chained Phase 39 sacred-file integrity test re-asserting new `BASELINE_SHA = 4f868d31...`.

</domain>

<decisions>
## Implementation Decisions

All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use ROADMAP phase goal, success criteria, REQUIREMENTS.md (FR-CF-01..04), and codebase conventions to guide decisions.

**Locked decisions inherited from REQUIREMENTS.md:**
- D-NO-NEW-DEPS: 0 new npm/apt deps.
- D-LIVINITYD-IS-ROOT: NO sudoers / polkit / D-Bus brokers.
- D-D-40-01-RITUAL: every sacred-file edit follows Phase 40 ritual.
- D-NO-SERVER4: Mini PC only.

**Critical sequencing constraint** for this phase:
- FR-CF-02 (sacred SHA re-pin) is **audit-only** — `git diff --shortstat` MUST return empty for `sdk-agent-runner.ts`. No source edit. Just the test constant changes.
- All 4 carry-forwards (C1-C4) can land as separate atomic commits OR be batched. Recommend separate commits for clean history.

**File landing zones (verified in v29.4-ARCHITECTURE.md):**
- C1 → `livos/packages/livinityd/source/modules/livinity-broker/router.ts:159` + `agent-runner-factory.ts:75-76`
- C2 → `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:33`
- C3 → `livos/packages/livinityd/source/modules/server/trpc/common.ts:8`
- C4 → `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts`

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research via gsd-pattern-mapper + gsd-phase-researcher. Pre-existing v29.3 broker module + integrity test + httpOnlyPaths + OpenAI SSE adapter are direct prior art for each carry-forward.

</code_context>

<specifics>
## Specific Ideas

- All 4 fixes are surgical edits to existing files. No new modules, no new dependencies.
- Each fix has its own integration test (parameterized 9-status-code test for C1; restart-livinityd-mid-session test for C3; openai Python SDK smoke test for C4; sacred-SHA byte-identical test for C2).
- Test infrastructure: extend existing v29.3 broker `integration.test.ts` for C1 + C4. Extend `api-home-override.test.ts` or add new restart test for C3. C2 test already exists in `sdk-agent-runner-integrity.test.ts` — only the constant changes.
- `npm run test:phase45` script chains Phase 39+40+41+42+43+44 + Phase 45 new tests.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped, scope is fixed by REQUIREMENTS.md FR-CF-01..04.

</deferred>
