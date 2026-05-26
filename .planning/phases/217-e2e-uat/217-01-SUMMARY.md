# Phase 217 / Plan 01 — SUMMARY (UAT-PENDING)

**Status:** 🟡 OPERATOR-PENDING 2026-05-26. Autonomous Claude-side prep complete; operator walk required to close milestone.
**Sacred SHA:** preserved.

## What shipped (Claude side)

- `.planning/phases/217-e2e-uat/UAT-CHECKLIST.md` — exhaustive operator-walked checklist:
  - Per-phase sections (P209 through P216) with step-by-step PASS criteria.
  - Carry-forward summary (~25 carries cataloged) so nothing falls between cracks.
  - Final verdict template.
- All upstream phases (P212, P213, P214, P215, P216) flipped to CODE-COMPLETE / DOCS-COMPLETE.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| UAT-01 | UAT-CHECKLIST.md written | 🟢 GREEN |
| UAT-02 | Walked by operator | 🟡 OPERATOR-PENDING |
| UAT-03 | All FAILs fixed and re-verified before close | 🟡 OPERATOR-PENDING |
| UAT-04 | STATE.md + ROADMAP.md updated; milestone archived | 🟡 OPERATOR-PENDING (this happens after the walk) |

## Operator instructions

1. Schedule the walk (estimate: 2–4 hours given ~70 rows in the checklist).
2. Execute each row, mark ☐ → ✓ or ✗.
3. For each ✗:
   - If the gap is small and within v41 scope → hot-fix commit + re-test.
   - If the gap matches an existing CARRY-* → mark KNOWN-GAP and continue.
   - If genuinely new → file a new CARRY-V41-UAT-<topic> entry.
4. When all rows are either ✓ or KNOWN-GAP:
   - Update `.planning/STATE.md` → `status: complete`, `progress.completed_phases: 9`.
   - Flip ROADMAP v41 milestone line to ✅ Shipped.
   - `mkdir -p .planning/milestones/v41 && git mv .planning/phases/{209,210,211,212,213,214,215,216,217}-* .planning/milestones/v41/`.
   - Update PROJECT.md v41 footer with link to archive.
   - Final push.

## Carries → v42

All ~25 carries enumerated in UAT-CHECKLIST.md §Carry-forward-summary. Suggested grouping for v42 planning:
- v42 phase A: Mini PC bridge wiring (CARRY-P212-TUNNEL-PERSIST + CARRY-P215-MINIPC-POLLER).
- v42 phase B: RLS hardening (CARRY-P212-RLS-POLICIES + CARRY-P212-LEGACY-ADMIN-UNIFY).
- v42 phase C: UI polish (CARRY-P213-*).
- v42 phase D: Store polish (CARRY-P214-*).
- v42 phase E: CF automation (CARRY-P216-TERRAFORM + REPROVISION-ENDPOINT).
