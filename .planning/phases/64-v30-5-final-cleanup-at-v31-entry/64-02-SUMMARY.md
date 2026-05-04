---
phase: 64-v30-5-final-cleanup-at-v31-entry
plan: 02
subsystem: milestone-audit
tags: [uat, classification, milestone-audit, v29.3, v29.4, v29.5]
requires: []
provides:
  - 14-row UAT classification matrix at .planning/phases/64-.../64-UAT-MATRIX.md
  - canonical needs-human-walk count for v30.5 close (11 items)
affects:
  - .planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-UAT-MATRIX.md
tech-stack:
  added: []
  patterns: [VERIFICATION.md-status-vocabulary, milestone-audit-honest-debt]
key-files:
  created:
    - .planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-UAT-MATRIX.md
  modified: []
decisions:
  - D-05 hard rule honored — zero silent elevations of human_needed to script-verified
  - D-49-blocked classified as failed (not human-walk) because phase explicitly cannot reach goal
  - D-43-obsolete classified explicitly given Phase 52 migration 0010_drop_mirofish.sql
metrics:
  duration_minutes: 7
  completed_date: 2026-05-04
  total_tasks: 1
  files_created: 1
requirements: [CARRY-02]
---

# Phase 64 Plan 02: 14-UAT Classification Matrix Summary

**One-liner:** Classified all 14 v29.3+v29.4+v29.5 carryforward UAT/VERIFICATION/AUDIT files per the canonical UAT-discipline rule (`feedback_milestone_uat_gate.md`), surfacing **11 honest `needs-human-walk` items** that the user must walk before v30.5 milestone close.

## What was done

1. Read all 14 source files in batched parallel reads (no SSH calls, no network):
   - **v29.3 (6):** `39-AUDIT.md`, `40-UAT.md`, `41-UAT.md`, `42-UAT.md`, `43-UAT.md`, `44-UAT.md`
   - **v29.4 (4):** `45-VERIFICATION.md`, `46-UAT.md`, `47-UAT.md`, `48-UAT.md`
   - **v29.5 (4):** `49-VERIFICATION.md`, `50-VERIFICATION.md`, `51-VERIFICATION.md`, `52-VERIFICATION.md`
2. Read context guardrails: `64-CONTEXT.md` (D-04, D-05, D-06), `feedback_milestone_uat_gate.md`, `v29.4-REGRESSIONS.md`.
3. Classified each UAT into one of 4 statuses (`script-verified`, `needs-human-walk`, `failed`, `obsolete`) with explicit rationale honoring D-05 (no silent elevation of `human_needed` → `script-verified`).
4. Wrote `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-UAT-MATRIX.md` (430 lines): preamble + vocabulary + 14-row table + per-row evidence subsections + summary counts + D-NO-SERVER4 attestation.
5. Verified file passes the plan's automated structural check (14 evidence blocks, 57 status tags across the doc, all 3 milestones cited, `feedback_milestone_uat_gate` cited in preamble).
6. Committed atomically as `b54dbcd5 docs(64-02): UAT classification matrix for 14 carryforward UATs`.

## **Honest debt surfaced (PROMINENT)**

| Status counts          | N |
|------------------------|---|
| `script-verified`      | 1 |
| **`needs-human-walk`** | **11** |
| `failed`               | 1 |
| `obsolete`             | 1 |
| **Total**              | **14** |

### The 11 `needs-human-walk` items the user must walk before v30.5 closes

| Row | Phase | Title                                       | Browser-dependent for |
|----:|-------|---------------------------------------------|-----------------------|
| 2   | 40    | per-user-claude-oauth-home-isolation        | OAuth device-code flow + 2-browser concurrent login + DOM-grep for `sk-ant-` absence |
| 3   | 41    | anthropic-messages-broker                   | Section G — per-user subdomain login + AI Chat HOME isolation walk |
| 4   | 42    | openai-compatible-broker                    | inherits Phase 41 prereq + Python `openai` SDK round-trip (D-1/D-2) |
| 6   | 44    | per-user-usage-dashboard                    | Settings → AI Configuration UI rendering: 3 stat cards + filter chips + 80%/429 banners |
| 7   | 45    | carry-forward-sweep                         | FR-CF-04 live token round-trip + FR-CF-03 WS reconnect mid-mutation |
| 8   | 46    | fail2ban-admin-panel                        | 9 sections of UI walks: sidebar render + 3 banners + modals + cellular toggle + lockout recovery |
| 9   | 47    | ai-diagnostics                              | 3-card UI render + atomic-swap visualization + cross-user `app_not_owned` DOM probe |
| 10  | 48    | live-ssh-session-viewer                     | WS live-tail UI + click-to-copy + click-to-ban modal cross-link + scroll-tolerance + RBAC 4403 |
| 12  | 50    | a1-tool-registry-seed                       | FR-A1-04 live AI Chat invokes a built-in tool (closes "shell: No such tool available" regression) |
| 13  | 51    | a2-streaming-fix                            | Token-by-token streaming visible in browser AI Chat (visual judgment, no automatable proxy) |
| 14  | 52    | a3-marketplace-state                        | FR-A3-03 `apps.livinity.io` browser visit confirms Bolt.diy renders + MiroFish absent |

Of these 11:
- **6 are pure browser UI walks** (Rows 2, 6, 8, 9, 10, 13) — must happen on `https://bruce.livinity.io` in a real browser session.
- **5 are browser + curl/psql combos** (Rows 3, 4, 7, 12, 14) — can be batched with one Mini PC SSH session if Phase 40 OAuth has already happened.

### The 1 `failed` item

| Row | Phase | Title                  | Why failed                                                                                        |
|----:|-------|------------------------|---------------------------------------------------------------------------------------------------|
| 11  | 49    | mini-pc-diagnostic     | SSH BLOCKED by fail2ban self-ban; Mini PC capture never completed (3/5 passed, 1 BLOCKED). Phases 50-53 fixes were built on REGRESSIONS.md hypotheses, not live diagnostic data. |

**Carry-forward action:** When user is on Mini PC for any other v30.5 walk (Rows 12-14 especially), opportunistically re-run Phase 49's batched SSH diagnostic to validate that Phases 50-53 fixes actually closed their target regressions live (not just at unit-test level).

### The 1 `obsolete` item

| Row | Phase | Title                                       | Why obsolete                                                                |
|----:|-------|---------------------------------------------|-----------------------------------------------------------------------------|
| 5   | 43    | marketplace-integration-anchor-mirofish     | MiroFish DELETED via Phase 52 migration `0010_drop_mirofish.sql`. UAT anchor (FR-MARKET-02) no longer exists. |

The marketplace mechanism (FR-MARKET-01: `requiresAiProvider:true` flag injection) is still valid and can be re-validated against any future opt-in app.

### The 1 `script-verified` item

| Row | Phase | Title                                | Why eligible                                                          |
|----:|-------|--------------------------------------|-----------------------------------------------------------------------|
| 1   | 39    | risk-fix-close-oauth-fallback        | Read-only caller-inventory audit — no UI/runtime UAT; SHA pin self-verified |

This is the only row where `script-verified` is honest because the source artifact is itself a static inventory, not a behavior assertion.

## D-05 hard rule compliance — silent-elevation cross-check

For every source file with frontmatter `status: human_needed`, the matrix Status MUST NOT be `script-verified`. Cross-check:

- **Row 7 (Phase 45, source `status: human_needed`)** → matrix `needs-human-walk` ✓ (no elevation)
- **Row 11 (Phase 49, source `status: human_needed`)** → matrix `failed` ✓ (downgrade is fine; D-05 forbids upward elevation only)
- **Row 13 (Phase 51, source `status: human_needed`)** → matrix `needs-human-walk` ✓ (no elevation)

For sources with `status: passed` (mechanism), the matrix is allowed to remain conservative when FR-* live verification was deferred:
- **Row 12 (Phase 50, source `status: passed`)** → matrix `needs-human-walk` (because FR-A1-03/04 explicitly DEFERRED to Phase 55, which never ran)
- **Row 14 (Phase 52, source `status: passed`)** → matrix `needs-human-walk` (because FR-A3-03 DEFERRED to Phase 55)

These are NOT elevations — they are honest deferrals reflecting that mechanism-pass at unit-test level is not equivalent to feature-pass at user level (the canonical lesson from `v29.4-REGRESSIONS.md`).

## Decisions made

1. **Phase 49 classified `failed`, not `needs-human-walk`** — when a phase's own VERIFICATION.md explicitly says it cannot reach its core deliverable due to an environmental constraint (fail2ban self-ban) that was never resolved, calling it "needs-human-walk" understates the debt. `failed` is the honest classification.
2. **Phase 43 classified `obsolete`, not `failed`** — MiroFish's removal was an intentional product decision (Phase 52 migration), not a regression. `obsolete` correctly captures "scope removed, supersession pointer recorded".
3. **Phase 39 is the only `script-verified` row** — every other phase's UAT involves either browser interaction or a chain of dependencies that includes browser interaction. This is uncomfortable but honest. The matrix would be untrustworthy if we elevated curls-only-look-scriptable rows.
4. **No SSH was attempted during this plan's execution** — per source-file analysis being sufficient (plan default-lean: classify based on what the original VERIFICATION.md describes, without re-running it). The Mini PC SSH-rate-limit discipline (`feedback_ssh_rate_limit.md`) and the documented Phase 49 fail2ban ban argued for not re-probing.

## Deviations from plan

**None — plan executed exactly as written.**

The plan's `<action>` step 1f said "Per D-NO-SERVER4: Server4 is OFF-LIMITS. If any UAT mentions Server4, classify it `obsolete` with rationale 'D-NO-SERVER4 hard rule'." No row in the matrix targets Server4 — Server5 is the platform-store host and is acceptable per `MEMORY.md`. D-NO-SERVER4 attestation included in matrix preamble.

Plan's automated verification (the inline node command) passed: `UAT matrix OK: 14 evidence blocks, 57 status tags, all 3 milestones cited`.

## Self-Check: PASSED

- File `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-UAT-MATRIX.md` exists (430 lines on disk).
- Commit `b54dbcd5` exists in `git log --oneline`: `docs(64-02): UAT classification matrix for 14 carryforward UATs`.
- All 14 source files were read (verified by reads in this session's tool log).
- Plan automated check (`node -e ...`) returned exit 0 with all conditions met.
- D-NO-SERVER4 attested in matrix preamble (Server4 zero references; only Mini PC + Server5 cited).
- D-05 silent-elevation guard manually verified above — zero elevations.

## Output commit

| Commit    | Subject                                                                  |
|-----------|--------------------------------------------------------------------------|
| `b54dbcd5` | `docs(64-02): UAT classification matrix for 14 carryforward UATs`       |

---

*Phase 64 Plan 02 executor — 2026-05-04. Source files read but not modified per `<sacred_boundary>`. Output is exactly one new file in the phase dir.*
