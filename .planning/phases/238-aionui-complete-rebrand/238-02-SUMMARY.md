---
phase: 238-aionui-complete-rebrand
plan: 02
subsystem: infra
tags: [aionui, rebrand, sed, investigation, branding, install-script]
requires:
  - phase: 234-liv-ai-brand
    provides: compound AionUi→Liv AI sed pass (this plan finds the word-boundary leftovers)
provides:
  - Investigation findings driving Plan 238-01 (logo overlay target list + word-boundary regex)
  - Disposition table proving ZERO on-disk logo overlay targets (LOGO_TARGETS empty)
  - Word-boundary regex validation (\b(Aion|AION|aion)\b — 7 files in scope, no false positives)
  - LICENSE/NOTICE sha256 baseline for D-V43-APACHE-NOTICE byte-identity gate
affects: [238-01, 238-03]
tech-stack:
  added: []
  patterns: [single-batched-SSH-probe, word-boundary-rebrand-regex]
key-files:
  created: [.planning/phases/238-aionui-complete-rebrand/238-INVESTIGATION.md]
  modified: []
key-decisions:
  - "Ship Step 238-A logo overlay as scaffolding with empty LOGO_TARGETS=() — Section C found zero on-disk AionUi-branded logo assets (PWA icons out-of-scope, Lark third-party, theme art cosmetic)"
  - "Word-boundary regex \\b(Aion|AION|aion)\\b is REQUIRED — naive sed would mangle tension/version/application/dimension (311+ occurrences)"
patterns-established:
  - "Pattern: word-boundary brand-rebrand sed scoped to served static/ bundle, LICENSE/NOTICE excluded by path"
requirements-completed: []
duration: ~13min
completed: 2026-05-27
---

# Phase 238: Plan 02 — AionUi Rebrand Discovery Investigation Summary

**Single batched Mini PC SSH probe enumerating logo assets (zero overlay targets), 7 word-boundary `Aion` leftover files, and false-positive risk register — drives Plan 238-01's regex + empty LOGO_TARGETS.**

> ⚠️ **Retroactive backfill (created 2026-05-29).** Phase 238 originally tracked completion via `238-INVESTIGATION.md` + `238-03-DEPLOY-LOG.md` instead of GSD `*-SUMMARY.md` files, so `gsd-sdk init.execute-phase 238` falsely reported this plan incomplete. This file closes that `has_summary` tracking drift. The canonical evidence is **`238-INVESTIGATION.md`** (full Section A–H findings).

## Performance
- **Completed:** 2026-05-27T20:53:31Z
- **Tasks:** 1 (investigation)
- **Files modified:** 1 (investigation artifact)

## Accomplishments
- **Logo asset inventory (Section C):** ZERO on-disk files match `aion|logo|favicon|brand`; the only HTML logo refs are 3 PWA icons (out-of-scope) + a third-party Lark SVG (preserve). → Plan 238-01 ships empty `LOGO_TARGETS=()` scaffold.
- **Remaining Aion text (Section D):** 30 files contain case-insensitive `aion` but only **7** contain word-boundary `\b(Aion|AION|aion)\b` tokens (CSS class selectors `.aion-url-viewer-toolbar` / `.aion-file-changes-panel` — non-breaking to rewrite).
- **False-positive register (Section E):** word-boundary regex confirmed REQUIRED — excludes `tension`(108), `version`(90), `application`(36), `dimension`(20), etc.
- **D-V43-APACHE-NOTICE baseline (Section B):** LICENSE sha256 `a515d5a7…` + NOTICE sha256 `be9e969f…` captured for Plan 238-03 byte-identity gate.

## Task Commits
1. **Task 1: Mini PC investigation probe** — `8a5e2608` (docs: investigation — logo asset inventory + remaining Aion text + word-boundary regex validation)

## Files Created/Modified
- `.planning/phases/238-aionui-complete-rebrand/238-INVESTIGATION.md` — full Section A–H discovery (logo disposition table, word-boundary dry-run, false-positive register, sacred SHA snapshot)

## Decisions Made
- See key-decisions frontmatter. Empty `LOGO_TARGETS=()` + default `\b(Aion|AION|aion)\b → Liv` regex both locked here.

## Deviations from Plan
None — investigation executed as specified.

## Next Phase Readiness
- Plan 238-01 has explicit guidance for both Step 238-A (scaffold) and Step 238-B (regex + 7-file PRE count).

---
*Phase: 238-aionui-complete-rebrand*
*Completed: 2026-05-27 (summary backfilled 2026-05-29)*
