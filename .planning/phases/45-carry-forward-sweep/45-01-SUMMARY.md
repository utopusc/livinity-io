---
phase: 45-carry-forward-sweep
plan: 01
subsystem: testing
tags: [carry-forward, sacred-file, audit-only, integrity-test, baseline-sha, fr-cf-02]

# Dependency graph
requires:
  - phase: 39-risk-fix-close-oauth-fallback
    provides: Sacred file integrity test pattern (D-39-12 / D-39-13) and original BASELINE_SHA recording ritual
  - phase: 40-per-user-claude-oauth-home-isolation
    provides: Previous BASELINE_SHA (623a65b9...) baseline + D-40-01 ritual (pre-edit SHA verify, no source edit, post-edit SHA verify, integrity test re-pin with audit comment)
provides:
  - Re-pinned BASELINE_SHA (4f868d318abff71f8c8bfbcf443b2393a553018b) — green CI for sdk-agent-runner-integrity.test.ts
  - Audit comment block enumerating v43.x model-bump drift commits between Phase 40 baseline and v29.4 baseline
  - Reference baseline for Phase 47 FR-MODEL-02 Branch B (if taken) re-pin on top of this commit
affects: [45-02, 45-03, 45-04, 47-MODEL-02]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — audit-only re-pin
  patterns:
    - "D-40-01 ritual reapplied: pre-edit SHA verify -> no source edit -> post-edit SHA verify -> integrity test re-pin with exhaustive drift commit citation"
    - "Audit-only commit gate (pitfall B-11): git diff --shortstat HEAD~1 HEAD -- <sacred-file> must return empty before commit lands"

key-files:
  created: []
  modified:
    - nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts

key-decisions:
  - "BASELINE_SHA re-pinned to 4f868d318abff71f8c8bfbcf443b2393a553018b matching current git hash-object output of the sacred file"
  - "Audit comment block cites all 3 v43.x drift commits (9f1562be, 47890a85, 9d368bb5) verbatim with short-SHA + subject line, most recent first"
  - "Sacred file nexus/packages/core/src/sdk-agent-runner.ts source bytes left untouched — audit-only contract upheld via empty git diff --shortstat"

patterns-established:
  - "Audit-only re-pin: when sacred file SHA drifts due to upstream commits, the re-pin commit modifies ONLY the integrity test (BASELINE_SHA constant + audit comment block); the sacred file diff against HEAD~1 must be empty"
  - "Drift commit citation: every commit between previous and new baseline is listed by short-SHA + subject in the audit comment block, ordered most-recent-first to match git log default"
  - "blob-SHA vs commit-SHA disambiguation: BASELINE_SHA is a git blob SHA (output of `git hash-object`), NOT a commit SHA. To find drift commits, use the commit that introduced the previous blob (here 2cf59b1f for 623a65b9...) and run `git log <prev-commit>..HEAD -- <sacred-file>`"

requirements-completed: [FR-CF-02]

# Metrics
duration: 2min
completed: 2026-05-01
---

# Phase 45 Plan 01: Carry-Forward C2 Sacred-File BASELINE_SHA Re-Pin Summary

**Re-pinned sdk-agent-runner-integrity.test.ts BASELINE_SHA from stale `623a65b9...` to current `4f868d31...` via audit-only commit citing all 3 v43.x drift commits — restores green CI without touching the sacred file.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T19:07:19Z
- **Completed:** 2026-05-01T19:09:24Z
- **Tasks:** 3
- **Files modified:** 1 (only `sdk-agent-runner-integrity.test.ts`)

## Accomplishments

- Confirmed pre-state: sacred file `git hash-object` = `4f868d31...`, integrity test BASELINE_SHA stale at `623a65b9...`, test fails with expected `Sacred file integrity violation` diagnostic
- Captured drift commit list verbatim from `git log 2cf59b1f..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` (the actual commit that introduced the previous baseline blob — see Decisions Made for the blob-vs-commit-SHA correction)
- Edited only lines 28-33 of the integrity test: replaced 5-line audit comment block with 14-line block citing all 3 v43.x drift commits, swapped `BASELINE_SHA` constant from `623a65b9...` to `4f868d31...`
- Audit-only commit `f5ffdd00` lands on master with the sacred file's `git diff --shortstat HEAD~1 HEAD` returning empty (zero bytes — pitfall B-11 contract upheld)
- Integrity test passes (`PASS: sdk-agent-runner.ts integrity verified (SHA: 4f868d318abff71f8c8bfbcf443b2393a553018b)`)
- Chained `npm run test:phase39` (claude.test.ts + no-authtoken-regression.test.ts + sdk-agent-runner-integrity.test.ts) all pass

## Pre-State / Post-State SHAs

| Layer | Pre-State | Post-State |
|-------|-----------|------------|
| Sacred file `git hash-object` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged) |
| Integrity test BASELINE_SHA constant | `623a65b9a50a89887d36f770dcd015b691793a7f` (stale) | `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches sacred file) |
| Integrity test exit code | `1` (FAIL — `Sacred file integrity violation`) | `0` (PASS) |

## Drift Commit List (verbatim — pasted into audit block)

Captured from `git log 2cf59b1f..HEAD --oneline -- nexus/packages/core/src/sdk-agent-runner.ts` (most recent first):

```
9f1562be feat(43.12): bump tierToModel to Claude 4.X (Opus 4.7 / Sonnet 4.6) + Bolt.diy category fix
47890a85 feat(43.10): inject model identity line — fix Claude 3.5 Sonnet hallucination
9d368bb5 feat(43.8): broker passthrough — drop Nexus identity for raw API callers
```

These 3 commits, all merged during v43.x model-bump work, fully account for the SHA drift between the Phase 40 baseline (`623a65b9...`) and the v29.4 baseline (`4f868d31...`). Note `2cf59b1f` (Phase 40 — homeOverride addition) was the previous baseline itself, NOT a drift commit, so it is correctly excluded from the audit block.

## Task Commits

This plan produces a single audit-only commit (Tasks 1 and 3 are read-only / git verification only — no separate per-task commits per the plan's design):

1. **Task 1: Pre-state verification** — no commit (read-only verification: `git hash-object`, `grep BASELINE_SHA`, integrity-test failure capture, `git log` drift list)
2. **Task 2: Edit BASELINE_SHA + audit comment block** — staged only, committed as part of Task 3
3. **Task 3: Audit-only commit gate + commit** — `f5ffdd0084a10fad27d97db2e1afaa08a485e76e` (`chore(45-01): re-pin sacred-file BASELINE_SHA from 623a65b9... to 4f868d31... (audit-only, FR-CF-02)`)

**Audit-only commit hash (full):** `f5ffdd0084a10fad27d97db2e1afaa08a485e76e`
**Short hash:** `f5ffdd00`

This commit is the reference baseline for Phase 47 FR-MODEL-02 Branch B (if taken) — that future plan will re-pin again on top of `f5ffdd00`.

## Files Created/Modified

- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` — Replaced lines 28-33 with new BASELINE_SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` + 14-line audit comment block citing 3 v43.x drift commits (1 file changed, 10 insertions, 1 deletion)

## Decisions Made

- **`623a65b9...` is a git BLOB SHA, not a commit SHA.** The plan's literal `git log 623a65b9..HEAD` instruction returned 26 commits because git falls back to history-walking when given an unrecognized blob SHA in a revision-range context. To compute the correct drift commit list, used `git log 2cf59b1f..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` where `2cf59b1f` (`feat(40-02): add homeOverride...`) is the actual commit that introduced the `623a65b9...` baseline blob. This yielded exactly the 3 drift commits the planner pre-computed in `<drift_commits>`. The plan's pre-computed list was therefore correct; only the verification command in Task 1 step 4 had to be adapted.
- **Skipped Co-Authored-By footer per plan's explicit instruction** ("Do NOT add a Co-Authored-By footer; the project's recent commits don't use one consistently"). Recent project commits show inconsistent usage (some include the footer, some omit it) — followed the plan's directive.

## Audit-Only Contract Verification

Per pitfall B-11 (sacred-file content drift hidden inside an "audit-only" commit), the C2 commit was gated:

```
$ git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
(empty — zero bytes)

$ git show HEAD --stat
 .../core/src/providers/sdk-agent-runner-integrity.test.ts | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)

$ git log -1 --pretty=%s
chore(45-01): re-pin sacred-file BASELINE_SHA from 623a65b9... to 4f868d31... (audit-only, FR-CF-02)
```

Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` does NOT appear in the commit's file-stat — audit-only contract upheld.

## Deviations from Plan

### Adapted Verification Commands (no source-code deviation)

**1. [Rule 3 - Blocking] `git log 623a65b9..HEAD` revision-range command yielded misleading output**
- **Found during:** Task 1 step 4 (capture drift commit list)
- **Issue:** The plan's verification command `git log 623a65b9..HEAD --oneline -- nexus/packages/core/src/sdk-agent-runner.ts` returned 26 commits going back to `a6ac274a feat(v1.5): Claude Agent SDK integration` because `623a65b9...` is a BLOB SHA (output of `git hash-object`), not a commit SHA. Git's revision-range parser silently falls back to walking the entire history when given an unrecognized object as a range endpoint.
- **Fix:** Used `git cat-file -t` to confirm both `623a65b9...` and `4f868d31...` are blob types, then used `git log --find-object=623a65b9...` to locate the commit that introduced the previous baseline blob (`2cf59b1f feat(40-02): add homeOverride...`). Re-ran `git log 2cf59b1f..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` which returned exactly 3 commits matching the planner's pre-computed `<drift_commits>` list verbatim.
- **Files modified:** None (verification-only — no source code changed as a result of this adaptation)
- **Verification:** All 3 commits in the planner's `<drift_commits>` block (9f1562be, 47890a85, 9d368bb5) confirmed present in the corrected `git log` output, in the same most-recent-first order. No additional drift commits surfaced — the audit block is exhaustive.
- **Committed in:** N/A (verification-only adaptation — the audit block in `f5ffdd00` is unchanged from the plan's literal text)

---

**Total deviations:** 1 (verification command adaptation only — no source-code or commit-message change)
**Impact on plan:** None. The audit comment block landed in the integrity test verbatim per the plan's `<action>` step, the drift commit list is exhaustive, and the audit-only contract is upheld.

## Issues Encountered

- The Task 3 step 6 automated verify gate `grep -qE "^\s*$"` returned exit 1 against truly empty output (because `grep` treats empty input as zero matching lines). Confirmed manually via `[ -z "$DIFF_OUT" ]` test that the diff is genuinely empty — the audit-only contract is upheld; only the verify-gate's grep idiom was infelicitous. Did NOT alter the plan's verify-gate command in any committed code; this is a runner-side observation only.

## User Setup Required

None — no external service configuration needed for an audit-only re-pin.

## Next Phase Readiness

- Plan 45-01 lands cleanly in Wave 1 isolation. Sacred file commit history is unambiguous: the only commit modifying anything related to the sacred-file integrity in this phase is `f5ffdd00`, and that commit modifies ONLY the integrity test, not the sacred file.
- Wave 2 plans (45-02, 45-03, 45-04) can proceed without touching the sacred file or its integrity test — confirmed by the planner's `files_modified` frontmatter scan.
- Phase 47 FR-MODEL-02 Branch B (if taken) will re-pin the BASELINE_SHA again on top of `f5ffdd00` and must cite this commit as its starting baseline.
- Green CI restored for `npm run test:phase39` chain (claude.test.ts + no-authtoken-regression.test.ts + sdk-agent-runner-integrity.test.ts all pass exit 0).

## Self-Check: PASSED

- File `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` exists and contains `const BASELINE_SHA = '4f868d318abff71f8c8bfbcf443b2393a553018b';` — verified
- Commit `f5ffdd00` exists in `git log --oneline -3` — verified
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` `git hash-object` = `4f868d318abff71f8c8bfbcf443b2393a553018b` — verified
- `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` returns empty — verified
- `npm run test:phase39` exits 0 with all 3 chained tests passing — verified

---
*Phase: 45-carry-forward-sweep*
*Completed: 2026-05-01*
