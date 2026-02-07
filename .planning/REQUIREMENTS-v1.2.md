# Requirements: LivOS v1.2 — Visual Impact Redesign

**Defined:** 2026-02-07
**Core Value:** Make the UI actually visible and beautiful — increase surface contrast, strengthen borders, add visible shadows, improve component definition
**Milestone Goal:** Transform the dark theme from "invisible gray on gray" to a polished, high-contrast glassmorphism UI with clear visual hierarchy

## Context

v1.1 replaced raw Tailwind values with semantic token names but kept identical CSS output. v1.2 changes the actual token VALUES and applies targeted component fixes to produce real, user-visible design improvements.

Based on: `.planning/VISUAL-AUDIT.md` (comprehensive audit of current visual state)

## v1.2 Requirements

### Token Foundation (TF)

- [x] **TF-01**: Increase surface opacity values — surface-base 0.04→0.06, surface-1 0.06→0.10, surface-2 0.10→0.16, surface-3 0.14→0.22 ✓
- [x] **TF-02**: Increase border opacity values — border-subtle 0.06→0.10, border-default 0.10→0.16, border-emphasis 0.20→0.30 ✓
- [x] **TF-03**: Add inner glow highlights to elevation shadows — elevation-sm/md/lg/xl get white inset + stronger outer opacity ✓
- [x] **TF-04**: Increase text contrast — text-primary 0.90→0.92, text-secondary 0.60→0.65, text-tertiary 0.40→0.45 ✓
- [x] **TF-05**: Fix sheet-shadow from 2px offset to proper 0px 1px inset top highlight at 0.10 opacity ✓
- [x] **TF-06**: Fix dialog shadow inset from 1px 1px to 0px 1px 0px for clean top highlight ✓

### Component Visual Fixes (CV)

- [x] **CV-01**: Dock — upgrade border-hpx to border-px, increase surface to surface-1, increase padding 10px→12px ✓
- [x] **CV-02**: Dock Items — increase icon size ratio 55%→60%, increase glow opacity 30%→50%, reduce spring damping 10→14 ✓
- [x] **CV-03**: Sheet — increase backdrop-brightness from 0.3 to 0.38, add top border border-t border-border-default ✓
- [x] **CV-04**: Dialog — upgrade border from border-subtle to border-default ✓
- [x] **CV-05**: File Manager List — add hover:bg-surface-base to rows, increase desktop icon size 20px→24px ✓
- [x] **CV-06**: Context Menu & Dropdown — upgrade focus bg from surface-base to surface-1, upgrade context menu radius from radius-sm to radius-md ✓
- [x] **CV-07**: Window — upgrade border from border-default to border-emphasis, add shadow-elevation-lg ✓
- [x] **CV-08**: Button — upgrade highlight from 0.5px to 1px inset, increase desktop heights sm 28→30px, default 34→36px ✓

### Design Enhancements (DE)

- [x] **DE-01**: Add semantic radius tokens — radius-2xl (24px), radius-3xl (28px) for dialogs and sheets ✓
- [x] **DE-02**: Add semantic status colors — info (#3B82F6), warning (#F59E0B) with surface variants ✓
- [x] **DE-03**: AI Chat — add subtle left border accent on assistant messages for visual distinction ✓

## Out of Scope

| Feature | Reason |
|---------|--------|
| Brand surface tinting | Complex CSS variable interaction, deferred to v1.3 |
| Typography scale changes | High risk of layout breakage, deferred |
| Font weight 500 system | Requires audit of every text element, deferred |
| New components or pages | v1.2 is visual polish only |
| Light theme | Dark theme is core identity |
| Card gradients | Design direction needs user input |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TF-01 to TF-06 | Phase 1 | Complete |
| CV-01 to CV-08 | Phase 2 | Complete |
| DE-01 to DE-03 | Phase 3 | Complete |

**Coverage:**
- v1.2 requirements: 17 total
- Complete: 17
- Pending: 0
- Unmapped: 0

---
*Requirements defined: 2026-02-07*
