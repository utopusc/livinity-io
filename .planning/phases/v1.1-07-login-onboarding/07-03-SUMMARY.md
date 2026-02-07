---
phase: v1.1-07-login-onboarding
plan: 03
subsystem: ui
tags: [tailwind, semantic-tokens, step-indicator, restore-flow, app-auth, cn-utility, react]

# Dependency graph
requires:
  - phase: v1.1-01-design-system
    provides: Semantic color/typography/radius tokens (surface, border, text, brand)
  - phase: v1.1-07-login-onboarding
    plan: 01
    provides: StepIndicator component, Layout stepIndicator slot, shared auth token exports
provides:
  - Restore flow with dynamic 4-step StepIndicator tracking internal Step enum
  - Restore BackupSnapshot with cn() utility and semantic tokens
  - App-auth login page with semantic typography, radius, and elevation tokens
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BackupSnapshot cn() conditional: selected brand border vs border-default, hover surface-base"
    - "Back button brand focus pattern: focus-visible:border-brand + bg-surface-2"
    - "App-auth card: bg-dialog-content/70 with shadow-elevation-lg (Phase 3 dialog elevation)"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/routes/onboarding/restore.tsx
    - livos/packages/ui/app-auth/src/login-with-livinity.tsx

key-decisions:
  - "BackupSnapshot badge text-caption-sm (11px) over text-[10px] — enough space in onboarding for 11px"
  - "bg-dialog-content/70 preserved on app-auth card (semantic token from Phase 3 dialog system with transparency)"
  - "bg-black/50 overlay preserved on app-auth (intentional darken layer, same convention as darken-layer.tsx)"
  - "bg-neutral-600 preserved on placeholder app icon (domain-specific, not generic surface)"

patterns-established:
  - "Restore back button: border-border-default/bg-surface-base with brand focus"
  - "BackupSnapshot: cn() with semantic tokens, brand selection state preserved"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 7 Plan 03: Restore Flow & App-Auth Semantic Token Migration Summary

**Restore flow gains StepIndicator with 4 dynamic steps; BackupSnapshot migrated to cn() with semantic tokens; app-auth login card uses semantic typography/radius/elevation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T04:49:11Z
- **Completed:** 2026-02-07T04:52:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added StepIndicator to restore flow with steps=4 and dynamic currentStep=step (0-indexed enum)
- Migrated restore back button from raw white/XX to semantic tokens with brand focus pattern
- Migrated loading state (text-text-secondary), empty state (text-caption text-text-secondary), review text (text-body)
- Converted BackupSnapshot from array.join(' ') to cn() utility with semantic tokens
- BackupSnapshot badges: bg-surface-2, text-caption-sm, text-text-secondary (replaces bg-white/10 + opacity-80 + text-[10px])
- App-auth card: rounded-radius-xl, shadow-elevation-lg
- App-auth icons: rounded-radius-md
- App-auth title: text-heading-sm, description: text-body-sm text-text-tertiary
- App-auth button: text-body-sm

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate restore.tsx with StepIndicator and semantic tokens** - `372bd44` (feat)
2. **Task 2: Migrate app-auth login-with-livinity.tsx to semantic tokens** - `c6842c8` (feat)

## Files Created/Modified
- `livos/packages/ui/src/routes/onboarding/restore.tsx` - StepIndicator added, back button semantic, BackupSnapshot cn() with semantic tokens, loading/empty/review states migrated
- `livos/packages/ui/app-auth/src/login-with-livinity.tsx` - Card radius/shadow, icon radius, title/description/button typography all migrated to semantic tokens

## Decisions Made
- **BackupSnapshot badge text-caption-sm (11px) over text-[10px]:** In onboarding there is enough space for 11px vs the 10px arbitrary value; differs from mobile FrequentApp (v1.1-02-03) where space is tighter
- **bg-dialog-content/70 kept on app-auth card:** This is already a semantic token (from Phase 3 dialog system) used with explicit transparency; no migration needed
- **bg-black/50 overlay preserved:** Intentional darken layer convention, not generic surface (matches darken-layer.tsx decision from 07-01)
- **bg-neutral-600 preserved on placeholder app icon:** Domain-specific placeholder background, not a generic surface

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All auth pages (login, create, restore, app-auth) now use semantic design tokens
- Phase 7 Login & Onboarding migration is complete (plans 01, 02, 03 all done)
- Ready for Phase 8 (Mobile Responsive)

---
*Phase: v1.1-07-login-onboarding*
*Completed: 2026-02-07*
