---
phase: 249
plan: 01
status: human_needed
artifact_complete_on: 2026-05-29
operator_walk_pending: true
sacred_sha_preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_aionui_sha256: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
milestone: v44.0
tags: [v44, uat, milestone-close, operator-handoff, artifact-only, sacred-sha]
files_created:
  - .planning/v44-UAT-CONSOLIDATED.md
  - .planning/v44-OPERATOR-WALK.md
  - scripts/close-v44-when-uat-green.sh
files_modified:
  - .planning/STATE.md
  - .planning/ROADMAP.md
commits:
  - 5277c065  # docs(249-01): add v44-UAT-CONSOLIDATED
  - 71cef051  # docs(249-01): add v44-OPERATOR-WALK
  - f115fc9c  # feat(249-01): add scripts/close-v44-when-uat-green.sh
---

# Phase 249 Plan 01 — Stage v44.0 milestone close (artifacts only)

**One-liner:** Authored the 3 artifacts the operator needs to walk v44.0 end-to-end and then close the milestone — single-page consolidated UAT index inlining every Phase 246/247/248 item, sequenced operator-walk doc with per-step UAT-id cross-references, and a guarded bash close script that gates on the sacred SHAs + UAT tick count. **No code shipped. No services deployed. No Mini PC SSH actions. No milestone status flipped.** Status is honestly `human_needed` — the close is operator-only per `feedback_milestone_uat_gate.md`.

## What this plan shipped

| Artifact                                         | Purpose                                                                                  | Lines |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----- |
| `.planning/v44-UAT-CONSOLIDATED.md`              | Single-page UAT index — Phase 246 UAT-1..UAT-7 + Phase 248 A..G inlined verbatim; GO/NO-GO matrix; pre-flight sacred-SHA gate; close procedure; audit trail | 317   |
| `.planning/v44-OPERATOR-WALK.md`                 | Sequenced 9-section browser walk path with per-step UAT-id cross-references (29 `satisfies UAT-x` / `→ UAT-x` markers) and a quick-lookup table | 309   |
| `scripts/close-v44-when-uat-green.sh`            | Guarded archive script — 4 pre-checks (file presence, sacred repo blob SHA, UAT tick gate, Mini PC binary sha256) + archive to `.planning/milestones/v44/` + print next manual step | 267   |

Plus per-plan + phase-aggregate SUMMARY files (this file + `249-SUMMARY.md`) and STATE/ROADMAP surgical updates.

## Why status: human_needed

Per project memory `feedback_milestone_uat_gate.md` ("Never declare milestone passed without UAT — v29.4 audit said 'passed' with 4× human_needed verifications and shipped broken"), **artifact creation is not UAT**. The milestone is `OPERATOR-PENDING` until the operator:

1. Walks `.planning/v44-OPERATOR-WALK.md` steps 1-7 from a real Chrome session at `https://bruce.livinity.io/`.
2. Ticks every mandatory row in `.planning/v44-UAT-CONSOLIDATED.md` to `[x]` (or `[~] N/A` where allowed — Phase 248 item F only on single-tenant Mini PC).
3. Runs `bash scripts/close-v44-when-uat-green.sh` from the repo root.

This plan deliberately does NOT:

- Run the close script.
- Create `.planning/milestones/v44/`.
- Flip v44.0 to CLOSED in ROADMAP.
- Invoke `/gsd-complete-milestone v44.0`.
- SSH to the Mini PC.
- Execute any UAT items.

All six are operator responsibilities.

## Operator hand-off

1. Read `.planning/v44-UAT-CONSOLIDATED.md` §2 sacred-SHA gate. Run both probes. If either fails → STOP, escalate.
2. Walk `.planning/v44-OPERATOR-WALK.md` steps 1-7 in order. Update consolidated doc tick boxes as you go.
3. Fill in `.planning/v44-UAT-CONSOLIDATED.md` §10 audit trail (date, operator, Mini PC SHAs, mandatory count, optional count).
4. From the repo root: `bash scripts/close-v44-when-uat-green.sh`.
5. After close prints success → `/gsd-complete-milestone v44.0` → `git add .planning/ scripts/close-v44-when-uat-green.sh && git commit -m "docs(v44): close milestone — operator UAT GREEN" && git tag v44.0`.

## Drift-locks honored

- **D-V44-SACRED** — `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at HEAD after all 3 commits (`[sacred-sha] PASS: 20 files verified` on each).
- **D-V44-MINI-PC-ONLY** — Zero off-limits-host references in any new file (the deprecated-host literals from HARD RULE 2026-04-27 verified absent via `grep -ciE` returning 0 on consolidated + walk + close script).
- **UAT item-id parity** — Consolidated doc reuses exact ids from per-phase UAT files (`UAT-1`..`UAT-7`, `OPT-1`, `OPT-2`, `A`..`I`); operator walk references those same ids.
- **Anti-shallow** — Every mandatory UAT item from Phase 246 + Phase 248 is inlined verbatim (not just linked), so the operator does not need to open per-phase files unless diagnosing a failure.

## Commits

| Commit     | Subject                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| `5277c065` | docs(249-01): add v44-UAT-CONSOLIDATED — single-page index inlining all Phase 246/247/248 UAT items |
| `71cef051` | docs(249-01): add v44-OPERATOR-WALK — sequenced browser walk with UAT-id cross-refs |
| `f115fc9c` | feat(249-01): add scripts/close-v44-when-uat-green.sh — guarded milestone-close |

Plus this docs commit (SUMMARYs + STATE/ROADMAP updates).

## Self-Check: PASSED

- ✅ 3 artifact files exist: `.planning/v44-UAT-CONSOLIDATED.md` (317 lines), `.planning/v44-OPERATOR-WALK.md` (309 lines), `scripts/close-v44-when-uat-green.sh` (267 lines, `bash -n` PASS, executable bit set).
- ✅ Both sacred SHAs appear in the close script (`f3538e1d...` repo blob + `293a49927b...` AionUi binary).
- ✅ Consolidated doc ≥ 180 lines (317 ✓).
- ✅ Operator walk ≥ 120 lines (309 ✓).
- ✅ Close script gates on the consolidated doc tick count (`grep -cE '^- \[ \] \*\*(UAT-[1-7]|[A-G]\.)'`).
- ✅ Close script archives to `.planning/milestones/v44/` and prints `/gsd-complete-milestone v44.0` as next step.
- ✅ Close script was NOT run (`.planning/milestones/v44/` does NOT exist).
- ✅ `status: human_needed` declared in this SUMMARY's frontmatter.
- ✅ D-V44-SACRED preserved (`f3538e1d811992b782a9bb057d1b7f0a0189f95f` at HEAD).
- ✅ Zero off-limits-host literals (per HARD RULE 2026-04-27) in any new file.
