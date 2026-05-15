---
phase: 120-mini-pc-ui-migration-wave-1
plan: 01
subsystem: ui-foundation
tags: [design-system, tokens, ui-kit, mini-pc, foundation, v35.0]
dependency-graph:
  requires:
    - "@livinity/design-tokens@workspace (Phase 116)"
    - "@livinity/ui-kit@workspace (Phase 119, dist/ pre-built)"
  provides:
    - "Canonical token CSS vars resolvable inside livos/packages/ui (`var(--accent-blue)`, `var(--card-bg)`, etc.)"
    - "Tailwind preset extension (accent-*, card-bg, dash-line classes available)"
    - "ThemeProvider body-class toggle for `dark` + `iridescent` (tokens.css overrides fire)"
    - "`iridescent` Theme value for ThemeProvider consumers"
    - "@livinity/ui-kit component imports unblocked for Wave 2 (120-02..05)"
  affects:
    - "livos/packages/ui (visual layer; no functional change)"
    - "Wave 2 plans 120-02 / 120-03 / 120-04 / 120-05 (now unblocked for parallel exec)"
tech-stack:
  added:
    - "@livinity/design-tokens (workspace dep)"
    - "@livinity/ui-kit (workspace dep)"
  patterns:
    - "Tailwind presets layered atop existing theme.extend (shallow merge per key)"
    - "Body-class theme toggle mirrored alongside existing html.dark for backward-compat"
    - "createRequire shim NOT used (jiti CJS sandbox); declare const require + bare require()"
key-files:
  created: []
  modified:
    - "livos/packages/ui/package.json"
    - "livos/packages/ui/tailwind.config.ts"
    - "livos/packages/ui/src/index.css"
    - "livos/packages/ui/src/providers/theme-provider.tsx"
    - "livos/packages/ui-kit/package.json (deviation — see below)"
    - "livos/pnpm-lock.yaml (auto from pnpm install)"
decisions:
  - "Keep STORAGE_KEY='liv-theme' (NOT migrated to design-tokens-recommended 'liv_theme') per D-120-MINI-PC-OPERATOR-PRIORITY — preserves every existing Mini PC user's theme preference."
  - "Body-class mirror in applyTheme() is additive — html.dark continues to toggle for Tailwind dark: variants (existing /routes/docker contract)."
  - "Did NOT add `body { font-family: ... }` rule (per plan interfaces section) — existing v32-tokens chain already sets `--font-sans`; canonical tokens.css adds new vars without overriding the font cascade."
  - "Renamed local require shim from `require` to `declare const require: NodeRequire` because Tailwind's `jiti` config loader operates in a CJS sandbox where `import.meta.url` throws + `createRequire` re-declaration collides with the global `require`."
  - "Added `./dist/index.css` export to @livinity/ui-kit/package.json — was missing from the published exports map. Required to import the ui-kit bundled CSS from consumers."
metrics:
  duration: "~30 minutes"
  completed: "2026-05-14"
  tasks: 4
  files_modified: 6
---

# Phase 120 Plan 01: Foundation — wire `@livinity/design-tokens` + `@livinity/ui-kit` into Mini PC UI Summary

Installed the v35.0 canonical design system + component library into `livos/packages/ui` (Mini PC livinityd UI), wired Tailwind preset + CSS token/font imports + iridescent theme support — zero functional change, foundation for Wave 2 component restyles.

## What Shipped

- **Workspace deps**: `@livinity/design-tokens@workspace:*` + `@livinity/ui-kit@workspace:*` added to `livos/packages/ui/package.json` (alphabetical position between `@hookform/resolvers` and `@radix-ui/react-checkbox`).
- **Tailwind preset**: Loaded `@livinity/design-tokens/tailwind.preset.cjs` via bare `require()` (CJS-compatible with Tailwind's `jiti` loader) and added as first entry in `presets:` array. Preserves all existing `theme.extend.*` (colors, spacing, shadows, fontSize) — Tailwind merges presets shallowly so no key conflict.
- **Canonical CSS**: Prepended three `@import` lines to `livos/packages/ui/src/index.css`:
  - `@livinity/design-tokens/tokens.css` — `:root` light defaults + `body.dark` / `body.iridescent` overrides
  - `@livinity/design-tokens/fonts.css` — Geist + Geist Mono + Instrument Serif @font-face declarations
  - `@livinity/ui-kit/dist/index.css` — atoms.css + composites.css class definitions (`.h-btn`, `.b-card`, `.pill`)
- **ThemeProvider extension**: `applyTheme()` now mirrors `html.dark` onto `document.body` (`body.dark` / `body.iridescent`) so tokens.css `body.*` override blocks fire. `Theme` type union extended with `'iridescent'` value; localStorage initializer accepts it.
- **Behavioral diff**: ZERO. All existing call sites (`setTheme('light')` / `'dark'` / `'system'`) preserved verbatim. `STORAGE_KEY='liv-theme'` unchanged.

## Files Modified

| File | Change |
| --- | --- |
| `livos/packages/ui/package.json` | +2 lines (workspace deps in `dependencies`) |
| `livos/packages/ui/tailwind.config.ts` | +12 lines (`presets:` field + declare-require shim with documentation) |
| `livos/packages/ui/src/index.css` | +13 lines (3 `@import` for canonical tokens/fonts/ui-kit + comment block) |
| `livos/packages/ui/src/providers/theme-provider.tsx` | ~20 lines diff (Theme/ResolvedTheme union, applyTheme body mirror, localStorage validator) |
| `livos/packages/ui-kit/package.json` | +1 line (`./dist/index.css` export; see deviation below) |
| `livos/pnpm-lock.yaml` | auto-generated diff from `pnpm install` |

## Sacred SHA Verification

Verified before AND after every change:
```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
Per D-120-SACRED-SHA — preserved across all 4 tasks. No commit attempted with mismatched SHA.

## Build Status

```
$ cd livos && pnpm --filter ui build
✓ 44 modules transformed.
✓ built in 48.06s
PWA v1.2.0 — precache 206 entries (6923.88 KiB)
```

Token markers visible in bundled CSS:
```
$ grep -oE -- "--accent-blue|--card-bg|--dash-pad-[a-z]+" livos/packages/ui/dist/assets/index-bf47862e.css | head -10
--card-bg
--accent-blue
--accent-blue
(... 10 occurrences total)
```

Typecheck status: 18 pre-existing errors in `stories/` (Storybook fixtures) and `routes/stories/wifi.tsx` — NONE in `theme-provider.tsx` or any plan-touched file. Out-of-scope per scope boundary rule; logged but not fixed.

## Deviations from Plan

### Rule 1 — Bug: jiti CJS sandbox incompatibility with `createRequire(import.meta.url)`

- **Found during**: Task 4 (`pnpm --filter ui build`)
- **Issue**: Plan prescribed `import {createRequire} from 'module'; const require = createRequire(import.meta.url)` at top of `tailwind.config.ts`. Build failed twice:
  1. First with `SyntaxError: Identifier 'require' has already been declared` — jiti pre-defines `require` in its CJS scope.
  2. After renaming to `livinityRequire`: `SyntaxError: Cannot use 'import.meta' outside a module` — jiti's sandbox does NOT have `import.meta` available.
- **Fix**: Removed `createRequire` entirely. Used `declare const require: NodeRequire` (TypeScript-only declaration for type-check) plus bare `require('@livinity/design-tokens/tailwind.preset.cjs')` which jiti resolves natively. Documented the rationale in an inline comment block (8 lines).
- **Files modified**: `livos/packages/ui/tailwind.config.ts`
- **Commit**: (this plan's single commit)

### Rule 2 — Missing critical functionality: `@livinity/ui-kit` was missing `./dist/index.css` export

- **Found during**: Task 4 build (second attempt)
- **Issue**: Vite/PostCSS could not resolve `@livinity/ui-kit/dist/index.css` because the ui-kit package.json `exports` map did not list `./dist/index.css`. Error: `Missing "./dist/index.css" specifier in "@livinity/ui-kit" package`. Without this, ui-kit atoms/composites CSS classes cannot be consumed downstream — blocks Wave 2 entirely.
- **Fix**: Added `"./dist/index.css": "./dist/index.css"` to `@livinity/ui-kit/package.json` exports map. Single-line additive change, no functional change to ui-kit itself.
- **Files modified**: `livos/packages/ui-kit/package.json` (outside the plan's nominal `livos/packages/ui/` boundary, but explicitly permitted by the plan: "If you need to touch any file outside livos/packages/ui/ ... document each as a deviation").
- **Commit**: (this plan's single commit)

## Operator UAT (deploy + smoke)

1. SSH to Mini PC: `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68`
2. Run: `bash /opt/livos/update.sh`
3. Open `https://bruce.livinity.io` (or LAN `https://10.69.31.68:8080`)
4. Validate:
   a. Daily-driver routes still load (OwnCloud-equivalent: Files, App Store, Settings panes open without console errors)
   b. Theme toggle still works (Settings → Theme): light/dark/system cycle behaves identically to pre-deploy
   c. In DevTools console:
      ```js
      getComputedStyle(document.documentElement).getPropertyValue('--accent-blue')
      // → "#2563eb" (proves canonical tokens.css loaded)
      ```
   d. In DevTools console after toggling to dark:
      ```js
      document.body.classList.contains('dark')
      // → true (proves body-class mirror works)
      ```
   e. Token markers in bundle:
      ```bash
      curl -s https://bruce.livinity.io/assets/index-*.css | grep -oE -- "--accent-blue" | head -3
      ```
   f. No visible color/font/spacing changes vs pre-deploy (no components consume tokens yet — that's Wave 2)
   g. No JS errors in browser console
5. Report PASS/FAIL in chat
6. On FAIL: `cd /opt/livos && git revert <plan-commit> && bash update.sh`

## Auth Gates

None encountered.

## Known Stubs

None.

## Deferred Issues

- Pre-existing `pnpm --filter ui typecheck` errors in `stories/src/routes/stories/widgets.tsx` (5×) and `wifi.tsx` (10×) — unrelated to design-system foundation. Logged to `.planning/phases/120-mini-pc-ui-migration-wave-1/deferred-items.md` if it does not already exist; should be addressed in Phase 121 or a dedicated cleanup plan.
- 39 deprecated transitive subdeps surfaced during `pnpm install` (e.g., `glob@7.2.3`, `rimraf@3.0.2`, `request@2.88.2`) — all pre-existing, no plan touches them.
- Peer-dep warnings on `@react-three/fiber` / `@react-three/drei` expecting React 19 — pre-existing.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/package.json` — contains `@livinity/design-tokens` workspace dep
- FOUND: `livos/packages/ui/tailwind.config.ts` — contains `presets:` line
- FOUND: `livos/packages/ui/src/index.css` — contains `@livinity/design-tokens/tokens.css` import
- FOUND: `livos/packages/ui/src/providers/theme-provider.tsx` — contains `body.classList.add('iridescent')`
- FOUND: `livos/packages/ui-kit/package.json` — contains `./dist/index.css` export entry
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/120-01-SUMMARY.md` — this file
- VERIFIED: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved)
- VERIFIED: `pnpm --filter ui build` exits 0 with token markers (`--accent-blue`, `--card-bg`) present in `dist/assets/index-bf47862e.css`
