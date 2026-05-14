---
phase: 115-ui-component-inventory
plan: 01
subsystem: ui
tags: [ui-inventory, design-system, v35, mini-pc, documentation, livinityd, tailwind, shadcn, framer-motion]

# Dependency graph
requires:
  - phase: v35-DESIGN-SYSTEM-MILESTONE
    provides: Migration tag taxonomy + dashboard.html canonical reference + 7-bucket surface inventory targets
provides:
  - Exhaustive A→Z map of 654 TSX files under livos/packages/ui/src/
  - Per-file migration tag from locked 5-tag taxonomy
  - Per-directory tag and idiom distributions (drives Phase 117/120/121 scoping)
  - Heuristic playbook (extract.mjs + build-inventory.mjs) reusable for 115-02 (Server5) and 115-03 (Landing)
affects: [116-design-tokens, 117-canonical-component-migration, 119-ui-kit-extraction, 120-feature-shell-migration, 121-visual-regression-baseline]

# Tech tracking
tech-stack:
  added: []  # documentation-only phase, no runtime deps
  patterns:
    - "Two-stage scratch pipeline: header extraction (Bash) → signal scoring (Node) → markdown writer (Node)"
    - "First-40-lines signal heuristic for 600+ file inventories (low-context-cost classification)"
    - "Migration tag column on every row — keeps inventory machine-actionable for downstream phases"

key-files:
  created:
    - ".planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md (919 lines, 654 row inventory)"
  modified: []  # D-115-READ-ONLY honored — zero source-tree edits

key-decisions:
  - "Used Node.js scratch scripts (extract.mjs + build-inventory.mjs) for bulk header analysis — single Read-per-file across 654 files was infeasible inside the agent loop"
  - "Read first 120 lines per file (deeper than the 40-line plan suggestion) — keeps no-styling-signal rate at 0% for shipped components"
  - "Reclassified initial 217 unknown → 0 by adding has_jsx_return + is_svg_only + is_test signals; shipping components now have a definite tag"
  - "Files under assets/, hooks/, lib/, trpc/ and *.test.tsx / *.spec.tsx are tagged wontfix (non-shipping or non-visual support code)"
  - "SVG-icon-only components are wontfix (icons are not themable chrome)"
  - "Phase 119 ui-kit replacement targets: all 29 shadcn-components/ files + 1 thin wrapper under components/ (30 total replace-with-library)"

patterns-established:
  - "Inventory document structure: taxonomy header → summary-by-directory → per-directory tables → aggregate counts → operator-review queue → wontfix rationale → heuristic notes (replicate verbatim in 115-02 and 115-03)"
  - "Tag column conventions: only one of {canonical, needs-migration, replace-with-library, wontfix, unknown} per row — keeps regex sweeps in downstream phases trivial"
  - "Notes column carries the actionable hint (e.g. 'uses framer-motion; 3 inline-style site(s)') so Phase 117 planners can scope migrations by note-substring search"

requirements-completed: []  # plan-level requirements array was empty in frontmatter

# Metrics
duration: ~25min
completed: 2026-05-14
---

# Phase 115 Plan 01: Mini PC livinityd UI Inventory Summary

**654 TSX files under `livos/packages/ui/src/` classified into 484 needs-migration / 30 replace-with-library / 140 wontfix / 0 unknown — zero source-tree edits, machine-actionable foundation for v35 design system migration.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-14T20:57Z (approx — plan kickoff)
- **Completed:** 2026-05-14T21:22Z
- **Tasks:** 2 of 2 (enumerate + classify-and-write)
- **Files modified:** 1 (`.planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md`)

## Accomplishments

- Walked the entire `livos/packages/ui/src/` tree, captured all 654 TSX files in a deterministic sort.
- Extracted styling signals (Tailwind, shadcn imports, framer-motion, inline `style={{...}}`, CSS modules, JSX root tag, default/named export, JSDoc) from each file's first 120 lines using a Node.js scratch pipeline.
- Wrote a 919-line `INVENTORY-MINI-PC.md` containing: migration tag taxonomy, methodology, summary-by-directory, seven per-bucket tables (one row per file), aggregate counts, operator-review queue (empty), wontfix rationale, and heuristic notes for 115-02 replication.
- Honored **D-115-READ-ONLY** in full: `git diff HEAD -- livos/ liv/ scripts/ packages/` returns empty.

## File-count breakdown

| Bucket | TSX files | Match against milestone target |
|---|---|---|
| `components/` | 95 | exact (target 95) |
| `modules/` | 123 | exact (target 123) |
| `routes/` | 219 | exact (target 219) |
| `shadcn-components/` | 29 | exact (target 29) |
| `features/` | 142 | exact (target 142) |
| `layouts/` | 7 | exact (target 7) |
| `providers/` | 23 | exact (target 23) |
| `misc/` (assets 5 + hooks 5 + lib 1 + trpc 2 + root 3) | 16 | within tolerance |
| **TOTAL** | **654** | exact match to v35 master plan |

## Migration tag distribution

| Tag | Count | % | Action surface |
|---|---|---|---|
| `canonical` | 0 | 0.0% | Nothing already matches dashboard.html — entire surface is migration territory |
| `needs-migration` | 484 | 74.0% | Phase 117/120 scope — restyle to canonical tokens |
| `replace-with-library` | 30 | 4.6% | Phase 119 ui-kit replacement targets (29 shadcn-components + 1 thin wrapper) |
| `wontfix` | 140 | 21.4% | Tests, assets/icons, hooks/lib/trpc, bootstrap roots, SVG-only components, pure context providers |
| `unknown` | 0 | 0.0% | None — every component received a definite classification |

## Task Commits

1. **Task 1: Enumerate every TSX file and bucket by top-level directory** — _not separately committed (scratch artifact in `.work/file-list.txt` per plan note)._
2. **Task 2: Classify every file and write INVENTORY-MINI-PC.md** — `0aab97d4` (docs)

## Files Created/Modified

- `.planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md` — 919-line per-file inventory document, 654 data rows, 7 directory tables + summary tables + aggregate counts + operator-review queue + wontfix rationale + heuristic notes.

Scratch artifacts (not committed, per plan's `.work/` guidance):
- `.planning/phases/115-ui-component-inventory/.work/file-list.txt` (654 TSX paths, sorted)
- `.planning/phases/115-ui-component-inventory/.work/headers2/` (first-120-lines snapshots, 654 files)
- `.planning/phases/115-ui-component-inventory/.work/records.json` (extracted signal records)
- `.planning/phases/115-ui-component-inventory/.work/extract.mjs` (Node signal extractor)
- `.planning/phases/115-ui-component-inventory/.work/build-inventory.mjs` (Node markdown writer)

## Decisions Made

- **Two-stage scratch pipeline over single-pass Read-per-file.** Reading 654 individual files through the agent's `Read` tool would have consumed enormous context and time. Instead, a Bash `head -n 120` walk wrote header snapshots to `.work/headers2/`, then a Node script (`extract.mjs`) extracted styling signals into JSON, and a second Node script (`build-inventory.mjs`) emitted the markdown. Net: classification of all 654 files in seconds, with zero source-tree mutation.
- **Read 120 lines per file, not 40.** Plan suggested 40 lines as the budget but in practice many real components (especially under `components/motion-primitives/` and `routes/`) have imports + type definitions filling the first 40 lines, with the actual JSX body deeper. Bumping to 120 dropped the `unknown` rate from 33% (217 files) to 0% without any per-file Read calls.
- **Added classification signals beyond the plan's 4 rules:** `has_jsx_return`, `is_svg_only`, `is_test`, `is_story`. These distinguish shipping UI from support code (tests, icons, helpers) — critical for keeping `wontfix` accurate.
- **`shadcn-components/` → `replace-with-library` (all 29 entries) by Rule 1, AND one additional thin wrapper under `components/` matching the primitive-name heuristic.** 30 total ui-kit replacement targets feed Phase 119 scope cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Header window extended from 40 to 120 lines**
- **Found during:** Task 2 first build pass
- **Issue:** First-40-lines budget left 217 files (33%) tagged `unknown` because imports + types pushed actual JSX past the 40-line mark.
- **Fix:** Re-extracted headers at 120 lines and added complementary signals (`has_jsx_return`, `is_svg_only`, `is_test`, `is_story`). Plan's stated 40-line budget is a guideline ("DO NOT read the entire file unless the first 40 lines are insufficient") — 120 lines stays well below "entire file" and produced 0 unknowns.
- **Files modified:** `.planning/phases/115-ui-component-inventory/.work/extract.mjs` (scratch only — not committed; tracked in summary for 115-02 replication).
- **Verification:** Re-ran build → `unknown: 0`, all 654 files have definite tag.
- **Committed in:** `0aab97d4` (Task 2 commit — only the final INVENTORY-MINI-PC.md is shipped; the scratch script change is local).

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No scope creep. Heuristic refinement only. Source tree untouched. The deeper window is now documented in the SUMMARY's "Heuristic notes" section of INVENTORY-MINI-PC.md so 115-02 (Server5) and 115-03 (Landing) can replicate the same approach.

## Issues Encountered

- **First-pass classification produced 217 `unknown` tags.** Root cause: 40-line window too short for the actual repo's TSX shape. Resolved by extending the header window (see Deviations above).
- **PowerShell-on-Windows quirks.** Initial attempts to use `python3` failed (not installed on Windows host). Switched to Node.js (already present at v24.11.1) — Node ES modules ran cleanly through Bash.
- **Template literal nesting bug** in `build-inventory.mjs` (backtick inside a backtick string interpolation). Fixed by switching to string concatenation for the affected line. One iteration cycle, no impact on output.

## User Setup Required

None. Pure documentation phase.

## Next Phase Readiness

- **115-02 (Server5 inventory)** can run identically against `/opt/platform/web/src/` via SSH. The scratch pipeline (`extract.mjs` + `build-inventory.mjs`) is reusable — just point the `headers2/` extraction at the Server5 sources (or rsync them down). Expected output: ~150-line `INVENTORY-SERVER5.md`.
- **115-03 (Landing + visual baseline)** can proceed once 115-02 ships. Landing surface is much smaller (8 HTML files) and the visual-baseline screenshot capture is operator-walked or skipped per plan note.
- **Phase 116 (design tokens)** has now-precise scope: 484 needs-migration components define the migration target. Token introduction can start with the highest-traffic buckets first (routes/ 219 files → modules/ 123 files → features/ 142 files).
- **Phase 119 (ui-kit extraction)** has its replacement target list: 30 files under `replace-with-library`. The 29 `shadcn-components/` files map 1:1 to ui-kit primitive names.
- **No blockers identified.**

## Self-Check: PASSED

- `INVENTORY-MINI-PC.md` exists (919 lines).
- `115-01-SUMMARY.md` exists (this file).
- Scratch pipeline files exist under `.work/` (intentionally uncommitted per plan note).
- Commit `0aab97d4` present in `git log --oneline --all`.
- `git diff HEAD -- livos/ liv/ scripts/ packages/` returns empty (D-115-READ-ONLY).
- 10/10 random row-paths spot-checked resolve to real files under `livos/packages/ui/src/`.
- All 5 plan-level automated verify gates returned PASS.

---
*Phase: 115-ui-component-inventory*
*Completed: 2026-05-14*
