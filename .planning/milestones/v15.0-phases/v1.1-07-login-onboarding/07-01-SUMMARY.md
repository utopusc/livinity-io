---
phase: v1.1-07-login-onboarding
plan: 01
subsystem: ui
tags: [tailwind, semantic-tokens, brand, auth-layout, step-indicator, react]

# Dependency graph
requires:
  - phase: v1.1-01-design-system
    provides: Semantic color/typography/radius tokens (surface, border, text, brand)
provides:
  - Semantic token migration for all shared auth exports (Title, SubTitle, buttonClass, secondaryButtonClasss, footerLinkClass, formGroupClass)
  - Brand-themed primary button (bg-brand) for all auth pages
  - Layout stepIndicator slot for multi-step flows
  - Reusable StepIndicator component (pill/dot progress)
  - Tailwind 3.4 shorthand in bare-page.tsx
affects: [07-02, 07-03, app-auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StepIndicator pill pattern: active=w-6 bg-brand, completed=w-1.5 bg-brand/50, future=w-1.5 bg-surface-3"
    - "Auth button brand pattern: bg-brand text-white with hover:bg-brand-lighter"
    - "Layout stepIndicator slot between logo and title/subtitle block"

key-files:
  created:
    - livos/packages/ui/src/components/ui/step-indicator.tsx
  modified:
    - livos/packages/ui/src/layouts/bare/shared.tsx
    - livos/packages/ui/src/layouts/bare/bare-page.tsx

key-decisions:
  - "md:text-56 kept on Title (custom 56px hero text, no semantic match)"
  - "secondaryButtonClasss typo preserved to avoid breaking imports"
  - "darken-layer.tsx unchanged (bg-black/50 is intentional overlay, not generic surface)"
  - "StepIndicator 0-indexed to match restore.tsx Step enum convention"

patterns-established:
  - "Auth primary CTA: bg-brand text-white hover:bg-brand-lighter"
  - "Auth secondary CTA: bg-surface-2 text-white hover:bg-surface-3"
  - "StepIndicator: pills with brand tokens, 0-indexed, className-extensible"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 7 Plan 01: Auth Layout Foundation Summary

**Shared auth layout migrated to semantic tokens with brand-themed buttons, StepIndicator pill component, and Layout stepIndicator slot**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T04:42:53Z
- **Completed:** 2026-02-07T04:46:59Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Migrated all raw Tailwind values in shared.tsx to semantic design tokens (typography, colors, spacing)
- Replaced white/black auth buttons with brand-themed primary (bg-brand) and semantic secondary (bg-surface-2)
- Created reusable StepIndicator component with pill/dot pattern using brand tokens
- Added optional stepIndicator slot to Layout component between logo and title
- Updated bare-page.tsx to Tailwind 3.4 min-h-dvh shorthand

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate shared.tsx to semantic tokens and brand-themed buttons** - `ea4ead1` (feat)
2. **Task 2: Create StepIndicator component** - `a81f90f` (feat)
3. **Task 3: Update bare-page.tsx and darken-layer.tsx tokens** - `56dcd86` (feat)

## Files Created/Modified
- `livos/packages/ui/src/layouts/bare/shared.tsx` - Title, SubTitle, buttonClass, secondaryButtonClasss, footerLinkClass migrated to semantic tokens; Layout gains stepIndicator prop
- `livos/packages/ui/src/components/ui/step-indicator.tsx` - NEW: Reusable step indicator with pill/dot progress using brand tokens
- `livos/packages/ui/src/layouts/bare/bare-page.tsx` - min-h-[100dvh] -> min-h-dvh (Tailwind 3.4 shorthand)
- `livos/packages/ui/src/components/darken-layer.tsx` - Reviewed, no changes needed (intentional overlay color)

## Decisions Made
- **md:text-56 preserved on Title:** Custom 56px hero text has no semantic match; text-display-lg is 48px which would shrink the hero too much
- **secondaryButtonClasss typo preserved:** Triple 's' typo exists in exports consumed by other files; renaming would break imports and is out of scope
- **darken-layer.tsx left unchanged:** bg-black/50 is an intentional overlay color for wallpaper contrast, not a generic surface
- **StepIndicator uses 0-indexed currentStep:** Matches the Step enum convention used in restore.tsx (Step.LOCATION=0, Step.PASSWORD=1, etc.)
- **focus-visible:ring-3 -> ring-2 ring-brand/20:** Consistent with Phase 1 brand focus pattern established across all form inputs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All auth pages that import from shared.tsx now inherit semantic tokens and brand-themed buttons automatically
- StepIndicator ready for integration in onboarding create flow (3 steps) and restore flow (4 steps)
- Layout stepIndicator slot ready for consumers to pass StepIndicator instances
- Ready for Plan 07-02 (login page, onboarding pages, pin-input) and Plan 07-03 (restore flow, app-auth)

---
*Phase: v1.1-07-login-onboarding*
*Completed: 2026-02-07*
