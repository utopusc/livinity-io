# Phase 249: v44 E2E UAT + milestone close - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Operator walks every Phase 246-248 deliverable; UAT-CHECKLIST.md sections per phase; fix any FAIL; archive milestone to `.planning/milestones/v44/` per v43 precedent.

**UAT:** every Phase 246-248 box GREEN → milestone archived → v45 unblocked.

**State at phase entry (2026-05-29):**
- Phase 246 (Terminal v2): **ARTIFACT-COMPLETE, OPERATOR-PENDING DEPLOY** — 6/6 plans shipped, Mini PC deploy + browser UAT pending (SSH from this Windows host to Mini PC failed with ECDH timeout)
- Phase 247 (Luse skill v2 docs): **SHIPPED** — 2/2 plans, 20/20 shims, idempotent
- Phase 248 (display lifecycle): **DEPLOYED OPERATOR-PENDING** — 5/5 plans + deployed to Mini PC SHA `49ba196501ae481a337645970d6cef2e2ba71f7d`, 9/10 probes GREEN, 1 known limitation documented, operator UAT walk remains

</domain>

<decisions>
## Implementation Decisions

### Honest scoping (UAT gate per `feedback_milestone_uat_gate.md`)
- Phase 249 produces ARTIFACTS (consolidated UAT checklist, milestone close staging) but does NOT flip v44 to CLOSED — that requires actual operator walk.
- Per project memory `feedback_milestone_uat_gate.md`: "Never declare milestone passed without UAT. v29.4 audit said 'passed' with 4× human_needed verifications, shipped broken."

### Claude's Discretion
Format of consolidated UAT checklist (single file vs. per-phase index), archive command sequence (rsync vs. git mv vs. manual).

### v44 invariants
- D-V44-SACRED — sdk-agent-runner.ts SHA = f3538e1d811992b782a9bb057d1b7f0a0189f95f

</decisions>

<code_context>
## Existing Code Insights

- Per-phase UAT artifacts already exist:
  - `.planning/phases/246-terminal-v2-multi-session/246-UAT-CHECKLIST.md` + `246-06-UAT-CHECKLIST.md`
  - `.planning/phases/248-luse-display-lifecycle/248-05-UAT-CHECKLIST.md`
  - Phase 247 has no separate UAT (docs-only) — sync idempotency was its UAT.
- v43 precedent close: `.planning/milestones/v43/` (look at archive structure).
- `/gsd-complete-milestone` skill exists — should run it once UAT GREEN.

</code_context>

<specifics>
## Specific Ideas

Plan count estimate: 1 plan
1. **249-01** — Consolidated v44 UAT checklist + milestone close staging:
   - Produce `.planning/v44-UAT-CONSOLIDATED.md` linking all per-phase UAT checklists with section per phase, GO/NO-GO rollup matrix.
   - Document the operator's expected walk path (bruce.livinity.io login → AionUi Liv AI → terminal multi-tab test → display lifecycle test → admin Active Terminals panel).
   - Stage milestone close (do NOT execute archive): produce a `close-when-uat-green.sh` script the operator runs after UAT is GREEN.
   - Write 249-SUMMARY.md flagging `status: human_needed` per CTRL-01.
   - Do NOT flip v44 to CLOSED in ROADMAP — leave at OPERATOR-PENDING.

</specifics>

<deferred>
## Deferred Ideas

Actual milestone archive — deferred to post-UAT operator commit. `/gsd-complete-milestone v44.0` run after operator confirms GREEN.

</deferred>
