# Phase 54: B1 — Live-Verification Gate (Process Change) — Context

**Gathered:** 2026-05-02
**Status:** EXECUTED INLINE — gsd toolkit edited in user's home install
**Mode:** Auto-generated (workflow.skip_discuss=true) + post-execution

<domain>
## Phase Boundary

**Goal:** Block `/gsd-complete-milestone` from returning audit `passed` while any phase has `status: human_needed` UNLESS the user explicitly attests live UAT walking OR provides `--accept-debt` override. Address the v29.4 disaster where four `human_needed` UATs were silently deferred and the milestone shipped broken.

**Files modified (OUTSIDE this repo, in user's home gsd-toolkit installation):**
- `~/.claude/get-shit-done/workflows/complete-milestone.md` — added new `<step name="live_verification_gate">` between `pre_close_artifact_audit` and `verify_readiness`
- `~/.claude/get-shit-done/workflows/audit-milestone.md` — added `human_needed` to status enum + scan logic that surveys phase VERIFICATION.md files

**Files in this repo:**
- `.planning/phases/54-b1-live-verification-gate/{CONTEXT,VERIFICATION}.md` — forensic record of the change

**Out of scope:**
- Bringing the gsd toolkit into a versioned repo (it's a user-level install). The change persists as long as the user does not `/gsd-update`.
- Replicating the change for other GSD users (each user's install is independent).
- Auditing past milestones for missed UATs (limited to v29.4 → next milestone close cycle).
</domain>

<decisions>
## Implementation Decisions

### D-54-01 (LOCKED): Gate runs BEFORE verify_readiness

The new `live_verification_gate` step is positioned right after `pre_close_artifact_audit` and BEFORE `verify_readiness`. Rationale: hard-block early. If the gate decides to block, we don't waste time on stats/extraction/archive steps that follow. If the gate is clear, the rest of the workflow proceeds unchanged.

### D-54-02 (LOCKED): AskUserQuestion default = "No"

The first option in the AskUserQuestion list is "No — I have NOT walked the UATs". This is intentional ergonomic friction. Accidental enter-key-to-confirm cannot bypass the gate — the user must consciously SELECT "Yes" with attestation note. This addresses FR-B1-03.

### D-54-03 (LOCKED): `--accept-debt` flag bypass with forensic logging

For genuine emergencies, `--accept-debt` flag bypasses the AskUserQuestion. BOTH paths (flag bypass AND attestation) append a row to `MILESTONES.md` under a new `## Live-Verification Gate Overrides` section with:
- ISO8601 UTC timestamp
- milestone version
- comma-separated phase slugs
- count of UATs waived
- user-supplied free-text reason or attestation note
- mode (`--accept-debt` vs `attestation`)

This is APPEND-ONLY — no editing or deletion. Provides forensic trail for retroactive review. Addresses FR-B1-04.

### D-54-04 (LOCKED): Audit status enum extended with `human_needed`

`audit-milestone.md` now declares status precedence: `gaps_found > human_needed > tech_debt > passed`. The new scan logic:
1. Scans `*-VERIFICATION.md` files for `status: human_needed`
2. Scans `MILESTONES.md` for any "Live-Verification Gate Overrides" entry referencing this milestone version
3. If `human_needed` files exist AND no override is recorded → audit status = `human_needed`

This means the retroactive v29.4 audit (FR-B1-05) WILL return `human_needed` until either:
- v29.5 Phase 55 walks the v29.4 UATs and the user attests them in MILESTONES.md
- An `--accept-debt` override is recorded for v29.4 explicitly

### D-54-05 (Claude's discretion): User attestation requires brief note

When user selects "Yes" to attestation, the workflow prompts: "Brief note of what you walked (1 line)?". This 1-line note is captured in MILESTONES.md alongside the timestamp. Cheap forensic data — if the milestone later shows regressions, the note answers "what was supposedly verified".

</decisions>

<code_context>
## Existing Code Insights

- **`~/.claude/get-shit-done/workflows/complete-milestone.md` line 38-82** — pre_close_artifact_audit step. Insertion point: line 82 (end of step). Step structure follows the `<step name="...">...</step>` pattern.
- **`~/.claude/get-shit-done/workflows/audit-milestone.md` line 199-205** — Status values block. Insertion point: line 205, after the existing 3-status enum. Also line 171 (YAML status enum) and line 55 (status overview).
- **VERIFICATION.md frontmatter format** (verified across phases 49-53): `status: passed | human_needed | passed (with deferral) | etc`. Frontmatter is YAML at top of file. Scan via `grep -qE "^status:\s*human_needed"` is robust against trailing comments / whitespace.
- **MILESTONES.md** — exists at project root `.planning/MILESTONES.md`. Append-only convention already used for milestone entries. New "Live-Verification Gate Overrides" section appends at file END to preserve existing structure.

## What changed

`~/.claude/get-shit-done/workflows/complete-milestone.md`:
- New `<step name="live_verification_gate">` block (~85 lines added) between line 82 and line 84
- No other modifications

`~/.claude/get-shit-done/workflows/audit-milestone.md`:
- Line 55: status enum updated `passed | gaps_found` → `passed | gaps_found | tech_debt | human_needed`
- Line 171: YAML status enum updated similarly
- Line 199-205: Status values block extended with `human_needed` definition (~25 lines added) + scan logic + per-phase surface markdown table

</code_context>

<specifics>
## Specific Requirements

- FR-B1-01 (workflow scans VERIFICATION files, counts human_needed) — DONE in both complete-milestone.md and audit-milestone.md
- FR-B1-02 (count > 0 returns human_needed by default) — DONE in audit-milestone.md status precedence (`human_needed` ranks above `passed`)
- FR-B1-03 (AskUserQuestion default "No") — DONE in complete-milestone.md (first option = "No")
- FR-B1-04 (--accept-debt with MILESTONES.md log) — DONE in complete-milestone.md (forensic trail captured in `## Live-Verification Gate Overrides` section)
- FR-B1-05 (retroactive v29.4 audit returns human_needed) — IMPLICIT via the audit-milestone.md scan: any v29.4 phase with `status: human_needed` triggers it, and there's no override entry yet for v29.4

</specifics>

<deferred>
## Deferred Ideas

- Per-UAT-step attestation tracking (instead of per-phase) — out of scope; per-phase is already a major improvement
- Automatic UAT execution by gsd-executor (replacing manual walk) — out of scope; would require browser automation + per-test environments
- Migrating the gsd toolkit to a public repo so the change is reviewable + reproducible — out of scope; user runs gsd toolkit as a personal install
- Adding a CI/CD check that scans for `human_needed` VERIFICATION files in PR branches — out of scope; the user's workflow runs locally

</deferred>
