# LivOS Visual Audit Report

**Date:** 2026-02-06
**Purpose:** Document the current visual state of LivOS v1.0/v1.1 and identify concrete CSS/token changes for v1.2 that produce **visible, user-facing** design improvements.
**Context:** v1.1 renamed token names (e.g. `white/4` to `surface-base`) but kept identical visual output. This audit identifies what the actual values should become.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Surface & Opacity System](#2-surface--opacity-system)
3. [Border System](#3-border-system)
4. [Shadow / Elevation System](#4-shadow--elevation-system)
5. [Typography System](#5-typography-system)
6. [Border Radius System](#6-border-radius-system)
7. [Color & Accent System](#7-color--accent-system)
8. [Component-Level Audit](#8-component-level-audit)
   - [Buttons](#81-buttons)
   - [Cards](#82-cards)
   - [Dock](#83-dock)
   - [Dock Items](#84-dock-items)
   - [Sheets (Full-Screen Panels)](#85-sheets)
   - [Dialogs](#86-dialogs)
   - [Context Menus & Dropdowns](#87-context-menus--dropdowns)
   - [Inputs](#88-inputs)
   - [File Manager List View](#89-file-manager-list-view)
   - [App Store Cards](#810-app-store-cards)
   - [AI Chat](#811-ai-chat)
   - [Login / Auth Screens](#812-login--auth-screens)
   - [Windows (Floating)](#813-windows)
   - [Toasts](#814-toasts)
9. [Glassmorphism Intensity](#9-glassmorphism-intensity)
10. [Priority Impact Matrix](#10-priority-impact-matrix)
11. [Recommended Token Changes](#11-recommended-token-changes)

---

## 1. Executive Summary

LivOS has a dark-theme glassmorphism aesthetic. The current design is **extremely low-contrast**: surfaces are nearly invisible (4-14% white opacity), borders are barely perceptible (6-20% white), and shadows on dark backgrounds produce almost no visible depth. The overall impression is "everything is translucent dark gray on dark gray."

**The three highest-impact changes for v1.2:**

1. **Increase surface opacity** -- Surfaces need to actually be visible. Going from 4%/6%/10%/14% to 6%/10%/16%/22% would make panels, cards, and UI elements distinguishable from backgrounds.
2. **Strengthen borders** -- At 6% and 10% opacity, borders are invisible on most monitors. They need to be at least 10%/16%/25% to provide structure.
3. **Add visible shadows** -- Current `elevation-sm` is `rgba(0,0,0,0.12)` on a dark background, which is invisible. Shadows need to combine dark outer shadows with subtle light inner glows to create perceivable depth.

---

## 2. Surface & Opacity System

### Current Values (tailwind.config.ts)

| Token | Value | Visual Description |
|-------|-------|-------------------|
| `surface-base` | `rgba(255,255,255, 0.04)` | Virtually invisible. 4% white on dark = indistinguishable from black. |
| `surface-1` | `rgba(255,255,255, 0.06)` | Barely visible. Most users cannot distinguish this from pure black on consumer monitors. |
| `surface-2` | `rgba(255,255,255, 0.10)` | First level where surfaces become faintly perceptible. Still very subtle. |
| `surface-3` | `rgba(255,255,255, 0.14)` | The only surface level that reads as "slightly lighter than background." |

### What's Wrong

- **4% and 6% opacity are below the perceptual threshold** for most displays. sRGB gamma means low values are crushed -- `rgba(255,255,255,0.04)` over `#000000` produces `#0A0A0A`, which is indistinguishable from black on typical monitors.
- **The step between levels is too small.** The jump from 4% to 6% is imperceptible. The jump from 6% to 10% is barely noticeable.
- **Hover states don't register.** When `surface-1` (6%) transitions to `surface-2` (10%) on hover, the 4 percentage-point difference is almost invisible.

### Recommended Changes

| Token | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| `surface-base` | `0.04` | `0.06` | Minimum perceptible on consumer monitors |
| `surface-1` | `0.06` | `0.10` | Standard resting surface for cards/panels |
| `surface-2` | `0.10` | `0.16` | Hover and interactive states |
| `surface-3` | `0.14` | `0.22` | Emphasized/pressed states, active surfaces |

This increases the step size between levels from ~4pp to ~6pp, making state transitions actually visible.

---

## 3. Border System

### Current Values

| Token | Value | Visual Description |
|-------|-------|-------------------|
| `border-subtle` | `rgba(255,255,255, 0.06)` | Invisible on most monitors. |
| `border-default` | `rgba(255,255,255, 0.10)` | Barely visible thin line. |
| `border-emphasis` | `rgba(255,255,255, 0.20)` | First level that reads as an actual border. |

### What's Wrong

- `border-subtle` at 6% is functionally nonexistent. A 1px line at 6% white on dark background is below perceptual threshold.
- Most components use `border-subtle` or `border-default`, meaning **most borders in the UI are invisible**.
- The dock uses `border-hpx border-border-default` -- a 0.5px border at 10% opacity, which is sub-pixel and invisible.
- Cards use `border border-border-subtle` -- 1px at 6%, invisible.

### Recommended Changes

| Token | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| `border-subtle` | `0.06` | `0.10` | Minimum visible 1px border |
| `border-default` | `0.10` | `0.16` | Standard component border |
| `border-emphasis` | `0.20` | `0.30` | High-contrast interactive borders |

Also consider: replace `border-hpx` (0.5px) usage with full `border-px` (1px) in key components like the dock.

---

## 4. Shadow / Elevation System

### Current Values

| Token | Value | On Dark Background |
|-------|-------|-------------------|
| `elevation-sm` | `0px 2px 8px rgba(0,0,0, 0.12)` | **Invisible.** Dark shadow on dark bg. |
| `elevation-md` | `0px 4px 16px rgba(0,0,0, 0.16)` | **Invisible.** |
| `elevation-lg` | `0px 8px 24px rgba(0,0,0, 0.20)` | **Barely visible.** |
| `elevation-xl` | `0px 16px 48px rgba(0,0,0, 0.24)` | **Faintly visible.** |
| `dock` | Complex inset shadow with outer `rgba(0,0,0, 0.56)` | Visible due to high opacity. |
| `dialog` | `0px 24px 48px rgba(0,0,0, 0.35)` + `inset 0px 1px 1px rgba(255,255,255, 0.1)` | Moderately visible. |

### What's Wrong

- **Shadows in the elevation scale are dark-on-dark.** On a dark UI, `rgba(0,0,0,0.12)` is adding a shadow that is only marginally darker than the already-dark background. The shadow is invisible.
- **The component-specific shadows (dock, dialog, widget) actually work** because they combine high-opacity dark outer shadows with white inset glow highlights. The semantic `elevation-*` tokens do not use this technique.
- Cards use `shadow-elevation-sm` which is completely invisible.

### Recommended Changes

The elevation tokens need to adopt the same multi-layer approach as the dock/dialog shadows:

```
elevation-sm:  0px 2px 8px rgba(0,0,0, 0.25), 0px 0.5px 0px 0px rgba(255,255,255, 0.06) inset
elevation-md:  0px 4px 16px rgba(0,0,0, 0.35), 0px 1px 0px 0px rgba(255,255,255, 0.08) inset
elevation-lg:  0px 8px 24px rgba(0,0,0, 0.45), 0px 1px 0px 0px rgba(255,255,255, 0.10) inset
elevation-xl:  0px 16px 48px rgba(0,0,0, 0.55), 0px 1px 0px 0px rgba(255,255,255, 0.12) inset
```

Key changes:
- Double or triple the outer shadow opacity
- Add inner glow (white inset highlight) to all elevation levels -- this is the technique that makes the dock shadow actually perceptible on dark backgrounds

---

## 5. Typography System

### Current Values

**Font Family:** Plus Jakarta Sans (primary), Inter (fallback)
**Global:** `text-rendering: geometricPrecision`, letter-spacing `-0.03em`

| Token | Size | Weight | Line Height |
|-------|------|--------|-------------|
| `caption-sm` | 11px | inherit | 1.4 |
| `caption` | 12px | inherit | 1.4 |
| `body-sm` | 13px | inherit | 1.5 |
| `body` | 14px | inherit | 1.5 |
| `body-lg` | 15px | inherit | 1.5 |
| `heading-sm` | 17px | 600 | 1.3 |
| `heading` | 19px | 600 | 1.3 |
| `heading-lg` | 24px | 600 | 1.2 |
| `display-sm` | 32px | 700 | 1.2 |
| `display` | 36px | 700 | 1.1 |
| `display-lg` | 48px | 700 | 1.1 |

### What's Wrong

- **Body text is very small.** 13-14px body text combined with the tight `-0.03em` letter-spacing makes text feel cramped and hard to scan.
- **The jump from body (14px) to heading-sm (17px) is abrupt.** There is no "subheading" or "body-xl" size.
- **Weight contrast is limited.** Most UI text defaults to `inherit` (which is 400 from the font load). Headings jump directly to 600/700. There is no medium weight (500) used systematically.
- **Text colors are very transparent.** `text-primary` at 90% is fine, but `text-secondary` at 60% and `text-tertiary` at 40% are quite faded on dark backgrounds.

### Recommended Changes

| Token | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| `body-sm` | 13px | 13px | Keep -- suitable for dense data |
| `body` | 14px | 14px | Keep -- standard body |
| `body-lg` | 15px | 16px | Bump slightly for readability |
| `heading-sm` | 17px | 16px | Create tighter scale step |
| `heading` | 19px | 20px | Round up for cleaner math |
| `text-secondary` | `0.60` | `0.65` | Slightly more readable |
| `text-tertiary` | `0.40` | `0.45` | Slightly more readable |

Also consider: Adding a `font-weight: 500` (medium) utility and using it for labels, sidebar items, and secondary headings.

---

## 6. Border Radius System

### Current Values

| Token | Value | Used By |
|-------|-------|---------|
| `radius-sm` | 8px | Buttons (sm), context menu items, dock item inner |
| `radius-md` | 12px | Buttons (default), inputs, dropdowns |
| `radius-lg` | 16px | Dock items, inputs (default) |
| `radius-xl` | 20px | Cards, dock container, windows |
| (raw) 24px | 24px | Dialogs, sheets (side panels) |
| (raw) 28px | 28px | Sheet (bottom panel, top corners) |

### What's Wrong

- **Radius values are reasonable** but the system is inconsistent. Some components use semantic tokens (`radius-xl`) while others use raw values (`rounded-24`, `rounded-28`).
- **The dock at `radius-xl` (20px) feels too rounded** relative to its compact height (~70px). A dock that is 70px tall with 20px radius is nearly a pill shape.
- **Dialogs at 24px are very round.** This is stylistic but combined with the nearly-invisible borders, they look like floating blobs rather than structured panels.

### Recommended Changes

- Tighten dock radius to `radius-lg` (16px) or introduce `radius-2xl` at 24px and use `radius-xl` (20px) for the dock. The dock currently uses `radius-xl` which is 20px -- this is acceptable.
- The main issue is not the values themselves but the **need for `radius-2xl` (24px) and `radius-3xl` (28px)** as official semantic tokens, since dialogs and sheets use these raw values directly.

---

## 7. Color & Accent System

### Current Colors

| Token | Value | Usage |
|-------|-------|-------|
| `brand` | Dynamic HSL (from wallpaper) | Primary accent |
| `brand-lighter` | Derived from brand | Hover states |
| `brand-lightest` | Derived from brand | Light accents |
| `destructive` | `#E03E3E` | Destructive actions |
| `destructive2` | `#E22C2C` | Primary destructive bg |
| `success` | `#299E16` | Success states |
| `dialog-content` | `#1E1E1E` | Dialog background |

### What's Wrong

- **Only one accent color.** The entire UI is monochromatic dark gray + one brand accent. There are no secondary accent colors (info blue, warning amber, etc.)
- **Brand color is wallpaper-derived**, which means it can be any hue. Some wallpapers may produce low-saturation or very dark brand colors that are hard to see.
- **No surface tinting.** Modern dark UIs often tint surfaces slightly with the accent color (e.g., Apple's selection tinting). All LivOS surfaces are pure white-on-black with no color personality.
- **Menu backgrounds use brand tinting** (`color-mix(in hsl, hsl(var(--color-brand)) 20%, black 80%)`) but nothing else does. This creates visual inconsistency -- menus have color but panels/cards do not.

### Recommended Changes

- **Add semantic status colors:** `info: #3B82F6`, `warning: #F59E0B`, `info-surface: rgba(59,130,246,0.08)`, `warning-surface: rgba(245,158,11,0.08)`
- **Add surface tinting:** Change `surface-1` from pure `rgba(255,255,255,0.10)` to include a hint of brand color: `color-mix(in srgb, hsl(var(--color-brand)) 5%, rgba(255,255,255,0.10) 95%)`. This gives surfaces personality.
- **Ensure minimum brand saturation:** Clamp the derived brand color to a minimum saturation (e.g., 30%) so it is always visible regardless of wallpaper.

---

## 8. Component-Level Audit

### 8.1 Buttons

**File:** `livos/packages/ui/src/shadcn-components/ui/button.tsx`

#### Current Appearance

- **Default variant:** `bg-surface-1` (6% white) with `border-border-default` (10% white). Shadow: `shadow-button-highlight-soft-hpx` = `0px 0.5px 0px rgba(255,255,255, 0.1) inset`.
- **Primary variant:** `bg-brand` with `shadow-button-highlight-hpx` = `0px 0.5px 0px rgba(255,255,255, 0.3) inset`. Has scale hover effect (1.02x).
- **Sizes:** `sm` = 28px desktop height, `default` = 34px, `dialog` = 36px, `lg` = 44px, `xl` = 52px.

#### Issues

- **Default buttons are nearly invisible.** A 6% white background with a 10% white border on a dark background barely registers as a button. The 0.5px inset highlight at 10% opacity is imperceptible.
- **Hover state transition is invisible.** Default goes from `bg-surface-1` (6%) to `bg-surface-2` (10%) on hover -- a 4pp change that cannot be seen.
- **Desktop sizes are small.** 28px for `sm` and 34px for `default` are compact. Touch targets are fine (44px on mobile) but desktop buttons feel tiny.

#### Specific Changes Needed

```
Default variant:
  bg-surface-1 (0.06) -> bg-surface-1 (0.10)  [with token update]
  hover:bg-surface-2 (0.10) -> hover:bg-surface-2 (0.16)
  shadow-button-highlight-soft-hpx -> shadow-button-highlight-soft (change 0.5px to 1px)

Desktop heights:
  sm: 28px -> 30px
  default: 34px -> 36px
```

---

### 8.2 Cards

**File:** `livos/packages/ui/src/components/ui/card.tsx`

#### Current Appearance

```
rounded-radius-xl bg-surface-1 px-4 py-5 max-lg:min-h-[95px] lg:p-6
border border-border-subtle shadow-elevation-sm
hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md
```

- Radius: 20px
- Background: 6% white
- Border: 6% white
- Shadow: `0px 2px 8px rgba(0,0,0, 0.12)` (invisible on dark)

#### Issues

- **Cards look like empty space.** 6% white bg + 6% white border + invisible shadow = there is no visible card boundary.
- **Hover state is barely perceptible.** Going from 6% to 10% bg, 6% to 10% border.
- **No visual hierarchy.** A card looks the same as the background it sits on.

#### Specific Changes Needed

With the updated surface/border/shadow tokens, cards will automatically look much better. Additionally:

- Consider adding a subtle gradient to card backgrounds: `bg-gradient-to-b from-surface-1 to-surface-base` for added depth.
- The hover shadow transition from `elevation-sm` to `elevation-md` will actually be visible once those tokens have inner glow highlights.

---

### 8.3 Dock

**File:** `livos/packages/ui/src/modules/desktop/dock.tsx`

#### Current Appearance

```
rounded-radius-xl bg-surface-base backdrop-blur-2xl px-2.5 shadow-dock
border-hpx border-border-default
```

- Radius: 20px
- Background: 4% white with heavy blur (2xl = 40px)
- Border: 0.5px at 10% white
- Shadow: Complex multi-layer (the one shadow that actually works)
- Icon size: 50px, zoomed: 80px
- Padding: 10px
- Gap: 12px (`gap-3`)

#### Issues

- **The dock background is almost invisible.** `surface-base` (4% white) even with `backdrop-blur-2xl` is extremely subtle. The dock relies entirely on its shadow for definition.
- **0.5px border is sub-pixel.** On non-retina displays, `border-hpx` rounds to either 0 or 1px inconsistently.
- **The dock shadow is the saving grace** -- the complex inset + outer shadow makes the dock perceptible. But the dock bg itself contributes almost nothing.
- **Dock padding is tight.** 10px vertical padding + 10px bottom spacing = icons sit close to the dock edges.

#### Specific Changes Needed

```
bg-surface-base (0.04) -> bg-surface-1 (new 0.10) or a dedicated dock token ~0.12
border-hpx -> border-px (upgrade to 1px)
border-border-default -> border-border-default (will be 0.16 with new tokens)
padding: 10px -> 12px
gap: 12px -> keep
```

---

### 8.4 Dock Items

**File:** `livos/packages/ui/src/modules/desktop/dock-item.tsx`

#### Current Appearance

Each dock icon is:
```
rounded-radius-lg bg-surface-2 backdrop-blur-md border border-border-emphasis
```

- 50x50px squares with 16px radius
- Background: 10% white
- Border: 20% white
- Uses React Icons (Tabler) at 55% of container size
- Has a glow element: `bg-surface-3 opacity-30` with `blur(16px)`
- Open indicator: 2px x 10px white pill below

#### Issues

- **Dock item icons feel flat.** While they have the strongest borders in the system (`border-emphasis` = 20%), the actual icon rendering (line icons at 55% size) looks small and thin inside a 50px container.
- **The glow effect is very subtle.** `surface-3` (14% white) at 30% opacity = ~4.2% effective opacity. This glow is invisible.
- **Icon size in the zoomed state (80px) is good** but the spring animation at `mass: 0.1, stiffness: 150, damping: 10` is quite bouncy and may feel toy-like.

#### Specific Changes Needed

```
Icon size within container: 55% -> 60% (slightly larger icons)
Glow: opacity-30 -> opacity-50 (make it actually visible with updated surface-3)
Spring damping: 10 -> 14 (slightly less bouncy, more polished feel)
Consider adding a subtle gradient bg instead of flat surface-2
```

---

### 8.5 Sheets

**File:** `livos/packages/ui/src/shadcn-components/ui/sheet.tsx`

#### Current Appearance

Sheet content:
```
bg-black/70 (base)
```

Background technique:
1. Black base layer
2. Wallpaper image (rotated 180deg, scaled 1.2x) faded in with delay
3. Blur overlay: `backdrop-blur-xl md:backdrop-blur-3xl backdrop-brightness-[0.3] backdrop-saturate-[1.2]`
4. Inner glow: `shadow-sheet-shadow` = `2px 2px 2px rgba(255,255,255, 0.05) inset`

Sheet chrome:
- Top corners: `rounded-t-28` (28px)
- Inner content padding: `px-3 pt-6 md:px-[40px] md:pt-12 xl:px-[70px]`
- Max width: 1320px

#### Issues

- **The sheet looks good overall** due to the wallpaper blur technique. This is the best-executed glassmorphism in the system.
- **The inner glow (`shadow-sheet-shadow`) is invisible.** `2px 2px 2px rgba(255,255,255, 0.05)` is not perceptible. This should be a top-edge highlight.
- **`backdrop-brightness-[0.3]` is very dark.** The blurred wallpaper is dimmed to 30% brightness, making it look almost solid black. Raising to 35-40% would let the wallpaper color show through more.
- **No visible border.** The sheet has no border, relying entirely on the shadow for edge definition.

#### Specific Changes Needed

```
shadow-sheet-shadow: 2px 2px rgba(255,255,255,0.05) -> 0px 1px 0px rgba(255,255,255,0.10) inset (top edge highlight)
backdrop-brightness: 0.3 -> 0.38 (let wallpaper color show more)
Add: border-t border-border-default (visible top edge)
```

---

### 8.6 Dialogs

**File:** `livos/packages/ui/src/shadcn-components/ui/shared/dialog.ts`

#### Current Appearance

```
rounded-24 bg-dialog-content/75 p-8 shadow-dialog
backdrop-blur-lg md:backdrop-blur-2xl
border border-border-subtle
```

- Radius: 24px
- Background: `#1E1E1E` at 75% opacity
- Shadow: `0px 24px 48px rgba(0,0,0, 0.35)` + `inset 0px 1px 1px rgba(255,255,255, 0.1)`
- Border: `border-subtle` (6% white)
- Overlay: `bg-black/60`
- Gap: 24px between children
- Padding: 32px

#### Issues

- **Dialog background is one of the better surfaces** because it uses a solid color (`#1E1E1E`) rather than pure white opacity. At 75% alpha with blur, it creates decent contrast.
- **The border is invisible** (6% white) -- dialogs have no visible edge.
- **The dialog shadow is reasonable** but the inset highlight (`1px 1px rgba(255,255,255,0.1)`) uses `1px 1px` offset, which means it highlights the top-left corner only. It should be `0px 1px 0px` for a clean top highlight.
- **The overlay at 60% black** is good but has no blur on it by default (blur is in other dialog types).

#### Specific Changes Needed

```
border-border-subtle -> border-border-default (will be 0.16 with new tokens)
shadow-dialog inset: 0px 1px 1px rgba(255,255,255,0.1) -> 0px 1px 0px rgba(255,255,255,0.12) (clean top highlight)
```

---

### 8.7 Context Menus & Dropdowns

**File:** `livos/packages/ui/src/shadcn-components/ui/shared/menu.ts`

#### Current Appearance

Context menu:
```
bg-[color-mix(in_hsl, hsl(var(--color-brand)) 20%, black 80%)]
shadow-context-menu rounded-radius-sm
```

Dropdown:
```
Same bg, shadow-dropdown, rounded-radius-md, p-2.5
```

Menu items:
```
px-3 py-2 text-body-sm font-medium
focus:bg-surface-base focus:text-white
```

#### Issues

- **Menus are the only component that uses brand tinting** (`color-mix`). This is actually a great technique and should be applied more widely.
- **Menu item hover state uses `surface-base` (4% white)** which is nearly invisible.
- **The context menu shadow works well** due to high outer opacity (50%).
- **`rounded-radius-sm` (8px) for context menus feels tight** compared to the rest of the UI which uses 16-24px radii.

#### Specific Changes Needed

```
Menu item focus: bg-surface-base (0.04) -> bg-surface-1 (new 0.10) or brand/10
Context menu radius: radius-sm (8px) -> radius-md (12px)
Consider: apply the color-mix technique to other surfaces
```

---

### 8.8 Inputs

**File:** `livos/packages/ui/src/shadcn-components/ui/input.tsx`

#### Current Appearance

```
border border-border-default bg-surface-base
hover:bg-surface-1
focus-visible:bg-surface-1 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20
h-12 rounded-radius-lg px-5 py-2 text-body-lg font-medium
```

- Height: 48px (default), 40px (short)
- Background: 4% white
- Border: 10% white
- Focus: brand border + 3px ring at brand/20%
- Placeholder: `text-tertiary` (40% white)

#### Issues

- **Input bg at 4% is invisible.** The input field looks like empty space until focused.
- **The focus state is well-designed** -- brand border + ring gives clear feedback.
- **Placeholder text at 40% opacity is too faint.** Should be 50%+.
- **The hover state** (4% -> 6%) is imperceptible.

#### Specific Changes Needed

```
bg-surface-base (0.04) -> bg-surface-base (new 0.06) [with token update]
hover:bg-surface-1 (0.06) -> hover:bg-surface-1 (new 0.10)
placeholder: text-tertiary (0.40) -> text-tertiary (new 0.45)
```

---

### 8.9 File Manager List View

**File:** `livos/packages/ui/src/features/files/components/listing/file-item/list-view-file-item.tsx`

#### Current Appearance

Desktop:
- Simple flex row with no background, no border
- Columns: Name (flex-5), Date (flex-2), Size (flex-1), Type (flex-2)
- Text: `text-caption` (12px) with `p-2.5` padding
- Icons: 20x20px
- Selected: `bg-brand/10` with brand-colored box-shadow borders

Mobile:
- `rounded-lg px-3 py-2`
- Icon: 28x28px
- Name: `text-caption`, details: `text-caption-sm text-tertiary`

#### Issues

- **No row separators.** File items have no visual boundary between them -- just text floating in space.
- **No hover state.** There is no `hover:bg-*` class on file items.
- **The selected state is well-implemented** with brand tinting and inset borders.
- **Icon size (20px desktop) is quite small.** macOS Finder uses 16px icons but with much more padding and visual hierarchy.
- **Column text at 12px (caption) is small** for a data table.

#### Specific Changes Needed

```
Add hover state: hover:bg-surface-base (or hover:bg-white/4)
Add alternating row tint or subtle separator line
Increase desktop icon size: 20px -> 24px (or use the icon-md token that exists)
Increase desktop text to body-sm (13px) from caption (12px)
Add row padding: p-2.5 -> py-2 px-3 (more horizontal breathing room)
```

---

### 8.10 App Store Cards

**File:** `livos/packages/ui/src/modules/app-store/shared.tsx`

#### Current Appearance

**PremiumAppCard:**
```
rounded-2xl border border-border-subtle bg-surface-1 p-5
hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md
```

**FeaturedAppSpotlight:**
```
rounded-3xl border border-border-default p-6 md:p-8
hover:border-border-emphasis hover:shadow-elevation-lg
```

**CategoryPill:**
```
rounded-full px-4 py-2 text-body-sm font-medium
Active: bg-white text-black shadow-lg
Inactive: bg-surface-2 text-text-primary hover:bg-surface-3
```

#### Issues

- **PremiumAppCard suffers from the same card invisibility** -- `surface-1` + `border-subtle` is invisible.
- **FeaturedAppSpotlight is better** because it uses `border-default` and accepts a `gradient` prop for colored backgrounds.
- **CategoryPill active state (white bg, black text) is effective** -- high contrast. The inactive state (`surface-2` = 10%) is marginal.
- **App icon shadow (`shadow-elevation-sm`) is invisible** on dark background.
- **The app icon hover scale (1.05x on card, 1.10x on featured) is a nice touch** but needs visible shadow to accompany it.

#### Specific Changes Needed

```
PremiumAppCard:
  Add shadow-elevation-sm (will be visible with updated tokens)
  Icon ring: ring-1 ring-border-default -> ring-1 ring-border-emphasis

FeaturedAppSpotlight:
  The hover overlay (bg-surface-base opacity-0 -> opacity-100) is invisible.
  Change to bg-white/5 or bg-surface-1.

AppIcon shadow: shadow-elevation-sm -> shadow-elevation-md (with updated tokens)
```

---

### 8.11 AI Chat

**File:** `livos/packages/ui/src/routes/ai-chat/index.tsx`

#### Current Appearance

**Chat Messages:**
- User: `bg-brand text-white` in `rounded-radius-xl px-4 py-3`
- Assistant: `bg-surface-2 text-text-primary` in `rounded-radius-xl px-4 py-3`
- Assistant avatar: `bg-gradient-to-br from-violet-500/30 to-blue-500/30` 32x32 circle

**Tool Call Display:**
```
rounded-radius-sm border border-border-default bg-surface-base
```

#### Issues

- **User messages (brand bg) look good** -- solid color provides contrast.
- **Assistant messages (`surface-2` = 10%) are very faint.** Hard to distinguish from background.
- **The assistant avatar gradient (violet/blue at 30%)** is the only place in the UI with non-brand color accents. This is actually nice but inconsistent with the rest of the system.
- **Tool call display at `surface-base` (4%) is nearly invisible.**

#### Specific Changes Needed

```
Assistant messages: bg-surface-2 -> bg-surface-1 (with updated 0.10 value) -- or use a dedicated chat-bubble token
Tool calls: bg-surface-base -> bg-surface-1
Consider: giving assistant messages a subtle left border in brand color for visual distinction
```

---

### 8.12 Login / Auth Screens

**File:** `livos/packages/ui/src/layouts/bare/shared.tsx`

#### Current Appearance

- **Title:** `text-display-sm font-bold` (32px / 700) centered
- **Subtitle:** `text-body text-text-secondary md:text-body-lg` centered
- **Login button:** `h-12 rounded-full bg-brand px-4 text-body font-medium min-w-[112px]`
- **Secondary button:** `h-12 rounded-full bg-surface-2 backdrop-blur-sm px-4 text-body font-medium min-w-[112px]`
- **Footer links:** `text-body-sm text-text-secondary`
- **Form inputs:** max-w-sm with gap-2.5

#### Issues

- **The login screen is one of the most polished areas** because it uses centered layout with large text and the brand color prominently.
- **Secondary buttons use `surface-2` (10%)** which is faint but acceptable against the wallpaper blur.
- **The `min-w-[112px]` constraint is good** for button sizing consistency.
- **Footer links at `text-secondary` (60%)** are readable but could use slightly more contrast.

#### Specific Changes Needed

Minimal changes needed here. The login screen benefits from the wallpaper background providing contrast. Token-level changes will naturally improve:
```
Secondary button: bg-surface-2 -> bg-surface-2 (new 0.16) will be more visible
```

---

### 8.13 Windows

**File:** `livos/packages/ui/src/modules/window/window.tsx`

#### Current Appearance

```
rounded-radius-xl bg-black/90 backdrop-blur-xl border border-border-default
```

Window chrome (title bar):
```
bg-black/80 backdrop-blur-lg rounded-full border border-border-emphasis shadow-elevation-md
```

Close button:
```
w-9 h-9 rounded-full bg-black/80 backdrop-blur-lg border border-border-emphasis
hover:bg-destructive
```

#### Issues

- **Windows use `bg-black/90`** which is much more opaque than the surface system. This is actually good -- windows need to be readable over complex wallpapers.
- **The floating title bar** (rounded-full with `bg-black/80 backdrop-blur-lg`) is a creative design choice -- macOS-like but more minimal.
- **Window border at `border-default` (10%)** is too faint for a floating window. Windows need clear edges.
- **The close button hover state** (bg-destructive) is one of the few places where status colors are used effectively.

#### Specific Changes Needed

```
border-border-default -> border-border-emphasis (will be 0.30 with new tokens)
Consider: adding shadow-elevation-lg to windows for depth
Title bar shadow-elevation-md will be visible with updated shadow tokens
```

---

### 8.14 Toasts

**File:** `livos/packages/ui/src/components/ui/toast.tsx`

#### Current Appearance (from grep results)

```
bg-surface-3 rounded-radius-md py-4 px-5 backdrop-blur-md shadow-elevation-lg text-body-lg
```

#### Issues

- **`surface-3` (14%) is the highest surface token used** -- this is appropriate for toasts as notifications.
- **With updated `surface-3` to 22%, toasts will be more visible.**
- **`shadow-elevation-lg` is currently invisible** but will be fixed with updated shadow tokens.

---

## 9. Glassmorphism Intensity

### Current Blur Values Used

| Component | Blur | Effect |
|-----------|------|--------|
| Dock | `backdrop-blur-2xl` (40px) | Heavy blur -- good |
| Sheet overlay | `backdrop-blur-lg` (12px) / `backdrop-blur-xl` (24px) | Medium blur |
| Sheet content | `backdrop-blur-xl` (24px) / `backdrop-blur-3xl` (64px) | Heavy blur -- good |
| Dialog | `backdrop-blur-lg` (12px) / `backdrop-blur-2xl` (40px) | Medium to heavy |
| Dock items | `backdrop-blur-md` (12px) | Light blur |
| Command palette overlay | `backdrop-blur-xl` (24px) | Medium |
| Window | `backdrop-blur-xl` (24px) | Medium |
| Window chrome | `backdrop-blur-lg` (12px) | Light |
| Desktop date pill | `backdrop-blur-sm` (4px) | Very light |

### What's Wrong

- **Blur is appropriate in most places** but the surfaces behind the blur are too transparent to show the blur effect. You cannot see blur if the surface is nearly 100% transparent.
- **The key problem is not blur intensity but surface opacity.** When `surface-base` is 4%, the blur has almost nothing to blur *through*. Increasing surface opacity to 6-10% will make the glassmorphism actually visible.
- **Sheet brightness (`backdrop-brightness-[0.3]`)** is too aggressive. The sheet dims the blurred wallpaper to 30%, losing most of the glassmorphism color.

### Recommended Changes

```
Dock: increase surface from 0.04 to 0.08-0.10 (let blur shine through)
Sheet: increase backdrop-brightness from 0.3 to 0.38
Desktop date pill: increase backdrop-blur-sm to backdrop-blur-md
Window chrome: increase backdrop-blur-lg to backdrop-blur-xl
```

---

## 10. Priority Impact Matrix

Changes ranked by **visible impact to users** vs **implementation effort**:

### Tier 1: Highest Impact, Lowest Effort (Token-Level Changes)

These changes require editing only `tailwind.config.ts` and immediately affect every component that uses the semantic tokens.

| Change | Files Modified | Components Affected |
|--------|---------------|-------------------|
| Update `surface-base/1/2/3` opacity values | 1 file | Every surface in the UI |
| Update `border-subtle/default/emphasis` opacity values | 1 file | Every border in the UI |
| Update `elevation-sm/md/lg/xl` shadow values (add inner glow) | 1 file | Every card, dialog, toast |
| Update `text-secondary/tertiary` opacity values | 1 file | All secondary/tertiary text |

### Tier 2: High Impact, Low Effort (Component Tweaks)

| Change | Files Modified | Visual Impact |
|--------|---------------|---------------|
| Dock: `border-hpx` to `border-px`, increase surface | 1 file | Dock becomes clearly defined |
| Sheet: increase `backdrop-brightness`, add top border | 1 file | Sheets show wallpaper color |
| Dialog: upgrade border from `subtle` to `default` | 1 file | Dialogs have visible edges |
| File list: add hover state, increase row density | 1 file | File manager feels interactive |
| Menu items: increase hover bg, increase radius | 1 file | Menus feel more modern |

### Tier 3: Medium Impact, Medium Effort (Design Additions)

| Change | Files Modified | Visual Impact |
|--------|---------------|---------------|
| Add surface tinting with brand color | 2-3 files | UI gains color personality |
| Add `info`/`warning` semantic colors | 1 config + usage | Richer status communication |
| Add font-weight 500 usage for labels | Multiple files | Better typographic hierarchy |
| Dock item icon sizing and glow | 1 file | More polished dock icons |

### Tier 4: Lower Priority / Longer Term

| Change | Rationale |
|--------|-----------|
| Add `radius-2xl`/`radius-3xl` semantic tokens | Cleanup, not visual change |
| Rework typography scale | Risky, affects all layouts |
| Add gradient backgrounds to cards | Design direction decision |

---

## 11. Recommended Token Changes

### tailwind.config.ts -- Proposed Changes

```typescript
colors: {
  // === SURFACES ===
  'surface-base': 'rgba(255, 255, 255, 0.06)',   // was 0.04
  'surface-1':    'rgba(255, 255, 255, 0.10)',   // was 0.06
  'surface-2':    'rgba(255, 255, 255, 0.16)',   // was 0.10
  'surface-3':    'rgba(255, 255, 255, 0.22)',   // was 0.14

  // === BORDERS ===
  'border-subtle':   'rgba(255, 255, 255, 0.10)', // was 0.06
  'border-default':  'rgba(255, 255, 255, 0.16)', // was 0.10
  'border-emphasis': 'rgba(255, 255, 255, 0.30)', // was 0.20

  // === TEXT ===
  'text-primary':   'rgba(255, 255, 255, 0.92)',  // was 0.90 (slight bump)
  'text-secondary': 'rgba(255, 255, 255, 0.65)',  // was 0.60
  'text-tertiary':  'rgba(255, 255, 255, 0.45)',  // was 0.40

  // === NEW: Status Colors ===
  'info':           '#3B82F6',
  'warning':        '#F59E0B',
},

boxShadow: {
  // === UPDATED ELEVATION (add inner glow for dark-theme visibility) ===
  'elevation-sm': '0px 2px 8px rgba(0, 0, 0, 0.25), 0px 0.5px 0px 0px rgba(255, 255, 255, 0.06) inset',
  'elevation-md': '0px 4px 16px rgba(0, 0, 0, 0.35), 0px 1px 0px 0px rgba(255, 255, 255, 0.08) inset',
  'elevation-lg': '0px 8px 24px rgba(0, 0, 0, 0.45), 0px 1px 0px 0px rgba(255, 255, 255, 0.10) inset',
  'elevation-xl': '0px 16px 48px rgba(0, 0, 0, 0.55), 0px 1px 0px 0px rgba(255, 255, 255, 0.12) inset',

  // === UPDATED SHEET SHADOW ===
  'sheet-shadow': '0px 1px 0px 0px rgba(255, 255, 255, 0.10) inset',  // was 2px 2px 2px 0.05
},
```

### Component-Level Changes Summary

| Component | Change | Priority |
|-----------|--------|----------|
| Dock (`dock.tsx`) | `border-hpx` -> `border-px` | High |
| Dock (`dock.tsx`) | Consider dedicated bg token ~0.08-0.10 | Medium |
| Sheet (`sheet.tsx`) | `backdrop-brightness-[0.3]` -> `backdrop-brightness-[0.38]` | High |
| Sheet (`sheet.tsx`) | Add `border-t border-border-default` | Medium |
| Dialog (`dialog.ts`) | `border-border-subtle` -> `border-border-default` | High |
| Dialog (`dialog.ts`) | Fix inset shadow offset from `1px 1px` to `0px 1px 0px` | Low |
| File list (`list-view-file-item.tsx`) | Add `hover:bg-surface-base` to rows | High |
| File list (`list-view-file-item.tsx`) | Increase icon size 20px -> 24px | Medium |
| Menu (`menu.ts`) | `focus:bg-surface-base` -> `focus:bg-surface-1` | Medium |
| Menu (`menu.ts`) | Context menu `radius-sm` -> `radius-md` | Medium |
| Dock item (`dock-item.tsx`) | Icon size 55% -> 60%, glow opacity 30% -> 50% | Medium |
| AI Chat | Assistant bubble: add left border accent | Low |
| Window | `border-border-default` -> `border-border-emphasis` | Medium |
| Button default | `shadow-button-highlight-soft-hpx` -> `shadow-button-highlight-soft` (1px) | Low |

---

## Appendix: File Reference

All paths relative to `livos/packages/ui/`:

| File | Role |
|------|------|
| `tailwind.config.ts` | Design token definitions (colors, shadows, radii, typography) |
| `src/index.css` | Global base styles, scrollbar, animations, fonts |
| `src/shadcn-components/ui/button.tsx` | Button component + variants |
| `src/shadcn-components/ui/button-styles.css` | Button active state (scale 0.97) |
| `src/components/ui/card.tsx` | Card component |
| `src/modules/desktop/dock.tsx` | Dock container + layout |
| `src/modules/desktop/dock-item.tsx` | Individual dock icons |
| `src/shadcn-components/ui/sheet.tsx` | Sheet (full-panel overlay) |
| `src/layouts/sheet.tsx` | Sheet layout wrapper |
| `src/shadcn-components/ui/shared/dialog.ts` | Dialog shared classes |
| `src/shadcn-components/ui/shared/menu.ts` | Context menu + dropdown classes |
| `src/shadcn-components/ui/input.tsx` | Input component |
| `src/modules/app-store/shared.tsx` | App store cards + typography |
| `src/routes/ai-chat/index.tsx` | AI chat UI |
| `src/features/files/components/listing/file-item/list-view-file-item.tsx` | File list rows |
| `src/features/files/components/listing/file-item/list-view-file-item.css` | File list selection styles |
| `src/layouts/bare/shared.tsx` | Login/auth screen layout |
| `src/modules/window/window.tsx` | Floating window component |
| `src/modules/window/window-chrome.tsx` | Window title bar + close button |
| `src/components/ui/toast.tsx` | Toast notifications |
