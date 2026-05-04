---
phase: 56-research-spike
plan: 01
subsystem: research
tags: [research, spike, anthropic-sdk, passthrough, streaming, tools, sacred-file]

# Dependency graph
requires:
  - phase: 55-deferred
    provides: "Carry-forward live-verification debt frames Phase 56's purpose"
  - phase: v29.5
    provides: "Live Bolt.diy testing surfaced 3 architectural failures (identity contamination, block streaming, wrong auth model) that v30 must fix"
provides:
  - "Q1 verdict — Anthropic HTTP-proxy passthrough (Strategy A) chosen; integration point at livinity-broker/router.ts:36-187"
  - "Q2 verdict — forward client tools[] verbatim in passthrough mode; ignore preserved in agent mode"
  - "Q7 verdict — agent mode keeps current aggregation; sacred file UNTOUCHED in v30; D-30-XX deferred to v30.1+"
  - "D-51-03 sub-question answered: Branch N reversal NOT needed in v30 (passthrough handles external)"
  - "Sacred SHA stability proof across all 3 tasks (4f868d318abff71f8c8bfbcf443b2393a553018b)"
affects: [phase-57, phase-58, phase-61, phase-63]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verdict-block format (Verdict / Rationale ≥3 / Alternatives ≥2 / Integration Point / Risk + Mitigation / D-NO-NEW-DEPS) for SPIKE-FINDINGS.md"
    - "ASSUMED → VERIFIED traceability table per notes file"

key-files:
  created:
    - .planning/phases/56-research-spike/SPIKE-FINDINGS.md
    - .planning/phases/56-research-spike/notes-q1-passthrough.md
    - .planning/phases/56-research-spike/notes-q2-tools.md
    - .planning/phases/56-research-spike/notes-q7-streaming.md
  modified: []

key-decisions:
  - "Q1: Strategy A (HTTP-proxy direct to api.anthropic.com with raw byte-forward) over Strategy B (SDK-direct) — preserves D-NO-NEW-DEPS for livinityd; reuses agent-runner-factory.ts:64-173 fetch() pattern; Strategy B disqualified for cross-package dep boundary violation + ToS-fingerprint risk repetition"
  - "Q2: Forward client tools[] verbatim in passthrough mode (Anthropic raw forward; OpenAI translates to Anthropic shape); status quo ignore-warn preserved in agent mode to keep LivOS in-app chat behavior"
  - "Q7: Sacred file UNTOUCHED in v30; passthrough delivers external streaming via direct Anthropic SSE; agent mode aggregation accepted; D-30-XX deferred-decision row logged for v30.1+ if internal-chat user pain ever resurfaces"
  - "Falsified plan candidate Q7-A ('Agent SDK fundamentally aggregates') — the SDK supports includePartialMessages: true + SDKPartialAssistantMessage type stream_event; aggregation in current agent mode is a CALL-SITE choice, not an SDK constraint"
  - "D-51-03: Branch N reversal NOT needed in v30 — passthrough handles external; agent mode internal-chat acceptable per Phase 51 deploy-layer fix"

patterns-established:
  - "Sacred-file READ-ONLY citation pattern: cite line number + immediately follow with 'read-only', 'untouched', or 'no edit' within 200 chars to prove non-edit intent"
  - "Cross-Cutting SHA stability table at end of SPIKE-FINDINGS.md proves invariant across all plan tasks"
  - "When SDK source moves to closed/private (claude-agent-sdk repo only ships README+examples), the local node_modules .d.ts files are the definitive public API contract — search there"

requirements-completed: []

# Metrics
duration: ~25 min
completed: 2026-05-03
---

# Phase 56 Plan 01: Architectural Verdicts (Q1+Q2+Q7) Summary

**Three v30.0 architectural verdicts produced: HTTP-proxy passthrough strategy, forward-client-tools-verbatim policy, and sacred-file-untouched agent-mode confirmation — all backed by SDK source evidence and aligned with D-NO-NEW-DEPS + sacred boundary constraints.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-03T00:00Z (approx)
- **Completed:** 2026-05-03T00:16Z
- **Tasks:** 3 (Q1, Q2, Q7)
- **Files created:** 4 (SPIKE-FINDINGS.md + 3 notes)
- **Files modified (source code):** 0
- **Sacred file SHA drift:** 0 — `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged across all 3 tasks

## Accomplishments

- **Q1 — Anthropic Passthrough Strategy:** Chose Strategy A (HTTP-proxy direct to `api.anthropic.com` with raw `fetch()` + byte-forward of upstream `Response.body`). Disqualified Strategy B (SDK-direct) because it would force `@anthropic-ai/sdk` into livinityd's package.json (cross-package dep boundary violation; D-NO-NEW-DEPS broken) AND structurally repeat the OAuth-token-through-raw-SDK pattern that v29.3 Phase 39 explicitly closed in claude.ts. Integration point precise: `livinity-broker/router.ts:36-187` insertion + new `livinity-broker/passthrough-anthropic.ts` file. Zero new deps. Verified ASSUMED A1 (SDK supports both apiKey AND authToken) and A5 (SDK supports baseURL override) via direct SDK source inspection: `src/client.ts:264, 269, 276, 384-385, 493-505`.
- **Q2 — External-client tools[] forward vs ignore:** Chose forward verbatim in passthrough mode (Anthropic raw byte forward already passes tools[] through; OpenAI translates schema). Status quo ignore-warn preserved in agent mode to keep LivOS in-app chat byte-identical (FR-BROKER-A2-02). Worked example documented for both Anthropic and OpenAI routes including `tool_use` content block round-trip. Aligned with Q1 (Strategy A's raw forward already implements this for Anthropic). Integration points: `router.ts:66-70` (delete ignore-warn) + `openai-router.ts:110-124` (translate OpenAI→Anthropic shape).
- **Q7 — Agent mode block-level streaming:** Discovered the Agent SDK DOES support per-token streaming (`includePartialMessages: true` option + `SDKPartialAssistantMessage` type `stream_event` carrying raw `BetaRawMessageStreamEvent`) — falsifying plan candidate A's "fundamentally aggregates" framing. Sacred file at `sdk-agent-runner.ts:340-355` does NOT opt in, AND its message-handling loop at `sdk-agent-runner.ts:440` explicitly excludes `stream_event` per code comment. Both narrowings are CALL-SITE choices, not SDK constraints. Per v30 sacred-untouched constraint, BOTH are deferred to a v30.1+ candidate D-30-XX row. Verdict: agent mode keeps current aggregation; passthrough mode delivers token-level streaming for external clients; sacred file untouched. D-51-03 stays deferred (Branch N reversal not needed in v30).

## Task Commits

Each task was committed atomically:

1. **Task 1: Q1 verdict — Anthropic HTTP-proxy passthrough (Strategy A)** — `5479f4a7` (docs)
2. **Task 2: Q2 verdict — forward client tools[] verbatim in passthrough mode** — `443fac52` (docs)
3. **Task 3: Q7 verdict — agent mode keeps aggregation; passthrough delivers external streaming; sacred file untouched** — `b0839289` (docs)

**Plan metadata:** (this commit) `docs(56-01): summary — Q1+Q2+Q7 verdicts complete`

## Files Created/Modified

- `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` — Canonical verdict document with Q1/Q2/Q7 sections + Cross-Cutting sacred SHA stability table. Pending Q3/Q4/Q5/Q6 from plan 56-02 + cross-cuts from 56-03 + executive summary from 56-04.
- `.planning/phases/56-research-spike/notes-q1-passthrough.md` — Raw research: 7 findings + candidate evaluation table + risk inventory + ASSUMED→VERIFIED traceability + sacred SHA check
- `.planning/phases/56-research-spike/notes-q2-tools.md` — Raw research: Anthropic Tool schema (verbatim from SDK source) + OpenAI ChatCompletionTool schema + worked example for both routes + Q1 alignment
- `.planning/phases/56-research-spike/notes-q7-streaming.md` — Raw research: Anthropic SSE event sequence + Agent SDK type findings (decisive `SDKPartialAssistantMessage` discovery) + sacred file 378-389 read-only summary + D-30-XX surgical-edit blueprint (for future deferred row, NOT v30) + D-51-03 implication

## Decisions Made

See frontmatter `key-decisions`. Each decision is grounded in either (a) verbatim SDK source inspection or (b) verbatim in-repo file:line references. No "TBD" rows.

## Deviations from Plan

None — plan executed exactly as written.

The plan's optional Step 8 in Task 1 (LiteLLM/OpenRouter competitor research) was skipped because evidence from in-repo agent-runner-factory.ts and Anthropic SDK source was already overwhelming for the Strategy A choice; competitor patterns would have been confirmatory only. This is a discretion-allowed skip ("Optionally WebSearch for...") and not a deviation from a required step.

## Issues Encountered

- **`docs.anthropic.com` pages are heavily React-rendered** — naive `curl | grep` returned mostly nav-link junk for tool-overview, computer-use, and openai-chat. **Resolution:** pivoted to extracting Tool / ChatCompletionTool schemas directly from the Anthropic TypeScript SDK source (`@anthropic-ai/sdk/src/resources/messages/messages.ts`) — these types are GENERATED FROM Anthropic's OpenAPI spec by Stainless, so they are MORE authoritative than the human-rendered docs.
- **`anthropics/claude-agent-sdk-typescript` GitHub repo does NOT publicly expose `src/`** — only README, examples, scripts, CHANGELOG. **Resolution:** read the local `nexus/packages/core/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (4110 lines) — this IS the public TypeScript API contract and is bundled in every install. This led to the decisive finding that the Agent SDK supports `includePartialMessages: true` (line 1003-1006), changing Q7's framing from "SDK aggregates" to "SDK can stream but call-site forces aggregation."

## Authentication Gates

None — all research was via public docs + npm registry + already-installed local node_modules. No auth required.

## Next Phase Readiness

- **Plan 56-02 ready to start:** Q3 (agent-mode opt-in mechanism) + Q4 (Caddy vs CF Worker) + Q5 (key rotation) + Q6 (rate-limit policy). Q3's verdict will gate the mode-dispatch implementation in Phase 57; the rest are perimeter/policy decisions for Phase 60+.
- **Plan 56-03 (cross-cuts) inputs ready:** Q1+Q2+Q7 verdicts collectively prove sacred file untouched (cross-cut #2) and zero new deps (cross-cut #1 — D-NO-NEW-DEPS confirmed across all 3 verdicts).
- **Plan 56-04 (synthesis) inputs ready:** Q1+Q2+Q7 verdict blocks present in SPIKE-FINDINGS.md; executive summary will pull substrate from these.
- **No blockers for 56-02.** No follow-up actions required from 56-01.

## Phase 57 Inputs Ready

- **Phase 57 plan 57-02 (mode dispatch + credential extractor):** Q1 names the integration point precisely (`livinity-broker/router.ts:36-187` + new `passthrough-anthropic.ts`); Q2 confirms `tools[]` flows through the same byte-forward without extra code on the Anthropic route; Q7 confirms passthrough bypasses the sacred file entirely.
- **Phase 57 plan 57-03 (Anthropic Messages passthrough handler):** Q1's behavioral expectation block (read creds.json → fetch upstream → pipe Response.body verbatim → forward 429+Retry-After) is the implementation spec.
- **Phase 57 plan 57-04 (OpenAI Chat Completions passthrough):** Q2's worked OpenAI translation example is the spec; Phase 58/61 owns the bidirectional translator.

## Carry-forward to plan 56-04 (synthesis)

- Q1 verdict feeds Phase 57 success criterion #1 (passthrough is default; integration point named).
- Q2 verdict feeds FR-BROKER-A1-03 acceptance ("external clients see only their own tools or none").
- Q7 verdict feeds D-51-03 final disposition for v30: deferred to v30.1+ as D-30-XX candidate (NOT in v30 scope).
- Sacred SHA stability table can be expanded across plans 56-02/03/04 to track the invariant across the entire phase, not just this plan.

---

## Self-Check: PASSED

- [x] `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` exists (verified by `[ -f ]`)
- [x] `.planning/phases/56-research-spike/notes-q1-passthrough.md` exists
- [x] `.planning/phases/56-research-spike/notes-q2-tools.md` exists
- [x] `.planning/phases/56-research-spike/notes-q7-streaming.md` exists
- [x] Commits `5479f4a7`, `443fac52`, `b0839289` all present in `git log --oneline`
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` (verified at end via `git hash-object`)
- [x] No commits in this plan touched the sacred file (verified via `git log -- nexus/packages/core/src/sdk-agent-runner.ts`)
- [x] All 3 task `<verify><automated>` node scripts return OK (Q1 OK / Q2 OK / Q7 OK)
- [x] All acceptance criteria for Tasks 1, 2, 3 verified PASS via grep + node + git checks (see in-task self-checks above)
- [x] Plan-level `<verification>` (3 verdict blocks present, 3 notes files exist, sacred SHA matches, no Edit/Write to sacred file, each verdict has ≥2 alternatives + ≥3 rationale + integration point + risk/mitigation) — all confirmed
- [x] ROADMAP Phase 56 success criterion #1 PARTIALLY satisfied (Q1+Q2+Q7 have verdicts; Q3-Q6 + D-51-03 final synthesis pending plans 56-02/03/04)
- [x] ROADMAP Phase 56 success criterion #2 SATISFIED (Q1 verdict names code-level integration point with file:line — `router.ts:36-187`)
- [x] ROADMAP Phase 56 success criterion #5 INPUT PREPARED (Q7 verdict feeds D-51-03 re-evaluation in plan 56-03)
