# Phase 121 — Mini PC UI Long-Tail Migration + Cross-Surface Audit — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Final phase of v35.0. Depends on Phase 120 foundation + ui-kit + design-tokens.

## Phase intent

Migrate remaining ~600 Mini PC components in feature batches. Audit cross-surface visual consistency. Lock with regression tests. Ship developer style guide. After this phase, v35.0 acceptance criteria all green.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 121 + § Acceptance criteria
- Inventory (Phase 115 output): `.planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md` — long-tail = inventory minus Phase 120 wave-1
- ui-kit (Phase 119 output): `livos/packages/ui-kit/`
- Style guide stub (Phase 116 output): `livos/packages/design-tokens/STYLE-GUIDE.md`

## What this phase ships

### Long-tail Mini PC component migration (5 batches)

- **121-01** — Backups feature (~30 components) + Factory-reset (~10) + Local-setup (~10)
- **121-02** — Files feature (~25 components)
- **121-03** — Window-content app dialogs (~50 components)
- **121-04** — `routes/*` (~219 components, sub-batched by route group: settings/* · apps/* · misc)
- **121-05** — Generic components (~150) + shadcn-components/* replacement audit (29 → keep only what ui-kit doesn't cover)

### Cross-surface audit + regression (1 plan)

- **121-06** — Cross-surface audit + Playwright regression suite + style guide
  - `CONSISTENCY-REPORT.md`: side-by-side screenshots of common elements on each surface (button, card, stepper, modal, command box, theme toggle, etc.); document and fix residual diffs
  - Playwright snapshot tests for canonical pages of each surface (login, dashboard, dashboard/install, store, Mini PC dashboard, Mini PC settings)
  - GitHub Actions workflow to run on PRs (visual regression CI)
  - `livos/packages/design-tokens/STYLE-GUIDE.md` (full version): "How to add a new component to LivOS UI" — always start with ui-kit; only fork if ui-kit doesn't cover; document why; PR checklist

## Locked decisions

| ID | Decision |
|----|----------|
| **D-121-OPERATOR-CHECKPOINTS** | Plan 121-04 (routes batch, ~219 components) is large. Insert operator UAT checkpoints between sub-batches (settings/* → operator UAT → apps/* → operator UAT → misc → operator UAT). |
| **D-121-NO-FUNCTIONAL-CHANGES** | Same as D-120: visual layer only. |
| **D-121-INCREMENTAL-DEPLOY** | Each plan ships deployable + revertable. Sub-batches within 121-04 individually deployable. |
| **D-121-MINI-PC-OPERATOR-PRIORITY** | bruce's OwnCloud use never broken mid-flight. |
| **D-121-PLAYWRIGHT-IS-NEW-DEPENDENCY** | Adding Playwright + GitHub Actions visual regression is the v35 acceptance criterion #6. Audit dependency, document rationale, lock version. |
| **D-121-STYLE-GUIDE-LIVES-WITH-TOKENS** | `STYLE-GUIDE.md` lives in `livos/packages/design-tokens/` so it ships with the package and is discoverable by any future developer pulling the package. |

## Plans (6)

- **121-01** — Backups + Factory-reset + Local-setup (~50 components, single plan, 1 deployable batch)
- **121-02** — Files feature (~25 components)
- **121-03** — Window-content app dialogs (~50 components)
- **121-04** — routes/* sub-batched (settings/* + apps/* + misc; insert operator UAT between sub-batches)
- **121-05** — Generic components + shadcn audit (~150 + 29 → drop or convert)
- **121-06** — Cross-surface audit + Playwright regression suite + STYLE-GUIDE.md (full)

## Acceptance criteria validation

After this phase, all 8 v35.0 acceptance criteria pass:
1. Single design token source (Phase 116 ✓ + Phase 117/118/120/121 consumers ✓)
2. Single component library — ui-kit is default, audit confirms (this phase plan 121-05/06 ✓)
3. Cross-surface visual parity — `CONSISTENCY-REPORT.md` (this phase plan 121-06 ✓)
4. Geist + Instrument Serif everywhere (Phase 116 + 117/118/120/121 ✓)
5. Light/dark/iridescent everywhere (Phase 116 + every consumer ✓)
6. Visual regression CI — Playwright snapshots (this phase plan 121-06 ✓)
7. Inventory accuracy — re-run Phase 115 mapping post-migration (this phase plan 121-06 ✓)
8. Operator-walked UAT — final end-to-end browse (operator-walked, post-121-06)

## Open questions for discuss-phase

- routes/* sub-batching — which sub-batches make sense? Likely (a) settings/* (most-touched), (b) apps/* (per-app dialogs + content), (c) everything else. Confirm during discuss.
- Playwright config — headless on CI, headed locally? Snapshot threshold (pixel diff %)? Standard 0.1% drift tolerance?
- Style guide — Markdown or interactive (Storybook-hosted)? Markdown for portability; Storybook is built in Phase 119 anyway, can link.

## What this phase does NOT do

- Backend/livinityd source changes
- New components beyond ui-kit (Phase 119 set is locked for v35; new components go in v36)
- Documentation site (style guide is a single MD file in design-tokens package; site is v36 candidate)
- Mobile design (out of v35 scope per master plan)
