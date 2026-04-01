---
phase: 37-pwa-foundation
plan: 01
subsystem: ui
tags: [pwa, vite-plugin-pwa, workbox, service-worker, manifest, apple-meta-tags, ios, android]

# Dependency graph
requires: []
provides:
  - PWA manifest generation via VitePWA plugin (name, icons, theme_color, start_url, scope)
  - Service worker with workbox precaching and runtime caching
  - Apple PWA meta tags for iOS standalone mode
  - viewport-fit=cover for edge-to-edge rendering on notched devices
  - navigateFallbackDenylist for /trpc, /api, /ws routes
affects: [37-02-PLAN, 38-mobile-app-grid, 40-mobile-polish]

# Tech tracking
tech-stack:
  added: [vite-plugin-pwa, workbox]
  patterns: [VitePWA plugin in vite.config.ts, Apple meta tags in index.html]

key-files:
  created: []
  modified:
    - livos/packages/ui/vite.config.ts
    - livos/packages/ui/index.html
    - livos/packages/ui/package.json
    - livos/packages/ui/.gitignore

key-decisions:
  - "registerType autoUpdate -- auto-updates without user prompt (dashboard app, not content)"
  - "navigateFallbackDenylist for /trpc, /api, /ws -- network routes must never serve cached HTML"
  - "CacheFirst for wallpapers and figma-exports -- static assets with long TTL"
  - "black-translucent status bar style -- blends with app background on iOS"
  - "theme_color #f8f9fc -- matches existing body background and meta tag"

patterns-established:
  - "VitePWA plugin configuration pattern in vite.config.ts"
  - "Apple PWA meta tags pattern in index.html head"

requirements-completed: [PWA-01, PWA-02, PWA-03, PWA-04]

# Metrics
duration: 3min
completed: 2026-04-01
---

# Phase 37 Plan 01: PWA Foundation Summary

**VitePWA plugin with manifest generation, workbox service worker (precache + runtime cache), and Apple iOS standalone meta tags**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T16:27:43Z
- **Completed:** 2026-04-01T16:31:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed and configured vite-plugin-pwa with full manifest (name, icons, theme_color, start_url, scope, id, orientation)
- Configured workbox service worker with app shell precaching, navigateFallbackDenylist for API routes, and runtime caching for wallpapers/icons
- Added all three Apple PWA meta tags (capable, status-bar-style, title) for iOS standalone mode
- Added viewport-fit=cover for edge-to-edge rendering on notched iOS devices
- Removed old static site.webmanifest (replaced by VitePWA-generated manifest)
- Build verified: produces manifest.webmanifest, sw.js, workbox runtime, and registerSW.js with 184 precache entries

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vite-plugin-pwa and configure PWA manifest + service worker** - `23add5a` (feat)
2. **Task 2: Add Apple PWA meta tags and viewport-fit=cover to index.html** - `305672f` (feat)

## Files Created/Modified
- `livos/packages/ui/vite.config.ts` - Added VitePWA plugin with manifest and workbox configuration
- `livos/packages/ui/index.html` - Added viewport-fit=cover, Apple PWA meta tags, removed old manifest link
- `livos/packages/ui/package.json` - Added vite-plugin-pwa devDependency
- `livos/packages/ui/.gitignore` - Added dev-dist directory
- `livos/packages/ui/public/site.webmanifest` - Deleted (replaced by VitePWA generated manifest)

## Decisions Made
- Used `registerType: 'autoUpdate'` for seamless background updates (Livinity is a dashboard, not a content app where users need to approve updates)
- Configured `navigateFallbackDenylist` for `/trpc`, `/api`, `/ws` to prevent service worker from intercepting API and WebSocket routes
- Used `CacheFirst` strategy for wallpapers and figma-exports (static assets with 30-day TTL)
- Set `black-translucent` status bar style to blend with the app's light background on iOS
- Reused existing `android-chrome-512x512.png` as maskable icon (avoids creating a new asset)
- Set `theme_color: '#f8f9fc'` to match existing meta tag and body background (fixes old manifest's #000000)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pnpm postinstall script (`copy-tabler-icons`) fails on Windows due to shell incompatibility -- resolved by using `--ignore-scripts` flag. This is a pre-existing issue unrelated to PWA changes.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all configuration is complete and functional.

## Next Phase Readiness
- PWA foundation is complete: manifest + service worker + Apple meta tags all verified via production build
- Phase 37 Plan 02 (safe area CSS) can proceed -- viewport-fit=cover is already set in index.html
- Phase 38 (mobile app grid) can build on the PWA installability established here
- Real-device testing on iOS Safari and Android Chrome recommended after deployment

## Self-Check: PASSED

- [x] 37-01-SUMMARY.md exists
- [x] vite.config.ts exists with VitePWA config
- [x] index.html exists with Apple meta tags
- [x] site.webmanifest deleted
- [x] Commit 23add5a found (Task 1)
- [x] Commit 305672f found (Task 2)
- [x] Build produces manifest.webmanifest + sw.js

---
*Phase: 37-pwa-foundation*
*Completed: 2026-04-01*
