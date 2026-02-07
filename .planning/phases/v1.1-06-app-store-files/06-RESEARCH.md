# Phase 6: App Store & Files - Research

**Researched:** 2026-02-06
**Domain:** UI Component Redesign / Design Token Migration / Tailwind CSS
**Confidence:** HIGH

## Summary

This research inventories all files related to the App Store and File Manager features, analyzing their current styling patterns, raw values to migrate, component structures, and inter-file dependencies. The goal is to refine these components from the current glassmorphism/gradient-heavy aesthetic to the cleaner "Minimal & Clean" (Apple/Linear) design language established in Phase 1.

The App Store has **two rendering paths** that must stay in sync: (1) the sheet/route-based rendering (`routes/app-store/` + `modules/app-store/`) used when the app store opens as a sheet, and (2) the window-based rendering (`modules/window/app-contents/app-store-routes/`) used when the app store opens in a window. The window variants (e.g., `shared-components.tsx`) duplicate several components with slightly different styling. Both paths must be updated together.

The File Manager is a large feature with ~100 files. However, the styling-heavy files that need migration are concentrated in the listing components (file-item views, actions bar, path bar), the sidebar, and drag-and-drop feedback. Many files (hooks, store slices, utilities) are pure logic with no styling and are out of scope.

**Primary recommendation:** Split into 3 plans: (1) App Store Navigation & Cards + Gallery, (2) App Store Detail Page + Dialogs, (3) File Manager Listing, Actions Bar & DnD. Within each plan, migrate raw `white/XX` opacity values and `purple-*`/`cyan-*` accent colors to semantic tokens, remove excessive gradient layering, and simplify hover effects.

## Standard Stack

No new libraries needed. This phase is purely a design token migration and component styling refinement.

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.1 | Utility-first CSS | All styling is Tailwind classes |
| shadcn/ui | Latest | Component library | Button, Dialog, ContextMenu, Tabs, etc. |
| Framer Motion | 10.16.4 | Animations | Used in NavigationControls, DnD overlay |
| @dnd-kit/core | Latest | Drag and drop | File manager DnD system |
| PhotoSwipe | Latest | Image lightbox | Gallery section only |
| react-dropzone | Latest | File upload drop zone | File upload DnD |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-color-thief | Custom hook | Extract colors from app icons | App cards with dynamic gradients |
| compute-scroll-into-view | Latest | Scroll navigation | Category nav scroll-into-view |

## Architecture Patterns

### Current Project Structure (Relevant Files)
```
livos/packages/ui/src/
├── routes/app-store/               # Route-level app store pages (sheet mode)
│   ├── discover.tsx                 # Main discover page composition
│   ├── category-page.tsx            # Category listing page
│   ├── app-page/index.tsx           # App detail page (sheet)
│   └── use-discover-query.tsx       # Data fetching hook
├── routes/community-app-store/      # Community app store routes
│   ├── index.tsx                    # Community store listing
│   └── app-page/index.tsx           # Community app detail
├── modules/app-store/               # Shared app store components
│   ├── app-store-nav.tsx            # Category navigation chips
│   ├── shared.tsx                   # Card styles, grid layouts, typography, shared components
│   ├── gallery-section.tsx          # Banner/gallery carousels
│   ├── constants.ts                 # Category definitions
│   ├── utils.ts                     # Helper utilities
│   ├── updates-button.tsx           # Updates notification button
│   ├── updates-dialog.tsx           # Updates dialog
│   ├── select-dependencies-dialog.tsx  # Dependency selection
│   ├── os-update-required.tsx       # OS update alert
│   ├── community-app-store-dialog.tsx  # Community store management
│   ├── discover/
│   │   ├── apps-grid-section.tsx    # Grid layout section
│   │   ├── apps-row-section.tsx     # Horizontal scroll section
│   │   └── apps-three-column-section.tsx  # Featured 3-column section
│   └── app-page/
│       ├── top-header.tsx           # App detail hero header
│       ├── app-content.tsx          # Content layout (desktop/mobile)
│       ├── shared.tsx               # Card/text styles for detail page
│       ├── about-section.tsx        # About section
│       ├── info-section.tsx         # Info key-value pairs
│       ├── dependencies.tsx         # Dependencies section
│       ├── recommendations-section.tsx  # Recommended apps
│       ├── release-notes-section.tsx    # Release notes
│       ├── settings-section.tsx     # Credentials section
│       ├── public-access-section.tsx    # Public domain access
│       ├── app-settings-dialog.tsx  # App settings dialog
│       ├── default-credentials-dialog.tsx  # Credentials dialog
│       └── get-recommendations.ts   # Recommendation logic
├── modules/window/app-contents/     # Window-mode rendering
│   ├── app-store-content.tsx        # Window app store entry
│   ├── files-content.tsx            # Window files entry
│   └── app-store-routes/
│       ├── shared-components.tsx    # Duplicated card/section components
│       ├── discover-window.tsx      # Window discover page
│       ├── category-page-window.tsx # Window category page
│       ├── app-page-window.tsx      # Window app detail page
│       ├── marketplace-app-window.tsx   # Marketplace detail
│       └── app-store-layout-window.tsx  # Window layout wrapper
├── modules/community-app-store/
│   └── community-badge.tsx          # Community badge component
├── components/
│   └── install-button-connected.tsx # Install button with dependency logic
└── features/files/
    ├── index.tsx                     # Files feature root
    ├── components/
    │   ├── listing/
    │   │   ├── index.tsx            # Listing root
    │   │   ├── listing-body.tsx     # List/grid body with table header
    │   │   ├── listing-and-file-item-context-menu.tsx  # Context menu (333 lines)
    │   │   ├── marquee-selection.tsx # Marquee selection (730 lines, logic-heavy)
    │   │   ├── virtualized-list.tsx  # Virtualized rendering (415 lines, logic-heavy)
    │   │   ├── file-item/
    │   │   │   ├── index.tsx        # File item wrapper (258 lines)
    │   │   │   ├── list-view-file-item.tsx  # List view row (131 lines)
    │   │   │   ├── icons-view-file-item.tsx # Grid view card (82 lines)
    │   │   │   ├── editable-name.tsx        # Inline rename (248 lines)
    │   │   │   ├── truncated-filename.tsx    # Filename display (35 lines)
    │   │   │   ├── circular-progress.tsx     # Upload progress (51 lines)
    │   │   │   └── list-view-file-item.css  # CSS for selection styling
    │   │   ├── actions-bar/
    │   │   │   ├── index.tsx        # Actions bar composition
    │   │   │   ├── path-bar/
    │   │   │   │   ├── index.tsx    # Path bar router
    │   │   │   │   ├── path-bar-desktop.tsx  # Breadcrumb nav (244 lines)
    │   │   │   │   ├── path-bar-mobile.tsx   # Mobile path bar
    │   │   │   │   └── path-input.tsx        # Path text input
    │   │   │   ├── navigation-controls.tsx   # Back/forward buttons (131 lines)
    │   │   │   ├── search-input.tsx          # Search field (85 lines)
    │   │   │   ├── sort-dropdown.tsx         # Sort menu
    │   │   │   ├── view-toggle.tsx           # Icons/list toggle
    │   │   │   ├── mobile-actions.tsx        # Mobile action menu
    │   │   │   └── actions-bar-context.tsx   # Config context
    │   │   ├── directory-listing/
    │   │   │   ├── index.tsx        # Directory listing
    │   │   │   └── empty-state.tsx  # Empty folder state
    │   │   ├── apps-listing/index.tsx
    │   │   ├── recents-listing/index.tsx
    │   │   ├── trash-listing/index.tsx
    │   │   └── search-listing/index.tsx
    │   ├── shared/
    │   │   ├── drag-and-drop.tsx     # Draggable/Droppable components (145 lines)
    │   │   ├── file-upload-drop-zone.tsx  # Upload overlay (97 lines)
    │   │   ├── upload-input.tsx
    │   │   └── file-item-icon/       # File type icons (mostly SVG, minimal styling)
    │   ├── files-dnd-wrapper/
    │   │   ├── index.tsx            # DnD context wrapper
    │   │   └── files-dnd-overlay.tsx # Drag preview overlay (45 lines)
    │   ├── sidebar/
    │   │   ├── index.tsx            # Sidebar composition (138 lines)
    │   │   ├── sidebar-item.tsx     # Individual sidebar item (58 lines)
    │   │   └── [11 more section files]
    │   ├── floating-islands/        # Audio/upload/operations islands
    │   ├── file-viewer/             # File preview viewers
    │   ├── dialogs/                 # File dialogs
    │   ├── rewind/                  # Rewind/backup feature
    │   ├── cards/server-cards.tsx   # Server cards
    │   ├── mini-browser/            # Mini file browser
    │   └── embedded/                # Embedded file browser
    └── [hooks/, store/, utils/ - pure logic, no styling]
```

### Pattern 1: Dual Rendering Paths (App Store)
**What:** The app store renders both in sheet mode (via routes) and window mode (via modules/window). Both paths share `modules/app-store/shared.tsx` for base styles but the window path has its own duplicated components in `shared-components.tsx`.
**When it matters:** Any style change in the shared module affects sheet mode. Window mode components must be updated separately.
**Risk:** Forgetting to update the window-mode duplicates leads to visual inconsistency.

### Pattern 2: CSS + Tailwind Hybrid (File Manager List View)
**What:** `list-view-file-item.css` uses `@apply` with `data-selection-position` attribute selectors for contiguous selection styling. This CSS file uses `theme(colors.brand)` references and `hsl(var(--color-brand))` directly.
**When it matters:** Selection styling for list view file items. Must preserve this CSS + data attribute pattern.

### Pattern 3: Dynamic Gradients from Icon Colors (App Store)
**What:** `useColorThief` extracts dominant colors from app icons to generate dynamic CSS gradients. Used in `apps-row-section.tsx`, `apps-three-column-section.tsx`, and `shared-components.tsx`.
**When it matters:** These dynamic gradients based on icon colors are a brand feature. They should be preserved but simplified (fewer gradient layers).

### Anti-Patterns to Avoid
- **Removing dynamic icon-based gradients entirely:** These are a distinctive feature; simplify but keep them
- **Breaking the dual render path:** Always update both sheet-mode and window-mode variants
- **Touching the context menu logic:** The 333-line context menu file is mostly logic; only touch the `className` props on `ContextMenuContent`
- **Modifying virtualized-list or marquee-selection internals:** These are performance-critical logic files

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Selection styling | Custom selection CSS | Keep existing `list-view-file-item.css` pattern | Complex contiguous selection logic already works |
| DnD feedback | Custom drag overlay | Keep existing `@dnd-kit` overlay | Already integrated with file store |
| Gallery lightbox | Custom image viewer | Keep PhotoSwipe | Full-featured lightbox with swipe support |
| Category nav scroll | Custom scroll management | Keep `compute-scroll-into-view` | Handles overflow boundary correctly |

## Common Pitfalls

### Pitfall 1: Purple/Cyan Accent Colors Are Hardcoded Throughout
**What goes wrong:** The app store heavily uses `purple-300`, `purple-400`, `purple-500`, `purple-600`, `cyan-500`, `cyan-600`, `indigo-500`, `pink-500` as accent colors throughout gradient backgrounds, hover glows, focus rings, overline text, and featured badges. These are NOT design tokens.
**Why it happens:** The glassmorphism design used these as decorative accents.
**How to avoid:** Replace with `brand` token where they serve as primary accents. For decorative gradients that should be removed (glow orbs, gradient backgrounds), simply remove or simplify. The "Minimal & Clean" language should use `brand` for primary actions and `surface-*` tokens for backgrounds.
**Warning signs:** Any remaining `purple-*` or `cyan-*` classes after migration.

**Files affected (25+ occurrences across 4 files):**
- `modules/app-store/shared.tsx` (11 occurrences)
- `modules/app-store/gallery-section.tsx` (6 occurrences)
- `modules/app-store/discover/apps-grid-section.tsx` (4 occurrences)
- `modules/app-store/discover/apps-three-column-section.tsx` (4 occurrences)

### Pitfall 2: Raw white/XX Opacity Values Everywhere
**What goes wrong:** Instead of using semantic tokens (`text-secondary`, `surface-1`), files use raw `white/40`, `white/50`, `white/60`, `white/70`, `bg-white/[0.04]`, `bg-white/[0.06]`, `bg-white/[0.08]`, etc.
**Why it happens:** Pre-token design system used raw opacity values.
**How to avoid:** Map these to semantic tokens established in Phase 1:
  - `text-white/40` -> `text-text-tertiary` (0.40)
  - `text-white/50` -> `text-text-tertiary` (0.40, close enough)
  - `text-white/60` -> `text-text-secondary` (0.60)
  - `text-white/70` -> `text-text-secondary` (0.60, close enough)
  - `opacity-50` -> `text-text-tertiary` or specific token
  - `bg-white/[0.04]` -> `bg-surface-base` (0.04)
  - `bg-white/[0.06]` -> `bg-surface-1` (0.06)
  - `bg-white/[0.10]` -> `bg-surface-2` (0.10)
  - `bg-white/[0.14]` -> `bg-surface-3` (0.14)
  - `border-white/[0.06]` -> `border-border-subtle` (0.06)
  - `border-white/[0.10]` -> `border-border-default` (0.10)
  - `border-white/[0.20]` -> `border-border-emphasis` (0.20)
**Warning signs:** Any remaining raw `white/` patterns after migration.

### Pitfall 3: Excessive Gradient and Glow Layers
**What goes wrong:** Many app store components stack 3-4 gradient overlays: base gradient + hover glow + animated glow orb + shine effect. This conflicts with "Minimal & Clean" language.
**Why it happens:** Glassmorphism design aesthetic.
**How to avoid:** Strip down to at most 1 subtle gradient per component. Remove glow orbs (`absolute -right-20 -top-20 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl`), remove shine effects, keep at most a subtle hover background change.
**Warning signs:** Components with more than 2 `absolute inset-0` overlay divs.

### Pitfall 4: Focus Ring Uses purple-500 Instead of Brand
**What goes wrong:** Focus indicators use `focus:ring-purple-500/50` or `focus-visible:ring-purple-500/50` instead of the established brand focus pattern.
**Why it happens:** Pre-Phase-1 focus styling.
**How to avoid:** Use the v1.1 brand focus pattern: `focus-visible:border-brand ring-brand/20`
**Warning signs:** Any `focus:ring-purple-*` or `focus-visible:ring-purple-*` remaining.

### Pitfall 5: Hardcoded Pixel Font Sizes in File Manager
**What goes wrong:** File manager uses `text-11`, `text-12`, `text-13`, `text-14`, `text-15`, `text-16`, `text-19`, `text-24` pixel sizes defined elsewhere in Tailwind config. These are functional pixel sizes, not semantic tokens.
**Why it happens:** The file manager was built with pixel-precision typography.
**How to avoid:** These pixel-based font sizes are currently working and may or may not need migration to semantic scale (`text-caption`, `text-body`, etc.). For this phase, focus on spacing/color token migration. Typography can remain as-is if it matches the scale.

### Pitfall 6: Brand Colors That MUST Be Preserved
**What goes wrong:** Some brand/status colors are functional and must NOT be replaced with generic tokens.
**Why it happens:** These colors carry semantic meaning.
**Colors to preserve:**
  - `bg-brand`, `text-brand`, `border-brand` (primary actions, selections)
  - `text-brand-lighter`, `text-brand-lightest` (links, secondary brand)
  - `text-destructive`, `text-red-400`, `text-red-300` (delete actions)
  - `text-green-400` (DNS OK status in public-access-section)
  - `text-yellow-400`, `text-yellow-300`, `bg-yellow-700/50` (warnings)
  - `text-slate-500` (installed check icon in dependencies)

## Code Examples

### Example 1: Migrating a Card Component from Glassmorphism to Minimal
```typescript
// BEFORE (modules/app-store/shared.tsx):
export const cardClass = cn(
  cardBaseClass,
  tw`relative overflow-hidden`,
  tw`bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent`,
  tw`backdrop-blur-xl`,
  tw`border border-white/[0.08]`,
  tw`shadow-[0_8px_32px_rgba(0,0,0,0.4)]`,
)

// AFTER (Minimal & Clean):
export const cardClass = cn(
  cardBaseClass,
  tw`bg-surface-1`,
  tw`border border-border-subtle`,
  tw`shadow-elevation-sm`,
)
```

### Example 2: Migrating App Card Hover Effects
```typescript
// BEFORE:
'hover:from-white/[0.1] hover:to-white/[0.02]',
'hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
'focus:outline-none focus:ring-2 focus:ring-purple-500/50',

// AFTER:
'hover:bg-surface-2 hover:border-border-default',
'hover:shadow-elevation-md',
'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
```

### Example 3: Migrating Text Opacity Patterns
```typescript
// BEFORE:
<p className='text-sm text-white/50'>{description}</p>
<span className='text-xs text-white/40'>{label}</span>

// AFTER:
<p className='text-sm text-text-secondary'>{description}</p>
<span className='text-xs text-text-tertiary'>{label}</span>
```

### Example 4: File Manager Selection (Preserve As-Is)
```css
/* list-view-file-item.css - keep this pattern, only update values if needed */
.files-list-view-file-item[data-selected='true'] {
  @apply bg-brand/10 shadow-[0_0_0_1px_theme(colors.brand)];
}
```

## File Inventory by Concern

### Group A: App Store Navigation & Shared Styles (Plan 06-01)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `modules/app-store/shared.tsx` | 276 | `white/[0.08]`, `white/[0.04]`, `white/[0.03]`, `white/[0.05]`, gradient-to-br, backdrop-blur-xl, `shadow-[0_8px_32px...]`, `purple-500`, `cyan-500`, `purple-400/80`, `purple-300/80`, `white/50`, `white/60`, `white/70` | HIGH - Central style definitions, many components depend on exports |
| `modules/app-store/app-store-nav.tsx` | 89 | `gap-[5px]` raw value | LOW - Uses ButtonLink, minimal custom styling |
| `modules/app-store/gallery-section.tsx` | 193 | `white/5`, `purple-500`, `cyan-500`, `white/20`, `white/10`, `black/60`, `black/40`, gradient overlays, `shadow-[0_20px_60px...]` | HIGH - Multiple gradient overlays per item |
| `modules/app-store/constants.ts` | 42 | None (pure data) | NONE |
| `modules/app-store/utils.ts` | 54 | None (pure logic) | NONE |

### Group B: App Store Discover Sections (Plan 06-01)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `modules/app-store/discover/apps-grid-section.tsx` | 165 | `white/[0.02]`, `white/[0.1]`, `white/[0.06]`, `purple-500/40`, `shadow-[0_8px_30px...]`, `white/10`, `purple-500/0`, `cyan-500/0`, `text-[15px]`, `text-[13px]`, `white/40`, `white/55` | HIGH - Multiple card variants |
| `modules/app-store/discover/apps-row-section.tsx` | 147 | Dynamic icon gradients, `white/[0.1]`, `white/[0.2]`, `shadow-[0_20px_50px...]`, `ring-2 ring-white/20`, `shadow-[0_8px_32px...]`, `white/60`, `white/40`, `white/[0.08]` | HIGH - Dynamic color extraction |
| `modules/app-store/discover/apps-three-column-section.tsx` | 240 | `white/[0.08]`, `white/[0.06]`, `purple-500/10`, `cyan-500/10`, `white/50`, `ring-2 ring-white/20`, `shadow-[0_12px_40px...]`, `black/30`, `white/10`, `indigo-500/20`, `purple-500/10`, `pink-500/5`, `white/5` | HIGH - Complex gradient sections |
| `routes/app-store/discover.tsx` | 116 | `text-15`, `text-12`, `white/80`, `white/50` | LOW - Mostly composition |
| `routes/app-store/category-page.tsx` | 50 | Minimal | LOW |
| `routes/app-store/use-discover-query.tsx` | 154 | None (data fetching) | NONE |

### Group C: App Store Detail Page (Plan 06-02)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `modules/app-store/app-page/top-header.tsx` | 94 | `rounded-8`, `text-16`, `text-19`, `rounded-12`, `rounded-20`, `text-12`, `text-24`, `text-13` | MEDIUM - Mix of pixel sizes |
| `modules/app-store/app-page/app-content.tsx` | 68 | `gap-5`, `max-w-sm` | LOW - Mostly layout |
| `modules/app-store/app-page/shared.tsx` | 70 | `cardFaintClass` import, `rounded-12`, `px-[20px]`, `py-[30px]`, `text-12`, `text-15`, `text-13` | MEDIUM - Local card/text style defs |
| `modules/app-store/app-page/info-section.tsx` | 69 | `text-14`, `opacity-50`, `text-brand-lighter` | LOW |
| `modules/app-store/app-page/dependencies.tsx` | 94 | `rounded-8`, `text-14`, `h-[16px]`, `w-[16px]`, `text-slate-500`, `text-brand-lightest`, `text-brand-lighter` | LOW |
| `modules/app-store/app-page/recommendations-section.tsx` | 54 | `rounded-10`, `text-14`, `text-12`, `opacity-40` | LOW |
| `modules/app-store/app-page/settings-section.tsx` | 42 | `text-15`, `text-14` | LOW |
| `modules/app-store/app-page/public-access-section.tsx` | 216 | `white/10`, `white/5`, `white/50`, `white/90`, `white/40`, `text-yellow-400`, `text-green-400`, `text-red-400`, `text-red-300` | MEDIUM - Status colors to preserve |
| `modules/app-store/app-page/release-notes-section.tsx` | 18 | Minimal | LOW |
| `modules/app-store/app-page/about-section.tsx` | 13 | Minimal | LOW |
| `modules/app-store/app-page/app-settings-dialog.tsx` | 186 | Dialog styling (should use Phase 3 tokens) | LOW |
| `modules/app-store/app-page/default-credentials-dialog.tsx` | 150 | Dialog styling | LOW |
| `modules/app-store/app-page/get-recommendations.ts` | 13 | None (pure logic) | NONE |
| `routes/app-store/app-page/index.tsx` | 73 | Mostly composition | LOW |

### Group D: App Store Dialogs & Window Variants (Plan 06-02)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `modules/app-store/updates-dialog.tsx` | 164 | `rounded-8`, `text-13`, `opacity-40`, `text-brand` | LOW |
| `modules/app-store/updates-button.tsx` | 33 | Uses ButtonLink | LOW |
| `modules/app-store/select-dependencies-dialog.tsx` | 303 | `divide-white/6`, `bg-white/6`, `rounded-12`, `h-[50px]`, `h-[60px]`, `text-[14px]`, `rounded-6`, `rounded-4`, `h-[40px]`, `w-[256px]` | MEDIUM |
| `modules/app-store/os-update-required.tsx` | 52 | Uses AlertDialog (Phase 3 tokens) | LOW |
| `modules/app-store/community-app-store-dialog.tsx` | 150 | `text-13`, `white/50`, `rounded-8`, `bg-yellow-700/50`, `text-yellow-300/80`, `text-brand` | LOW |
| `modules/window/app-contents/app-store-routes/shared-components.tsx` | 214 | Duplicated styles: `white/4`, `rounded-20`, `rounded-10`, `text-13`, `text-15`, `text-12`, `rounded-24`, `white/10`, `#24242499`, `#18181899`, `white/22` | HIGH - Must sync with sheet variants |
| `modules/window/app-contents/app-store-routes/discover-window.tsx` | 114 | Imports shared-components | LOW |
| `modules/window/app-contents/app-store-routes/category-page-window.tsx` | 53 | Minimal | LOW |
| `modules/window/app-contents/app-store-routes/app-page-window.tsx` | 105 | Minimal | LOW |
| `modules/window/app-contents/app-store-routes/marketplace-app-window.tsx` | 112 | Minimal | LOW |
| `modules/window/app-contents/app-store-routes/app-store-layout-window.tsx` | 141 | Layout only | LOW |
| `modules/window/app-contents/app-store-content.tsx` | 64 | Layout routing | LOW |
| `modules/window/app-contents/files-content.tsx` | 178 | Layout routing | LOW |
| `components/install-button-connected.tsx` | 161 | None (logic only) | NONE |
| `modules/community-app-store/community-badge.tsx` | 10 | Uses Badge component | NONE |
| `routes/community-app-store/index.tsx` | 64 | Minimal | LOW |
| `routes/community-app-store/app-page/index.tsx` | 42 | Minimal | LOW |

### Group E: File Manager Listing & File Items (Plan 06-03)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `features/files/components/listing/file-item/index.tsx` | 258 | `bg-brand/10`, `shadow-[0_0_0_1px_theme(colors.brand)]`, `hover:!border-white/6`, `hover:!bg-white/5` | MEDIUM - Selection logic + styling |
| `features/files/components/listing/file-item/list-view-file-item.tsx` | 131 | `text-12`, `text-11`, `text-white/40`, `text-white/60`, `opacity-50`, `opacity-70` | MEDIUM - Table layout with flex ratios |
| `features/files/components/listing/file-item/list-view-file-item.css` | 33 | `theme(colors.brand)`, `hsl(var(--color-brand))` | LOW - Keep pattern, values are correct |
| `features/files/components/listing/file-item/icons-view-file-item.tsx` | 82 | `w-28` (112px), `text-12`, `text-white/40`, `bg-black/35`, `opacity-50` | LOW |
| `features/files/components/listing/file-item/editable-name.tsx` | 248 | Logic-heavy, minimal styling | LOW |
| `features/files/components/listing/file-item/truncated-filename.tsx` | 35 | Minimal | LOW |
| `features/files/components/listing/file-item/circular-progress.tsx` | 51 | SVG, minimal | LOW |
| `features/files/components/listing/listing-body.tsx` | 93 | `text-12`, `text-white/70`, flex ratios | LOW |
| `features/files/components/listing/listing-and-file-item-context-menu.tsx` | 333 | `contextMenuClasses.item.rootDestructive`, `w-48`, `w-28`, `w-24` | LOW - Mostly logic, minimal style changes |
| `features/files/components/listing/index.tsx` | 219 | Composition file | LOW |
| `features/files/components/listing/directory-listing/index.tsx` | 193 | Composition | LOW |
| `features/files/components/listing/directory-listing/empty-state.tsx` | 62 | `text-12`, `text-white/40` | LOW |

### Group F: File Manager Actions Bar & Navigation (Plan 06-03)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `features/files/components/listing/actions-bar/index.tsx` | 54 | `h-8`, `lg:-mt-14`, layout | LOW |
| `features/files/components/listing/actions-bar/path-bar/path-bar-desktop.tsx` | 244 | `text-xs`, `text-white/50`, breadcrumb segment overflow logic | MEDIUM - Complex width calculation |
| `features/files/components/listing/actions-bar/path-bar/path-bar-mobile.tsx` | 79 | Mobile layout | LOW |
| `features/files/components/listing/actions-bar/path-bar/path-input.tsx` | 67 | Input styling | LOW |
| `features/files/components/listing/actions-bar/path-bar/index.tsx` | 59 | Router | LOW |
| `features/files/components/listing/actions-bar/navigation-controls.tsx` | 131 | `opacity-50`, `hover:bg-transparent`, `focus:ring-0` | LOW |
| `features/files/components/listing/actions-bar/search-input.tsx` | 85 | `border-neutral-600`, `border-neutral-800`, `border-white/6`, `bg-white/5`, `text-neutral-500`, `focus:w-[calc(100vw-11rem)]` | MEDIUM - Complex responsive width |
| `features/files/components/listing/actions-bar/sort-dropdown.tsx` | 48 | `text-13`, `text-white/40` | LOW |
| `features/files/components/listing/actions-bar/view-toggle.tsx` | 41 | `border-white/6`, `bg-white/6`, `ring-white/6`, `hover:bg-white/10`, `bg-brand`, `text-white/50` | LOW |
| `features/files/components/listing/actions-bar/mobile-actions.tsx` | 112 | Mobile menu | LOW |
| `features/files/components/listing/actions-bar/actions-bar-context.tsx` | 56 | Context only | NONE |

### Group G: File Manager Sidebar & DnD (Plan 06-03)

| File | Lines | Raw Values to Migrate | Complexity |
|------|-------|----------------------|------------|
| `features/files/components/sidebar/sidebar-item.tsx` | 58 | `white/[0.04]`, `white/[0.08]`, `border-white/6`, `shadow-button-highlight-soft-hpx`, `text-12`, `white/40`, `white/60`, `hover:bg-white/10` | MEDIUM - Active/inactive/disabled states |
| `features/files/components/sidebar/index.tsx` | 138 | Section layout | LOW |
| `features/files/components/shared/drag-and-drop.tsx` | 145 | `dropOverClassName = 'bg-brand text-white'` default prop | LOW |
| `features/files/components/shared/file-upload-drop-zone.tsx` | 97 | `border-[hsl(var(--color-brand))]/30`, `bg-black/50`, `text-5xl`, `bg-brand/25`, ripple animation | MEDIUM - Brand-colored upload overlay |
| `features/files/components/files-dnd-wrapper/files-dnd-overlay.tsx` | 45 | `bg-brand`, `border-brand/90`, `bg-brand/20`, `text-12`, `border-white/25` | LOW - Drag preview styling |

### Group H: Out of Scope (No Styling Changes Needed)

These files are pure logic, data, or already use proper tokens:
- All hook files (`features/files/hooks/`)
- All store slices (`features/files/store/`)
- All utility files (`features/files/utils/`)
- `features/files/types.ts`, `features/files/constants.ts`
- `features/files/routes.tsx`, `features/files/cmdk-search-provider.tsx`
- `features/files/providers/files-capabilities-context.tsx`
- `features/files/components/listing/virtualized-list.tsx` (logic-heavy)
- `features/files/components/listing/marquee-selection.tsx` (logic-heavy)
- `features/files/components/file-viewer/` (separate concern)
- `features/files/components/floating-islands/` (separate concern)
- `features/files/components/rewind/` (separate concern)
- `features/files/components/dialogs/` (already use Dialog tokens from Phase 3)
- `features/files/components/cards/server-cards.tsx`
- `features/files/components/mini-browser/`
- `features/files/components/embedded/`
- `features/files/assets/` (SVG icons)

## Suggested Plan Grouping

### Plan 06-01: App Store Navigation, Cards & Gallery (18 files, ~1,800 lines)
**Focus:** AS-01 (navigation), AS-02 (app cards), AS-04 (gallery/banners)
**Files:**
1. `modules/app-store/shared.tsx` - Central style definitions (must go first)
2. `modules/app-store/app-store-nav.tsx` - Category chips
3. `modules/app-store/gallery-section.tsx` - Banner/gallery carousel
4. `modules/app-store/discover/apps-grid-section.tsx` - Grid cards
5. `modules/app-store/discover/apps-row-section.tsx` - Horizontal scroll cards
6. `modules/app-store/discover/apps-three-column-section.tsx` - Featured sections
7. `routes/app-store/discover.tsx` - Discover page composition
8. `routes/app-store/category-page.tsx` - Category page
9. `modules/window/app-contents/app-store-routes/shared-components.tsx` - Window variants
10. `modules/window/app-contents/app-store-routes/discover-window.tsx`
11. `modules/window/app-contents/app-store-routes/category-page-window.tsx`

**Dependencies:** `shared.tsx` must be updated first (exported styles used everywhere)

### Plan 06-02: App Store Detail Page & Dialogs (18 files, ~1,700 lines)
**Focus:** AS-03 (app detail page hero/content)
**Files:**
1. `modules/app-store/app-page/top-header.tsx` - Hero header
2. `modules/app-store/app-page/shared.tsx` - Local card styles
3. `modules/app-store/app-page/app-content.tsx` - Layout
4. `modules/app-store/app-page/info-section.tsx`
5. `modules/app-store/app-page/dependencies.tsx`
6. `modules/app-store/app-page/recommendations-section.tsx`
7. `modules/app-store/app-page/settings-section.tsx`
8. `modules/app-store/app-page/public-access-section.tsx`
9. `modules/app-store/app-page/release-notes-section.tsx`
10. `modules/app-store/app-page/about-section.tsx`
11. `modules/app-store/updates-dialog.tsx`
12. `modules/app-store/select-dependencies-dialog.tsx`
13. `modules/app-store/community-app-store-dialog.tsx`
14. `modules/window/app-contents/app-store-routes/app-page-window.tsx`
15. `modules/window/app-contents/app-store-routes/marketplace-app-window.tsx`
16. `routes/app-store/app-page/index.tsx`

**Dependencies:** Depends on Plan 06-01 completing `shared.tsx` migration

### Plan 06-03: File Manager Views, Navigation & DnD (20 files, ~2,200 lines)
**Focus:** FM-01 (list/grid view), FM-02 (breadcrumb nav), FM-03 (action buttons/context menus), FM-04 (drag-and-drop feedback)
**Files:**
1. `features/files/components/listing/file-item/index.tsx` - Selection/hover styling
2. `features/files/components/listing/file-item/list-view-file-item.tsx` - List row styling
3. `features/files/components/listing/file-item/list-view-file-item.css` - Selection CSS
4. `features/files/components/listing/file-item/icons-view-file-item.tsx` - Grid card styling
5. `features/files/components/listing/listing-body.tsx` - Table header
6. `features/files/components/listing/listing-and-file-item-context-menu.tsx` - Context menu
7. `features/files/components/listing/directory-listing/empty-state.tsx`
8. `features/files/components/listing/actions-bar/index.tsx` - Actions bar
9. `features/files/components/listing/actions-bar/path-bar/path-bar-desktop.tsx` - Breadcrumb
10. `features/files/components/listing/actions-bar/path-bar/path-bar-mobile.tsx`
11. `features/files/components/listing/actions-bar/navigation-controls.tsx`
12. `features/files/components/listing/actions-bar/search-input.tsx`
13. `features/files/components/listing/actions-bar/sort-dropdown.tsx`
14. `features/files/components/listing/actions-bar/view-toggle.tsx`
15. `features/files/components/listing/actions-bar/mobile-actions.tsx`
16. `features/files/components/sidebar/sidebar-item.tsx`
17. `features/files/components/sidebar/index.tsx`
18. `features/files/components/shared/drag-and-drop.tsx`
19. `features/files/components/shared/file-upload-drop-zone.tsx`
20. `features/files/components/files-dnd-wrapper/files-dnd-overlay.tsx`

**Dependencies:** Independent of Plans 06-01/06-02 (depends on Phase 1 tokens + Phase 3 window system)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `white/XX` opacity values | Semantic tokens (`surface-*`, `text-*`, `border-*`) | Phase 1 (v1.1) | All components should use tokens |
| `purple-*`/`cyan-*` accent colors | `brand` token system | Phase 1 (v1.1) | Focus rings, primary accents use brand |
| Glassmorphism (backdrop-blur, stacked gradients) | Minimal flat surfaces | Phase 1 (v1.1) | Remove blur, simplify to single surface |
| `focus:ring-purple-500/50` | `focus-visible:border-brand ring-brand/20` | Phase 1 (v1.1) | Consistent focus treatment |
| Arbitrary `rounded-XX` | Semantic `radius-sm/md/lg/xl` | Phase 1 (v1.1) | Standardized radii |

## Open Questions

1. **Dynamic icon-color gradients in app cards (apps-row-section, apps-three-column-section)**
   - What we know: `useColorThief` extracts colors from icons for dynamic gradients. This is a distinctive feature.
   - What's unclear: Should these be preserved in the "Minimal & Clean" redesign, or simplified to single-tone tints?
   - Recommendation: Preserve but simplify to a single subtle gradient (one layer instead of 3-4). The icon color extraction is a unique brand feature.

2. **Window-mode component duplication**
   - What we know: `shared-components.tsx` in the window routes duplicates styles from `modules/app-store/shared.tsx`
   - What's unclear: Can these be unified, or must they remain separate?
   - Recommendation: Keep them separate for now (they have different sizing needs for windowed vs sheet context) but ensure both are migrated to the same token vocabulary.

3. **File Manager floating islands**
   - What we know: There are 4 floating island types (audio, upload, formatting, operations) with ~15 files total
   - What's unclear: Should these be included in Phase 6?
   - Recommendation: Defer floating islands to a later phase. They are a separate visual concern from the core file browser.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all files in `modules/app-store/`, `routes/app-store/`, `features/files/`, and `modules/window/app-contents/`
- `tailwind.config.ts` for current design token definitions
- Phase 1 research (`01-RESEARCH.md`) for established token vocabulary

### Secondary (MEDIUM confidence)
- Phase descriptions and requirements from v1.1 plan for success criteria

## Metadata

**Confidence breakdown:**
- File inventory: HIGH - Direct codebase analysis, every file read
- Raw values to migrate: HIGH - Each file's className props were examined
- Dependencies: HIGH - Import chains traced through codebase
- Plan grouping: MEDIUM - Groupings are a recommendation, planner may adjust

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - stable codebase)
