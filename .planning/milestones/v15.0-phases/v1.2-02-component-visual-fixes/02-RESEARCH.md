# Phase 2: Component Visual Fixes - Research

**Researched:** 2026-02-06
**Domain:** Tailwind CSS class updates across 8 UI components
**Confidence:** HIGH

## Summary

This phase applies targeted visual fixes to 8 components that need more than just token value changes (which were handled in Phase 1). Every change is a direct Tailwind class or inline value edit -- no new libraries, no architecture changes, no new files. The work is purely surgical: find the exact class string or value, replace it with the upgraded version.

All 8 target files have been read and analyzed. Every current value has been located with exact line numbers. The changes are straightforward string replacements with no complex dependencies between them, though all depend on Phase 1's token values already being in `tailwind.config.ts` (confirmed present).

**Primary recommendation:** Execute all 8 requirements as independent, parallelizable tasks. Each touches a different file (except CV-06 which shares `menu.ts` for both context menu and dropdown). Order does not matter.

## Standard Stack

No new libraries needed. All changes use existing Tailwind utilities defined in `tailwind.config.ts`.

### Relevant Token Definitions (from tailwind.config.ts)

| Token | Value | Used by |
|-------|-------|---------|
| `border-hpx` (borderWidth) | `0.5px` | CV-01 current dock border |
| `border-px` (borderWidth) | `1px` | CV-01 target dock border |
| `bg-surface-base` | `rgba(255,255,255,0.06)` | CV-01 current dock bg, CV-05 hover, CV-06 focus |
| `bg-surface-1` | `rgba(255,255,255,0.10)` | CV-01 target dock bg, CV-06 target focus |
| `radius-sm` | `8px` | CV-06 current context menu radius |
| `radius-md` | `12px` | CV-06 target context menu radius |
| `shadow-elevation-lg` | with inset glow | CV-07 target window shadow |
| `shadow-button-highlight-soft-hpx` | `0px 0.5px 0px 0px rgba(255,255,255,0.1) inset` | CV-08 current |
| `shadow-button-highlight-soft` | `0px 1px 0px 0px rgba(255,255,255,0.1) inset` | CV-08 target |

All tokens already exist in `tailwind.config.ts`. No new tokens need to be created.

## Architecture Patterns

### Pattern: `tw` tagged template for static class strings

Several components use `tw` tagged template literals for static class definitions extracted outside the component function:

```typescript
const dockClass = tw`...classes...`
const windowClass = tw`...classes...`
```

These are defined at module scope and must be edited as string literals.

### Pattern: `cn()` for dynamic class merging

Components use `cn()` (clsx + tailwind-merge) for conditional/dynamic classes:

```typescript
className={cn(menuItemClass, 'rounded-radius-sm')}
```

### Pattern: `cva()` for variant-based classes

The button and sheet components use `class-variance-authority` for variant-based class definitions:

```typescript
const buttonVariants = cva('base classes', { variants: { ... } })
```

### Pattern: Inline style objects for non-Tailwind values

Dock item uses inline `style` props for dynamic values like icon dimensions and spring physics:

```typescript
const springOptions: SpringOptions = { mass: 0.1, stiffness: 150, damping: 10 }
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class string manipulation | Manual string concat | `cn()` from shadcn-lib/utils | Handles conditional merging and Tailwind conflicts |

**Key insight:** Every change in this phase is a direct value replacement. No abstractions needed.

## Common Pitfalls

### Pitfall 1: Editing the wrong hover class in FileItem
**What goes wrong:** CV-05 says "add hover:bg-surface-base to rows" but the hover is ALREADY applied in the `FileItem` wrapper (index.tsx line 198), not in `ListViewFileItem` itself.
**Why it happens:** The requirement text says "File Manager List" suggesting edits in list-view-file-item.tsx, but the hover state is in the parent `FileItem` component.
**How to avoid:** The hover class `md:hover:!bg-surface-base` already exists at `index.tsx` line 198. This requirement may already be satisfied, OR it may mean the hover bg needs to be upgraded. Verify against the requirement carefully.
**Warning signs:** If you add hover classes to `list-view-file-item.tsx`, they may conflict with the parent's hover classes.

### Pitfall 2: DockPreview class not updated alongside Dock
**What goes wrong:** The dock has two class definitions: `dockClass` (line 305) and `dockPreviewClass` (line 306). Changes to the dock may need to apply to both.
**Why it happens:** The preview version has different styling (e.g., `bg-neutral-900/80` instead of `bg-surface-base`).
**How to avoid:** CV-01 requirements are for the main dock only. The preview class already uses `px-3` and `bg-neutral-900/80`, so it likely should NOT be changed. But verify the border-hpx change -- the preview also has `border-hpx`.
**Warning signs:** Visual inconsistency between dock and dock preview.

### Pitfall 3: Sheet backdrop-brightness is inside a complex nested div
**What goes wrong:** The `backdrop-brightness-[0.3]` value is on an inner div, not on the SheetContent itself.
**Why it happens:** The sheet has a layered background system with wallpaper, blur, and brightness.
**How to avoid:** Target the exact div at line 84 that has `backdrop-brightness-[0.3]`.

### Pitfall 4: Context menu vs Dropdown have different radius requirements
**What goes wrong:** CV-06 says upgrade context menu radius from radius-sm to radius-md, but dropdown already uses radius-md.
**Why it happens:** They share `menuItemClass` but have separate content/item classes.
**How to avoid:** Only change `contextMenuClasses.content` and `contextMenuItemClass` radius -- dropdown already has `radius-md`.

### Pitfall 5: Button size "default" vs size "md" confusion
**What goes wrong:** CV-08 mentions "default 34->36px" but the `default` size already has `md:h-[34px]` and the `md` size also has `md:h-[34px]`.
**Why it happens:** Both `default` and `md` sizes share the same responsive height.
**How to avoid:** Check both `sm` and `default` sizes carefully. The `md` size also needs updating.

## Code Examples

### CV-01: Dock (dock.tsx, line 305)

**Current (line 305):**
```typescript
const dockClass = tw`mx-auto flex items-end gap-3 rounded-radius-xl bg-surface-base contrast-more:bg-neutral-700 backdrop-blur-2xl contrast-more:backdrop-blur-none px-2.5 shadow-dock shrink-0 will-change-transform transform-gpu border-hpx border-border-default`
```

**Changes needed:**
1. `border-hpx` -> `border-px` (upgrade border width from 0.5px to 1px)
2. `bg-surface-base` -> `bg-surface-1` (upgrade background)
3. `px-2.5` -> `px-3` (increase horizontal padding)

**Target:**
```typescript
const dockClass = tw`mx-auto flex items-end gap-3 rounded-radius-xl bg-surface-1 contrast-more:bg-neutral-700 backdrop-blur-2xl contrast-more:backdrop-blur-none px-3 shadow-dock shrink-0 will-change-transform transform-gpu border-px border-border-default`
```

**Note on dockPreviewClass (line 306):** Already uses `px-3` and has `border-hpx`. The preview may or may not need the border-hpx -> border-px change. Since the requirement specifically says "Dock" and the preview is a different context (wallpaper settings preview), it should be left as-is unless explicitly required.

---

### CV-02: Dock Items (dock-item.tsx)

**Current icon size (line 149):**
```typescript
<Icon className='h-[55%] w-[55%] text-text-primary drop-shadow-md' />
```
**Change:** `h-[55%] w-[55%]` -> `h-[60%] w-[60%]`

**Current glow opacity (line 121):**
```typescript
<div
    className='absolute hidden h-full w-full rounded-radius-lg bg-surface-3 opacity-30 md:block'
```
**Change:** `opacity-30` -> `opacity-50`

**Current spring damping (lines 85-88):**
```typescript
const springOptions: SpringOptions = {
    mass: 0.1,
    stiffness: 150,
    damping: 10,
}
```
**Change:** `damping: 10` -> `damping: 14`

---

### CV-03: Sheet (sheet.tsx, line 84)

**Current backdrop-brightness (line 84):**
```typescript
<div className='absolute inset-0 transform-gpu backdrop-blur-xl md:backdrop-blur-3xl backdrop-brightness-[0.3] backdrop-saturate-[1.2]' />
```
**Change:** `backdrop-brightness-[0.3]` -> `backdrop-brightness-[0.38]`

**Add top border:** The sheet content div (line 69) needs a top border added. The `sheetVariants` base class (line 33) defines the content styling. For "bottom" variant sheets (the default), a top border should be added.

**Current sheetVariants base class (line 33):**
```typescript
'fixed z-30 gap-4 bg-black/70 contrast-more:bg-black overflow-hidden transition-[opacity,transform] ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-100 data-[state=open]:duration-100 outline-none data-[state=closed]:fade-out data-[state=closed]:ease-in',
```

**Where to add border:** The `border-t border-border-default` should be added to the base class of `sheetVariants` (line 33). Note: the `top` and `left` variants already have `border-b` and `border-r` respectively, so adding `border-t` to the base would affect all sides. Better approach: add `border-t border-border-default` only to the `bottom` and `bottom-zoom` variants since the requirement is for sheets that slide up from the bottom.

**Current `bottom` variant (lines 38-39):**
```typescript
bottom:
    'inset-x-0 bottom-0 data-[state=closed]:slide-out-to-bottom-1/2 data-[state=open]:slide-in-from-bottom-1/2 rounded-t-28',
```

**Current `bottom-zoom` variant (lines 40-41):**
```typescript
'bottom-zoom':
    'inset-x-0 bottom-0 data-[state=closed]:zoom-out-75 data-[state=open]:zoom-in-90 rounded-t-28 data-[state=open]:duration-200 data-[state=closed]:duration-100',
```

**Change:** Add `border-t border-border-default` to both `bottom` and `bottom-zoom` variant strings.

---

### CV-04: Dialog (shared/dialog.ts, line 5)

**Current (line 5):**
```typescript
export const dialogContentClass = tw`fixed left-[50%] top-[50%] z-50 flex flex-col translate-x-[-50%] translate-y-[-50%] gap-6 rounded-24 bg-dialog-content/75 contrast-more:bg-dialog-content p-8 shadow-dialog transform-gpu backdrop-blur-lg md:backdrop-blur-2xl contrast-more:backdrop-blur-none duration-200 outline-none max-h-[calc(100%-16px)] border border-border-subtle`
```

**Change:** `border-border-subtle` -> `border-border-default`

**Note:** The requirement says "upgrade border from border-subtle to border-default". Prior decision v1.1-03-01 says "Dialog: border-border-subtle in shared/dialog.ts" but this phase overrides that with the new visual hierarchy.

---

### CV-05: File Manager List (list-view-file-item.tsx + index.tsx)

**Desktop icon size (list-view-file-item.tsx line 87):**
```typescript
<FileItemIcon item={item} className='h-5 w-5' />
```
**Change:** `h-5 w-5` -> `h-6 w-6` (20px -> 24px)

**Hover state (index.tsx line 198):**
```typescript
!isSelected && !isUploading && 'md:hover:!border-border-subtle md:hover:!bg-surface-base', // don't show hover state for selected items or uploading items
```
**Analysis:** The hover state `md:hover:!bg-surface-base` already exists in the parent `FileItem` wrapper. The requirement says "add hover:bg-surface-base to rows". This is ALREADY PRESENT. If the requirement means something different (like making it more visible or changing to a different surface level), clarification may be needed. But based on the literal requirement text, this is already satisfied.

**Gotcha:** The `h-5 w-5` is 20px (Tailwind's `5` = 1.25rem = 20px). `h-6 w-6` is 24px. This matches the requirement "20px -> 24px".

---

### CV-06: Context Menu & Dropdown (shared/menu.ts)

**Focus bg in menuItemClass (line 10):**
```typescript
const menuItemClass = tw`relative flex cursor-default select-none items-center px-3 py-2 text-body-sm font-medium -tracking-3 leading-tight outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-surface-base focus:text-white data-[highlighted]:bg-surface-base data-[highlighted]:text-white`
```
**Change:** `focus:bg-surface-base` -> `focus:bg-surface-1` AND `data-[highlighted]:bg-surface-base` -> `data-[highlighted]:bg-surface-1`

**Context menu content radius (line 19):**
```typescript
content: cn(menuContentClass, 'shadow-context-menu rounded-radius-sm'),
```
**Change:** `rounded-radius-sm` -> `rounded-radius-md`

**Context menu item radius (line 16):**
```typescript
const contextMenuItemClass = cn(menuItemClass, 'rounded-radius-sm')
```
**Change:** `rounded-radius-sm` -> `rounded-radius-md`

**Dropdown item radius (line 34):**
```typescript
const dropdownItemClass = cn(menuItemClass, 'rounded-radius-sm')
```
**Analysis:** The requirement says "upgrade context menu radius from radius-sm to radius-md". Dropdown already has `rounded-radius-md` on its content (line 36). The dropdown ITEM class also has `rounded-radius-sm` (line 34). If the focus bg upgrade applies to the shared `menuItemClass`, it automatically affects both context menu and dropdown items. The radius change for items may need to apply to dropdown items too for consistency -- but the requirement only mentions context menu radius explicitly.

**Gotcha:** The `menuItemClass` is shared between context menu and dropdown. Changing `focus:bg-surface-base` to `focus:bg-surface-1` in `menuItemClass` will affect BOTH context menus and dropdowns. This is likely intentional since the requirement title says "Context Menu & Dropdown".

---

### CV-07: Window (window.tsx, lines 211-221)

**Current windowClass (lines 211-221):**
```typescript
const windowClass = tw`
	fixed
	flex
	flex-col
	rounded-radius-xl
	bg-black/90
	backdrop-blur-xl
	overflow-hidden
	border
	border-border-default
`
```
**Change:** `border-border-default` -> `border-border-emphasis`

**Add shadow:** Add `shadow-elevation-lg` to the class string.

**Note:** The window currently uses inline `boxShadow` style (lines 180-182) for drag state shadows. Adding `shadow-elevation-lg` as a Tailwind class may conflict with the inline `style.boxShadow`. The inline style will take precedence over Tailwind classes due to CSS specificity. This means `shadow-elevation-lg` will be overridden by the inline style.

**Gotcha:** Lines 180-182 show:
```typescript
boxShadow: isDragging
    ? '0 35px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)'
    : '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
```
The inline `boxShadow` will always override the Tailwind `shadow-elevation-lg` class. Options:
1. Replace the inline boxShadow with the Tailwind class (remove the inline style entirely and use `shadow-elevation-lg` in the class)
2. Add `shadow-elevation-lg` to the class AND keep inline style for drag state only (set inline shadow to empty string when not dragging)
3. Just update the non-dragging inline shadow value to match `shadow-elevation-lg`

**Recommendation:** The cleanest approach is to remove the non-dragging shadow from inline styles and use the Tailwind class, but keep the dragging state inline shadow. When `isDragging` is false, set `boxShadow: undefined` to let the Tailwind class apply. When `isDragging` is true, use the elevated drag shadow inline.

---

### CV-08: Button (button.tsx)

**Default variant shadow (line 16):**
```typescript
'bg-surface-1 hover:bg-surface-2 active:bg-surface-base border border-border-default ring-white/20 data-[state=open]:bg-surface-2 hover:border-border-emphasis focus-visible:border-border-emphasis data-[state=open]:border-border-emphasis shadow-button-highlight-soft-hpx',
```
**Change:** `shadow-button-highlight-soft-hpx` -> `shadow-button-highlight-soft`

**Size `sm` (line 26):**
```typescript
sm: 'rounded-radius-sm h-[44px] md:h-[28px] px-3 text-caption gap-1.5',
```
**Change:** `md:h-[28px]` -> `md:h-[30px]`

**Size `default` (line 29):**
```typescript
default: 'rounded-radius-md h-[44px] md:h-[34px] px-3.5 text-body-sm',
```
**Change:** `md:h-[34px]` -> `md:h-[36px]`

**Size `md` (line 27):**
```typescript
md: 'rounded-radius-md h-[44px] md:h-[34px] min-w-[80px] px-4 text-body-sm',
```
**Analysis:** The requirement says "increase desktop heights sm 28->30px md:h-[28px]->md:h-[30px], default 34->36px md:h-[34px]->md:h-[36px]". The `md` size also has `md:h-[34px]`. Should the `md` size also be updated to `md:h-[36px]`? The requirement only mentions `sm` and `default` explicitly.

**Other sizes with md:h-[34px]:** Also check `icon-only` (line 35): `md:h-[34px] md:w-[34px]`. If we're increasing the default height to 36px, the icon-only size should probably match.

**Gotcha:** The `md` and `icon-only` sizes also use `md:h-[34px]`. The requirement text explicitly mentions "sm" and "default" sizes. The planner should decide whether to also update `md` and `icon-only` to maintain consistency.

## File-by-File Change Summary

| Req | File | Line(s) | Current Value | New Value |
|-----|------|---------|---------------|-----------|
| CV-01 | dock.tsx | 305 | `border-hpx` | `border-px` |
| CV-01 | dock.tsx | 305 | `bg-surface-base` | `bg-surface-1` |
| CV-01 | dock.tsx | 305 | `px-2.5` | `px-3` |
| CV-02 | dock-item.tsx | 149 | `h-[55%] w-[55%]` | `h-[60%] w-[60%]` |
| CV-02 | dock-item.tsx | 121 | `opacity-30` | `opacity-50` |
| CV-02 | dock-item.tsx | 88 | `damping: 10` | `damping: 14` |
| CV-03 | sheet.tsx | 84 | `backdrop-brightness-[0.3]` | `backdrop-brightness-[0.38]` |
| CV-03 | sheet.tsx | 38-41 | (no border-t) | add `border-t border-border-default` to bottom variants |
| CV-04 | shared/dialog.ts | 5 | `border-border-subtle` | `border-border-default` |
| CV-05 | list-view-file-item.tsx | 87 | `h-5 w-5` | `h-6 w-6` |
| CV-05 | index.tsx (FileItem) | 198 | already has `md:hover:!bg-surface-base` | Already satisfied (verify) |
| CV-06 | shared/menu.ts | 10 | `focus:bg-surface-base` | `focus:bg-surface-1` |
| CV-06 | shared/menu.ts | 10 | `data-[highlighted]:bg-surface-base` | `data-[highlighted]:bg-surface-1` |
| CV-06 | shared/menu.ts | 19 | `rounded-radius-sm` (content) | `rounded-radius-md` |
| CV-06 | shared/menu.ts | 16 | `rounded-radius-sm` (item) | `rounded-radius-md` |
| CV-07 | window.tsx | 220 | `border-border-default` | `border-border-emphasis` |
| CV-07 | window.tsx | 211-221 | no shadow class | add `shadow-elevation-lg` (but see inline style gotcha) |
| CV-08 | button.tsx | 16 | `shadow-button-highlight-soft-hpx` | `shadow-button-highlight-soft` |
| CV-08 | button.tsx | 26 | `md:h-[28px]` | `md:h-[30px]` |
| CV-08 | button.tsx | 29 | `md:h-[34px]` | `md:h-[36px]` |

## Open Questions

1. **CV-05 hover state already exists**
   - What we know: The `FileItem` wrapper (index.tsx line 198) already has `md:hover:!bg-surface-base`
   - What's unclear: Does the requirement mean the existing hover should be preserved as-is, or does it need to be added to the inner `ListViewFileItem` component?
   - Recommendation: Since it already exists, consider this satisfied. Only flag if the hover bg level needs upgrading (e.g., to `surface-1`).

2. **CV-07 window shadow vs inline boxShadow conflict**
   - What we know: The window uses inline `boxShadow` style that overrides Tailwind shadow classes
   - What's unclear: Should we replace the inline shadow with the Tailwind class, or keep both?
   - Recommendation: Replace non-dragging inline shadow with Tailwind class `shadow-elevation-lg`. Keep dragging state as inline override. Set `boxShadow: isDragging ? '...' : undefined`.

3. **CV-08 button sizes beyond sm and default**
   - What we know: `md` size and `icon-only` size also use `md:h-[34px]`
   - What's unclear: Should these also be updated to `md:h-[36px]` for consistency?
   - Recommendation: Update `md` and `icon-only` sizes to match for consistency, unless the requirement specifically wants them different.

4. **CV-06 dropdown item radius**
   - What we know: Dropdown items use `rounded-radius-sm` (line 34), same as context menu items
   - What's unclear: The requirement says "upgrade context menu radius from radius-sm to radius-md". Should dropdown items also get radius-md?
   - Recommendation: Update dropdown item radius too for consistency since they share visual language.

5. **CV-03 sheet border - which variants?**
   - What we know: Sheet has 5 side variants (top, bottom, bottom-zoom, left, right). Some already have borders.
   - What's unclear: Should the top border only apply to bottom/bottom-zoom variants?
   - Recommendation: Add `border-t border-border-default` only to `bottom` and `bottom-zoom` variants, since sheets that open from the bottom show a top edge to the user.

## Sources

### Primary (HIGH confidence)
- Direct code reading of all 8 target files (exact line numbers verified)
- `tailwind.config.ts` token definitions (all tokens confirmed to exist)
- Phase 1 plan confirming token values already updated

### Secondary (MEDIUM confidence)
- Prior decisions from v1.1 phases (referenced for context on what's being overridden)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all Tailwind utilities
- Architecture: HIGH - Direct code reading, patterns verified
- Pitfalls: HIGH - All edge cases identified from actual code analysis

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable; these are static class changes)
