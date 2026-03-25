# Phase 2: Desktop Shell - Research

**Researched:** 2026-02-06
**Domain:** Desktop UI Components / Tailwind CSS Token Migration / Framer Motion Animations
**Confidence:** HIGH

## Summary

This research investigates the complete desktop shell layer of LivOS: the dock, app grid, desktop header/greeting, wallpaper system, context menu, command palette, toast/notification system, and floating island notifications. The codebase was analyzed file-by-file (24 files, ~3,164 lines total) to catalog every class string, animation, and dependency relationship.

The desktop shell is composed of three layers: (1) the wallpaper background layer with blur transitions, (2) the content layer containing the header/greeting, app grid, and search button, and (3) the overlay layer with the dock at bottom, floating islands above the dock, and context menus/command palette on demand. The current styling uses a mix of raw Tailwind values (`bg-white/10`, `text-19`, `rounded-2xl`), the `tw` template literal helper for extracted class strings, and a few component-specific shadow tokens already defined in tailwind.config.ts (e.g., `shadow-dock`, `shadow-floating-island`).

Phase 1 established semantic tokens (surface-base/1/2/3, border-subtle/default/emphasis, text-primary/secondary/tertiary, typography scale, elevation shadows, semantic radii). The majority of the desktop shell components do NOT yet use these tokens -- they still use raw opacity values like `bg-white/10`, `text-white/90`, `border-white/5`, numeric font sizes like `text-19`, `text-13`, `text-11`, and numeric border radii like `rounded-2xl`, `rounded-xl`, `rounded-10`, `rounded-15`. The primary work in this phase is migrating these raw values to semantic tokens while refining the visual design.

**Primary recommendation:** Group changes by visual area (dock, desktop content, command palette, toasts/islands) to keep each plan focused and independently verifiable. The dock+blur system is the most complex due to Framer Motion physics-based animations tightly coupled to styling. Handle it in its own plan.

## Component Analysis

### 1. Dock (`dock.tsx` + `dock-item.tsx` + `blur-below-dock.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/dock.tsx` (312 lines)
- `livos/packages/ui/src/modules/desktop/dock-item.tsx` (195 lines)
- `livos/packages/ui/src/modules/desktop/blur-below-dock.tsx` (10 lines)

**Requirements:** DD-01 (slimmer profile, refined hover animations, cleaner divider)

**Current class strings (exact):**

```typescript
// dock.tsx line 305
const dockClass = tw`mx-auto flex items-end gap-3 rounded-2xl bg-black/10 contrast-more:bg-neutral-700 backdrop-blur-2xl contrast-more:backdrop-blur-none px-3 shadow-dock shrink-0 will-change-transform transform-gpu border-hpx border-white/10`

// dock.tsx line 306
const dockPreviewClass = tw`mx-auto flex items-end gap-4 rounded-2xl bg-neutral-900/80 px-3 shadow-dock shrink-0 border-hpx border-white/10`

// dock.tsx line 309 (DockDivider)
<div className='br grid w-1 place-items-center' style={{height: iconSize}}>
    <div className='h-7 border-r border-white/10' />
</div>

// dock-item.tsx line 121 (icon glow)
<div className='absolute hidden h-full w-full rounded-xl bg-white/20 opacity-30 md:block'
    style={{ filter: 'blur(16px)', transform: 'translateY(4px)' }} />

// dock-item.tsx line 129-131 (icon container)
'relative origin-top-left rounded-xl bg-white/10 backdrop-blur-md border border-white/20 transition-[filter] has-[:focus-visible]:brightness-125 flex items-center justify-center'

// dock-item.tsx line 149 (React Icon)
<Icon className='h-[55%] w-[55%] text-white/90 drop-shadow-md' />

// dock-item.tsx line 183 (OpenPill indicator)
'absolute -bottom-[7px] left-1/2 h-[2px] w-[10px] -translate-x-1/2 rounded-full bg-white'

// blur-below-dock.tsx line 4
'pointer-events-none fixed inset-0 top-0 backdrop-blur-2xl duration-500 animate-in fade-in fill-mode-both'
// with inline style: background: '#00000044', WebkitMaskImage gradient
```

**Framer Motion animations:**
- Dock enter: `initial={{translateY: 80, opacity: 0}} animate={{translateY: 0, opacity: 1}}` with spring stiffness:200, damping:20
- DockItem magnification: `useTransform(distance, [-150, 0, 150], [iconSize, iconSizeZoomed, iconSize])` + `useSpring` with mass:0.1, stiffness:150, damping:10
- DockItem bounce: `translateY: [0, -20, 0]` on open
- OpenPill: fade in with delay matching bounce duration

**Dimensions system:**
- Desktop: iconSize=50, iconSizeZoomed=80, padding=12
- Mobile: iconSize=48, iconSizeZoomed=60, padding=8
- Preview: iconSize=50, iconSizeZoomed=80, padding=12
- DOCK_BOTTOM_PADDING_PX = 10

**Complexity:** HIGH - Framer Motion physics animations are intertwined with layout. The magnification effect uses `useTransform` + `useSpring` on mouse distance. Changing icon sizes or padding requires careful testing of the spring behavior. The `shadow-dock` is a complex multi-layer inset shadow.

**Dependencies:**
- `DockItem` depends on: Framer Motion (`useMotionValue`, `useTransform`, `useSpring`), react-icons/tb (10 icons), NotificationBadge
- `DockBottomPositioner` uses fixed positioning with z-50
- `DockSpacer` creates spacer matching dock height + bottom padding
- `BlurBelowDock` uses CSS mask gradient for the dock blur effect

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `bg-black/10` | `bg-surface-base` or new `bg-dock` |
| `border-white/10` | `border-border-default` |
| `bg-white/10` (dock item) | `bg-surface-2` |
| `border-white/20` (dock item) | `border-border-emphasis` |
| `bg-white/20 opacity-30` (glow) | Consider removing or reducing |
| `text-white/90` (icon) | `text-text-primary` |
| `bg-white` (open pill) | Keep as-is (pure white indicator) |
| `rounded-2xl` | `rounded-radius-xl` (20px) |
| `rounded-xl` | `rounded-radius-lg` (16px) |

---

### 2. Desktop Header & Greeting (`header.tsx` + `greeting-message.ts`)

**Files:**
- `livos/packages/ui/src/modules/desktop/header.tsx` (23 lines)
- `livos/packages/ui/src/modules/desktop/greeting-message.ts` (27 lines)

**Requirements:** DD-03 (minimal typography)

**Current class strings (exact):**

```typescript
// header.tsx line 9
<div className={cn('relative z-10', name ? '' : 'invisible')}>

// header.tsx line 10
<div className='flex flex-col items-center gap-3 px-4 md:gap-4'>

// header.tsx line 11-17
<LivinityLogo className='w-[73px] md:w-auto' ... />

// header.tsx line 19
<h1 className='text-center text-19 font-bold md:text-5xl'>{greetingMessage(name)}</h1>
```

**Complexity:** LOW - Simple presentational component. Only typography and spacing tokens need updating.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `text-19` | `text-heading` (19px) |
| `md:text-5xl` | `text-display-lg` (48px) |
| `font-bold` | Included in display-lg definition (fontWeight: 700) |
| `gap-3 md:gap-4` | Standard spacing, fine as-is |

---

### 3. Desktop Content & Layout (`desktop-content.tsx` + `desktop.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` (86 lines)
- `livos/packages/ui/src/layouts/desktop.tsx` (49 lines)

**Requirements:** DD-02 (improved app grid spacing and alignment)

**Current class strings (exact):**

```typescript
// desktop-content.tsx line 43
'flex h-full w-full select-none flex-col items-center justify-between'

// desktop-content.tsx line 49
'pt-6 md:pt-8' (top spacing)

// desktop-content.tsx line 51
'pt-6 md:pt-8' (between header and grid)

// desktop-content.tsx line 52
'flex w-full grow overflow-hidden' (grid container)

// desktop-content.tsx line 82
'pt-6' (above dock spacer)

// desktop.tsx line 37
'relative flex h-[100dvh] w-full flex-col items-center justify-between'

// desktop.tsx line 49
tw`absolute right-5 top-5 z-10` (wifi button positioner)
```

**Framer Motion animations:**
- Desktop content variants: opacity 1 (default) vs opacity 0 with translateY 0 (overlayed)
- App icons stagger: delay `i * 0.01`, duration 0.2, scale 0.75 -> 1

**Complexity:** LOW - Layout component with simple flex structure. Spacing tokens are standard.

---

### 4. App Grid (`app-grid.tsx` + `paginator.tsx` + `app-pagination-utils.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx` (125 lines)
- `livos/packages/ui/src/modules/desktop/app-grid/paginator.tsx` (131 lines)
- `livos/packages/ui/src/modules/desktop/app-grid/app-pagination-utils.tsx` (115 lines)

**Requirements:** DD-02 (improved app grid spacing and alignment)

**Current class strings (exact):**

```typescript
// app-grid.tsx line 125
const appGridClass = tw`gap-x-[var(--app-x-gap)] gap-y-[var(--app-y-gap)] grid content-center justify-center`

// app-grid.tsx line 50
'livinity-hide-scrollbar flex h-full w-full snap-x snap-mandatory overflow-hidden overflow-x-auto md:max-w-[var(--apps-max-w)]'

// app-grid.tsx line 90
'mb-6 mt-6' (paginator pills wrapper)

// paginator.tsx line 92 (arrow button)
'shrink-0 w-10 h-10 rounded-full backdrop-blur-sm contrast-more:bg-neutral-800 contrast-more:backdrop-blur-none grid place-items-center bg-white/5 shadow-glass-button text-white/75 disabled:text-white/30 transition-all hover:bg-white/10 contrast-more:hover:bg-neutral-700 active:bg-white/5 cursor-default'

// paginator.tsx line 106-108 (paginator pills)
'h-1 w-3 rounded-full bg-white/20 transition-all group-hover:bg-white/30'
active: 'w-5 bg-white'
```

**CSS Variables (set by app-pagination-utils.tsx):**
- `--page-w`, `--app-w`, `--app-h`, `--app-x-gap`, `--app-y-gap`, `--apps-max-w`, `--apps-padding-x`
- Responsive: S (mobile): appW=70, appH=90, appXGap=20, appYGap=0, paddingX=10, appsPerRowMax=4
- Responsive: M (desktop): appW=120, appH=110, appXGap=30, appYGap=12, paddingX=32, appsPerRowMax=6

**Complexity:** MEDIUM - The pagination system is self-contained but depends on CSS variables for grid layout. The arrow buttons use `shadow-glass-button` (complex inset shadow). Changing grid spacing requires updating the pagination calculation constants.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `bg-white/5` (arrow button) | `bg-surface-base` |
| `hover:bg-white/10` | `hover:bg-surface-2` |
| `text-white/75` | `text-text-secondary` or keep as `text-white/75` |
| `bg-white/20` (pill) | `bg-border-emphasis` |
| `shadow-glass-button` | Consider simplifying to `shadow-elevation-sm` |

---

### 5. App Icon (`app-icon.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/app-icon.tsx` (318 lines)

**Requirements:** DD-02 (part of grid redesign)

**Current class strings (exact):**

```typescript
// line 48-49
'group flex h-[var(--app-h)] w-[var(--app-w)] flex-col items-center gap-2.5 py-3 focus:outline-none'

// line 71-72 (icon container)
'relative aspect-square w-12 shrink-0 overflow-hidden rounded-10 bg-white/10 bg-cover bg-center ring-white/25 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:ring-6 group-focus-visible:ring-6 group-active:scale-95 group-data-[state=open]:ring-6 md:w-16 md:rounded-15'

// line 90 (progress bar bg)
'relative h-1 w-[75%] overflow-hidden rounded-full bg-white/40'

// line 92-93 (progress bar fill)
'absolute inset-0 w-0 rounded-full bg-white/90 transition-[width] delay-200 duration-700 animate-in slide-in-from-left-full fill-mode-both'

// line 97 (indeterminate loader)
'absolute inset-0 w-[30%] animate-sliding-loader rounded-full bg-white/90'

// line 109 (label)
'max-w-full text-11 leading-normal drop-shadow-desktop-label md:text-13'
```

**Context menu (AppIconConnected):** Uses shared `ContextMenuContent` + `ContextMenuItem` + `contextMenuClasses` from shadcn shared menu system.

**Complexity:** MEDIUM - Has multiple states (ready, stopped, installing, progress) with different visual treatments. The hover ring animation (`group-hover:ring-6`) and scale transitions are design-critical. The context menu is shared infrastructure.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `bg-white/10` (icon bg) | `bg-surface-2` |
| `ring-white/25` | `ring-border-emphasis` |
| `rounded-10 md:rounded-15` | `rounded-radius-sm md:rounded-radius-md` |
| `text-11 md:text-13` | `text-caption-sm md:text-body-sm` |
| `bg-white/40` (progress bg) | `bg-surface-3` |
| `bg-white/90` (progress fill) | `bg-text-primary` |

---

### 6. Desktop Search Button (`desktop-misc.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/desktop-misc.tsx` (57 lines)

**Requirements:** Part of DD-02 and CN-01

**Current class strings (exact):**

```typescript
// line 12 (Search button)
'z-10 select-none rounded-full border border-white/5 bg-neutral-600/20 px-3 py-2.5 text-12 leading-inter-trimmed text-white/90 backdrop-blur-sm transition-colors delay-300 duration-300 animate-in fade-in fill-mode-both hover:bg-neutral-600/30 active:bg-neutral-600/10'

// line 16 (keyboard shortcut hint)
'text-white/20'
```

Also contains `AppGridGradientMasking` which uses wallpaper image for side gradient masks.

**Complexity:** LOW - Simple button. The gradient masking is functional (hides grid edges).

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `border-white/5` | `border-border-subtle` |
| `bg-neutral-600/20` | `bg-surface-1` |
| `text-12` | `text-caption` |
| `text-white/90` | `text-text-primary` |
| `text-white/20` | `text-text-tertiary` |

---

### 7. Desktop Context Menu (`desktop-context-menu.tsx` + `shared/menu.ts`)

**Files:**
- `livos/packages/ui/src/modules/desktop/desktop-context-menu.tsx` (65 lines)
- `livos/packages/ui/src/shadcn-components/ui/context-menu.tsx` (175 lines)
- `livos/packages/ui/src/shadcn-components/ui/shared/menu.ts` (48 lines)

**Requirements:** DD-05 (minimal style context menu)

**Current class strings (exact):**

```typescript
// shared/menu.ts line 8 (menu content - SHARED between context menu and dropdown)
const menuContentClass = tw`bg-[color-mix(in_hsl,hsl(var(--color-brand))_20%,black_80%)] z-[9999] min-w-[8rem] p-1 animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 text-white`

// shared/menu.ts line 10 (menu item - SHARED)
const menuItemClass = tw`relative flex cursor-default select-none items-center px-3 py-2 text-13 font-medium -tracking-3 leading-tight outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-white/5 focus:text-white data-[highlighted]:bg-white/5 data-[highlighted]:text-white`

// shared/menu.ts line 16 (context menu item has rounded-5)
const contextMenuItemClass = cn(menuItemClass, 'rounded-5')

// shared/menu.ts line 19 (context menu content)
content: cn(menuContentClass, 'shadow-context-menu rounded-8')

// shared/menu.ts line 34-36 (dropdown - also shares this)
content: cn(menuContentClass, 'shadow-dropdown rounded-15 p-2.5')
item: { root: cn(menuItemClass, 'rounded-8') }

// desktop-context-menu.tsx line 57 (close button)
'rounded-full opacity-30 outline-none ring-white/60 transition-opacity hover:opacity-40 focus-visible:opacity-40 focus-visible:ring-2'
```

**IMPORTANT:** The `menuContentClass` and `menuItemClass` in `shared/menu.ts` are SHARED between `context-menu.tsx` AND `dropdown-menu.tsx`. Changes here affect BOTH. The `color-mix` background is the brand-tinted black background used by all menus.

**Complexity:** MEDIUM - The shared menu system means changes cascade. The `color-mix` background is a key brand element. The context menu animation classes are standard Radix/shadcn animations.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `text-13` | `text-body-sm` |
| `focus:bg-white/5` | `focus:bg-surface-base` |
| `rounded-5` | `rounded-radius-sm` (8px) - slightly larger |
| `rounded-8` | `rounded-radius-sm` (8px) |
| `shadow-context-menu` | Could simplify to `shadow-elevation-lg` |
| `color-mix` bg | Keep - this is the brand-tinted menu background |

---

### 8. Command Palette (`cmdk.tsx` + `shadcn command.tsx`)

**Files:**
- `livos/packages/ui/src/components/cmdk.tsx` (435 lines)
- `livos/packages/ui/src/shadcn-components/ui/command.tsx` (184 lines)
- `livos/packages/ui/src/shadcn-components/ui/shared/dialog.ts` (10 lines)

**Requirements:** CN-01 (refined styling)

**Current class strings (exact):**

```typescript
// command.tsx line 31-38 (CommandDialog content)
cn(dialogContentClass, dialogContentAnimationClass,
    'data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0',
    'top-4 translate-y-0 overflow-hidden p-3 md:p-[30px] lg:top-[10%]',
    'w-full max-w-[calc(100%-40px)] sm:max-w-[700px]',
    'z-[999]')

// dialog.ts line 5 (shared dialog content class)
tw`fixed left-[50%] top-[50%] z-50 flex flex-col translate-x-[-50%] translate-y-[-50%] gap-6 rounded-24 bg-dialog-content/75 contrast-more:bg-dialog-content p-8 shadow-dialog backdrop-blur-3xl contrast-more:backdrop-blur-none duration-200 outline-none max-h-[calc(100%-16px)] border border-white/5`

// command.tsx line 42 (Command wrapper)
'[&_[cmdk-group-heading]]:font-medium[&_[cmdk-group-heading]]:text-neutral-400 flex flex-col gap-3 md:gap-5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0'

// command.tsx line 58-60 (CommandInput)
'flex w-full rounded-md bg-transparent p-2 text-15 font-medium -tracking-2 outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-50'

// command.tsx line 121-123 (CommandItem)
'group relative flex cursor-default select-none items-center gap-3 rounded-8 p-2 text-13 font-medium -tracking-2 outline-none aria-selected:bg-white/4 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 md:text-15'

// command.tsx line 152 (CommandShortcut)
'ml-auto text-xs tracking-widest text-white/30'

// command.tsx line 172 (blur overlay)
cn(dialogOverlayClass, 'z-[999] bg-black/30 backdrop-blur-xl contrast-more:backdrop-blur-none')

// command.tsx line 180 (close button)
'rounded-full opacity-30 outline-none ring-white/60 transition-opacity hover:opacity-40 focus-visible:opacity-40 focus-visible:ring-2'

// cmdk.tsx line 304 (FrequentApps heading)
'mb-5 ml-2 hidden text-15 font-semibold leading-tight -tracking-2 md:block'

// cmdk.tsx line 362 (FrequentApp button)
'inline-flex w-[75px] flex-col items-center gap-2 overflow-hidden rounded-8 border border-transparent p-1.5 outline-none transition-all hover:border-white/10 hover:bg-white/4 focus-visible:border-white/10 focus-visible:bg-white/4 active:border-white/20 md:w-[100px] md:p-2'

// cmdk.tsx line 376 (FrequentApp name)
'w-full truncate text-[10px] -tracking-2 text-white/75 md:text-13'
```

**IMPORTANT:** The `dialogContentClass` from `shared/dialog.ts` is SHARED by all dialogs in the system. It uses `bg-dialog-content/75`, `backdrop-blur-3xl`, `rounded-24`, and `shadow-dialog`. The command palette overrides some positioning properties but inherits this base.

**Complexity:** HIGH - Large component (435 lines in cmdk.tsx) with multiple sub-sections (frequent apps, search items, settings items, pluggable providers). The styling is split between the shadcn command component and the feature-level cmdk component. The dialog base class is shared infrastructure.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `text-15` | `text-body-lg` |
| `text-13` | `text-body-sm` |
| `rounded-8` | `rounded-radius-sm` |
| `rounded-24` | `rounded-radius-xl` (20px) - needs attention (currently 24px) |
| `border-white/5` | `border-border-subtle` |
| `bg-dialog-content/75` | Keep (shared dialog base) |
| `aria-selected:bg-white/4` | `aria-selected:bg-surface-base` |
| `hover:bg-white/4` | `hover:bg-surface-base` |
| `text-white/25` (placeholder) | `text-text-tertiary` |
| `text-white/75` | `text-text-secondary` |
| `text-white/30` | `text-text-tertiary` |

---

### 9. Toast System (`toast.tsx`)

**Files:**
- `livos/packages/ui/src/components/ui/toast.tsx` (55 lines)

**Requirements:** CN-02 (cleaner style)

**Current class strings (exact):**

```typescript
// toast.tsx line 21 (close button)
tw`absolute top-0 right-0 p-1 -translate-y-1/3 translate-x-1/3 bg-neutral-600/70 rounded-full hover:scale-105 transition-[transform,opacity] duration-300 hidden sm:block`

// toast.tsx line 22 (toast container)
tw`bg-[#404040]/40 rounded-12 py-4 px-5 backdrop-blur-md flex items-center gap-2 shadow-dialog text-15 text-white -tracking-4 w-full`

// toast.tsx line 23 (title)
tw`font-medium leading-[18px]`

// toast.tsx line 24 (description)
tw`opacity-60 leading-[18px]`

// toast.tsx line 54 (icon glow)
style={{color: hexColor, filter: `drop-shadow(0 0 8px ${hexColor}88)`}}
```

**Dependencies:** Uses `sonner` library. Icon colors are hardcoded hex: success=#00AD79, info=#139EED, warning=#D7BF44, error=#F45A5A.

**Complexity:** LOW - Self-contained component using sonner's `unstyled` mode with custom class names. The icon glow is CSS filter-based.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `bg-[#404040]/40` | Could use `bg-surface-3` with backdrop-blur |
| `rounded-12` | `rounded-radius-md` |
| `text-15` | `text-body-lg` |
| `text-white` | `text-text-primary` (or keep white since toast is isolated) |
| `opacity-60` | Could use `text-text-secondary` |
| `shadow-dialog` | `shadow-elevation-lg` |
| `bg-neutral-600/70` (close) | `bg-surface-3` |

---

### 10. Floating Island System (`bare-island.tsx` + `container.tsx` + feature islands)

**Files:**
- `livos/packages/ui/src/modules/floating-island/bare-island.tsx` (122 lines)
- `livos/packages/ui/src/modules/floating-island/container.tsx` (80 lines)
- Feature islands: `features/files/components/floating-islands/{audio,formatting,operations,uploading}-island/`
- Feature islands: `features/backups/components/floating-island/`

**Requirements:** CN-03 (redesign floating island notifications)

**Current class strings (exact):**

```typescript
// bare-island.tsx line 89 (Island container)
'relative select-none bg-black text-white shadow-floating-island'

// bare-island.tsx line 107 (close button)
'absolute right-4 top-4 rounded-full bg-white/10 p-1 transition-colors hover:bg-white/20'

// container.tsx line 50 (positioning)
'fixed bottom-[76px] left-1/2 z-50 flex w-full -translate-x-1/2 flex-col items-center justify-center gap-1 md:bottom-[90px] md:flex-row md:items-baseline md:gap-2'

// uploading-island/expanded.tsx (example inner content)
'flex h-full w-full flex-col overflow-hidden py-5'
'mb-4 flex items-center justify-between px-5'
'text-sm text-white/60'
'text-xs text-white/60'
'text-xs text-white/90'
'relative h-1 overflow-hidden rounded-full bg-white/20'
'absolute left-0 top-0 h-full rounded-full bg-brand transition-all duration-300'
'flex-shrink-0 rounded-full bg-white/10 p-1 transition-colors hover:bg-white/20'
```

**Animation system:**
- Island size animation: spring stiffness:400, damping:30
- Sizes: minimized (150x40, borderRadius:22), expanded (371x180, borderRadius:32)
- Container: AnimatePresence with scale 0->1 entry/exit

**Complexity:** MEDIUM - The bare island is a reusable component used by 5 different feature islands. The core island styling is centralized, but each feature island has its own content styling. Changes to `bare-island.tsx` affect all islands. The container positioning (`bottom-[76px]`/`bottom-[90px]`) depends on dock height.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `bg-black` | Keep (islands use solid black bg) |
| `shadow-floating-island` | Keep (complex inset shadow, distinctive) |
| `bg-white/10` (close btn) | `bg-surface-2` |
| `hover:bg-white/20` | `hover:bg-surface-3` |
| `text-white/60` | `text-text-secondary` |
| `text-white/90` | `text-text-primary` |
| `bg-white/20` (progress bg) | `bg-surface-3` |
| `text-sm`, `text-xs` | `text-body-sm`, `text-caption` |

---

### 11. Wallpaper System (`wallpaper.tsx`)

**Files:**
- `livos/packages/ui/src/providers/wallpaper.tsx` (374 lines)

**Requirements:** DD-04 (better blur transitions and edge handling)

**Current class strings (exact):**

```typescript
// line 265 (thumbnail/blur layer)
'pointer-events-none fixed inset-0 w-full scale-125 object-cover object-center blur-[var(--wallpaper-blur)] duration-700'

// line 278 (full wallpaper)
tw`pointer-events-none fixed inset-0 w-full bg-black object-cover object-center duration-700 animate-in fade-in`
// Plus CSS animation: 'animate-unblur 0.7s'

// line 293 (previous wallpaper exit)
'pointer-events-none fixed inset-0 bg-cover bg-center duration-700 animate-out fade-out zoom-out-125 fill-mode-both'
```

**CSS variables set:**
- `--color-brand` (HSL)
- `--color-brand-lighter`
- `--color-brand-lightest`
- `--wallpaper-blur: 12px` (set in index.css)

**The `animate-unblur` keyframes (index.css lines 191-200):**
```css
@keyframes animate-unblur {
    from { filter: blur(var(--wallpaper-blur)); scale: 1.25; }
    to { filter: blur(0); scale: 1; }
}
```

**Complexity:** MEDIUM-HIGH - The wallpaper system manages three visual states (blurred thumb, full image, previous wallpaper exit). The `scale-125` is used to prevent edge artifacts during blur. The brand color extraction is critical -- all semantic brand tokens depend on it. Changes to blur or transition timing affect perceived performance.

**Key consideration for DD-04:** The current system already handles blur transitions well. "Better blur transitions and edge handling" likely means: reducing the `scale-125` approach (which causes slight zoom), refining the timing of the blur-to-clear transition, and ensuring edges don't show artifacts on different screen sizes.

---

### 12. Install First App (`install-first-app.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/install-first-app.tsx` (160 lines)

**Requirements:** DD-02 (part of desktop layout)

**Current class strings (exact):**

```typescript
// line 158 (card)
tw`rounded-20 backdrop-blur-2xl contrast-more:backdrop-blur-none bg-blend-soft-light bg-gradient-to-b from-black/50 via-black/50 to-black contrast-more:bg-neutral-800 px-4 py-8 shadow-dialog flex flex-col gap-4 min-w-0`

// line 160 (card heading)
tw`text-center text-19 font-bold leading-tight -tracking-2`

// line 34 (page title)
'-translate-y-2 text-center text-3xl font-bold leading-tight -tracking-2 md:text-48'

// line 50 (app store link)
'h-[42px] px-5 py-4 text-14 backdrop-blur-md'

// line 148 (app row)
'flex w-full items-center gap-2.5 rounded-15 p-2 duration-300 hover:bg-white/4'

// line 150 (app name)
'text-15 font-semibold -tracking-3'

// line 152 (app description)
'w-full min-w-0 truncate text-13 opacity-50'
```

**Complexity:** LOW-MEDIUM - Has some heavy glassmorphism (backdrop-blur-2xl on cards, gradient backgrounds). The card styling is a good candidate for the new clean card pattern.

**Token migration targets:**
| Current | Semantic Token |
|---------|---------------|
| `rounded-20` | `rounded-radius-xl` |
| `text-19` | `text-heading` |
| `text-48` | `text-display-lg` |
| `text-14` | `text-body` |
| `text-15` | `text-body-lg` |
| `text-13` | `text-body-sm` |
| `rounded-15` | `rounded-radius-md` |
| `hover:bg-white/4` | `hover:bg-surface-base` |
| `opacity-50` | Use `text-text-secondary` instead |
| `backdrop-blur-2xl` | Reduce to `backdrop-blur-md` or remove |

---

### 13. Desktop Preview Components (`desktop-preview.tsx` + `desktop-preview-basic.tsx`)

**Files:**
- `livos/packages/ui/src/modules/desktop/desktop-preview.tsx` (133 lines)
- `livos/packages/ui/src/modules/desktop/desktop-preview-basic.tsx` (130 lines)

**Requirements:** Not directly in scope, but should be consistent with dock/desktop changes.

These are miniature scaled-down previews used in settings (wallpaper picker). They render at ~18% scale so pixel-perfect token usage matters less. Changes here should mirror the main dock/desktop styling at a basic level.

**Complexity:** LOW - These are presentational previews. They can be updated as a follow-up to match any dock/header changes.

---

### 14. Notification Badge (`notification-badge.tsx`)

**Files:**
- `livos/packages/ui/src/components/ui/notification-badge.tsx` (8 lines)

**Requirements:** Part of dock redesign (DD-01)

**Current class strings (exact):**

```typescript
'absolute -right-1 -top-1 flex h-[17px] min-w-[17px] select-none items-center justify-center rounded-full bg-red-600/80 px-1 text-[11px] font-bold shadow-md shadow-red-800/50 animate-in zoom-in'
```

**Complexity:** LOW - Tiny component. Should use `text-caption-sm` and potentially refine the red color.

---

## Shared Infrastructure Analysis

### Z-Index Stacking Order

The desktop shell has a critical z-index stacking:

| Layer | Z-Index | Component |
|-------|---------|-----------|
| Wallpaper | `fixed` (no z) | `Wallpaper` in wallpaper.tsx |
| Desktop content | `relative` | Desktop layout |
| Header | `z-10` | Header component |
| Search button | `z-10` | Search component |
| Wifi button | `z-10` | `topRightPositionerClass` |
| Floating islands | `z-50` | FloatingIslandContainer |
| Dock | `z-50` | DockBottomPositioner |
| Context menu | `z-[9999]` | shared/menu.ts |
| Command palette | `z-[999]` | command.tsx |

**Risk:** Changing z-index values could cause elements to appear behind the wallpaper or overlap incorrectly. The dock and floating islands share `z-50`, which works because they're positioned at different vertical locations.

### Shared Class Patterns

These patterns appear in multiple components and should be migrated consistently:

| Pattern | Used In | Count | Semantic Replacement |
|---------|---------|-------|---------------------|
| `bg-white/10` | dock-item, app-icon, island close btn | 3+ | `bg-surface-2` |
| `bg-white/5` | arrow buttons, search, items | 3+ | `bg-surface-base` |
| `border-white/10` | dock, dock-item, divider | 4+ | `border-border-default` |
| `text-white/90` | dock icon, content | 3+ | `text-text-primary` |
| `text-white/60` | island content, descriptions | 4+ | `text-text-secondary` |
| `opacity-50` | various disabled/secondary | 5+ | Replace with `text-text-secondary` |
| `rounded-xl` / `rounded-2xl` | dock, dock-item | 2+ | `rounded-radius-lg` / `rounded-radius-xl` |
| `backdrop-blur-2xl` | dock, install-first cards | 2 | Reduce or remove |
| `text-13`, `text-15`, `text-19` | many components | 10+ | `text-body-sm`, `text-body-lg`, `text-heading` |

### Animation Dependencies

Components with Framer Motion animations that interact with styling:

1. **Dock magnification** - width/scale driven by `useTransform` + `useSpring`. Safe to restyle (only affects icon container visuals, not physics)
2. **Dock enter** - translateY spring. Safe to restyle.
3. **App grid stagger** - opacity/scale with staggered delay. Safe to restyle.
4. **Desktop content variants** - opacity transitions. Safe to restyle.
5. **Floating island expand/collapse** - width/height/borderRadius animation. The `borderRadius` values (22/32) are hardcoded in JS -- must be updated in the `sizes` object, NOT Tailwind classes.
6. **Wallpaper blur-to-clear** - CSS animation `animate-unblur`. Timing changes affect perceived performance.

## Common Pitfalls

### Pitfall 1: Breaking Shared Menu Infrastructure
**What goes wrong:** Updating `shared/menu.ts` classes for context menu breaks dropdown-menu styling elsewhere (app store, settings, file manager context menus)
**Why it happens:** `menuContentClass` and `menuItemClass` are shared between context-menu.tsx AND dropdown-menu.tsx
**How to avoid:** When changing menu styles, verify both context menus AND dropdown menus across the app. Or, if context menu needs a different style than dropdown, split the shared classes.
**Warning signs:** Dropdown menus in settings/app store look wrong after context menu changes

### Pitfall 2: Breaking Dialog Base Class
**What goes wrong:** Updating `dialogContentClass` in `shared/dialog.ts` for command palette breaks all other dialogs
**Why it happens:** The command palette uses the shared dialog base class plus overrides
**How to avoid:** Command palette styling changes should be in the command.tsx override, not the shared dialog base. Only change the shared base if ALL dialogs should change (which is Phase 3 scope).
**Warning signs:** Alert dialogs, logout dialog, etc. look different after command palette changes

### Pitfall 3: Floating Island Position Drift
**What goes wrong:** After changing dock dimensions, floating islands overlap or float in wrong position
**Why it happens:** `container.tsx` has hardcoded `bottom-[76px]` / `bottom-[90px]` that must match dock total height
**How to avoid:** If dock dimensions change, update island container position. Currently: dock height = iconSize(50) + padding(12)*2 = 74px + DOCK_BOTTOM_PADDING_PX(10) = 84px. The 76px/90px values have some buffer.
**Warning signs:** Islands overlap dock or have too much gap

### Pitfall 4: Wallpaper Edge Artifacts
**What goes wrong:** Reducing the `scale-125` on the blurred wallpaper thumbnail reveals white edges during blur
**Why it happens:** CSS blur extends beyond element bounds. The scale-up compensates for this.
**How to avoid:** If changing blur amount, test with different wallpapers at different screen sizes. The `scale-125` is a deliberate workaround -- don't remove without an alternative (like `overflow: hidden` on parent + slightly oversized image).
**Warning signs:** White/light edges visible around wallpaper during transitions

### Pitfall 5: Dock Icon Spring Behavior
**What goes wrong:** Changing dock icon sizes causes janky/different magnification feel
**Why it happens:** The spring physics (`mass: 0.1, stiffness: 150, damping: 10`) were tuned for the current 50->80px range
**How to avoid:** If changing icon sizes for "slimmer profile," also test and potentially retune spring parameters. The `useTransform` range `[-150, 0, 150]` for mouse distance may also need adjustment.
**Warning signs:** Magnification feels sluggish or snappy compared to before

### Pitfall 6: CSS Variables Not Updated
**What goes wrong:** Grid layout breaks because CSS variables from `app-pagination-utils.tsx` are stale
**Why it happens:** The CSS variables `--app-w`, `--app-h`, etc. are set imperatively via `document.documentElement.style.setProperty`. If the constants change without updating the useLayoutEffect, the grid layout breaks.
**How to avoid:** If changing grid spacing constants (appW, appH, appXGap, appYGap), update them in the `usePager` hook only -- they propagate via CSS variables automatically.
**Warning signs:** Grid items overlap or have inconsistent spacing

## Recommended Plan Groupings

Based on component dependencies and risk isolation:

### Plan 02-01: Dock Redesign (DD-01)
**Files:** `dock.tsx`, `dock-item.tsx`, `blur-below-dock.tsx`, `notification-badge.tsx`
**Scope:**
- Slimmer dock profile (reduce padding, possibly icon sizes)
- Migrate dock classes to semantic tokens
- Refine hover animations (retune springs if needed)
- Cleaner divider styling
- Reduce/simplify dock shadow
- Migrate dock item styling to tokens
- Refine notification badge
**Risk:** MEDIUM - spring physics may need retuning
**Estimated tasks:** 8-12

### Plan 02-02: Desktop Content & App Grid (DD-02, DD-03)
**Files:** `header.tsx`, `desktop-content.tsx`, `desktop.tsx`, `desktop-misc.tsx`, `app-grid.tsx`, `paginator.tsx`, `app-icon.tsx`, `install-first-app.tsx`
**Scope:**
- Minimal header typography (semantic font sizes)
- Improved grid spacing (adjust CSS variable constants)
- Migrate app icon to semantic tokens
- Refine paginator arrow buttons and pills
- Refine search button styling
- Reduce glassmorphism on install-first-app cards
**Risk:** LOW - mostly token substitution
**Estimated tasks:** 10-14

### Plan 02-03: Context Menu & Command Palette (DD-05, CN-01)
**Files:** `shared/menu.ts`, `desktop-context-menu.tsx`, `cmdk.tsx`, `command.tsx`
**Scope:**
- Minimal context menu style (migrate shared menu classes to tokens)
- Refined command palette styling
- Migrate frequent apps section
- Migrate command item styling
- Update close buttons
- Keep dialog base class unchanged (Phase 3 scope)
**Risk:** MEDIUM - shared menu classes affect dropdowns too
**Estimated tasks:** 8-12

### Plan 02-04: Toast & Floating Island (CN-02, CN-03)
**Files:** `toast.tsx`, `bare-island.tsx`, `container.tsx`
**Scope:**
- Cleaner toast styling with semantic tokens
- Redesign island container and base component
- Update island close button
- Adjust island positioning if dock changed
- Migrate inner content patterns (feature islands reference)
**Risk:** LOW-MEDIUM - bare-island changes affect all feature islands
**Estimated tasks:** 6-10

### Plan 02-05: Wallpaper System (DD-04)
**Files:** `wallpaper.tsx`, relevant `index.css` keyframes
**Scope:**
- Better blur transitions (refine timing/easing)
- Edge handling (address scale-125 workaround)
- Ensure brand color theming still works with refined tokens
- Optionally update the desktop preview components to match
**Risk:** MEDIUM - blur/edge changes affect visual quality across all pages
**Estimated tasks:** 4-8

**Total estimated plans:** 5
**Total estimated tasks:** 36-56

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context menu behavior | Custom right-click handling | Radix `ContextMenu` (already used) | Accessibility, keyboard nav, sub-menus, positioning all handled |
| Command palette search | Custom search/filter | `cmdk` library (already used) | Fuzzy matching, keyboard navigation, command scoring built-in |
| Toast notifications | Custom notification system | `sonner` library (already used) | Positioning, stacking, auto-dismiss, accessibility handled |
| Dock magnification | Custom mouse proximity detection | Framer Motion `useTransform`+`useSpring` (already used) | Physics-based springs give natural feel, hard to replicate manually |
| Menu open/close animations | Custom CSS transitions | tailwindcss-animate + Radix data-state (already used) | Handles enter/exit, reduced motion, data-state coordination |

## State of the Art

| Old Pattern (Current) | New Pattern (Target) | Impact |
|----------------------|---------------------|--------|
| Raw opacity values (`bg-white/10`) | Semantic surface tokens (`bg-surface-2`) | Consistent across all components, easier theme changes |
| Numeric font sizes (`text-13`, `text-19`) | Semantic typography (`text-body-sm`, `text-heading`) | Includes line-height and letter-spacing automatically |
| Numeric border radii (`rounded-10`, `rounded-15`) | Semantic radii (`rounded-radius-sm`, `rounded-radius-md`) | Consistent rounding scale |
| Heavy backdrop-blur everywhere | Selective blur, prefer solid surfaces | Better performance, cleaner look |
| Complex multi-layer inset shadows | Simpler elevation shadows | Cleaner, more maintainable |

## Open Questions

1. **Dock "slimmer profile" -- how slim?**
   - Current: iconSize=50, padding=12, total height=74px
   - Reducing to iconSize=44, padding=10 would give 64px (-13%)
   - Reducing icon sizes affects the magnification spring behavior
   - Recommendation: Start with padding reduction first (10px instead of 12px), keep icon sizes at 50px. Test slimmer appearance before changing icon sizes.

2. **Should `shared/menu.ts` be split for context vs dropdown?**
   - Currently shared base with small overrides
   - If context menu needs significantly different styling from dropdown, splitting may be safer
   - Recommendation: Keep shared for now, only split if designs diverge significantly

3. **Should `dialogContentClass` be updated in Phase 2 or deferred to Phase 3?**
   - The command palette uses it as a base
   - Phase 3 covers windows/sheets/dialogs
   - Recommendation: Defer `shared/dialog.ts` changes to Phase 3. Only override in command.tsx for Phase 2.

4. **Desktop preview components -- update now or defer?**
   - `desktop-preview.tsx` and `desktop-preview-basic.tsx` render miniature previews
   - They have their own hardcoded sizes for the scaled-down view
   - Recommendation: Update basic styling (border radii, colors) to match, but don't invest heavily. They render at 18% scale.

5. **Floating island feature content (uploading, backups, etc.) -- in scope?**
   - CN-03 says "redesign floating island notifications"
   - The bare-island container is clearly in scope
   - Feature island content (uploading progress, backup progress) has its own raw styling
   - Recommendation: Update `bare-island.tsx` and `container.tsx` in Phase 2. Feature island content can be a "bonus" task or deferred -- it's internal to features that have their own phases later.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of 24 files in `livos/packages/ui/src/`
- `tailwind.config.ts` -- current token definitions (post-Phase 1)
- `index.css` -- global styles, keyframes, CSS variables
- Phase 1 RESEARCH.md -- established token patterns and decisions

### Secondary (MEDIUM confidence)
- Framer Motion documentation (spring physics, useTransform, useSpring)
- Sonner documentation (toast configuration)
- Radix UI Context Menu documentation (data-state attributes)
- cmdk documentation (command palette primitives)

## Metadata

**Confidence breakdown:**
- Component inventory: HIGH -- every file read and documented
- Class string extraction: HIGH -- exact strings copied from source
- Token migration targets: HIGH -- based on Phase 1 established tokens
- Plan groupings: HIGH -- based on dependency analysis
- Complexity assessments: HIGH -- based on animation/dependency analysis
- Pitfall identification: HIGH -- based on code-level understanding of shared infrastructure

**Research date:** 2026-02-06
**Valid until:** ~30 days (March 2026) -- codebase may evolve but component structure is stable
