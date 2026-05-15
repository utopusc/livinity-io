# Phase 124 — Section-Head Pattern as `<SettingsPageHeader/>` (Step 3 of 8)

**Milestone:** v36 LivOS Design Port
**Goal:** New shared component implementing design-system.html §17 section-head pattern; ONE settings page migrated as proof. Other 30+ settings pages unchanged.

**Source:** §17 Section heads (`design-system.html:1020-1039`, `.p-section-eyebrow/.p-section-title/.p-section-sub` CSS at lines 338-341).

**Status:** SHIPPED 2026-05-15 (commit `780d668a`).

## Files

1. NEW `livos/packages/ui/src/components/settings-page-header.tsx`
2. ADDITIVE `livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx` — `hideHeader?` prop
3. CONSUMER `livos/packages/ui/src/routes/settings/ai-config.tsx` — first opt-in

## Acceptance — see 124-SUMMARY.md
