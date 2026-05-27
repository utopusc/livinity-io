---
phase: 229
plan: 01
subsystem: docs / posture-recording
tags: [v42, docs, single-user, posture, repo-only, v7-preservation, v43-deferred]
status: shipped
dependency_graph:
  requires: []
  provides:
    - docs/v42-single-user-posture.md
    - .planning/PROJECT.md v42 Posture section
  affects: []
tech_stack:
  added: []
  patterns: [markdown reference doc, posture-recording phase, decision-with-deferred-questions]
key_files:
  created:
    - docs/v42-single-user-posture.md (71 lines)
  modified:
    - .planning/PROJECT.md (+9 lines: new H2 section + 2 paragraphs + cross-link)
decisions:
  - v42 ships single-user (operator = bruce); multi-user explicitly deferred to v43
  - v7.0 multi-user infrastructure (7 PostgreSQL tables, /login route, ShareAppDialog, app gateway, per-user Docker compose, tRPC namespaces) PRESERVED but INACTIVE — nothing deleted
  - Per-user Liv Assistant data isolation framed as OPEN design question with 3 option sketches (A shared dir / B per-user volume-mount + multi-instance / C upstream multi-tenant); NO option selected — Phase 229 is recording, not deciding
  - Per-user Claude subscription auth named as a v43 constraint (ToS implication of one Max subscription backing multiple end-users)
  - Caddy wildcard cert via `CF_API_TOKEN` named as the v7.0-era blocker for the Settings → Users → Multi-user toggle
metrics:
  duration: ~15min
  completed_date: 2026-05-27
  commit_sha: 02c70a26
  sacred_sha_pre: f3538e1d811992b782a9bb057d1b7f0a0189f95f
  sacred_sha_post: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 229 Plan 01: Single-User Posture Documentation Summary

Recorded v42's deliberate single-user posture in a dedicated docs file (`docs/v42-single-user-posture.md`) plus a top-of-`Current State` section in `.planning/PROJECT.md`, capturing the decision + preserved v7.0 multi-user surfaces + the v43 deferred design questions.

## What shipped

- **NEW** `docs/v42-single-user-posture.md` (71 lines, single-newline-terminated): operator + future-self reference doc with 5 sections — Decision, Rationale, Preserved multi-user surfaces (v7.0 inventory) table, Deferred to v43 (4 sub-headings: per-user Liv Assistant data isolation with 3 option sketches A/B/C, per-user Claude subscription auth, Caddy wildcard cert + `CF_API_TOKEN`, v43 announcement + migration runbook), How to (eventually) enable multi-user (6-step pointer), Related phases (228/223/226/v7.0 cross-links).
- **MODIFIED** `.planning/PROJECT.md` — inserted `## v42 Posture: Single-User (Multi-User Deferred to v43)` H2 section immediately before `### Validated (v23.0)`. Two paragraphs: opening v7.0-preservation inventory (7 PostgreSQL tables enumerated inline + 5 code-surface references) and rationale + cross-link to the deferred docs file.
- **Single atomic commit** `02c70a26` with message starting `docs(229-01):` covering both files. Pre-commit sacred-sha hook reported `[sacred-sha] PASS: 20 files verified`.

## Verification gates

| Gate | Expected | Actual | Verdict |
|---|---|---|---|
| `docs/v42-single-user-posture.md` exists | yes | yes | PASS |
| `^# v42 Single-User Posture$` H1 count | 1 | 1 | PASS |
| `livos/packages/livinityd/source/modules/database/schema.sql` references | ≥1 | 1 | PASS |
| `user_app_access` mentions | ≥1 | 1 | PASS |
| `CF_API_TOKEN` mentions | ≥1 | 5 | PASS |
| `per-user Liv Assistant` mentions | ≥1 | 1 | PASS |
| 7 v7.0 table names backtick-quoted | all 7 | all 7 (`users`, `sessions`, `user_preferences`, `system_settings`, `user_app_access`, `user_app_instances`, `invites`) | PASS |
| 3 Liv Assistant option sketches | 3 | 3 (`Option A —` / `Option B —` / `Option C —`) | PASS |
| `^## v42 Posture: Single-User (Multi-User Deferred to v43)$` in PROJECT.md | 1 | 1 | PASS |
| `^## Current State (post v22.0 — AGI Platform)$` still in PROJECT.md | 1 | 1 | PASS |
| `^### Validated (v23.0)$` still in PROJECT.md | 1 | 1 | PASS |
| `docs/v42-single-user-posture.md` cross-link in PROJECT.md | ≥1 | 1 | PASS |
| `git log -1 --name-only` includes both files | yes | yes (`.planning/PROJECT.md` + `docs/v42-single-user-posture.md`) | PASS |
| `git log -1 --name-only` includes `liv/packages/core/` paths | no | no (sacred clean) | PASS |
| Sacred SHA pre-commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS |
| Sacred SHA post-commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS |
| Pre-commit hook | PASS | `[sacred-sha] PASS: 20 files verified` | PASS |

## Per-SC verdict

- **SC-01** (PROJECT.md has v42 single-user section): **PASS** — new H2 `## v42 Posture: Single-User (Multi-User Deferred to v43)` present exactly once at the natural seam between the v22 Current State narrative and the `### Validated (v23.0)` chronological timeline; 2 paragraphs cover posture + cross-link.
- **SC-02** (docs/v42-single-user-posture.md exists with rationale + deferred items): **PASS** — 71-line file with Decision + Rationale + 9-row Preserved surfaces table + 4 Deferred sub-sections (including 3 Liv Assistant option sketches A/B/C) + How-to-enable pointer + Related phases.
- **SC-03** (sacred SHA unchanged): **PASS** — pre and post snapshots both `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Neither touched file lives under `liv/packages/core/`. Pre-commit hook PASSED.
- **SC-04** (docs commit lands sacred-SHA hook PASS): **PASS** — single atomic commit `02c70a26`, hook output `[sacred-sha] PASS: 20 files verified`.

**4/4 SCs GREEN.**

## Deviations from Plan

- **None.** Plan executed byte-for-byte as written. One mechanical note: `.planning/PROJECT.md` is globally gitignored (.gitignore:50 `.planning/`), so `git add -f` was required to stage it (matching the precedent documented in Phase 232 STATE.md trail — "git add `-f` needed for .planning/ commit (.gitignore excludes .planning/ globally; prior phases used same pattern — captured but not new)"). No content deviation, only a staging-command nuance.

## Idempotency

Re-running this plan against the post-commit tree produces zero further diff: the H1 `# v42 Single-User Posture` and the H2 `## v42 Posture: Single-User (Multi-User Deferred to v43)` are unique strings — a re-run sees them present and no-ops.

## Mini PC contact

None. Phase 229 is repo-only by design. Zero SSH, zero `curl https://bruce.livinity.io/`, zero `update.sh` invocation. Mini PC state unchanged.

## Related phases / cross-links

- **Phase 228** Claude auth bridge (referenced in new docs file as the audit confirming `/home/bruce/.claude/.credentials.json` is the shared single-user creds path).
- **Phase 223** vendor AionUi install (referenced as `liv-assistant.service` lineage + `/opt/liv-assistant/data/` single-dir lineage).
- **Phase 226** Caddy `/liv` proxy (referenced as the single-instance proxy that multi-user activation would extend to per-subdomain).
- **v7.0 milestone** (referenced for the original multi-user ship that introduced all 7 PostgreSQL tables + login + invite + per-user Docker + app gateway — all preserved).

## Self-Check: PASSED

- FOUND: docs/v42-single-user-posture.md (71 lines)
- FOUND: .planning/PROJECT.md (contains `## v42 Posture: Single-User (Multi-User Deferred to v43)`)
- FOUND: commit `02c70a26` in `git log` (`docs(229-01): record v42 single-user posture + v7.0 preservation + v43 deferred items`)
- FOUND: sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged
- FOUND: pre-commit hook output `[sacred-sha] PASS: 20 files verified` on commit `02c70a26`
