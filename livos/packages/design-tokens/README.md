# @livinity/design-tokens

Canonical LivOS design system tokens. Single source of truth for the dashboard.html aesthetic.

**Snapshot:** 2026-05-14 (Phase 116, v35.0 milestone)

## Install

Inside the `livos/` monorepo (linked via pnpm workspace):

```ts
// tokens.css — import in any HTML/CSS bundle
@import "@livinity/design-tokens/tokens.css";
@import "@livinity/design-tokens/fonts.css";

// tailwind.preset.cjs — extend any Tailwind config
module.exports = {
  presets: [require("@livinity/design-tokens/tailwind.preset.cjs")],
  // ...
};

// theme.json — read from any tooling
import tokens from "@livinity/design-tokens";
```

## Files

- `tokens.css` — CSS custom properties for `:root`, `body.dark`, `body.iridescent`
- `tailwind.preset.cjs` — Tailwind 3.4 preset (4.x variant noted in DESIGN-SYSTEM.md)
- `theme.json` — JSON manifest for tooling
- `fonts.css` — `@font-face` declarations (Geist, Geist Mono, Instrument Serif) — ships in Plan 116-02
- `fonts/` — Self-hosted `.woff2` files (offline fallback) — ships in Plan 116-02
- `DESIGN-SYSTEM.md` — Long-form spec
- `STYLE-GUIDE.md` — Component contribution guide (skeleton, expanded in Phase 121)
- `LICENSE-FONTS.md` — Font license attribution — ships in Plan 116-02

## Canonical reference

`/opt/landing/livinity.io/dashboard.html` on Server5 (read-only). Drift from this file is a bug per D-116-LOCK-CANONICAL.

## Versioning

This package versions independently of the LivOS monorepo. Token spec changes follow semver:

- **MAJOR** — Token rename or removal (consumer-breaking).
- **MINOR** — New token added.
- **PATCH** — Value adjustment within a token (e.g., shadow tweak), documentation, fixes.

Current: `1.0.0` (Plan 116-01 initial release).

## See also

- `.planning/phases/116-canonical-design-system/116-01-PLAN.md` — this package's authoring plan
- `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` — the design system unification milestone
