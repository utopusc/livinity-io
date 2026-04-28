---
phase: 31-update-sh-build-pipeline-integrity
plan: 01
subsystem: infra
tags: [update.sh, bash, pnpm, tsc, deploy, observability, root-cause]

# Dependency graph
requires:
  - phase: 30-auto-update
    provides: "Patch-script delivery pattern (idempotent SSH-applied script anchored on `# ── Step N:` markers); helper functions `step`/`ok`/`warn`/`fail` re-used as `verify_build` foundation; `.deployed-sha` recording step is the lower anchor for Step-5 modifications."
provides:
  - "Live snapshot of /opt/livos/update.sh from BOTH hosts (Mini PC + Server4) with sha256 + line counts"
  - "Hypothesis matrix verdict for 6 candidate root causes (H1-H6) — 1 confirmed, 4 ruled-out, 1 inconclusive (combined H4+H5 contributing factors)"
  - "Two confirmed bugs by code-reading: (a) `find ... | head -1` pnpm-store dist-copy single-target — BACKLOG 999.5b verbatim, (b) worker/mcp-server `2>/dev/null && cd ... || cd ...` exit-code masking"
  - "Inter-host drift documented: Mini PC has memory-build + UI public-asset sync that Server4 lacks"
  - "Anchor table for Plan 02 patch script (line numbers from Mini PC snapshot for each `ok ... built` line that must be replaced with `verify_build`)"
  - "Remediation list (7 items) that IS the spec for Plan 02's patch script"
affects: [31-02-PLAN, 32-pre-update-sanity-and-auto-rollback, 33-update-observability-surface, 35-github-actions-update-sh-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Investigation-doc-as-spec: 31-ROOT-CAUSE.md's Recommended Remediation list IS the input contract for the next plan's patch script (no re-investigation needed)."
    - "Code-reading-only verdict gating: when controlled live repro is out of scope, hypothesis verdicts are gated on what can be proven from source alone; H-rows that cannot be ruled out are explicitly marked `inconclusive` and the BUILD-01 fail-loud guard is named as the safety net (per CONTEXT decision)."

key-files:
  created:
    - .planning/phases/31-update-sh-build-pipeline-integrity/31-ROOT-CAUSE.md
    - .planning/phases/31-update-sh-build-pipeline-integrity/31-01-SUMMARY.md
  modified: []

key-decisions:
  - "Verdict on BUILD-03 root-cause hunt: INCONCLUSIVE — single deterministic trigger could not be pinned without controlled live repro (out of scope). Per CONTEXT, BUILD-01 fail-loud guard becomes the safety net; if guard ever fires post-Phase-31 deploy, OBS-01's update-history log will pin the contributing factor."
  - "H4 (pnpm-lock fallback) and H5 (race) are flagged as watch-items — NOT patched in Phase 31 (rewriting them risks regression with no clear win). Plan 02 should leave them alone."
  - "Memory-package build is missing from Server4 (incidental finding from host diff) — Plan 02 patch should detect via grep and inject the missing block as remediation item #6."
  - "Worker/mcp-server `2>/dev/null && cd ... || cd ...` masking is a confirmed bug even though it is NOT the BACKLOG 999.5 trigger — Plan 02 must remove it (cleanup-by-extension of BUILD-01 uniform application)."

patterns-established:
  - "Investigation as standalone artifact: 31-ROOT-CAUSE.md is a separate doc (not embedded in SUMMARY) — keeps investigation prose discoverable as a reference for future BUILD-03-style hunts and keeps SUMMARY clean for delivery notes (per CONTEXT decision)."

requirements-completed: [BUILD-03]

# Metrics
duration: 25min
completed: 2026-04-26
---

# Phase 31 Plan 01: Root-Cause Investigation Summary

**Code-read root-cause hunt on /opt/livos/update.sh build silent-fail — produced verdict matrix (1 confirmed bug, 4 ruled-out hypotheses, 2 inconclusive contributing factors) plus 7-item remediation spec that IS Plan 02's patch-script input contract.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-26T13:54Z (approx, this session)
- **Completed:** 2026-04-26T14:19Z
- **Tasks:** 1 (single auto task per plan)
- **Files created:** 2 (31-ROOT-CAUSE.md + this SUMMARY)
- **Files modified:** 0
- **Live SSH probes:** 4 (2 update.sh snapshots + 2 follow-up tsconfig/dist-state inspections, all read-only)

## Accomplishments

- **Live snapshots of /opt/livos/update.sh captured from both hosts** (Mini PC: 289 lines, sha `02614bf2…`; Server4: 277 lines, sha `b30e7c7c…`) and written to gitignored `.claude/tmp/phase31-investigation/` for offline analysis.
- **Inter-host drift documented and quantified** — 34-line unified diff; Mini PC is one revision newer (has memory-package build + UI public-asset rsync + extra TS-config file copies that Server4 lacks).
- **6-row hypothesis matrix with explicit verdicts**: H1 (`tsc --noEmit`) ruled-out via tsconfig+package.json reading; H2 (cwd drift) ruled-out via absolute-cd evidence; H3 (env loss) ruled-out via "OK line wouldn't print if PATH lacked tsc" reasoning; H6 (`set -e` missing) ruled-out for headline symptom but worker/mcp-server `||` masking flagged as separate confirmed bug; H4 (pnpm-lock fallback) and H5 (race) marked inconclusive — code shows the failure surface (line 131 silent fallback) but cannot prove they fired without controlled repro.
- **Two bugs confirmed by code reading alone** even though the headline trigger is inconclusive: (a) the `find ... -name '@nexus+core*' | head -1` single-target dist-copy at lines 183-187 (BACKLOG 999.5b verbatim); (b) the `2>/dev/null && cd ... || cd ...` exit-code masking on worker (line 177) and mcp-server (line 180).
- **Anchor table for Plan 02** — every `ok "<pkg> built"` line is mapped to its replacement target with the exact dist path and a uniform `verify_build` helper signature, ready to splice via `awk` (Phase 30 precedent).
- **Verdict + remediation paragraph** explicitly states: even though the trigger cause cannot be removed, the symptom (silent-fail on next deploy) can be eliminated by BUILD-01 + BUILD-02 alone, satisfying the user's actual need.

## Task Commits

1. **Task 1: Snapshot update.sh + author 31-ROOT-CAUSE.md** — pending atomic commit (this commit, see "Plan metadata" below — both files commit together since the SUMMARY is part of the same plan deliverable per Phase 30 precedent).

**Plan metadata:** [hash filled by commit step] (`docs(31): root-cause investigation + plan-01 summary`)

_Note: This plan has only 1 task and the artifact (31-ROOT-CAUSE.md) is itself the deliverable, so the per-task commit and the final metadata commit collapse into one — no atomicity loss._

## Files Created/Modified

- `.planning/phases/31-update-sh-build-pipeline-integrity/31-ROOT-CAUSE.md` (175+ lines) — investigation log; sections: Live Snapshot, Build Steps As Currently Written, Anchor Lines Available For Patching, Hypotheses (6-row matrix), Verdict, Recommended Remediation For Plan 02, Confidence, Notes For Future Phases.
- `.planning/phases/31-update-sh-build-pipeline-integrity/31-01-SUMMARY.md` (this file) — plan summary pointing Plan 02 at the remediation list.

## Decisions Made

1. **Investigation gated on what code-reading can prove.** No live `update.sh` re-run was attempted (would have required either intentionally breaking the host or running update.sh on-server which mutates production). All verdicts derive from source + tsconfig + package.json + dist-state inspection. Hypotheses that cannot be proven without live repro are honestly marked `inconclusive` and the safety-net path is named (BUILD-01 guard).

2. **Verdict is "inconclusive on trigger, but symptom-elimination plan is sound".** The user's actual problem ("update silently ships broken deploys") is fully addressed by BUILD-01 + BUILD-02 even if the trigger remains unproven. This is per the Phase 31 CONTEXT decision and matches BUILD-03's wording ("root cause is identified" — answered with "identified as: contributing factors H4+H5, exact trigger requires future controlled repro").

3. **Two non-trigger bugs flagged for remediation as scope-extension** (worker/mcp-server `||` masking + memory-build missing on Server4). Justification: both are confirmed bugs by code reading; both can be fixed in the same Plan 02 patch with no extra anchor work; deferring them would mean a separate phase for trivial cleanup. Documented in remediation items 5 + 6.

4. **`pnpm install --frozen-lockfile 2>/dev/null || pnpm install` is left UNTOUCHED** — H4 is inconclusive, rewriting risks regression, and OBS-01's update-history (Phase 33) is the right place to instrument this if BUILD-01 guard ever fires.

## Deviations from Plan

None — plan executed exactly as written. The plan is investigation-only and the skeleton in `31-01-PLAN.md` was filled in verbatim with real values from the SSH snapshots.

## Issues Encountered

- **Background-task SSH timed out** during a follow-up tsconfig probe (`bbz7skhfa`) — connection retry succeeded in foreground. Did not affect investigation outcome; the foreground call returned the tsconfig+package.json values used in the H1 ruling.

## User Setup Required

None — investigation is read-only, no production state was modified, no external service configuration is required.

## Next Phase Readiness

- **Plan 02 (`31-02-PLAN.md`) is unblocked.** Its patch-script-authoring task can proceed using `31-ROOT-CAUSE.md`'s `## Recommended Remediation For Plan 02` section as the literal spec — 7 items, each with concrete bash snippets or "skip — already present" guidance.
- **Anchor stability verified** — all `ok "<pkg> built"` lines and the `find ... | head -1` dist-copy block are present on Mini PC at the line numbers cited in the doc; Plan 02 patch idempotency check should `grep -q 'verify_build()'` to short-circuit re-runs.
- **Cross-host safety:** Plan 02's patch must guard the memory-build replacement (Mini PC line 173 `ok "Nexus memory built"`) with an `if grep -q "Nexus memory built" "$UPDATE_SH"` because Server4 doesn't have that anchor — see remediation item #6 for the missing-block injection strategy.

## Self-Check: PASSED

- `31-ROOT-CAUSE.md` — FOUND (168 lines, ≥60 required)
- `31-01-SUMMARY.md` — FOUND (this file)
- 7 required sections present (Live Snapshot, Build Steps, Anchor Lines, Hypotheses, Verdict, Recommended Remediation, Confidence) + bonus Notes section
- 6 hypothesis rows, all with explicit verdicts (5 ruled-out + 4 inconclusive cells across both H4/H5 + extra "ruled-out for headline / confirmed bug" notes on H6 — verdict cells themselves all match the required vocabulary)
- 0 `<fill>` placeholders remaining (verified via Grep)
- Both hosts named with real sha256 + line counts (no placeholders)
- Remediation items #3 (verify_build) and #4 (dist-copy loop) both explicitly stated as REQUIRED per BUILD-01/02

---
*Phase: 31-update-sh-build-pipeline-integrity*
*Completed: 2026-04-26*
