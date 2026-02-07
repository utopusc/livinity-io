# Roadmap: LivOS v1.2 — Visual Impact Redesign

## Overview

v1.1 established semantic design tokens but kept identical visual output. v1.2 changes the actual token VALUES to produce real, user-visible improvements. The approach is systematic: first change the foundation tokens (cascading to every component), then apply targeted component fixes, then add design enhancements.

Phase 1 alone (editing tailwind.config.ts) will cascade to every surface, border, shadow, and text element in the entire UI — producing massive visible change from one file edit.

## Phases

- [x] **Phase 1: Token Foundation** — Change actual token values in tailwind.config.ts (surfaces, borders, shadows, text) ✓
- [x] **Phase 2: Component Visual Fixes** — Targeted fixes that can't be solved by token changes alone ✓
- [x] **Phase 3: Design Enhancements** — New tokens, status colors, chat distinction ✓

## Phase Details

### Phase 1: Token Foundation
**Goal**: Change the actual CSS values behind semantic tokens so every component in the UI becomes visibly improved
**Depends on**: Nothing (first phase)
**Requirements**: TF-01, TF-02, TF-03, TF-04, TF-05, TF-06
**Success Criteria** (what must be TRUE):
  1. Surface opacities increased: surface-base 0.06, surface-1 0.10, surface-2 0.16, surface-3 0.22
  2. Border opacities increased: border-subtle 0.10, border-default 0.16, border-emphasis 0.30
  3. Elevation shadows have white inset glow highlights and stronger outer opacity
  4. Text secondary/tertiary more readable: 0.65 and 0.45
  5. Sheet-shadow and dialog shadow insets use proper top-edge highlight technique
**Plans**: 1 plan (single file edit)

Plans:
- [x] 01-01-PLAN.md — Update all token values in tailwind.config.ts (TF-01 to TF-06)

### Phase 2: Component Visual Fixes
**Goal**: Apply targeted visual fixes to components that need more than just token value changes
**Depends on**: Phase 1
**Requirements**: CV-01, CV-02, CV-03, CV-04, CV-05, CV-06, CV-07, CV-08
**Success Criteria** (what must be TRUE):
  1. Dock has 1px border, surface-1 background, 12px padding
  2. Dock items have 60% icon ratio, visible glow, smoother spring
  3. Sheet shows wallpaper color (brightness 0.38), has top border
  4. Dialog uses border-default for visible edges
  5. File list has hover states and larger icons
  6. Menus have visible hover and larger radius
  7. Windows have border-emphasis for clear floating edges
  8. Buttons have 1px highlight and taller desktop heights
**Plans**: 4 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — Dock container + dock items visual fixes (CV-01, CV-02)
- [x] 02-02-PLAN.md — Sheet + Dialog + Window visual fixes (CV-03, CV-04, CV-07)
- [x] 02-03-PLAN.md — File Manager + Menu visual fixes (CV-05, CV-06)
- [x] 02-04-PLAN.md — Button highlight and height adjustments (CV-08)

### Phase 3: Design Enhancements
**Goal**: Add new design tokens and visual distinction features
**Depends on**: Phase 1
**Requirements**: DE-01, DE-02, DE-03
**Success Criteria** (what must be TRUE):
  1. radius-2xl (24px) and radius-3xl (28px) semantic tokens exist
  2. info and warning colors with surface variants defined
  3. AI Chat assistant messages have left border accent
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — Add semantic radius tokens, status colors, chat accent (DE-01, DE-02, DE-03)

## Progress

**Execution Order:**
Phases execute in order: 1 -> 2 -> 3
(Phase 2 and 3 can partially parallel after Phase 1)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Token Foundation | 1/1 | Complete | 2026-02-07 |
| 2. Component Visual Fixes | 4/4 | Complete | 2026-02-07 |
| 3. Design Enhancements | 1/1 | Complete | 2026-02-07 |

---
*Roadmap created: 2026-02-07*
*Total phases: 3 | Total plans: 6*
*Coverage: 17/17 v1.2 requirements mapped*
