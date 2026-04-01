# Phase 37: PWA Foundation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Livinity installable as a standalone PWA on iOS and Android. Covers manifest configuration, service worker, Apple meta tags, viewport-fit=cover, and safe area CSS utilities. No UI component changes — purely configuration and CSS foundation.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key guidance from research:
- Use vite-plugin-pwa with generateSW strategy (not injectManifest)
- Add navigateFallbackDenylist for /trpc, /api, /ws paths
- Apple meta tags: apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-style (black-translucent)
- viewport-fit=cover in existing viewport meta tag
- theme_color must match between manifest and meta tag (#f8f9fc, not #000000)
- Use tailwindcss-safe-area plugin for safe area utilities (pt-safe, pb-safe)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/public/site.webmanifest` — exists but missing start_url, scope, id
- `livos/packages/ui/index.html` — already has manifest link and apple-touch-icon
- `livos/packages/ui/public/favicon/` — has android-chrome-192x192.png and android-chrome-512x512.png
- `livos/packages/ui/vite.config.ts` — Vite 4 config, no PWA plugin yet

### Established Patterns
- Tailwind CSS via `tailwind.config.ts`
- PostCSS pipeline in place
- Theme color currently #f8f9fc in meta tag but #000000 in manifest (conflict)

### Integration Points
- `vite.config.ts` — add VitePWA plugin
- `index.html` — add Apple meta tags, update viewport
- `tailwind.config.ts` — add tailwindcss-safe-area plugin
- `src/index.css` — safe area utility classes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
