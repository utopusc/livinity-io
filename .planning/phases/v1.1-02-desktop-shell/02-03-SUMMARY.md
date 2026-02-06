---
phase: v1.1-02-desktop-shell
plan: 03
subsystem: overlay-components
tags: [context-menu, command-palette, semantic-tokens, shared-classes]

dependency-graph:
  requires:
    - v1.1-01-01 (semantic design tokens)
  provides:
    - Shared menu classes with semantic tokens (affects context menu + dropdown menu)
    - Command palette with semantic typography, surface, and border tokens
  affects:
    - v1.1-03 (Phase 3 dialog.ts migration deferred)
    - Any future context menu or dropdown menu consumers

tech-stack:
  added: []
  patterns:
    - Shared class strategy: menu.ts as single source for context + dropdown styling
    - Brand-tinted color-mix backgrounds preserved alongside semantic surface tokens

file-tracking:
  key-files:
    modified:
      - livos/packages/ui/src/shadcn-components/ui/shared/menu.ts
      - livos/packages/ui/src/shadcn-components/ui/command.tsx
      - livos/packages/ui/src/components/cmdk.tsx

decisions:
  - id: "02-03-01"
    description: "Preserve color-mix brand background in menu content (not a generic surface)"
    rationale: "Brand-tinted menus are a design feature, not suitable for surface-* tokens"
  - id: "02-03-02"
    description: "Keep focus:text-white and highlighted:text-white at full opacity"
    rationale: "Full white on focus provides necessary contrast against brand-tinted background"
  - id: "02-03-03"
    description: "Keep text-[10px] on mobile FrequentApp name as arbitrary value"
    rationale: "Below smallest semantic token (caption-sm 11px), acceptable one-off for very small label"

metrics:
  duration: 3.75 min
  completed: 2026-02-06
---

# Phase 2 Plan 03: Context Menu and Command Palette Semantic Migration Summary

Migrated shared menu classes and command palette overlay components to semantic design tokens, covering both DD-05 (minimal style context menu) and CN-01 (refined command palette styling).

## What Changed

### Shared Menu Classes (menu.ts)
Shared between context-menu.tsx and dropdown-menu.tsx consumers:
- **Content text:** `text-white` -> `text-text-primary` (0.90 opacity semantic hierarchy)
- **Item typography:** `text-13` -> `text-body-sm` (semantic 13px with line-height)
- **Item focus:** `focus:bg-white/5` -> `focus:bg-surface-base` (semantic surface token)
- **Item highlight:** `data-[highlighted]:bg-white/5` -> `data-[highlighted]:bg-surface-base`
- **Context menu items:** `rounded-5` -> `rounded-radius-sm` (8px design system alignment)
- **Context menu content:** `rounded-8` -> `rounded-radius-sm` (8px)
- **Dropdown content:** `rounded-15` -> `rounded-radius-md` (12px design system alignment)
- **Dropdown items:** `rounded-8` -> `rounded-radius-sm` (8px)

### Command Palette (command.tsx)
- **Input:** `text-15` -> `text-body-lg`, `placeholder:text-white/25` -> `placeholder:text-text-tertiary`
- **Items:** `rounded-8` -> `rounded-radius-sm`, `text-13` -> `text-body-sm`, `aria-selected:bg-white/4` -> `aria-selected:bg-surface-base`, `md:text-15` -> `md:text-body-lg`
- **Shortcuts:** `text-white/30` -> `text-text-tertiary`

### Frequent Apps (cmdk.tsx)
- **Heading:** `text-15` -> `text-body-lg`
- **Button hover/focus:** `hover:border-white/10` -> `hover:border-border-default`, `hover:bg-white/4` -> `hover:bg-surface-base`, `active:border-white/20` -> `active:border-border-emphasis`
- **Name text:** `text-white/75` -> `text-text-secondary`, `md:text-13` -> `md:text-body-sm`

## What Was Preserved
- `color-mix(in_hsl,hsl(var(--color-brand))_20%,black_80%)` brand-tinted menu background
- `shadow-context-menu` and `shadow-dropdown` component-specific shadows
- `shared/dialog.ts` explicitly NOT modified (deferred to Phase 3)
- All animation classes unchanged
- Close button opacity-based styling unchanged
- Component exports, props, and behavior unchanged

## Decisions Made

1. **Preserve brand-tinted menu background** -- color-mix is a design feature, not a generic surface
2. **Keep full white on focus/highlight text** -- necessary contrast on brand-tinted backgrounds
3. **Keep text-[10px] as arbitrary value** -- below smallest semantic token (caption-sm 11px)

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | dd6c64a | feat(02-03): migrate shared menu classes to semantic tokens |
| 2 | f430075 | feat(02-03): migrate command palette to semantic tokens |

## Verification Results

- TypeScript compilation: passes (no new errors)
- Shared menu.ts: all semantic tokens confirmed (text-body-sm, focus:bg-surface-base, rounded-radius-sm/md, text-text-primary)
- Command palette: all semantic tokens confirmed (text-body-lg, placeholder:text-text-tertiary, aria-selected:bg-surface-base, text-text-tertiary)
- Frequent apps: all semantic tokens confirmed (hover:bg-surface-base, hover:border-border-default, text-text-secondary)
- shared/dialog.ts: verified unchanged (no git diff)

## Next Phase Readiness

No blockers. Phase 3 (windows/sheets) can safely migrate dialog.ts as planned. The shared menu.ts changes are complete and stable.
