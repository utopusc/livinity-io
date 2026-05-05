# Phase 80 — Foundation: Design Tokens + Geist Fonts + Theme Toggle Infra

**Milestone:** v32 AI Chat Ground-up Rewrite
**Wave:** 1 (file-disjoint, paralel P85-schema + P87)
**Effort:** ~8h
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (post-P77 baseline; this phase touches NO `liv/packages/core/` files)

## Goal

Establish the foundation for all v32 UI phases: OKLCH design tokens that match Suna's `globals.css` verbatim (light + dark theme), Geist Sans/Mono fonts, Tailwind config extension, ThemeProvider + useTheme hook, and a `/playground/v32-theme` preview route to visually validate before P81+ build on it.

## Requirements (V32-FOUND-01..05)

- **V32-FOUND-01** — `livos/packages/ui/src/styles/v32-tokens.css` exists with OKLCH color tokens for `:root` (light) and `.dark` (dark), values verbatim from Suna `frontend/src/app/globals.css` lines 227-296. Tokens covered: background, foreground, primary, muted, muted-foreground, border, accent, sidebar, sidebar-foreground, card, card-foreground, destructive, ring.
- **V32-FOUND-02** — `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` installed in `livos/packages/ui/package.json`. Imported in main entry (`livos/packages/ui/src/main.tsx`).
- **V32-FOUND-03** — `livos/packages/ui/tailwind.config.js` extended: `fontFamily.sans = ['Geist Variable', 'system-ui', ...]`, `fontFamily.mono = ['Geist Mono Variable', 'monospace']`, color binding to OKLCH custom properties via `--liv-*` references.
- **V32-FOUND-04** — `livos/packages/ui/src/providers/theme-provider.tsx` implements ThemeProvider that:
  - Reads `localStorage.getItem('liv-theme')` ('light' | 'dark' | 'system')
  - Falls back to system preference via `matchMedia('(prefers-color-scheme: dark)')`
  - Toggles `<html class="dark">` accordingly
  - Subscribes to system theme changes
  - Exposes `useTheme()` hook returning `{theme, setTheme, resolvedTheme}`
- **V32-FOUND-05** — `/playground/v32-theme` route renders a side-by-side preview: every primitive (Button, Card, Badge, Input, Switch) in both themes, color swatches, typography scale (text-xs → text-2xl), tool pill mock, side panel mock. Used for visual QA during phases 81-89.

## Files Affected

**Created:**
- `livos/packages/ui/src/styles/v32-tokens.css`
- `livos/packages/ui/src/providers/theme-provider.tsx`
- `livos/packages/ui/src/hooks/use-theme.ts`
- `livos/packages/ui/src/routes/playground/v32-theme.tsx`

**Modified:**
- `livos/packages/ui/package.json` (add 2 fontsource deps)
- `livos/packages/ui/src/main.tsx` (import fontsource + theme css + wrap with ThemeProvider)
- `livos/packages/ui/tailwind.config.js` (extend fontFamily + colors)
- `livos/packages/ui/src/router.tsx` (add `/playground/v32-theme` route, lazy-loaded)

## Sacred / Constraint Notes

- **No core/backend changes** — pure UI/build infra
- **No existing route changes** — all new components live in v32 namespace; `/ai-chat` still uses old tokens
- **D-NO-BREAKING** — existing dark theme MUST keep working (don't replace existing tokens, ADD v32-tokens.css alongside)

## Verification

- [ ] `pnpm --filter ui build` exits 0
- [ ] `pnpm --filter ui dev` runs, `/playground/v32-theme` renders both themes side-by-side
- [ ] Theme toggle persists across page reload via localStorage
- [ ] System default detection: `<html>` class follows OS theme when `liv-theme=system`
- [ ] No regression on existing `/ai-chat` (still renders correctly with old tokens)
- [ ] Sacred SHA `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d...`

## Reference (Suna verbatim)

`globals.css` lines 227-296 — copy OKLCH values:
```css
:root {
  --background: oklch(98.46% 0.002 247.84);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --sidebar: oklch(98.46% 0.002 247.84);
  --sidebar-foreground: oklch(0.145 0 0);
  --accent: oklch(0.97 0 0);
  /* ... full set ... */
}
.dark {
  --background: oklch(0.185 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  /* ... full set ... */
}
```

Local Suna ref: `C:/Users/hello/Desktop/Projects/contabo/suna-reference/frontend/src/app/globals.css`
