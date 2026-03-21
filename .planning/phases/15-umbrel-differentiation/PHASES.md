# Umbrel Differentiation — Execution Plan

## Phase 15.1: Rewrite 100% Identical Utility Files
- `utils/tw.ts` — rewrite with different implementation
- `utils/pretty-bytes.ts` — rewrite with different algorithm
- `modules/desktop/greeting-message.ts` — completely different greeting logic
- `hooks/use-is-mobile.ts` — different detection approach
- CSS `@keyframes` in index.css — different animation values

## Phase 15.2: Differentiate 85-95% Similar Utils & Hooks
- `utils/search.ts` — different Fuse config, rename functions
- `utils/dialog.ts` — different constants, rename exports
- `utils/misc.ts` — restructure, remove verbatim JSDoc comments
- `hooks/use-launch-app.ts` — rewrite JSDoc, restructure logic

## Phase 15.3: Differentiate Components
- `components/app-icon.tsx` — different structure, different CSS
- `components/cmdk.tsx` — remove verbatim TODO comments, restructure
- `components/darken-layer.tsx` — different overlay approach
- `components/markdown.tsx` — different config
- `components/ui/cover-message.tsx` — different pattern
- `components/ui/button.tsx` — different variant system

## Phase 15.4: Differentiate Desktop Module Code
- `modules/desktop/dock.tsx` — different animation constants, remove verbatim comments
- `modules/desktop/dock-item.tsx` — different spring physics values
- `modules/desktop/blur-below-dock.tsx` — different mask values
- `modules/desktop/app-icon.tsx` — different label logic structure
- `modules/desktop/header.tsx` — already different, verify
- `modules/desktop/desktop-content.tsx` — different animation variants

## Phase 15.5: Differentiate App Grid Constants
- `modules/desktop/app-grid/paginator.tsx` — different hook structure
- `modules/desktop/app-grid/app-pagination-utils.tsx` — different numeric constants
- `modules/desktop/app-grid/app-grid.tsx` — different CSS class names

## Phase 15.6: Differentiate Providers
- `providers/apps.tsx` — restructure, different type names
- `providers/wallpaper.tsx` — already different (animated), verify
- `providers/confirmation/` — verify differences

## Phase 15.7: Differentiate Layouts
- `layouts/desktop.tsx` — different structure
- `layouts/bare/shared.tsx` — already different, verify
- `layouts/sheet.tsx` — different approach

## Phase 15.8: Differentiate Routes/Settings
- `routes/settings/_components/` — restructure
- `routes/factory-reset/` — different component names
- `routes/login/` — verify differences

## Phase 15.9: Rename Directories & Clean CSS Classes
- Rename `umbrel-*` CSS class prefixes to `liv-*`
- Rename matching directory structures where possible
- Clean up any remaining verbatim comments

## Phase 15.10: Differentiate Features (Files, Backups)
- Verify all renamed files are actually different
- Change shared utility patterns in features/

## Phase 15.11: Final Verification & Build
- Build UI
- Deploy to mini PC
- Chrome DevTools test
- Push to GitHub
