# Phase 3: Window & Sheet System - Research

**Researched:** 2026-02-06
**Domain:** Window chrome, sheet components, dialog/modal system, animation patterns
**Confidence:** HIGH (all findings from direct source code analysis)

## Summary

Phase 3 covers the visual redesign of three major overlay systems in LivOS: (1) the floating window system used for desktop-mode apps (AI Chat, Terminal, App Store, etc.), (2) the sheet system used for full-panel mobile/desktop app containers (Settings, App Store, Files), and (3) the dialog/modal system used across the entire application (alerts, confirmations, immersive dialogs).

The most impactful change is updating `shared/dialog.ts` -- this file was **explicitly deferred from Phase 2** and contains 4 exported class constants that cascade to ~45 consumer files (27 Dialog consumers, 17 AlertDialog consumers, 16 ImmersiveDialog consumers, plus the sheet layout). The window system is relatively self-contained (5 core files), while the sheet system spans 4 files plus provider infrastructure.

**Primary recommendation:** Structure into 4 plans: (1) shared/dialog.ts + Dialog/AlertDialog component migration, (2) Sheet system + SheetStickyHeader migration, (3) Window chrome + window body redesign, (4) ImmersiveDialog + animation polish. This order ensures the shared foundation (dialog.ts) is migrated first, then the most-used overlay types, then the self-contained window system, and finally the more complex immersive dialog with animation work.

## Component Inventory

### 1. shared/dialog.ts (THE FOUNDATION)

**File:** `livos/packages/ui/src/shadcn-components/ui/shared/dialog.ts`
**Lines:** 11
**Deferred from:** Phase 2 (Plan 02-03 explicitly preserved this file unchanged)

This file exports 4 class constants used by ALL dialog variants:

```typescript
// Line 3: Dialog overlay (used by Dialog, AlertDialog, ImmersiveDialog)
export const dialogOverlayClass = tw`fixed inset-0 z-50 bg-black/60 contrast-more:bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`

// Line 5: Dialog content base (THE KEY CLASS - used everywhere)
export const dialogContentClass = tw`fixed left-[50%] top-[50%] z-50 flex flex-col translate-x-[-50%] translate-y-[-50%] gap-6 rounded-24 bg-dialog-content/75 contrast-more:bg-dialog-content p-8 shadow-dialog backdrop-blur-3xl contrast-more:backdrop-blur-none duration-200 outline-none max-h-[calc(100%-16px)] border border-white/5`

// Line 7: Content open/close animations
export const dialogContentAnimationClass = tw`data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2`

// Line 8: Slide animation variant
export const dialogContentAnimationSlideClass = tw`data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]`

// Line 10: Footer layout
export const dialogFooterClass = tw`flex flex-col gap-3 md:flex-row pt-2`
```

**Raw values needing token migration in `dialogContentClass`:**
| Current | Semantic Token | Notes |
|---------|----------------|-------|
| `rounded-24` | `rounded-radius-xl` (20px) or keep 24 | 24px > radius-xl(20px). Decision needed. |
| `bg-dialog-content/75` | Keep as-is (custom color #1E1E1E) | Not a surface token -- specific dialog background |
| `border border-white/5` | `border border-border-subtle` (0.06) | Close match (0.05 vs 0.06) |
| `backdrop-blur-3xl` | Keep (reduce to `backdrop-blur-xl`?) | Design direction: reduce glassmorphism |
| `shadow-dialog` | `shadow-elevation-xl` or keep custom | Custom shadow has inset highlight |
| `gap-6` | Keep | Spacing, not a token issue |
| `p-8` | Keep | Spacing, not a token issue |

**Raw values in `dialogOverlayClass`:**
| Current | Semantic Token | Notes |
|---------|----------------|-------|
| `bg-black/60` | Keep (overlay, not a surface) | Overlays are intentionally opaque |

**Consumers (direct importers of shared/dialog.ts):**
1. `shadcn-components/ui/dialog.tsx` - uses all 5 exports
2. `shadcn-components/ui/alert-dialog.tsx` - uses all 5 exports
3. `components/ui/immersive-dialog.tsx` - uses 4 exports (not dialogFooterClass)

**Cascade impact:** Changing `dialogContentClass` affects:
- 27 files importing from `dialog.tsx` (Dialog component)
- 17 files importing from `alert-dialog.tsx` (AlertDialog component)
- 16 files importing from `immersive-dialog.tsx` (ImmersiveDialog)
- Total: ~60 consumer files automatically get the new styling

### 2. Dialog Component (dialog.tsx)

**File:** `livos/packages/ui/src/shadcn-components/ui/dialog.tsx`
**Lines:** 117
**Consumers:** 27 files

**Key class strings to migrate:**

```typescript
// Line 45-46: DialogContent default width
'w-full max-w-[calc(100%-40px)] sm:max-w-[480px]'

// Line 62: DialogScrollableContent
'flex flex-col p-0'

// Line 73: DialogHeader
'flex flex-col space-y-1.5'

// Line 88: DialogTitle
'text-left text-19 font-semibold leading-snug -tracking-2'
// -> 'text-left text-heading -tracking-2' (heading = 19px + lineHeight 1.3 + fontWeight 600)

// Line 100: DialogDescription
'text-left text-14 font-normal leading-relaxed -tracking-2 text-white/50'
// -> 'text-left text-body -tracking-2 text-text-secondary' (body = 14px, text-secondary = 0.60)
// Note: text-white/50 (0.50) vs text-text-secondary (0.60) -- slight visibility increase
```

**Structure:** Uses Radix `@radix-ui/react-dialog` primitives. Components: Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogScrollableContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription.

### 3. AlertDialog Component (alert-dialog.tsx)

**File:** `livos/packages/ui/src/shadcn-components/ui/alert-dialog.tsx`
**Lines:** 182
**Consumers:** 17 files

**Key class strings to migrate:**

```typescript
// Line 79: AlertDialogContent width
'w-full max-w-[calc(100%-40px)] sm:max-w-md'

// Line 98: AlertDialogHeader
'flex flex-col space-y-2 text-center'

// Line 99: Icon styling
'mx-auto h-7 w-7 rounded-full bg-white/10 p-1'
// -> 'mx-auto h-7 w-7 rounded-full bg-surface-2 p-1' (surface-2 = 0.10)

// Line 107: AlertDialogFooter
dialogFooterClass + 'md:justify-center'

// Line 118: AlertDialogTitle
'whitespace-pre-line break-words text-center text-19 font-semibold leading-snug -tracking-2'
// -> 'whitespace-pre-line break-words text-center text-heading -tracking-2'

// Line 133: AlertDialogDescription
'whitespace-pre-line break-words text-14 font-normal leading-relaxed -tracking-2 text-white/50'
// -> 'whitespace-pre-line break-words text-body -tracking-2 text-text-secondary'
```

**Important:** Uses `@radix-ui/react-dialog` (NOT `@radix-ui/react-alert-dialog`!) with a custom AlertDialogContext for open/close state management. This is a deliberate workaround (GitHub issue #1281 referenced in code).

### 4. ImmersiveDialog Component (immersive-dialog.tsx)

**File:** `livos/packages/ui/src/components/ui/immersive-dialog.tsx`
**Lines:** 271
**Consumers:** 16 files

**Key class strings to migrate:**

```typescript
// Line 19: Title class
tw`text-24 font-bold leading-none -tracking-4 text-white/80`
// -> 'text-heading-lg -tracking-4 text-text-primary'
// Note: heading-lg = 24px + lineHeight 1.2 + fontWeight 600. Current has 700 weight and leading-none.
// Decision: Keep font-bold + leading-none as overrides, or accept heading-lg defaults

// Line 20: Description class
tw`text-15 font-normal leading-tight -tracking-2 text-white/40`
// -> 'text-body-lg -tracking-2 text-text-tertiary'

// Line 90: Split content bg
'bg-transparent shadow-none ring-2 ring-white/3'

// Line 98: Side section
'hidden w-[210px] flex-col items-center justify-center bg-black/40 md:flex md:rounded-l-20'

// Line 101: Main section
'flex-1 bg-dialog-content/70 max-md:rounded-20 md:rounded-r-20'

// Line 122: Overlay
'bg-black/30 backdrop-blur-xl contrast-more:backdrop-blur-none'

// Line 137: Close button
'h-[36px] w-[36px] border-none bg-dialog-content bg-opacity-70 shadow-immersive-dialog-close hover:border-solid hover:bg-dialog-content focus:border-solid focus:bg-dialog-content active:bg-dialog-content'

// Line 174: Body text
tw`text-15 font-medium leading-none -tracking-4 text-white/90`
// -> 'text-body-lg font-medium leading-none -tracking-4 text-text-primary'

// Line 216: Icon message container
'inline-flex w-full items-center gap-2 rounded-10 border border-white/4 bg-white/4 p-2 text-left font-normal'
// -> 'inline-flex w-full items-center gap-2 rounded-radius-sm border border-border-subtle bg-surface-base p-2 text-left font-normal'

// Line 223: Icon circle
'flex h-8 w-8 shrink-0 items-center justify-center rounded-8 bg-white/4'
// -> 'flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-sm bg-surface-base'

// Line 227: Title text
'text-13 font-normal leading-tight -tracking-2'
// -> 'text-body-sm leading-tight -tracking-2'

// Line 229: Description text
'text-12 font-normal leading-tight -tracking-2 text-white/50'
// -> 'text-caption leading-tight -tracking-2 text-text-secondary'
```

**Complexity:** HIGH. This component has multiple sub-variants (standard, split, body), uses Framer Motion for AnimateIn, has an inline style for boxShadow, and multiple size props (sm, md, lg, xl). The ImmersiveDialogClose button is absolutely positioned below the dialog.

### 5. Sheet Component (sheet.tsx)

**File:** `livos/packages/ui/src/shadcn-components/ui/sheet.tsx`
**Lines:** 128
**Consumers:** 4 files (sheet layout, settings index, app-store shared, files index)

**Key class strings to migrate:**

```typescript
// Line 23: SheetOverlay
'bg-background/80 fixed inset-0 z-30 backdrop-blur-xl duration-700 ...'
// Note: Currently commented out in SheetContent (not rendered)

// Line 33: sheetVariants base
'fixed z-30 gap-4 bg-black/70 contrast-more:bg-black overflow-hidden transition-[opacity,transform] ease-out ...'
// -> 'fixed z-30 gap-4 bg-black/70 contrast-more:bg-black ...' (bg-black/70 is intentional for sheet backdrop)

// Side variants:
// 'bottom': 'rounded-t-28'
// 'bottom-zoom': 'rounded-t-28' (with zoom animation)
// 'top': 'rounded-b-24'
// 'left': 'rounded-r-24'
// 'right': 'rounded-l-24'

// Line 72: Inner background div
'absolute inset-0 bg-black contrast-more:hidden'
// (This is the wallpaper-blurred background layer -- keep as-is)

// Line 84: Blur overlay on wallpaper
'absolute inset-0 backdrop-blur-3xl backdrop-brightness-[0.3] backdrop-saturate-[1.2]'
// Design direction: possibly reduce blur from 3xl

// Line 88: Inner glow highlight
'pointer-events-none absolute inset-0 z-50 rounded-t-28 shadow-sheet-shadow'

// Line 98: SheetHeader
'flex flex-col gap-2'

// Line 113: SheetTitle
'text-24 font-bold -tracking-3 text-white/75 md:text-48'
// -> 'text-heading-lg -tracking-3 text-text-secondary md:text-display-lg'
// Note: text-white/75 doesn't map cleanly. text-secondary (0.60) is closest but dimmer.
// Could keep text-white/75 or use text-text-primary (0.90) since it's a title.

// Line 123: SheetDescription
'text-sm text-neutral-400'
// -> 'text-body-sm text-text-tertiary'
```

**Wallpaper integration:** SheetContent renders a wallpaper background with `useWallpaper()` hook. The wallpaper image is shown blurred and darkened behind sheet content. This is unique to sheets (dialogs don't do this).

### 6. Sheet Layout (layouts/sheet.tsx)

**File:** `livos/packages/ui/src/layouts/sheet.tsx`
**Lines:** 90
**Used by:** Settings, App Store, Files (via React Router)

**Key class strings to migrate:**

```typescript
// Line 53: SheetContent sizing
'mx-auto h-[calc(100dvh-var(--sheet-top))] max-w-[1320px] md:w-[calc(100vw-25px-25px)] lg:h-[calc(100dvh-60px)] lg:w-[calc(100vw-60px-60px)]'
// Primarily layout sizing -- not token-related. Keep as-is.

// Line 58: Backdrop click handler
'fixed inset-0 z-30'

// Line 69: ScrollArea
'h-full rounded-t-20'

// Line 70: Inner content
'flex flex-col gap-5 px-3 pt-6 md:px-[40px] md:pt-12 xl:px-[70px]'
```

### 7. SheetStickyHeader (providers/sheet-sticky-header.tsx)

**File:** `livos/packages/ui/src/providers/sheet-sticky-header.tsx`
**Lines:** 90

**Key class strings to migrate:**

```typescript
// Line 80-81: Sticky header target
'invisible absolute inset-x-0 top-0 z-50 h-[76px] rounded-t-20 border-b border-white/10 bg-black/50 px-5 backdrop-blur-xl empty:hidden'
// -> 'invisible absolute inset-x-0 top-0 z-50 h-[76px] rounded-t-20 border-b border-border-default bg-black/50 px-5 backdrop-blur-xl empty:hidden'

// Line 86: Inline style
boxShadow: '2px 2px 2px 0px #FFFFFF0D inset'
// -> Could use shadow-sheet-shadow token or shadow-button-highlight-soft
```

### 8. DialogCloseButton (components/ui/dialog-close-button.tsx)

**File:** `livos/packages/ui/src/components/ui/dialog-close-button.tsx`
**Lines:** 14
**Uses:** `dialogHeaderCircleButtonClass` from `@/utils/element-classes`

```typescript
// element-classes.ts line 5:
export const dialogHeaderCircleButtonClass = tw`rounded-full outline-none opacity-30 hover:opacity-40`
// -> 'rounded-full outline-none text-text-tertiary hover:text-text-secondary'
// Or keep opacity approach but consider using semantic tokens

// dialog-close-button.tsx line 10:
'h-5 w-5 lg:h-6 lg:w-6'
// -> 'h-icon-sm w-icon-sm lg:h-icon-lg lg:w-icon-lg' (or h-icon-md w-icon-md)
```

### 9. Window System (modules/window/)

**File:** `livos/packages/ui/src/modules/window/window.tsx`
**Lines:** 154

**Key class strings to migrate:**

```typescript
// Line 19: Close button in WindowChrome
'absolute right-full mr-3 group flex items-center justify-center w-10 h-10 rounded-full bg-black/70 backdrop-blur-xl border-2 border-[hsl(var(--color-brand)/0.6)] shadow-xl hover:bg-red-500 hover:border-red-400 transition-all duration-200'
// -> Migrate hover:bg-red-500 to hover:bg-destructive, border to border-brand/60
// -> backdrop-blur-xl -> reduce per design direction

// Line 26: Title pill
'flex items-center gap-3 px-5 py-2.5 bg-black/70 backdrop-blur-xl rounded-full border-2 border-[hsl(var(--color-brand)/0.6)] shadow-xl cursor-grab active:cursor-grabbing'
// -> border-2 border-brand/60

// Line 28: Title text
'text-14 font-medium text-white/90 tracking-tight whitespace-nowrap select-none'
// -> 'text-body font-medium text-text-primary tracking-tight whitespace-nowrap select-none'

// Line 22: Close icon
'h-5 w-5 text-white/70 group-hover:text-white transition-colors'
// -> 'h-icon-md w-icon-md text-text-secondary group-hover:text-text-primary transition-colors'

// Lines 137-147: Window body class
tw`fixed flex flex-col rounded-2xl bg-black/90 backdrop-blur-3xl overflow-hidden border border-white/10`
// -> tw`fixed flex flex-col rounded-radius-xl bg-black/90 backdrop-blur-xl overflow-hidden border border-border-default`

// Line 119: Inline boxShadow on window body
'0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
// -> Use shadow-elevation-xl or keep custom (has ring + shadow combo)

// Lines 101-104: Chrome animations (Framer Motion)
initial: {opacity: 0, y: -10, scale: 0.9}
animate: {opacity: 1, y: 0, scale: 1}
exit: {opacity: 0, y: -10, scale: 0.9}
transition: {type: 'spring', stiffness: 500, damping: 35}

// Lines 121-128: Window body animations (Framer Motion)
initial: {opacity: 0, scale: 0.95, y: 20}
animate: {opacity: 1, scale: 1, y: 0}
exit: {opacity: 0, scale: 0.95, y: 20}
transition: {type: 'spring', stiffness: 500, damping: 35}
```

**Window drag system:** Manual mouse event handling (mousedown/mousemove/mouseup). Sets `document.body.style.cursor = 'grabbing'` during drag. Position clamped to keep window on screen. No resize handles exist currently (WS-04 requires adding them).

### 10. WindowContent (modules/window/window-content.tsx)

**File:** `livos/packages/ui/src/modules/window/window-content.tsx`
**Lines:** 81

```typescript
// Line 68-72: Content wrapper
tw`h-full overflow-auto livinity-hide-scrollbar`

// Line 74-80: Content inner
tw`flex flex-col gap-5 p-4 md:p-6`
```

### 11. WindowsContainer (modules/window/windows-container.tsx)

**File:** `livos/packages/ui/src/modules/window/windows-container.tsx`
**Lines:** 41

Minimal file -- renders `AnimatePresence` with `mode='popLayout'` wrapping Window instances. No class strings to migrate.

### 12. WindowManager Provider (providers/window-manager.tsx)

**File:** `livos/packages/ui/src/providers/window-manager.tsx`
**Lines:** 239

**No visual styling** -- this is pure state management. However, relevant for WS-03 (z-index management) and WS-04 (resize):
- z-index starts at 40 (below dock at z-50)
- No resize action exists -- needs `UPDATE_SIZE` action for WS-04
- Position update exists but no visual feedback during drag (WS-03)

### 13. utils/dialog.ts

**File:** `livos/packages/ui/src/utils/dialog.ts`
**Lines:** 100
**Consumers:** 3 files (settings shared, sheet layout, dialog.ts itself)

Contains `EXIT_DURATION_MS = 100`, `afterDelayedClose()`, `useAfterDelayedClose()`, `useDialogOpenProps()`, `useLinkToDialog()`.

**No visual styling** -- purely behavioral. However, `EXIT_DURATION_MS = 100` controls animation timing. If SM-04 wants smoother close animations, this value may need adjusting (e.g., to 200ms for a longer fade).

### 14. Sheet Scroll Area (sheet-scroll-area.tsx)

**File:** `livos/packages/ui/src/shadcn-components/ui/sheet-scroll-area.tsx`
**Lines:** 62

```typescript
// Line 49-52: Scrollbar
'group flex touch-none select-none rounded-tl-4 transition-colors hover:bg-white/10'
// -> 'group flex touch-none select-none rounded-tl-4 transition-colors hover:bg-surface-2'

// Line 50: Vertical scrollbar
'mt-[38px] h-[calc(100%-38px)] w-[11px] border-l border-l-transparent p-[4px]'

// Line 56: Thumb
'relative flex-1 rounded-full bg-white/20 group-hover:bg-white/50'
// -> 'relative flex-1 rounded-full bg-border-emphasis group-hover:bg-white/50'
```

### 15. GenericConfirmationDialog

**File:** `livos/packages/ui/src/providers/confirmation/generic-confirmation-dialog.tsx`
**Lines:** 110

Uses `AlertDialog` + `AlertDialogContent` etc. No custom class strings beyond `px-6` on action buttons. Will automatically benefit from shared/dialog.ts migration.

## rounded-14 Decision (Deferred from Phase 1)

Phase 1 decision `[v1.1-01-02]`: "Keep rounded-14 for dialog sizes until Phase 3 dialog redesign."

Current usage of `rounded-14` in `button.tsx`:
```typescript
dialog: 'rounded-14 h-[44px] md:h-[36px] min-w-[90px] px-5 font-semibold w-full md:w-auto text-body',
lg: 'rounded-14 h-[44px] px-6 text-body-lg font-semibold',
```

**Decision needed:** Change `rounded-14` to `rounded-radius-md` (12px) or `rounded-radius-lg` (16px)?
- `rounded-14` = 14px (between md and lg)
- `rounded-radius-md` = 12px (2px smaller -- tighter)
- `rounded-radius-lg` = 16px (2px larger -- rounder)
- Recommendation: `rounded-radius-md` (12px) for dialog buttons -- the "Minimal & Clean" direction favors tighter radii, and 12px is the standard for medium-sized interactive elements.

## Token Migration Summary

### Classes that map cleanly to semantic tokens:

| Raw Value | Semantic Token | Occurrences |
|-----------|---------------|-------------|
| `text-white/50` | `text-text-secondary` (0.60) | dialog.tsx, alert-dialog.tsx descriptions |
| `text-white/40` | `text-text-tertiary` (0.40) | immersive-dialog descriptions |
| `text-white/90` | `text-text-primary` (0.90) | window chrome title |
| `text-white/80` | `text-text-primary` (0.90) | immersive dialog title |
| `text-white/70` | `text-text-secondary` (0.60) | window close icon |
| `text-white/75` | `text-text-secondary` (0.60) | sheet title |
| `border-white/5` | `border-border-subtle` (0.06) | dialog content border |
| `border-white/10` | `border-border-default` (0.10) | window body, sticky header |
| `bg-white/10` | `bg-surface-2` (0.10) | alert icon, scrollbar hover |
| `bg-white/4` | `bg-surface-base` (0.04) | immersive icon message |
| `text-19` | `text-heading` (19px) | dialog/alert titles |
| `text-14` | `text-body` (14px) | dialog/alert descriptions |
| `text-24` | `text-heading-lg` (24px) | sheet title, immersive title |
| `text-13` | `text-body-sm` (13px) | immersive icon text |
| `text-12` | `text-caption` (12px) | immersive sub-text |
| `text-15` | `text-body-lg` (15px) | immersive description, body text |
| `text-48` | `text-display-lg` (48px) | sheet title desktop |
| `rounded-2xl` | `rounded-radius-xl` (20px) | window body |

### Classes to keep as-is (intentional, not generic surfaces):

| Class | Reason |
|-------|--------|
| `bg-dialog-content/75` | Custom dialog background (#1E1E1E at 75%) -- not a surface |
| `bg-black/70` | Sheet base background -- intentionally dark for wallpaper contrast |
| `bg-black/90` | Window body -- intentionally near-opaque |
| `bg-black/60` | Dialog overlay -- standard overlay opacity |
| `shadow-dialog` | Custom shadow with inset highlight -- keep or map to elevation-xl |
| `shadow-sheet-shadow` | Custom inset glow effect unique to sheets |
| Wallpaper blur layers | Intentional visual effect, not generic blur |

## Architecture Patterns

### Shared Class Architecture

The dialog system uses a layered architecture:

```
shared/dialog.ts (foundation classes)
    |
    +-- dialog.tsx (Dialog component -- adds width constraints)
    |       +-- 27 consumer files
    |
    +-- alert-dialog.tsx (AlertDialog -- adds centered layout)
    |       +-- 17 consumer files
    |
    +-- immersive-dialog.tsx (ImmersiveDialog -- adds size variants, split layout)
            +-- 16 consumer files
```

Changing `dialogContentClass` in shared/dialog.ts cascades to ALL variants. Variant-specific overrides (width, centering) are applied via `cn()` merging in each component.

### Window System Architecture

```
window-manager.tsx (state: position, size, zIndex, minimize)
    |
    +-- windows-container.tsx (AnimatePresence wrapper)
            |
            +-- window.tsx (drag logic + Framer Motion + renders chrome + content)
                    |
                    +-- window-chrome.tsx (title bar pill + close button)
                    +-- window-content.tsx (lazy-loaded app content)
                            |
                            +-- app-contents/*.tsx (per-app wrappers)
                                    |
                                    +-- window-router.tsx (in-window navigation)
```

### Sheet System Architecture

```
sheet.tsx (Sheet, SheetContent with wallpaper background)
    |
    +-- layouts/sheet.tsx (SheetLayout with scroll restoration)
    |       |
    |       +-- sheet-sticky-header.tsx (scroll-aware sticky header)
    |       +-- sheet-top-fixed.tsx (portal target for fixed content)
    |       +-- sheet-scroll-area.tsx (custom scroll area with fade)
    |
    +-- Consumers: settings/index.tsx, app-store/shared.tsx, files/index.tsx
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window resize | Custom mouse tracking | Existing pattern from drag system | WS-04 needs resize handles -- extend the existing mousedown/mousemove/mouseup pattern in window.tsx |
| Dialog animations | Custom CSS transitions | tailwindcss-animate + Radix data-state | Already used via `data-[state=open]:animate-in` pattern |
| Sheet wallpaper blur | Manual canvas blur | Existing CSS backdrop-filter | Already using `backdrop-blur-3xl` with `backdrop-brightness` |
| Z-index management | Manual z-index tracking | Existing window-manager reducer | Already has `nextZIndex` counter pattern |
| Dialog close timing | Custom setTimeout | Existing `EXIT_DURATION_MS` + `useAfterDelayedClose` | In utils/dialog.ts, already handles animation-aware close |

## Common Pitfalls

### Pitfall 1: Breaking All Dialogs via shared/dialog.ts
**What goes wrong:** A change to `dialogContentClass` that looks fine in one dialog breaks layout in others
**Why it happens:** 60+ consumers inherit this class. Some override with `cn()`, some don't.
**How to avoid:** Test changes against all 3 dialog variants (Dialog, AlertDialog, ImmersiveDialog) and at least one consumer of each. The stories file at `stories/src/routes/stories/dialogs.tsx` has examples of all variants.
**Warning signs:** Dialog content overflowing, wrong border radius, missing backdrop blur

### Pitfall 2: Sheet Animation Timing vs EXIT_DURATION_MS
**What goes wrong:** Changing animation durations in CSS without updating `EXIT_DURATION_MS` in utils/dialog.ts causes navigation to fire before close animation completes
**Why it happens:** `useAfterDelayedClose` uses `EXIT_DURATION_MS = 100` as a hard timeout. If CSS animation is > 100ms, the route changes mid-animation.
**How to avoid:** If SM-04 increases animation duration, also update `EXIT_DURATION_MS` to match. Check all 3 consumers of `useAfterDelayedClose` and `afterDelayedClose`.
**Warning signs:** Flash of new content during close animation

### Pitfall 3: Window Z-Index Collision with Dialogs
**What goes wrong:** Windows use z-index starting at 40, dialogs use z-50. If window z-index climbs high enough, windows appear above dialogs.
**Why it happens:** `nextZIndex` increments without limit on each focus. After focusing ~10 windows, z-index reaches 50+ and can overlap dialog overlays.
**How to avoid:** Add z-index normalization in the window manager (reset z-indices when they get too high), or ensure dialogs always use z-index above any possible window z-index.
**Warning signs:** Windows appearing above dialog overlays

### Pitfall 4: rounded-24 in dialogContentClass vs rounded-t-28 in Sheet
**What goes wrong:** Changing dialog rounding without considering sheet rounding creates inconsistency
**Why it happens:** Dialogs use `rounded-24` (24px all sides), sheets use `rounded-t-28` (28px top only). These are different components but should feel cohesive.
**How to avoid:** Choose related values. If dialog moves to `rounded-radius-xl` (20px), sheet top could move to `rounded-24` (kept) or a value that feels proportional.
**Warning signs:** Dialogs and sheets feel like they belong to different apps

### Pitfall 5: ImmersiveDialog Stacking Context
**What goes wrong:** ImmersiveDialog uses its own overlay (`ImmersiveDialogOverlay`) separately from the standard `DialogOverlay`. Some consumers render the overlay through `DialogPortal`, others don't.
**Why it happens:** `ImmersiveDialogContent` renders its own overlay internally (via the Radix DialogContent), while `ImmersiveDialogSplitContent` renders `ImmersiveDialogOverlay` explicitly. The overlay class is different from the standard one.
**How to avoid:** Ensure both overlay paths get the same styling updates. Check both `ForwardedImmersiveDialogContent` and `ForwardedImmersiveDialogSplitContent`.
**Warning signs:** Different overlay darkness/blur between dialog variants

### Pitfall 6: Window Resize (WS-04) Without Existing Infrastructure
**What goes wrong:** Adding resize handles requires new state (`UPDATE_SIZE` action), new event handlers, and careful interaction with the existing drag system
**Why it happens:** The window-manager.tsx has no resize action. Window sizes are set once at open time and never change.
**How to avoid:** Add `UPDATE_SIZE` reducer action to window-manager.tsx FIRST, then add resize handles in window.tsx. Ensure resize doesn't conflict with drag (drag is on title bar, resize should be on edges/corners).
**Warning signs:** Window flickering during resize, resize triggering drag, position jumping

## Recommended Plan Structure

### Plan 03-01: shared/dialog.ts + Dialog + AlertDialog Migration
**Scope:** The shared foundation and its two primary consumers
**Files (5):**
1. `shadcn-components/ui/shared/dialog.ts` (11 lines) -- THE KEY FILE
2. `shadcn-components/ui/dialog.tsx` (117 lines)
3. `shadcn-components/ui/alert-dialog.tsx` (182 lines)
4. `components/ui/dialog-close-button.tsx` (14 lines)
5. `utils/element-classes.ts` (6 lines) -- dialogHeaderCircleButtonClass

**Changes:**
- Migrate `dialogContentClass`: border-white/5 -> border-border-subtle, reduce backdrop-blur, update rounded if decided
- Migrate Dialog typography: text-19 -> text-heading, text-14 text-white/50 -> text-body text-text-secondary
- Migrate AlertDialog typography: same pattern + bg-white/10 -> bg-surface-2
- Update dialogHeaderCircleButtonClass to use semantic tokens
- Decide rounded-14 on button dialog/lg sizes
- Update `dialogFooterClass` if needed

**Verification:** Open dialogs.tsx story, verify Dialog and AlertDialog look correct. Check a real consumer (e.g., logout-dialog.tsx).

**Estimated complexity:** MEDIUM (small file count, but high cascade impact)

### Plan 03-02: Sheet System Migration
**Scope:** Sheet component, sheet layout, sticky header, scroll area
**Files (5):**
1. `shadcn-components/ui/sheet.tsx` (128 lines)
2. `layouts/sheet.tsx` (90 lines)
3. `providers/sheet-sticky-header.tsx` (90 lines)
4. `shadcn-components/ui/sheet-scroll-area.tsx` (62 lines)
5. `modules/sheet-top-fixed.tsx` (12 lines) -- no styling changes, but verify

**Changes:**
- SheetContent: migrate border values, consider reducing backdrop-blur-3xl
- SheetTitle: text-24/text-48 -> text-heading-lg/md:text-display-lg
- SheetDescription: text-sm text-neutral-400 -> text-body-sm text-text-tertiary
- Sticky header: border-white/10 -> border-border-default, inline boxShadow -> token
- Sheet scroll area: bg-white/20 -> bg-border-emphasis, hover:bg-white/10 -> hover:bg-surface-2
- Sheet variants (rounded values): Consider standardizing to radius tokens

**Verification:** Open sheet.tsx story, navigate to Settings/App Store/Files in-app.

**Estimated complexity:** MEDIUM (wallpaper interaction needs care)

### Plan 03-03: Window Chrome + Body Redesign
**Scope:** Window visual overhaul (WS-01, WS-02, WS-03)
**Files (3):**
1. `modules/window/window.tsx` (154 lines)
2. `modules/window/window-chrome.tsx` (35 lines)
3. `modules/window/window-content.tsx` (81 lines)

**Changes:**
- Window chrome: cleaner, more minimal title bar pill (WS-01)
  - Reduce border-2 to border, use border-border-emphasis or subtle brand accent
  - Reduce backdrop-blur-xl, use shadow-elevation-md
  - Typography: text-body text-text-primary
  - Close button: subtler hover (surface-2 -> surface-3, not full red)
- Window body: refined borders and shadows (WS-02)
  - rounded-2xl -> rounded-radius-xl
  - border-white/10 -> border-border-default
  - Inline boxShadow -> shadow-elevation-xl or shadow-elevation-lg
  - Consider reducing backdrop-blur-3xl to backdrop-blur-xl
- Drag feedback (WS-03): Add visual feedback during drag (opacity change, shadow lift)

**Verification:** Open any window (AI Chat, Terminal), test drag, verify chrome looks minimal.

**Estimated complexity:** LOW-MEDIUM (self-contained, few files)

### Plan 03-04: Window Resize + ImmersiveDialog + Animation Polish
**Scope:** New resize feature (WS-04), ImmersiveDialog migration, animation smoothing (SM-04)
**Files (5-6):**
1. `providers/window-manager.tsx` (239 lines) -- add UPDATE_SIZE action
2. `modules/window/window.tsx` (154 lines) -- add resize handles
3. `components/ui/immersive-dialog.tsx` (271 lines) -- full migration
4. `utils/dialog.ts` (100 lines) -- possibly adjust EXIT_DURATION_MS
5. Framer Motion animation values across window.tsx and sheet.tsx

**Changes:**
- Window resize (WS-04):
  - Add `UPDATE_SIZE` action to window-manager reducer
  - Add `updateWindowSize` to context
  - Add resize handles (edge/corner hotspots) to window.tsx
  - Smooth resize animation via Framer Motion layout
  - Min size constraints (400x400 already in getResponsiveSize)
- ImmersiveDialog migration:
  - Title/description to semantic typography
  - Icon message containers to surface-base/border-subtle
  - Split content sections to semantic tokens
  - Close button to semantic styling
- Animation polish (SM-04):
  - Review sheet open/close durations (currently 100ms/200ms)
  - Consider EXIT_DURATION_MS increase for smoother feel
  - Spring physics review on window animations

**Verification:** Test window resize by grabbing edges. Open ImmersiveDialog variants (factory reset, backups, live-usage). Check sheet open/close feel.

**Estimated complexity:** HIGH (new feature + large component + animation tuning)

## Estimated Total Plans: 4

| Plan | Files | Complexity | Requirements |
|------|-------|------------|-------------|
| 03-01 | 5 | MEDIUM | SM-03 (dialog styling) |
| 03-02 | 5 | MEDIUM | SM-01, SM-02 (sheet header/background) |
| 03-03 | 3 | LOW-MEDIUM | WS-01, WS-02, WS-03 (window chrome/body/drag) |
| 03-04 | 5-6 | HIGH | WS-04 (resize), SM-04 (animations) + ImmersiveDialog |

## Open Questions

1. **rounded-24 in dialogContentClass -- keep or change?**
   - Current: 24px (no semantic token match)
   - Options: Keep 24px numeric, or move to radius-xl (20px)
   - Recommendation: Keep 24px for now. It's a deliberate design choice for dialogs. Add `rounded-dialog` semantic token if needed.

2. **backdrop-blur reduction scope**
   - Design direction says "reduce glassmorphism" but how much?
   - Current: `backdrop-blur-3xl` (64px) on dialogs, sheets, windows
   - Options: `backdrop-blur-xl` (24px), `backdrop-blur-2xl` (40px)
   - Recommendation: Reduce to `backdrop-blur-2xl` for dialogs, keep `backdrop-blur-3xl` for sheets (wallpaper effect depends on heavy blur)

3. **text-white/50 vs text-text-secondary (0.60) discrepancy**
   - Dialog descriptions currently use text-white/50 (50% opacity)
   - text-text-secondary is rgba(255,255,255,0.60) -- 10% more visible
   - Recommendation: Accept the slight visibility increase. The semantic token provides consistency across the app.

4. **Sheet rounded-t-28 -- should it change?**
   - 28px is larger than any semantic radius token (max radius-xl = 20px)
   - Options: Keep 28px, reduce to radius-xl (20px), or add `rounded-28` as kept numeric
   - Recommendation: Keep 28px numeric. Sheets are full-panel overlays and benefit from a slightly more generous rounding than dialogs.

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of all files listed above
- Tailwind config: `livos/packages/ui/tailwind.config.ts`
- Phase 2 VERIFICATION: `.planning/phases/v1.1-02-desktop-shell/02-VERIFICATION.md`
- Phase 2 Plan 03 SUMMARY: `.planning/phases/v1.1-02-desktop-shell/02-03-SUMMARY.md`
- STATE.md deferred decisions

### Secondary (MEDIUM confidence)
- Phase 1 token definitions and migration patterns from 01-01 and 01-02 summaries

## Metadata

**Confidence breakdown:**
- Component inventory: HIGH - all files read directly
- Token mappings: HIGH - verified against tailwind.config.ts
- Plan structure: HIGH - based on dependency analysis
- Animation recommendations: MEDIUM - design direction subjective

**Research date:** 2026-02-06
**Valid until:** Indefinite (codebase-specific research, not library-dependent)
