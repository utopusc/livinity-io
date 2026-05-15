# LivOS Design System

> **Package:** `@livinity/design-tokens` v1.0.0
> **Snapshot date:** 2026-05-14
> **Canonical source:** `/opt/landing/livinity.io/dashboard.html` (Server5, read-only)
> **Lock invariant:** D-116-LOCK-CANONICAL — drift from canonical = bug.

This is the single source of truth for the LivOS visual identity. Every surface (Mini PC livinityd UI, Server5 Next.js platform, landing static HTML) consumes from here. Three formats ship the same values:

- `tokens.css` — CSS custom properties (`:root`, `body.dark`, `body.iridescent`).
- `tailwind.preset.cjs` — Tailwind 3.4 preset mapping tokens to `theme.extend.*`.
- `theme.json` — JSON manifest for tooling (Storybook, codegen, Figma plugin).

## Overview

The LivOS design system is anchored on the existing `dashboard.html` aesthetic shipped at `livinity.io/dashboard`. That page is the visual reference point: Geist + Geist Mono + Instrument Serif typography, custom CSS variables for color/spacing/radius, light/dark/iridescent themes, bento card layout, pill stepper, and accent-blue/green/amber/red palette.

The v35.0 milestone (Phases 115-121) unifies every LivOS UI surface on this system. Plan 116-01 codifies the tokens; consumer migration follows in Phases 117 (Server5 Next.js), 118 (landing HTML polish), 119 (`@livinity/ui-kit` component library), 120 (Mini PC livinityd wave 1), and 121 (Mini PC wave 2 + cross-surface audit).

## Typography

LivOS uses three font families, all loaded from Google Fonts in v1.0.0. Plan 116-02 adds self-hosted `.woff2` fallbacks (per D-116-SELF-HOSTED-FONT-FALLBACK) so Mini PC deployments work offline.

| Family | CSS variable | Tailwind alias | Weights | Use |
|---|---|---|---|---|
| Geist (sans) | _default_ — inherited from `<body>` font-family | (default sans) | 200/300/400/500/600/700/800 | Body copy, UI labels, headings (default) |
| Geist Mono | `--font-mono` | `font-mono` | 400/500 | Code, command boxes, uppercase pill labels (with `letter-spacing: 0.06-0.10em`) |
| Instrument Serif | `--font-serif` | `font-serif` | 400 (italic + roman) | Hero titles, editorial display — used sparingly for "personality" |

Google Fonts loader (v1.0.0):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400;500;600;700;800&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap">
```

Plan 116-02 will replace this with `@import "@livinity/design-tokens/fonts.css"` that ships `@font-face` declarations referencing self-hosted `.woff2` files plus the Google CDN as fallback.

## Color Tokens

All color tokens are CSS custom properties on `:root` for the light theme. The `body.dark` and `body.iridescent` blocks override the same variable names; consumers reference `var(--token-name)` and theme switching is body-class based.

### Light theme (`:root`)

| Token | Value | Tailwind alias | Use |
|---|---|---|---|
| `--accent-blue` | `#2563eb` | `accent-blue` | Primary action, links, focus |
| `--accent-green` | `#16a34a` | `accent-green` | Success states |
| `--accent-amber` | `#d97706` | `accent-amber` | Warning, attention |
| `--accent-red` | `#dc2626` | `accent-red` | Errors, destructive actions |
| `--card-bg` | `#ffffff` | `card-bg` | Card surface (light) |
| `--card-bg-2` | `#fafafa` | `card-bg-2` | Card surface alt (light) |
| `--dash-line` | `rgba(0,0,0,0.07)` | `dash-line` | Subtle dividers |
| `--dash-line-strong` | `rgba(0,0,0,0.12)` | `dash-line-strong` | Stronger dividers |
| `--hero-grad` | `linear-gradient(135deg, #fafafa 0%, #f0f0f3 100%)` | `bg-hero-grad` | Hero card background |

### Dark theme (`body.dark`)

> **Status:** PENDING canonical transcription (`D-116-FOLLOW-UP-DARK`).
>
> Phase 115's batched SSH fetch confirms `dashboard.html` ships 8 `body.dark` override hits — the variant has full content. Server5 was unreachable at Plan 116-01 fetch time (port 22 closed; Contabo panel restart pending per project memory). Plan 116-02 (or a 116-01 follow-up patch) will transcribe the block verbatim once SSH is restored. Per D-116-LOCK-CANONICAL **NO improvised values** are shipped in v1.0.0 — `body.dark { }` is left as a documented stub.

Consumer guidance: until v1.x ships the dark override block, dark-mode consumers fall back to the same `:root` light values when `body.dark` is set. Visual inspection on consumer migration (Phase 117/120) will flag any regression.

### Iridescent theme (`body.iridescent`)

> **Status:** PENDING canonical transcription (`D-116-FOLLOW-UP-IRIDESCENT`).
>
> Phase 115's fetch confirms `dashboard.html` ships 1 `body.iridescent` override. Same Server5 unavailability applies. v1.0.0 ships the stub block; v1.1+ will populate from the canonical fetch.

The iridescent theme is the purple-tinted variant used rarely (currently only the hero greeting overlay on `dashboard.html`).

## Spacing

LivOS uses one canonical named spacing token plus inline pixel literals for the rest. `dashboard.html` ships pixel-perfect spacing (8/16/24/28px) without a formal named scale; v1.0.0 codifies the most-referenced value as `--dash-pad`.

| Token | Value | Tailwind alias | Use |
|---|---|---|---|
| `--dash-pad` | `28px` | `p-dash` / `m-dash` / `gap-dash` | Canonical card padding |

Inline literals (8/16/24/32) remain valid for ad-hoc spacing in v1.0.0. A future v1.x may codify a full `--space-{xs,sm,md,lg,xl}` scale (open question from `116-CONTEXT.md`); per Plan 116-CONTEXT this is deferred to operator decision, not silently added.

## Radius

| Token | Value | Tailwind alias | Use |
|---|---|---|---|
| `--dash-radius` | `18px` | `rounded-dash` | Canonical card corner radius |

Smaller radii (8px, 12px) remain valid as inline literals for buttons and pills.

## Shadow

One canonical card elevation. Consumers MUST NOT improvise new shadow values; if a new component needs different elevation, add a new token to this package first.

| Token | Value | Tailwind alias | Use |
|---|---|---|---|
| `--card-shadow` | `0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -34px rgba(0,0,0,0.18)` | `shadow-card` | Card elevation |

The two-stop shadow gives a sharp near-edge plus a soft far-distance — copy-paste exactly. The far-distance offset (`-34px`) is intentional.

## Motion

All interactive transitions use the same timing function and duration. `dashboard.html` ships `0.18s ease` literally — no easing curve variation.

| Token | Value | Tailwind alias | Use |
|---|---|---|---|
| Transition (timing) | `0.18s ease` | `transition-all duration-dash ease` | All hover/focus/state transitions |
| `transitionDuration.dash` | `180ms` | `duration-dash` | Standard duration token |

**Hover lift pattern:** Buttons translate up by 1px on hover:
```css
.h-btn:hover {
  transform: translateY(-1px);
  transition: 0.18s ease;
}
```

**Hero greeting overlay:** `dashboard.html` ships one bespoke entrance animation:
```css
veilOut 0.7s 2.0s cubic-bezier(.4,0,.2,1)
greetIn / greetOut
```
This is a landing-page concern only — not a token, not generalized. Consumers do not consume it.

## Accessibility

`dashboard.html` does NOT ship explicit accessibility tokens (focus-ring color/width/offset, contrast adjustment variables). v1.0.0 documents the de facto values and `D-V35-ACCESSIBILITY-WHEN-MIGRATING` (from v35 milestone) directs consumers to add proper focus rings during migration.

### Color contrast targets (informational, WCAG AA)

Computed against `--card-bg` (`#ffffff`):

| Token | Contrast vs `#ffffff` | WCAG AA pass? |
|---|---|---|
| `--accent-blue` `#2563eb` | 5.17:1 | ✓ (normal text) |
| `--accent-green` `#16a34a` | 3.18:1 | ✓ (large text only) |
| `--accent-amber` `#d97706` | 3.34:1 | ✓ (large text only) |
| `--accent-red` `#dc2626` | 4.59:1 | ✓ (normal text) |

Consumers needing AA-compliant body copy in green/amber MUST use larger font sizes or pair with adjacent dark text. Phase 119 ui-kit will encode this in component variants.

### Focus rings

Recommended pattern (not yet a token):
```css
:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

A future v1.x may codify `--focus-ring-color`, `--focus-ring-width`, `--focus-ring-offset`.

## Interaction Patterns

### Theme switching

`dashboard.html` uses body class toggles, persisted via `localStorage`:

```js
// Read preferred theme
const theme = localStorage.getItem("liv_theme") || (
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
);
document.body.classList.toggle("dark", theme === "dark");
document.body.classList.toggle("iridescent", theme === "iridescent");
```

`liv_theme` accepted values: `"light"` | `"dark"` | `"iridescent"`. Default = system preference.

### Hover lift

All `.h-btn` (primary/secondary buttons) lift 1px on hover:
```css
.h-btn { transition: 0.18s ease; }
.h-btn:hover { transform: translateY(-1px); }
```

This is canonical micro-interaction — every clickable surface gets it. Phase 119 ui-kit will encode this in `<Button>`.

### Bento card grid

`dashboard.html` uses `display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px;` with `.b-card.span-{4,5,6,7,8,12}` modifiers. Mobile collapse at `1000px` makes every card `span-12`. Phase 119 ui-kit will provide a `<Card span={N}>` component.

## Tailwind Integration

Consumers extend their `tailwind.config.cjs` with the preset:

```js
// tailwind.config.cjs
module.exports = {
  presets: [require("@livinity/design-tokens/tailwind.preset.cjs")],
  content: [
    "./src/**/*.{ts,tsx,jsx,js,html}",
  ],
  // ...
};
```

Then in `index.css` / `globals.css`:

```css
@import "@livinity/design-tokens/tokens.css";
@import "@livinity/design-tokens/fonts.css"; /* available from Plan 116-02 */

@tailwind base;
@tailwind components;
@tailwind utilities;
```

In components:

```tsx
// Tokens via Tailwind utility classes:
<button className="bg-accent-blue text-white rounded-dash shadow-card duration-dash">
  Click
</button>

// Tokens via raw CSS variable (if preferred):
<button style={{ background: "var(--accent-blue)" }}>Click</button>
```

## Tailwind 4 Migration Note

When consumers migrate to Tailwind 4 (CSS-first config via `@theme inline`), this `tailwind.preset.cjs` will be deprecated. The CSS variables in `tokens.css` remain the single source of truth; the Tailwind 4 consumer will reference them directly via:

```css
@import "@livinity/design-tokens/tokens.css";

@theme inline {
  --color-accent-blue: var(--accent-blue);
  --color-card-bg: var(--card-bg);
  /* ... */
}
```

`@livinity/design-tokens` v2.x will likely deprecate the `.cjs` preset and document the `@theme inline` consumer pattern as canonical.

## Canonical Reference

The single source of truth is `/opt/landing/livinity.io/dashboard.html` (Server5, served at `https://livinity.io/dashboard`). Read-only. Drift from this file is a bug per **D-116-LOCK-CANONICAL**.

Phase 115 inventory: `.planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md` confirms `dashboard.html` carries the full canonical token set + 3-theme support (`body.dark` 8 hits, `body.iridescent` 1 hit) + canonical class vocabulary (`.h-btn`, `.b-card.span-N`, `.hero-card`, `.status-dot`, `.cmd-box`, `.stepper`, `.pill.{ok,err,warn}`).

## v36 Tokens (additive — Livinity Design Port)

Phase 122 of the v36 LivOS Design Port adds a second `:root` block to `tokens.css` with the Livinity Design System tokens (user-authored in claude.ai/design, 2026-05-15). These tokens are **additive** — they coexist with the v35.0 canonical block above, no rename, no value change. Consumers opt in by using the new utilities or by referencing the new CSS variables directly. Master plan: `.planning/v36-DESIGN-PORT-MASTER.md`.

### New CSS variables

| Token | Value | Role |
|-------|-------|------|
| `--fg` | `#1d1d1f` | Primary text, accent (monochrome). |
| `--fg-dim` | `#424245` | Secondary text. |
| `--fg-mute` | `#6e6e73` | Tertiary text / labels. |
| `--fg-faint` | `#a1a1a6` | Disabled / hairline icons. |
| `--bg` | `#ffffff` | Page background. |
| `--bg-2` | `#f5f5f7` | Subtle surface (rails, chips, inputs). |
| `--surface` | `#fafafa` | Card on neutral. |
| `--surface-2` | `#ebebed` | Hovered tile. |
| `--line` | `rgb(0 0 0 / .08)` | Default hairline. |
| `--line-strong` | `rgb(0 0 0 / .14)` | Strong hairline. |
| `--accent` | `#1d1d1f` | Monochrome accent. |
| `--accent-soft` | `rgb(0 0 0 / .06)` | Subtle accent fill. |
| `--blue` | `#0a84ff` | Use sparingly — focus rings, links. |
| `--green-bright` | `#28c840` | Live indicator dot. |
| `--r-xs` / `--r-sm` / `--r` / `--r-md` / `--r-lg` / `--r-xl` / `--r-2xl` / `--r-full` | `6 / 8 / 12 / 14 / 18 / 22 / 28 / 999` px | v36 radius scale. |
| `--shadow-card` | aliases `--card-shadow` | Card elevation (byte-equal to v35.0 token). |
| `--shadow-window` | multi-layer | OS-window elevation. |
| `--shadow-pop` | `0 12px 30px -16px rgb(0 0 0 / .18)` | Popover / floating elements. |
| `--ease-out-v36` / `--ease-in-out-v36` | `cubic-bezier(.2, .7, .2, 1)` / `cubic-bezier(.4, 0, .2, 1)` | Canonical easing. |
| `--sans` / `--mono` / `--serif` | system stack / alias `--font-mono` / alias `--font-serif` | Type stack. No new `@font-face` declarations. |

### New Tailwind utilities

The `tailwind.preset.cjs` ships a deliberately-narrow set of additive utility classes — only those that don't collide with existing Tailwind 3.x semantics:

| Class | Maps to | Notes |
|-------|---------|-------|
| `bg-fg` / `text-fg` / `border-fg` | `--fg` | Primary text/accent on white. |
| `bg-fg-dim` / `text-fg-dim` | `--fg-dim` | Secondary text. |
| `bg-fg-mute` / `text-fg-mute` | `--fg-mute` | Labels. |
| `bg-fg-faint` / `text-fg-faint` | `--fg-faint` | Disabled. |
| `bg-surface` / `bg-surface-2` | `--surface` / `--surface-2` | Card / hovered tile. |
| `border-line` / `border-line-strong` | `--line` / `--line-strong` | Hairlines. |
| `shadow-window-soft` | `--shadow-window` | OS-window elevation. |
| `shadow-pop` | `--shadow-pop` | Popover elevation. |
| `ease-out-v36` / `ease-in-out-v36` | the cubic-bezier curves | Apply via `transition-timing-function`. |

### Deliberately NOT exposed as Tailwind utilities (Phase 122 deviation)

These design tokens are **only** addressable via the raw CSS variable (e.g. `rounded-[var(--r-lg)]`):

- **`--r-xs` / `--r-sm` / `--r-md` / `--r-lg` / `--r-xl` / `--r-2xl`** — Adding these as `borderRadius` preset keys would generate Tailwind classes like `rounded-r-lg`, which **already exists** in Tailwind 3.x as the directional alias for `rounded-{side}-{size}` ("rounded right side with size lg"). The existing call-site `livos/packages/ui/src/features/files/components/sidebar/sidebar-network-storage.tsx` uses `rounded-r-lg` in the directional sense (8px right-only); adding the v36 18px alias would silently re-resolve it to 18px all-sides. The existing `"dash": "18px"` preset key already covers the most-common 18px case via `rounded-dash`.
- **`--bg` / `--bg-2`** — `bg-bg` reads weirdly. Consumers use `bg-[var(--bg)]`.
- **`--accent` / `--accent-soft`** — Reserved by Radix UI's theme system; collision risk with downstream UI plugins. Consumers use `bg-[var(--accent)]`.
- **fontFamily — no new entries** — the existing `serif` already maps to Instrument Serif (Phase 116). The v36 design system's editorial italic accents use `font-serif italic` as-is.

### Migration guide

v36 components should prefer the new tokens. The legacy `--accent-blue` / `--dash-line` / `--card-bg` tokens stay live and unchanged through v36; a v37 cleanup pass will retire them where the monochrome design system demands.

| Legacy | v36 equivalent | When to migrate |
|--------|----------------|-----------------|
| `bg-accent-blue` | `bg-fg` (monochrome black) | When the component is being ported to the new design language (Phases 123-129). |
| `border-dash-line` | `border-line` | Same migration point. |
| `bg-card-bg` | `bg-[var(--bg)]` | Page-level background. |
| `bg-card-bg-2` | `bg-surface` or `bg-[var(--bg-2)]` | Card / chip surface. |
| `shadow-card` | unchanged — both names work | The v36 `--shadow-card` aliases the v35.0 `--card-shadow`. |
| `rounded-dash` | unchanged — both work | `dash` and `--r-lg` are both `18px`. |
| `duration-dash` (180ms) | unchanged — keep | The v36 design system doesn't override the duration scale. |

### Roadmap reference

Phases 123-129 incrementally migrate consumer files (button → section-head → field-card → plan-card → stat-tile → app-tile → chat-bubble) to these tokens. See `.planning/v36-DESIGN-PORT-MASTER.md` for the per-phase scope and `.planning/phases/12X-*/12X-PLAN.md` for the detailed plan of each phase.

## Changelog

### 1.0.0 — 2026-05-14 — Initial release (Phase 116-01)

- `:root` block (light theme) shipped verbatim from canonical sources.
- `body.dark` + `body.iridescent` blocks shipped as documented stubs (Server5 unreachable at fetch time — see `D-116-FOLLOW-UP-DARK` / `D-116-FOLLOW-UP-IRIDESCENT`).
- Tailwind 3.4 preset, JSON manifest, long-form spec.
- `fonts.css` + self-hosted `.woff2` bundle deferred to Plan 116-02.
- `STYLE-GUIDE.md` skeleton for Phase 121 expansion.

### 1.1.0 — 2026-05-15 — v36 LivOS Design Port additive tokens (Phase 122)

- New `:root` block in `tokens.css`: monochrome neutrals (fg/fg-dim/fg-mute/fg-faint, bg/bg-2/surface/surface-2), hairlines (line/line-strong), accent (--accent/--accent-soft/--blue/--green-bright), v36 radii scale (--r-xs..--r-2xl, --r-full), v36 shadows (--shadow-window, --shadow-pop, --shadow-card aliasing --card-shadow), v36 easing (--ease-out-v36, --ease-in-out-v36), v36 fonts (--sans system stack, --mono / --serif aliasing --font-mono / --font-serif).
- New Tailwind preset entries (safe subset): `colors.{fg, fg-dim, fg-mute, fg-faint, surface, surface-2, line, line-strong}`, `boxShadow.{window-soft, pop}`, `transitionTimingFunction.{out-v36, in-out-v36}`.
- Tailwind r-* / bg / accent / fontFamily aliases **intentionally skipped** to avoid directional / semantic / Radix collisions — see "Deliberately NOT exposed" section above.
- **No consumer file changes** in Phase 122. D-V36-ADDITIVE-ONLY upheld: all 6 v35.0 canonical tokens (--accent-blue, --dash-line, --card-shadow, --card-bg, --hero-grad, --dash-radius) byte-unchanged. Sacred SHA `f3538e1d...` preserved.
