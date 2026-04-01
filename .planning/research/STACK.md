# Technology Stack: v23.0 Mobile PWA

**Project:** Livinity v23.0 -- Mobile PWA Experience
**Researched:** 2026-04-01
**Overall confidence:** HIGH (verified against package.json, Vite config, and official docs)

## Executive Summary

Livinity already has most of the foundation needed for PWA. The existing `site.webmanifest` declares `display: standalone` and Android Chrome icons. The `useIsMobile()` hook, `SheetLayout`, and `WindowsContainer` (returns null on mobile) provide branching points. What is MISSING: a service worker, proper Apple meta tags, iOS splash screens, safe-area CSS handling, and the `viewport-fit=cover` meta tag that enables edge-to-edge rendering on notched devices.

The approach is minimalist: add only what is needed for installability and native feel. No new frameworks, no heavy abstractions. The existing Vite 4 + React 18 + Tailwind 3.4 + framer-motion stack handles everything with targeted additions.

---

## Recommended Stack Additions

### PWA Core: vite-plugin-pwa

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vite-plugin-pwa` | `^1.2.0` | Service worker generation, manifest injection, install prompt handling | Zero-config PWA plugin for Vite. v1.2.0 peerDep explicitly supports `vite ^3.1.0 \|\| ^4.0.0 \|\| ^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0`. Uses Workbox 7.4+ internally via `generateSW` strategy. Eliminates hand-writing service worker boilerplate. |

**Why vite-plugin-pwa over manual service worker:**
- Generates Workbox-based service worker at build time with precache manifest
- Handles manifest.webmanifest generation from vite config (replaces manual `site.webmanifest`)
- Provides `registerSW` virtual module for React integration (update prompts, offline detection)
- The `generateSW` strategy is correct for Livinity because the app is a SPA with API calls -- we want to cache the shell, not intercept API routes

**Why NOT injectManifest strategy:**
Livinity does not need custom service worker logic. No offline-first data, no background sync, no push notifications (yet). `generateSW` produces the correct cache-first-for-assets + network-first-for-API behavior out of the box.

**Confidence:** HIGH -- peerDependencies verified from GitHub main branch package.json (Vite 4 explicitly listed)

### Safe Area CSS: tailwindcss-safe-area

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `tailwindcss-safe-area` | `0.8.0` | Tailwind utilities for `env(safe-area-inset-*)` | Provides `pt-safe`, `pb-safe`, `px-safe`, `h-screen-safe`, `inset-safe`, etc. Version 0.8.0 is the Tailwind CSS v3-compatible release (v1.3.0 is for Tailwind v4 only). 91k+ weekly downloads, actively maintained. |

**Why a plugin over manual CSS:**
- Provides composable Tailwind utilities (`pb-safe`, `pt-safe-offset-4`) that work with responsive variants (`md:pb-0`)
- Handles the fallback math (`max(env(safe-area-inset-bottom), 1rem)` via `-or-` variants)
- Keeps safe area logic in markup rather than scattered CSS files
- Already the ecosystem standard (see: Capacitor/Ionic projects, NativeWind)

**Why NOT manual `env()` in index.css:**
Manual CSS variables work but create a parallel styling system outside Tailwind. When you need `pb-safe` only on mobile but `pb-4` on desktop, plugin utilities compose with breakpoint variants naturally: `pb-safe lg:pb-4`.

**Confidence:** HIGH -- verified v0.8.0 targets Tailwind v3 explicitly, v1.3.0 for v4

### PWA Asset Generation: pwa-asset-generator (dev/build tool)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pwa-asset-generator` | `^6.3.2` | One-command generation of iOS splash screens, maskable icons, favicon variants | Puppeteer-based tool that scrapes Apple HIG specs for correct device dimensions. Generates all ~25 iOS splash screen variants (portrait/landscape per device), maskable icons, and the `<link>` tags needed in HTML. Run once during setup, not a runtime dependency. |

**Why this over @vite-pwa/assets-generator:**
- `pwa-asset-generator` generates iOS-specific `apple-touch-startup-image` link tags with correct `media` queries (device-width/height/pixel-ratio combinations). The `@vite-pwa/assets-generator` focuses more on icons than iOS splash screens.
- Produces the exact HTML to paste into `index.html` -- no guessing at media queries
- Can be run as a one-shot script during asset preparation, no ongoing dependency

**Alternative considered:** `@vite-pwa/assets-generator` (^0.2.6) -- better integration with vite-plugin-pwa but less iOS splash screen coverage. Use it if splash screens are deprioritized.

**Confidence:** MEDIUM -- pwa-asset-generator maintained but Puppeteer-dependent; may need manual verification of generated media queries against current iOS device list

---

## No New Dependencies Needed (Use What Exists)

### Page Transitions: framer-motion (already installed)

| Technology | Installed Version | Purpose | Notes |
|------------|-------------------|---------|-------|
| `framer-motion` | `10.16.4` | Slide/fade transitions between mobile app views | `AnimatePresence` already used in 35+ files. Route transitions use `AnimatePresence` + `motion.div` with `initial`/`animate`/`exit` variants. No upgrade needed -- v10 has full AnimatePresence support. |

**Pattern for mobile page transitions:**
```tsx
// Wrap route outlet with AnimatePresence
<AnimatePresence mode="wait" initial={false}>
  <motion.div
    key={location.pathname}
    initial={{ x: '100%', opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: '-30%', opacity: 0 }}
    transition={{ type: 'tween', duration: 0.25 }}
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

**Why NOT react-transition-group, react-spring, or motion (v12):**
- framer-motion is already deeply embedded (52 import sites)
- AnimatePresence handles mount/unmount animations which is exactly what route transitions need
- No benefit to adding a second animation library
- The `motion` v12 package in package.json appears unused (0 imports from `"motion"`)

### Mobile Detection: useIsMobile() (already exists)

| Technology | Location | Purpose | Notes |
|------------|----------|---------|-------|
| `useIsMobile()` | `src/hooks/use-is-mobile.ts` | Viewport-based mobile detection | Uses `react-use` `createBreakpoint` with `< 1024px` threshold. Already used in 30+ components including WindowsContainer, Dock, and various layouts. |

**Enhancement needed (not a new dep):**
Add a `useIsStandalone()` hook to detect PWA standalone mode:
```tsx
export function useIsStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true  // Safari iOS
}
```
This distinguishes "mobile browser" from "installed PWA" for cases where behavior should differ (e.g., showing install prompt in browser but not in standalone).

### Route-Based Navigation: react-router-dom (already installed)

| Technology | Installed Version | Purpose | Notes |
|------------|-------------------|---------|-------|
| `react-router-dom` | `6.17.0` | Mobile navigation via URL routes | SheetLayout already uses route-based navigation. Mobile full-screen apps will use the same router with different layout wrapping. No upgrade needed. |

### Bottom Sheet / Drawer: vaul (already installed)

| Technology | Installed Version | Purpose | Notes |
|------------|-------------------|---------|-------|
| `vaul` | `^0.9.0` | Mobile bottom sheet interactions (settings panels, context menus) | Already in the dependency tree. Provides iOS-style drag-to-dismiss sheet behavior. Use for mobile settings, share sheets, context actions. |

---

## HTML Meta Tags Required (No Dependencies)

These go directly into `index.html`. Not libraries -- just markup.

### Viewport (MODIFY existing)

```html
<!-- CURRENT -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />

<!-- CHANGE TO -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
```

`viewport-fit=cover` is CRITICAL. Without it, iOS will not extend the app behind the notch/home indicator, and `env(safe-area-inset-*)` values will all return 0. This single addition unlocks safe area handling.

### Apple PWA Meta Tags (ADD)

```html
<!-- Declare as standalone web app (iOS) -->
<meta name="apple-mobile-web-app-capable" content="yes" />

<!-- Status bar: black-translucent renders behind the status bar, allowing edge-to-edge -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

<!-- App title on home screen -->
<meta name="apple-mobile-web-app-title" content="Livinity" />

<!-- iOS does NOT read manifest icons -- must use this link tag -->
<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
```

**Why `black-translucent` and not `default`:**
- `default` = white status bar with black text. Creates a visible white bar at top.
- `black-translucent` = transparent status bar with white text. App content extends behind it. This is what native iOS apps do. Combined with `viewport-fit=cover` + `padding-top: env(safe-area-inset-top)`, the app renders edge-to-edge like a native app.

### Theme Color (KEEP existing)

```html
<!-- CURRENT (keep as-is) -->
<meta name="theme-color" content="#f8f9fc" />
```

The existing `#f8f9fc` is correct -- it matches the app's light theme background. This controls Android Chrome address bar color and iOS status bar tint.

**Confidence:** HIGH -- Apple's meta tag documentation is stable and well-documented

---

## Manifest Configuration (via vite-plugin-pwa)

The existing `public/site.webmanifest` will be REPLACED by vite-plugin-pwa's generated manifest. Configure in `vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon/favicon.ico', 'favicon/apple-touch-icon.png'],
      manifest: {
        name: 'Livinity',
        short_name: 'Livinity',
        description: 'Self-hosted AI server platform',
        theme_color: '#f8f9fc',
        background_color: '#f8f9fc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/favicon/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/favicon/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/trpc/, /^\/api/],
        runtimeCaching: [
          {
            urlPattern: /\/wallpapers\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wallpapers',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/figma-exports\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-icons',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
```

**Key decisions:**
- `registerType: 'autoUpdate'` -- no "update available" toast needed. When a new SW activates, it takes over immediately. Livinity is a dashboard, not a content app; stale cached shells are fine to auto-replace.
- `navigateFallbackDenylist` excludes `/trpc` and `/api` from SW interception -- tRPC calls MUST hit the network, never serve cached HTML.
- `globPatterns` includes `woff2` for fonts but NOT `jpg/png` (wallpapers are large; use runtime caching instead).
- Maskable icon reuses the 512x512 Android Chrome icon. A proper maskable icon (with safe zone padding) should be generated if the source icon has content near edges.

**Confidence:** HIGH -- vite-plugin-pwa docs explicitly cover this pattern for React SPA

---

## CSS Additions (No Dependencies)

### Safe Area CSS Variables

Add to `src/index.css`:

```css
/* Safe area insets -- applied globally when viewport-fit=cover is set */
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
}
```

These CSS variables provide a fallback layer. The `tailwindcss-safe-area` plugin utilities are preferred in markup, but raw CSS variables are useful for one-off calculations in component styles.

### Standalone Detection CSS

```css
/* Apply only when running as installed PWA */
@media (display-mode: standalone) {
  html {
    --sheet-top: 0vh;
  }
}
```

---

## Tailwind Config Addition

Add `tailwindcss-safe-area` plugin to `tailwind.config.ts`:

```ts
import tailwindSafeArea from 'tailwindcss-safe-area'

export default {
  // ... existing config
  plugins: [
    tailwindCssAnimate,
    tailwindContainerQueries,
    tailwindTypography,
    utilPlugin,
    tailwindRadix({variantPrefix: 'radix'}),
    tailwindSafeArea,  // ADD
  ],
}
```

This enables utilities like:
- `pt-safe` -- padding-top equal to safe-area-inset-top
- `pb-safe` -- padding-bottom equal to safe-area-inset-bottom
- `h-screen-safe` -- 100vh minus top and bottom safe areas
- `pb-safe-offset-2` -- safe-area-inset-bottom + 0.5rem

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| **Capacitor / Ionic** | Massive overhead for a web app that only needs PWA installability. Capacitor wraps in native WebView -- Livinity serves from its own server via HTTPS, so PWA is the right approach. |
| **next-pwa** | Not applicable -- Livinity UI is Vite/React, not Next.js. |
| **workbox-cli / workbox-build (standalone)** | vite-plugin-pwa wraps Workbox internally. Adding standalone Workbox creates duplicate tooling. |
| **@pwabuilder/pwaupdate** | Web component for PWA update UI. Unnecessary with `registerType: 'autoUpdate'`. |
| **tailwindcss v4** | Major migration. The existing v3.4 setup works. `tailwindcss-safe-area@0.8.0` targets v3 explicitly. |
| **Vite 5+ upgrade** | Not needed. vite-plugin-pwa v1.2.0 supports Vite 4. Avoid scope creep. |
| **Push notification libraries** | Out of scope for v23.0. Service worker foundation enables future push support without additional libraries now. |
| **motion v12 (separate package)** | Already in package.json but unused (0 imports). framer-motion v10 handles all animation needs. Consider removing `motion` as dead weight. |
| **React Native / Expo** | PWA approach explicitly chosen over native. See PROJECT.md Out of Scope. |

---

## Installation

```bash
# In livos/packages/ui/

# Dev dependencies (both are build-time only)
pnpm add -D vite-plugin-pwa
pnpm add -D tailwindcss-safe-area@0.8.0

# One-time asset generation (optional, run manually, not a project dependency)
# npx pwa-asset-generator ./public/favicon/android-chrome-512x512.png ./public/pwa-assets --splash-only --portrait-only
```

**Note:** `vite-plugin-pwa` will pull in `workbox-build` and `workbox-window` as transitive dependencies automatically. No need to install them separately.

---

## Integration Points

### Files to Modify

| File | Change | Purpose |
|------|--------|---------|
| `vite.config.ts` | Add VitePWA plugin | Service worker + manifest generation |
| `index.html` | Add Apple meta tags, modify viewport, add splash screen links | iOS installability + edge-to-edge |
| `tailwind.config.ts` | Add tailwindcss-safe-area plugin | Safe area utility classes |
| `src/index.css` | Add safe area CSS variables, standalone media query | Global safe area fallbacks |
| `public/site.webmanifest` | DELETE (replaced by vite-plugin-pwa) | Avoid duplicate manifests |

### Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/use-is-standalone.ts` | Detect PWA standalone mode |
| `src/hooks/use-pwa-install.ts` | Handle `beforeinstallprompt` event for install banners |

### Existing Files to Leverage (No Changes Needed for Stack)

| File | How It Helps |
|------|-------------|
| `src/hooks/use-is-mobile.ts` | Mobile detection already works; combine with `useIsStandalone()` |
| `src/modules/window/windows-container.tsx` | Already returns null on mobile |
| `src/layouts/sheet.tsx` | SheetLayout handles route-based navigation for settings/app-store |
| `src/utils/tw.ts` | Breakpoints already correct for responsive branching |
| `public/favicon/apple-touch-icon.png` | 180x180 icon already exists for iOS |
| `public/favicon/android-chrome-192x192.png` | Manifest icon already exists |
| `public/favicon/android-chrome-512x512.png` | Manifest icon already exists |

---

## Existing Icon Assets Audit

| Asset | Exists | Status |
|-------|--------|--------|
| `favicon/android-chrome-192x192.png` | YES | Used in current manifest |
| `favicon/android-chrome-512x512.png` | YES | Used in current manifest |
| `favicon/apple-touch-icon.png` | YES | 180x180, already linked in HTML |
| `favicon/favicon-32x32.png` | YES | Standard favicon |
| `favicon/favicon-16x16.png` | YES | Standard favicon |
| `favicon/favicon.ico` | YES | ICO fallback |
| Maskable icon (safe zone) | NO | Need to verify 512x512 has safe zone padding for maskable purpose |
| iOS splash screens | NO | Need to generate (~20 portrait variants) |

---

## iOS Splash Screens (Deferred Recommendation)

iOS requires `apple-touch-startup-image` link tags with device-specific `media` queries for splash screens. Without them, users see a white screen during PWA launch. This requires generating 20+ image variants and adding 20+ link tags to `index.html`.

**Recommendation:** Defer to a follow-up task within the milestone. The PWA will be installable and functional without splash screens -- users just see a brief white flash on launch. Use `pwa-asset-generator` when ready:

```bash
npx pwa-asset-generator ./src/assets/logo.svg ./public/splash \
  --splash-only --portrait-only --background "#f8f9fc"
```

This generates the images and prints the `<link>` tags to add to `index.html`.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| PWA plugin | vite-plugin-pwa ^1.2.0 | Manual SW + Workbox CLI | More boilerplate, no manifest injection, harder to maintain |
| Safe areas | tailwindcss-safe-area@0.8.0 | Manual CSS env() vars | No Tailwind utility composition, harder responsive patterns |
| Page transitions | framer-motion (existing) | react-transition-group | Already have framer-motion everywhere, no reason to add another |
| Manifest | vite-plugin-pwa generated | Manual public/site.webmanifest | Plugin auto-hashes, validates, keeps in sync with config |
| Install prompt | Custom useBeforeInstallPrompt hook | @niclas-niclas/react-pwa-prompt | Tiny amount of code, no need for a dependency |
| Icons | Existing + maskable variant | @vite-pwa/assets-generator | Existing icons cover requirements; only maskable needs attention |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| vite-plugin-pwa compatibility | HIGH | Verified peerDep `^4.0.0` in package.json on GitHub main |
| tailwindcss-safe-area v0.8.0 | HIGH | Explicitly targets Tailwind v3, separate from v1.x (Tailwind v4) |
| Apple meta tags | HIGH | Stable API, well-documented, verified across multiple sources |
| framer-motion transitions | HIGH | AnimatePresence used in 35+ existing files, v10 fully supports this |
| Workbox service worker config | MEDIUM | Config patterns well-documented but navigateFallbackDenylist for tRPC needs testing |
| iOS splash screens | LOW | Device media queries change with new devices; pwa-asset-generator scrapes Apple HIG but may lag |

---

## Sources

- [vite-pwa/vite-plugin-pwa - GitHub](https://github.com/vite-pwa/vite-plugin-pwa) -- peerDependencies verified
- [Vite PWA Official Docs](https://vite-pwa-org.netlify.app/) -- generateSW, workbox config
- [tailwindcss-safe-area - GitHub](https://github.com/mvllow/tailwindcss-safe-area) -- v0.8.0 for Tailwind v3
- [Apple Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)
- [PWA iOS Limitations 2026 - MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [iOS PWA Compatibility - firt.dev](https://firt.dev/notes/pwa-ios/)
- [CSS env() - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Web App Manifest - web.dev](https://web.dev/learn/pwa/web-app-manifest)
- [Workbox Precaching - Chrome Developers](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)
- [pwa-asset-generator - GitHub](https://github.com/elegantapp/pwa-asset-generator)
- [PWA on iOS 2025 - Brainhub](https://brainhub.eu/library/pwa-on-ios)
