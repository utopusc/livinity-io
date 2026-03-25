---
phase: v1.1-01-design-system
plan: 02
subsystem: design-system
tags: [button, card, shadcn, semantic-tokens, components]
requires:
  - v1.1-01-01 (Design Tokens)
provides:
  - Button component with semantic tokens and ghost variant
  - Card component with semantic tokens and elevation shadows
  - Pattern for migrating other components to semantic tokens
affects:
  - All v1.1 phases using Button/Card (most phases)
  - Future component migrations (pattern established)
tech-stack:
  added: []
  patterns:
    - Component migration from numeric to semantic tokens
    - focus-visible instead of focus for better keyboard UX
key-files:
  created: []
  modified:
    - livos/packages/ui/src/shadcn-components/ui/button.tsx
    - livos/packages/ui/src/components/ui/card.tsx
decisions:
  - decision: Use focus-visible instead of focus for all button focus states
    rationale: Better keyboard navigation UX - only shows ring when user tabs, not when clicking
    date: 2026-02-06
  - decision: Add ghost variant to button (transparent background, reveals on hover)
    rationale: Needed for minimal UI elements like toolbar buttons, icon buttons in clean interfaces
    date: 2026-02-06
  - decision: Keep rounded-14 for dialog/lg sizes instead of migrating to semantic radii
    rationale: These sizes (14px) are between radius-md (12px) and radius-lg (16px). Will migrate in Phase 3 when dialogs are redesigned.
    date: 2026-02-06
metrics:
  duration: 2 minutes
  completed: 2026-02-06
---

# Phase v1.1-01 Plan 02: Button and Card Redesign Summary

**One-liner:** Button and Card components redesigned with semantic tokens (surface/border/text), ghost variant added, focus-visible pattern established, cleaner elevation shadows replace heavy glassmorphism — pattern for all component migrations.

## What Was Built

**Button Component Redesign:**
- Migrated all variants to semantic tokens:
  - `default`: Uses `surface-1/2/base` instead of `white/8/12/6`, `border-default/emphasis` instead of `white/10/20`
  - `primary/secondary/destructive`: Changed `focus:` to `focus-visible:` for better keyboard UX
  - New `ghost` variant: Transparent background, reveals `surface-1` on hover, subtle border on hover
- Migrated all sizes to semantic tokens:
  - Font sizes: `text-12` → `text-caption`, `text-13` → `text-body-sm`, `text-14` → `text-body`, `text-15` → `text-body-lg`
  - Border radii: `rounded-10` → `rounded-radius-sm`, `rounded-12` → `rounded-radius-md`, `rounded-16` → `rounded-radius-lg`
  - Kept `rounded-14` for dialog/lg sizes (will migrate in Phase 3 dialog redesign)
- Base classes updated:
  - `focus:` → `focus-visible:` with consistent `ring-white/20` for WCAG compliance
  - Removed `leading-inter-trimmed` from base (sizes set their own line-height via semantic tokens)

**Card Component Redesign:**
- Migrated to semantic tokens:
  - Background: `bg-white/6` → `bg-surface-1`, hover: `bg-white/8` → `bg-surface-2`
  - Border: `border-white/5` → `border-border-subtle`, hover: `border-white/10` → `border-border-default`
  - Radius: `rounded-20` → `rounded-radius-xl` (20px, same value)
- Replaced heavy shadows with clean elevation:
  - `shadow-card-elevated` → `shadow-elevation-sm` (no inset shadow)
  - `hover:shadow-card-hover` → `hover:shadow-elevation-md` (cleaner, more professional)

**Visual Impact:**
- Button default variant: Subtler background (0.06 vs 0.08), cleaner borders, no redundant focus background
- Card: Cleaner depth with elevation shadows instead of heavy inset highlights
- Ghost buttons: Perfect for minimal toolbars, icon buttons, secondary actions

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Redesign Button component with semantic tokens | 405a034 | button.tsx |
| 2 | Redesign Card component with semantic tokens | 4632e3f | card.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

**1. focus-visible Pattern for All Focus States**
- **Context:** Original button used `focus:` for focus styling
- **Decision:** Replace all `focus:` with `focus-visible:` across all variants
- **Rationale:** Better keyboard navigation UX. `focus-visible` only shows ring when user tabs (keyboard), not when clicking (mouse). Improves visual cleanliness without sacrificing accessibility.
- **Impact:** All button variants now use `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/20`

**2. Ghost Variant Addition**
- **Context:** Plan specified adding ghost variant after destructive
- **Decision:** Implemented as `hover:bg-surface-1 active:bg-surface-base border border-transparent hover:border-border-subtle`
- **Rationale:** Essential for minimal UI elements — toolbar buttons, icon buttons, secondary actions that shouldn't compete visually with primary actions
- **Impact:** New variant available immediately, used in future phases for cleaner UI

**3. Preserve rounded-14 for Dialog Sizes**
- **Context:** Dialog and lg button sizes use `rounded-14` (14px)
- **Decision:** Keep as-is instead of forcing to `radius-md` (12px) or `radius-lg` (16px)
- **Rationale:** 14px is between semantic levels. Dialogs will be redesigned in Phase 3 with proper sizing decisions. Forcing to nearest semantic value now would require re-work later.
- **Impact:** Dialog/lg buttons keep `rounded-14` temporarily

## Technical Details

**Button Token Migration:**

Before (numeric tokens):
```tsx
variant: 'default'
// bg-white/8 hover:bg-white/12 border-white/10
size: 'md'
// text-13 rounded-12
```

After (semantic tokens):
```tsx
variant: 'default'
// bg-surface-1 hover:bg-surface-2 border-border-default
size: 'md'
// text-body-sm rounded-radius-md
```

**Card Token Migration:**

Before (raw opacity):
```tsx
rounded-20 bg-white/6 border-white/5 shadow-card-elevated
hover:bg-white/8 hover:border-white/10 hover:shadow-card-hover
```

After (semantic tokens):
```tsx
rounded-radius-xl bg-surface-1 border-border-subtle shadow-elevation-sm
hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md
```

**Ghost Variant Usage:**
```tsx
<Button variant="ghost">Cancel</Button>
<Button variant="ghost" size="icon-only"><Icon /></Button>
```

**Complete Button Variant Coverage:**
- `default`: Subtle surface background with border (general purpose)
- `primary`: Brand color with scale animation (primary actions)
- `secondary`: White background with black text (high contrast)
- `destructive`: Red color for dangerous actions
- `ghost`: Transparent, minimal (secondary/tertiary actions)

## Next Phase Readiness

**Immediate Next Steps:**
- Phase v1.1-01 Plan 03: Additional base components (Input, Select, etc.) can follow same pattern
- Phase v1.1-02 (Desktop UI): Can use redesigned Button/Card with semantic tokens
- All future phases have clean, consistent Button/Card foundation

**Migration Pattern Established:**
1. Identify raw opacity values (`white/N`, `black/N`)
2. Map to semantic tokens (surface-1/2/3, border-subtle/default/emphasis)
3. Replace numeric sizes with semantic equivalents (text-13 → text-body-sm)
4. Replace numeric radii with semantic equivalents (rounded-12 → radius-md)
5. Update focus states to focus-visible
6. Preserve component API (no breaking changes)

**Blockers:** None

**Concerns:** None - migrations are backward compatible, semantic tokens work seamlessly alongside numeric tokens

## Verification

All success criteria met:
- ✅ Button component fully migrated to semantic tokens
- ✅ Button has ghost variant (grep confirms `ghost:` in button.tsx)
- ✅ Button uses focus-visible consistently (grep confirms 6 instances, no bare `focus:`)
- ✅ Button has semantic surface/border tokens (grep confirms `bg-surface-1`, `border-border-default`)
- ✅ Button has semantic text sizes (grep confirms `text-body-sm`, `text-body`, `text-body-lg`)
- ✅ Button has semantic radii (grep confirms `rounded-radius-sm/md/lg`)
- ✅ Card component fully migrated to semantic tokens
- ✅ Card has semantic surface/border tokens (grep confirms `bg-surface-1`, `border-border-subtle`)
- ✅ Card has elevation shadows (grep confirms `shadow-elevation-sm`, `shadow-elevation-md`)
- ✅ Card has semantic radius (grep confirms `rounded-radius-xl`)
- ✅ Both components maintain existing exports (Button, buttonVariants, Card, cardClass)
- ✅ TypeScript compilation succeeds (pre-existing errors in livinityd unchanged)

## Repository State

**Commits:**
1. `405a034` - feat(v1.1-01-02): redesign button component with semantic tokens
2. `4632e3f` - feat(v1.1-01-02): redesign card component with semantic tokens

**Files Modified:** 2 files (button.tsx, card.tsx)

**Duration:** ~2 minutes

**Build Status:** TypeScript compilation successful (pre-existing errors in livinityd unchanged)
