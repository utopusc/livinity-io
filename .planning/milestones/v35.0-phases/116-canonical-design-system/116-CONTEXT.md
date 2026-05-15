# Phase 116 — Canonical Design System Spec — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Awaits Phase 115 to complete (depends on inventory + baseline screenshots).

## Phase intent

Codify the `dashboard.html` aesthetic into a portable, version-controlled spec — a single source of truth that every surface consumes. After this phase, "what color is the primary button?" has exactly one answer, in exactly one file, that every surface imports.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 116 + § What "the dashboard.html aesthetic" actually means
- Canonical reference file (DO NOT EDIT during this phase): `/opt/landing/livinity.io/dashboard.html` lines 27-80 (CSS variables block) and the full body classes/animations

## What this phase ships

| File | Content |
|---|---|
| `DESIGN-SYSTEM.md` | Long-form spec: typography scale, color tokens (light/dark/iridescent), spacing, radius, shadow, motion curves, accessibility tokens (focus rings, contrast targets), interaction patterns (hover lift, transition timing) |
| `livos/packages/design-tokens/tokens.css` | Pure CSS file with `:root` + `body.dark` + `body.iridescent` blocks. Importable by any HTML page or built bundle. |
| `livos/packages/design-tokens/tailwind.preset.cjs` | Tailwind preset that maps the same tokens to Tailwind theme colors / spacing scale. Vite + Next.js consume this. |
| `livos/packages/design-tokens/theme.json` | JSON manifest for tooling (Storybook, Figma plugin, future design tools) |
| `livos/packages/design-tokens/fonts.css` | Geist + Geist Mono + Instrument Serif font-face declarations. Includes Google Fonts CDN link AND self-hosted woff2 fallback for offline LivOS deploys. |
| `livos/packages/design-tokens/package.json` | npm package metadata, version `1.0.0`, exports map for ESM + CSS |
| `livos/packages/design-tokens/STYLE-GUIDE.md` (skeleton) | Stub for future Phase 121 expansion — "How to add a new component to LivOS UI" |
| Git tag | `v35.0-design-tokens-1.0.0` after Plan 116-02 ships |

## Locked decisions

| ID | Decision |
|----|----------|
| **D-116-LOCK-CANONICAL** | Tokens map exactly to dashboard.html's current shipped values (snapshot 2026-05-14). No improvisation, no "while we're here let's tweak the blue." Drift from canonical = bug. |
| **D-116-NEW-PACKAGE-IN-LIVOS** | The package lives in `livos/packages/design-tokens/`. Same monorepo, accessible to UI + livinityd if needed. Server5 + landing consume via npm install (Server5 will set up its own package.json reference). |
| **D-116-SELF-HOSTED-FONT-FALLBACK** | LivOS Mini PC deployments may run offline (no internet). Font files MUST be self-hostable — bundle .woff2 in the package + provide local @font-face block as fallback to Google Fonts CDN. |
| **D-116-NO-CONSUMER-CHANGES** | This phase ships the package standalone. No consumer migration yet (that's Phase 117/118/120). |

## Plans

- **116-01** — Spec + tokens.css + tailwind.preset.cjs + theme.json + package.json (writer-style agent — extracts dashboard.html values, formats as portable spec)
- **116-02** — fonts.css with self-hosted .woff2 fallback + visual smoke test (paint a canvas with each font, assert it renders, document license attribution for self-hosted Geist)

## Open questions for discuss-phase

- Self-hosting Geist requires a license check (Geist is open source, MIT-ish, but bundling needs attribution). Operator OK with that?
- Iridescent theme tokens — dashboard.html has them but they're rarely used. Include in v1 or defer to v1.1?
- Spacing scale — dashboard.html uses inline `28px`, `18px`, `8px`, `16px`, `24px` etc. Codify as `--space-{xs,sm,md,lg,xl}` (5 tokens) vs preserve as exact pixel literals (no scale)? Master plan implies 5-token scale; confirm.
- Should we include Tailwind v3 OR v4 preset (Server5 is on Tailwind 4-ish, Mini PC livinityd is on 3.4)? Probably both, with a default and a v4-shaped variant.

## What this phase does NOT do

- Migrate any consumer (Phase 117+)
- Build the component library (Phase 119)
- Write Storybook stories (Phase 119)
- Modify dashboard.html (D-116-LOCK-CANONICAL — dashboard.html is read-only canonical)
