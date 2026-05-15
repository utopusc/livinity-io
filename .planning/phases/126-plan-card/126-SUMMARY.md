---
phase: 126
name: Plan Card (Step 5 of 8)
milestone: v36.0
status: SHIPPED
shipped_at: 2026-05-15
commits: [<pending - to fill on tag> feat(plan-card): add v36 PlanCard + PlanGrid components]
visible_delta: NONE (component-only ship; consumer migration deferred to v37)
acceptance_criteria: 3/3 PASS
---

# Phase 126 — Plan Card — SHIPPED

PlanCard + PlanGrid components in `livos/packages/ui/src/components/plan-card.tsx`. Implements design-system.html §08 — 3-column grid with featured beige gradient + Popular badge + filled CTA. Mono uppercase name, 44px thin price, mono per-suffix, spec rows justify-between, hover lifts -2px + shadow-pop.

Featured plan gradient hardcoded `linear-gradient(160deg, #faf6f1 0%, #f5ede2 100%)` since the v36 Tailwind preset doesn't expose brand-specific gradients (deferred to v37).

Proof: `.planning/phases/v36-batch-proof-126-129.png` (combined overlay for phases 126-129).
