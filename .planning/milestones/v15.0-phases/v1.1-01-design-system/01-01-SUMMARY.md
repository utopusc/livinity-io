---
phase: v1.1-01-design-system
plan: 01
subsystem: design-system
tags: [tailwind, design-tokens, typography, colors, shadows, radii]
requires:
  - v1.0 baseline (wallpaper theming system)
provides:
  - Semantic color tokens (surface, border, text)
  - Semantic typography scale (caption, body, heading, display)
  - Semantic border radii (radius-sm/md/lg/xl)
  - Elevation shadow system (elevation-sm/md/lg/xl)
  - Icon sizing tokens (icon-sm/md/lg)
affects:
  - All future v1.1 plans (depends on these tokens)
tech-stack:
  added: []
  patterns:
    - Semantic design token system
    - Dual token strategy (semantic + numeric for migration)
key-files:
  created: []
  modified:
    - livos/packages/ui/tailwind.config.ts
    - livos/packages/ui/src/index.css
    - livos/packages/ui/src/shadcn-lib/utils.ts
decisions:
  - decision: Preserve all existing numeric tokens during semantic token introduction
    rationale: Enables gradual migration across 500+ component usages without breaking changes
    date: 2026-02-06
  - decision: Define semantic colors as static rgba values instead of CSS variables
    rationale: Surface/border/text colors are dark-theme-only and don't need dynamic theming like brand colors
    date: 2026-02-06
  - decision: Include line-height, letter-spacing, and font-weight in semantic font size definitions
    rationale: Creates complete typographic system, not just size tokens
    date: 2026-02-06
metrics:
  duration: 3 minutes
  completed: 2026-02-06
---

# Phase v1.1-01 Plan 01: Design Tokens Summary

**One-liner:** Semantic design token system with surface/border/text colors, caption/body/heading/display typography, radius-sm/md/lg/xl radii, elevation-sm/md/lg/xl shadows, and icon-sm/md/lg sizing — foundation for entire v1.1 UI redesign.

## What Was Built

**Semantic Color System:**
- Surface tokens: `surface-base`, `surface-1`, `surface-2`, `surface-3` (escalating white opacity for depth)
- Border tokens: `border-subtle`, `border-default`, `border-emphasis` (consistent line weights)
- Text tokens: `text-primary`, `text-secondary`, `text-tertiary` (hierarchical text opacity)

**Typography Scale:**
- Caption level: `caption-sm` (11px), `caption` (12px)
- Body level: `body-sm` (13px), `body` (14px), `body-lg` (15px)
- Heading level: `heading-sm` (17px), `heading` (19px), `heading-lg` (24px)
- Display level: `display-sm` (32px), `display` (36px), `display-lg` (48px)
- Each token includes line-height, letter-spacing, and weight (for heading/display)

**Consolidated Radius System:**
- `radius-sm` (8px), `radius-md` (12px), `radius-lg` (16px), `radius-xl` (20px)
- Replaces sprawl of 18 numeric values with 4 semantic levels

**Elevation Shadow System:**
- `elevation-sm/md/lg/xl` for standard shadow hierarchy
- Component-specific shadows (dock, dialog, etc.) preserved for backward compatibility

**Icon Sizing Tokens:**
- `icon-sm` (16px), `icon-md` (20px), `icon-lg` (24px) via spacing utilities
- Enables `w-icon-md h-icon-md` for consistent icon dimensions

**Supporting Infrastructure:**
- Updated `index.css` to use `text-text-primary` instead of raw `text-white/90`
- Updated `utils.ts` tw-merge config to handle semantic token class precedence
- Preserved all existing numeric tokens for backward compatibility during migration

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Define semantic design tokens in tailwind.config.ts | 5dd9043 | tailwind.config.ts |
| 2 | Update index.css and utils.ts for new token system | a7fc630 | index.css, utils.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

**1. Dual Token Strategy (Semantic + Numeric)**
- **Context:** Codebase has 500+ usages of numeric tokens (text-13, rounded-12, etc.)
- **Decision:** Keep all existing numeric tokens alongside new semantic ones
- **Rationale:** Enables gradual migration across components without breaking changes. New components use semantic tokens, old components get migrated incrementally.
- **Impact:** Config file grows temporarily but prevents big-bang rewrite

**2. Static RGBA for Semantic Colors**
- **Context:** Brand colors use CSS variables for wallpaper-based theming
- **Decision:** Define surface/border/text as static rgba values, not CSS variables
- **Rationale:** These colors are dark-theme constants that don't need dynamic theming. Only brand colors change per wallpaper.
- **Impact:** Simpler token system, no CSS variable overhead for static values

**3. Complete Typographic Definitions**
- **Context:** Could have defined font sizes alone (like existing numeric tokens)
- **Decision:** Include line-height, letter-spacing, and font-weight in semantic font definitions
- **Rationale:** Creates a complete typographic system. Using `text-body` sets size, leading, tracking, and weight in one class.
- **Impact:** More complex token definitions but better developer experience and consistency

## Technical Details

**Before (Token Sprawl):**
- 18 border radius values (3px through 32px)
- 14 font sizes (9px through 56px) without line-height guidance
- 12+ box shadows with inconsistent naming
- Raw opacity values scattered across components

**After (Semantic System):**
- 4 semantic radii + 18 numeric (preserved)
- 11 semantic font sizes with complete typography specs + 14 numeric (preserved)
- 4 elevation shadows + component-specific shadows (preserved)
- 10 semantic color tokens for surface/border/text hierarchy

**Token Usage Example:**
```tsx
// Old style (still works)
<div className="bg-white/10 text-white/90 text-13 rounded-12">

// New style (semantic)
<div className="bg-surface-1 text-text-primary text-body rounded-radius-md">
```

**tw-merge Integration:**
Both old and new tokens work correctly with `cn()` helper:
```tsx
cn('text-13', 'text-body')        // body wins (semantic overrides numeric)
cn('rounded-12', 'rounded-radius-lg') // radius-lg wins (semantic overrides numeric)
```

## Next Phase Readiness

**Immediate Next Steps:**
- Phase v1.1-01 Plan 02: Desktop UI can now use semantic tokens for dock, window chrome, context menus
- All subsequent v1.1 plans can leverage this token system

**Migration Strategy:**
- New components: Use semantic tokens exclusively
- Existing components: Migrate during redesign (happens naturally across v1.1 phases)
- Numeric tokens: Deprecated gradually, removed in future milestone after migration complete

**Blockers:** None

**Concerns:** None - token system is additive and backward compatible

## Verification

All success criteria met:
- ✅ tailwind.config.ts has complete semantic token system (10 colors, 11 typography, 4 radii, 4 shadows, 3 icon sizes)
- ✅ All existing numeric tokens preserved for backward compatibility
- ✅ Brand color CSS variable mechanism unchanged (wallpaper theming intact)
- ✅ index.css uses semantic `text-text-primary` token
- ✅ utils.ts tw-merge handles both old and new token patterns correctly
- ✅ TypeScript compilation succeeds with no new errors
- ✅ All grep verifications passed (surface-base, body-sm, radius-sm, elevation-sm, icon-sm present)
- ✅ Brand colors preserved (hsl(var(--color-brand)) confirmed)
- ✅ Numeric tokens preserved (fontSize 9: '9px' confirmed)

## Repository State

**Commits:**
1. `5dd9043` - feat(v1.1-01-01): define semantic design tokens in tailwind.config.ts
2. `a7fc630` - feat(v1.1-01-01): update index.css and utils.ts for semantic tokens

**Files Modified:** 3 files (tailwind.config.ts, index.css, utils.ts)

**Duration:** ~3 minutes

**Build Status:** TypeScript compilation successful (pre-existing errors in livinityd unchanged)
