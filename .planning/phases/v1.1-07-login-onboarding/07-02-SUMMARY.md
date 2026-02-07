---
phase: v1.1-07-login-onboarding
plan: 02
subsystem: ui
tags: [react, semantic-tokens, pin-input, onboarding, step-indicator, 2fa, login]

# Dependency graph
requires:
  - phase: v1.1-07-login-onboarding/07-01
    provides: Auth layout foundation, StepIndicator component, shared class constants (buttonClass, secondaryButtonClasss, formGroupClass)
  - phase: v1.1-01-design-system
    provides: Semantic token system (surface/border/text), brand focus pattern, typography scale
provides:
  - Login page with 2FA back navigation and brand-themed button
  - PinInput component with semantic tokens and improved error UX
  - Onboarding flow with step indicators (3-step progression)
  - Account-created page with semantic text tokens
affects: [v1.1-07-login-onboarding/07-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - StepIndicator integration in onboarding flow (steps=3, 0-indexed)
    - Secondary button for back navigation in multi-step flows

key-files:
  created: []
  modified:
    - livos/packages/ui/src/routes/login.tsx
    - livos/packages/ui/src/components/ui/pin-input.tsx
    - livos/packages/ui/src/routes/onboarding/index.tsx
    - livos/packages/ui/src/routes/onboarding/create-account.tsx
    - livos/packages/ui/src/routes/onboarding/account-created.tsx

key-decisions:
  - "PinInput error recovery 500ms -> 800ms for better user recognition of error state"
  - "2FA step changed from form to div (PinInput auto-submits, form wrapping was redundant and called wrong handler)"
  - "ToS text opacity-70 -> text-text-secondary (0.70 -> 0.60, slightly more muted but consistent with design system)"
  - "Error spacer -my-2.5 -> -my-2 (10px -> 8px, standardized to Tailwind scale)"

patterns-established:
  - "StepIndicator onboarding pattern: steps=3, currentStep=0/1/2 for Start/Create/Done"
  - "Secondary button for back navigation in multi-step auth flows"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 07 Plan 02: Login, PinInput & Onboarding Pages Summary

**Login 2FA back button with secondaryButtonClasss, PinInput semantic tokens (border-emphasis/surface-base/surface-2), and StepIndicator on all 3 onboarding pages**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T04:49:12Z
- **Completed:** 2026-02-07T04:52:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Login 2FA step has back button using secondaryButtonClasss for returning to password step
- PinInput migrated from raw white/hex values to semantic tokens (border-border-emphasis, bg-surface-base, bg-surface-2, rounded-radius-sm, bg-text-primary)
- PinInput error recovery duration increased from 500ms to 800ms for better UX
- All 3 onboarding create-flow pages show StepIndicator: Start (0/3), Create Account (1/3), Account Created (2/3)
- Account-created ToS text migrated from text-xs/opacity-70 to text-caption/text-text-secondary

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign login page and PinInput component** - `67ba83e` (feat)
2. **Task 2: Add StepIndicator to onboarding pages** - `5b5aebe` (feat)

## Files Created/Modified
- `livos/packages/ui/src/routes/login.tsx` - Added secondaryButtonClasss import, 2FA step back button, changed form to div
- `livos/packages/ui/src/components/ui/pin-input.tsx` - Semantic tokens for segments/dots/caret, 800ms error timeout
- `livos/packages/ui/src/routes/onboarding/index.tsx` - StepIndicator step 0 of 3
- `livos/packages/ui/src/routes/onboarding/create-account.tsx` - StepIndicator step 1 of 3, error spacer standardized
- `livos/packages/ui/src/routes/onboarding/account-created.tsx` - StepIndicator step 2 of 3, text-caption + text-text-secondary for ToS

## Decisions Made
- PinInput error recovery increased from 500ms to 800ms -- original was too fast for users to recognize what happened
- 2FA step wrapping changed from `<form>` to `<div>` -- PinInput auto-submits on fill, the form was redundant and its onSubmit called handleSubmitPassword which is wrong for 2FA
- ToS text opacity-70 replaced with text-text-secondary (0.60 vs 0.70) -- slightly more muted but consistent with semantic system
- Error spacer -my-2.5 standardized to -my-2 (8px vs 10px) -- cleaner Tailwind scale value, negligible visual difference

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Login and onboarding pages fully migrated to semantic tokens with step indicators
- Ready for Plan 07-03 (remaining auth flow pages: restore, 2FA enable/disable if not covered elsewhere)

---
*Phase: v1.1-07-login-onboarding*
*Completed: 2026-02-07*
