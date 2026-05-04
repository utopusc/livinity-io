---
phase: 56-research-spike
plan: 03
subsystem: research-spike-cross-cuts
tags: [research, spike, audit, cross-cut, dependencies, sacred-file, d-51-03]
dependency-graph:
  requires:
    - 56-01-SUMMARY.md (Q1+Q2+Q7 verdicts)
    - 56-02-SUMMARY.md (Q3+Q4+Q5+Q6 verdicts)
    - .planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md (D-51-03 deferral source)
  provides:
    - D-NO-NEW-DEPS audit verdict (YELLOW — npm-clean; non-npm Caddy/xcaddy infra delta flagged for Phase 60)
    - Sacred file SHA stability proof (PASS — no drift across 56-01 + 56-02 + 56-03)
    - D-51-03 re-evaluation verdict (Not needed in v30; v30.1+ D-30-XX safety net retained)
  affects:
    - Phase 57 (passthrough mode) — npm-side unblocked
    - Phase 58 (true token streaming) — npm-side unblocked
    - Phase 59 (per-user bearer auth) — npm-side unblocked
    - Phase 60 (api.livinity.io public endpoint) — YELLOW constrained; must explicitly budget xcaddy custom build pipeline + caddy-ratelimit pinned-sha plugin
    - Phase 61 (rate-limit headers / aliases / provider stub) — npm-side unblocked
    - Phase 62 (usage tracking + Settings UI) — npm-side unblocked
    - Phase 63 (live verification) — npm-side unblocked; UAT script implicitly covers internal-chat identity (D-30-XX safety net)
    - Plan 56-04 (synthesis) — Cross-Cuts section + D-30-01 placeholder ready for roll-up
tech-stack:
  added: []
  patterns:
    - cross-cutting audit pattern (per-Q dep walk + verdict color + per-Q coverage statement)
    - decisions-log placeholder convention (D-30-XX with XX=01 placeholder until 56-04 synthesis)
key-files:
  created:
    - .planning/phases/56-research-spike/notes-cross-cuts.md
    - .planning/phases/56-research-spike/56-03-SUMMARY.md
  modified:
    - .planning/phases/56-research-spike/SPIKE-FINDINGS.md (appended Cross-Cuts section)
decisions:
  - "D-NO-NEW-DEPS verdict YELLOW: zero new npm packages required by any Q1-Q7 primary path; two non-npm infra deps (caddy-ratelimit + xcaddy) flagged for Phase 60 budget"
  - "Sacred file SHA stability PASS: byte-identical at 4f868d318abff71f8c8bfbcf443b2393a553018b across plans 56-01 + 56-02 + 56-03"
  - "D-30-01 (placeholder; final number assigned in Plan 56-04): D-51-03 re-evaluation — Not needed in v30. Q1 passthrough bypasses sacred file for external clients; Q7 confirms agent mode acceptable; v30.1+ D-30-XX safety net retained IF internal-chat identity pain re-surfaces"
metrics:
  duration: ~10min
  completed_date: 2026-05-02
---

# Phase 56 Plan 03: Cross-Cuts Audit Summary

**One-liner:** Cross-cutting audit over Q1-Q7 verdicts: D-NO-NEW-DEPS YELLOW (npm-clean; Caddy/xcaddy non-npm infra delta flagged), sacred file SHA stable at `4f868d318abff71f8c8bfbcf443b2393a553018b`, D-51-03 re-evaluated as "Not needed in v30" with v30.1+ D-30-XX safety net retained.

## What This Plan Did

Plan 56-03 closed the three cross-cutting questions Phase 56 was designed to answer once Q1-Q7 verdicts were in:

1. **D-NO-NEW-DEPS audit** — walked every Q1-Q7 verdict's implied package list and classified each as already-present (with file:line + version cite) vs new-needed.
2. **Sacred file SHA stability** — confirmed `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` after 56-01 and 56-02 ran (and after 56-03's three tasks).
3. **D-51-03 re-evaluation** — combined Q1 + Q7 outcomes to choose one of three verdicts: not-needed-in-v30 / v30.1-hot-patch / re-evaluate-after-Phase-63.

Output landed in two files: `SPIKE-FINDINGS.md` (Cross-Cuts section appended after Q1-Q7 verdicts) + `notes-cross-cuts.md` (raw audit data, command output, reasoning trace).

## Key Findings

### D-NO-NEW-DEPS Verdict: YELLOW

**Zero new npm packages required by any Q1-Q7 primary path.** The strict letter of D-NO-NEW-DEPS (Node.js / TypeScript dep budget per `package.json`) is preserved.

But Q4's verdict (Server5 Caddy + `caddy-ratelimit` plugin) introduces TWO non-npm infrastructure dependencies:
- **`caddy-ratelimit`** — third-party Caddy module (`github.com/mholt/caddy-ratelimit`) NOT in stock Caddy binary; requires custom build.
- **`xcaddy`** — Go-toolchain build tool NOT currently installed; one-time tooling for the custom Caddy build.

These are not in any `package.json` so don't strictly violate the npm-only D-NO-NEW-DEPS letter, but they DO require Phase 60 explicit budget (build script, `apt-mark hold caddy`, README rebuild docs, validation step, fallback plan). YELLOW flags this so Phase 57+ planning can't smuggle them in as zero-cost.

Per-Q coverage:
- **Q1, Q2, Q3, Q5, Q6, Q7:** zero new packages implied — all use already-present `express`, `pg`, `node:crypto`, `node:fs`, Node 22 builtin `fetch`, and existing Express/openai-router scaffolds.
- **Q4:** the YELLOW source — two non-npm infra deps flagged.

Audit table cites `@anthropic-ai/sdk@^0.80.0` (`nexus/packages/core/package.json:34`), `@anthropic-ai/claude-agent-sdk@^0.2.84` (`nexus/packages/core/package.json:33`), `express@^4.18.2`/`^4.21.0`, `pg@^8.20.0`, `ioredis@^5.4.0` with line:version evidence. Full table + raw grep output in SPIKE-FINDINGS.md `### D-NO-NEW-DEPS Audit` and `notes-cross-cuts.md` Task 1.

**Routing for next phases:** Phases 57, 58, 59, 61, 62, 63 are unblocked on the npm side. Phase 60 is constrained YELLOW — must explicitly budget the Caddy custom-build pipeline.

### Sacred File SHA Stability: PASS

| Field         | Value                                          |
| ------------- | ---------------------------------------------- |
| Expected SHA  | `4f868d318abff71f8c8bfbcf443b2393a553018b`     |
| Observed SHA  | `4f868d318abff71f8c8bfbcf443b2393a553018b`     |
| Match?        | YES — byte-identical                           |
| `git status`  | `nothing to commit, working tree clean`        |
| `git diff --stat` | empty (zero lines changed)                 |

Sacred file untouched throughout phase 56-01 + 56-02 + 56-03. No drift introduced by spike. Sacred boundary preserved in full.

### D-51-03 Re-Evaluation: "Not needed in v30"

**Background.** D-51-03 (from Phase 51 SUMMARY): "Branch N reversal (sacred-file edit to inject identity assertion) is deferred from v29.5 pending future evaluation." Phase 56 is that future evaluation.

**Q1 effect.** Q1 chose Strategy A (raw HTTP-proxy `fetch()` to `api.anthropic.com` with byte-forward of upstream Anthropic SSE). External clients see upstream verbatim → sacred file bypassed → identity contamination structurally eliminated WITHOUT any sacred-file edit.

**Q7 effect.** Q7 confirms agent mode keeps current behavior (sacred file untouched; identity-line still in agent path; aggregation unchanged). Q7's own D-51-03 Implication subsection already concluded "Branch N reversal is NOT NEEDED in v30."

**Combined.** External-client identity surface (the original D-51-03 problem context, surfaced by v29.5 Bolt.diy live testing): RESOLVED structurally by Q1+Q3 passthrough-by-default. Internal LivOS AI Chat surface: acceptable (owner-user controls both sides; Phase 51 deploy-layer fix addressed visible regression; no complaints since).

**Verdict (chosen of three options): (a) "Not needed in v30."** With v30.1+ D-30-XX safety net retained from Q7 IF internal-chat identity pain re-surfaces post-v30.

**Decisions Log placeholder (final number assigned in 56-04):**
```
D-30-01: D-51-03 re-evaluation — Not needed in v30. Rationale: Q1 passthrough (default) bypasses sacred file for external clients structurally eliminating identity contamination there; Q7 confirms agent mode (internal LivOS AI Chat) keeps current identity-line, acceptable per Phase 51 deploy-layer fix. Sacred file edit deferred to v30.1+ D-30-XX candidate IF internal-chat identity pain ever re-surfaces post-v30. (Phase 56 spike outcome.)
```

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed in order; all verification gates passed first try; sacred file untouched throughout; no architectural surprises required Rule 4 escalation.

## Files Created / Modified / Deleted

**Created:**
- `.planning/phases/56-research-spike/notes-cross-cuts.md` (raw audit data, command output, reasoning trace)
- `.planning/phases/56-research-spike/56-03-SUMMARY.md` (this file)

**Modified:**
- `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` (appended `## Cross-Cuts` section with three subsections + Plan 56-03 sacred SHA stability table)

**Deleted:** none.

**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` — UNTOUCHED. SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan.

## Commits

- `60d4b202` — `docs(56-03): cross-cuts audit — D-NO-NEW-DEPS + sacred SHA + D-51-03 re-eval` (atomic commit covering all three task outputs because they are intrinsically one audit deliverable)

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 (D-NO-NEW-DEPS audit present + verdict color) | `node -e "..."` | `D-NO-NEW-DEPS OK` |
| Task 2 (sacred SHA matches + Stability subsection present) | `node -e "..."` | `Sacred SHA OK: 4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Task 3 (D-51-03 verdict + Q1/Q7 refs + decision-log entry) | `node -e "..."` | `D-51-03 re-eval OK` |
| key_links pattern (`@anthropic-ai/sdk` version cite) | `node -e "..."` | `Pattern key_links check OK` |
| Final sacred SHA confirmation | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` |

All gates pass.

## Self-Check: PASSED

Verified post-write:
- `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` — exists; Cross-Cuts section appended; three subsections present (D-NO-NEW-DEPS Audit + Sacred File SHA Stability + D-51-03 Re-Evaluation); plan 56-03 sacred SHA stability table appended.
- `.planning/phases/56-research-spike/notes-cross-cuts.md` — exists; contains Task 1 (audit table + per-Q walk + raw grep evidence), Task 2 (sacred SHA command output), Task 3 (D-51-03 reasoning trace).
- Commit `60d4b202` — present in `git log` (`docs(56-03): cross-cuts audit — D-NO-NEW-DEPS + sacred SHA + D-51-03 re-eval`).
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` — git hash-object returns `4f868d318abff71f8c8bfbcf443b2393a553018b`; git status reports clean working tree; zero diff stat.

## Threat Flags

None. Plan 56-03 is a documentation-only audit that introduces no new network endpoints, auth paths, file-access patterns, or schema changes. Sacred file SHA preservation explicitly verified.

## Known Stubs

None. Audit produces verdict tables, not stub UI/data. The `D-30-01` decision log entry uses `01` as a placeholder number (final number assigned during Plan 56-04 synthesis) — this is documented as a placeholder, not a stub.
