---
phase: 238-aionui-complete-rebrand
plan: 01
subsystem: infra
tags: [aionui, rebrand, sed, branding, install-script, pipefail, svg]
requires:
  - phase: 238-aionui-complete-rebrand
    provides: Plan 238-02 investigation (logo target list + word-boundary regex + 7-file PRE count)
provides:
  - Repo-side liv-logo.svg scaffold (forward-compatible overlay asset)
  - install-liv-assistant.sh Step 238-A logo overlay framework (empty LOGO_TARGETS=())
  - install-liv-assistant.sh Step 238-B word-boundary \b(Aion|AION|aion)\b → Liv sed pass
  - pipefail-safe grep+wc wrapping (survives zero-match POST grep under set -euo pipefail)
affects: [238-03]
tech-stack:
  added: []
  patterns: [set-+o-pipefail-wrap-around-grep-wc, empty-LOGO_TARGETS-scaffold]
key-files:
  created: [caddy/branding/liv-logo.svg]
  modified: [scripts/install-liv-assistant.sh, docs/liv-assistant-install.md]
key-decisions:
  - "Ship LOGO_TARGETS=() empty per 238-02 Section C — overlay framework is forward-compatible scaffold, WARN-skip is correct steady state"
  - "Word-boundary sed scoped to ${REBRAND_TARGET}/static/ — LICENSE/NOTICE one level up, structurally excluded"
patterns-established:
  - "Pattern: wrap PRE/POST grep+wc idempotency guards in `set +o pipefail`…`set -o pipefail` (mirrors Phase 235 count_unprefixed_paths)"
requirements-completed: []
duration: ~20min
completed: 2026-05-27
---

# Phase 238: Plan 01 — Repo-Side Logo Overlay + Word-Boundary Aion Sed Summary

**install-liv-assistant.sh gains a logo-overlay scaffold (empty LOGO_TARGETS) + a word-boundary `\b(Aion|AION|aion)\b → Liv` sed pass over the served static/ bundle, plus a pipefail-safe fix so the zero-match POST grep can't abort the installer.**

> ⚠️ **Retroactive backfill (created 2026-05-29)** to close the GSD `has_summary` tracking drift. Canonical execution evidence: commits `52f1232b` (feat) + `09cb8ebf` (pipefail hot-fix), verified live in `238-03-DEPLOY-LOG.md`.

## Performance
- **Completed:** 2026-05-27 (pre-deploy)
- **Tasks:** 3 (logo SVG scaffold + install-script extension + docs)
- **Files modified:** 3

## Accomplishments
- **Step 238-A:** logo-overlay framework shipped in `install-liv-assistant.sh` with empty `LOGO_TARGETS=()` (per 238-02 Section C — zero on-disk targets); `caddy/branding/liv-logo.svg` added as forward-compatible scaffold.
- **Step 238-B:** word-boundary `\b(Aion|AION|aion)\b → Liv` sed pass over `/opt/liv-assistant/current/static/` with grep idempotency pre-check + post-verify (PRE=7 → POST=0 expected delta).
- **Pipefail hot-fix:** wrapped both PRE and POST `grep … | wc -l` assignments in `set +o pipefail`…`set -o pipefail` — zero-match grep exits 1 which, under the script's `set -euo pipefail`, aborted the installer before bun-install/restart steps (surfaced on first deploy pass).

## Task Commits
1. **Task: logo asset + install-script Step 238-A/B** — `52f1232b` (feat: logo asset overlay + word-boundary Aion→Liv sed)
2. **Hot-fix: pipefail-safe grep+wc** — `09cb8ebf` (fix: wrap word-boundary grep+wc pipelines with set +o pipefail to survive zero-match POST)

## Files Created/Modified
- `caddy/branding/liv-logo.svg` — forward-compatible Livinity logo overlay scaffold
- `scripts/install-liv-assistant.sh` — Step 238-A logo overlay (empty LOGO_TARGETS) + Step 238-B word-boundary sed + pipefail-safe guards
- `docs/liv-assistant-install.md` — install-script doc update

## Decisions Made
- See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues
**1. [DELTA-PERMIT-NO-RECONSIDER] pipefail-safe grep+wc wrapping**
- **Found during:** Plan 238-03 first deploy pass (installer aborted after sed at the POST grep)
- **Issue:** zero-match `grep | wc -l` exits 1 → under `set -euo pipefail` the command substitution failed → `set -e` killed the script before bun-install/restart
- **Fix:** `set +o pipefail`…`set -o pipefail` around PRE/POST grep+wc (same shape as Phase 235 `count_unprefixed_paths`)
- **Committed in:** `09cb8ebf`

---
**Total deviations:** 1 auto-fixed. **Impact:** internal to the install-script; deliverables + SC verdicts unchanged.

## Next Phase Readiness
- Plan 238-03 can deploy: PRE word-boundary count = 7, idempotent re-run short-circuits on PRE=0.

---
*Phase: 238-aionui-complete-rebrand*
*Completed: 2026-05-27 (summary backfilled 2026-05-29)*
