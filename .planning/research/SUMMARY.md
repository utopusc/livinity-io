# Project Research Summary

**Project:** Livinity v23.0 -- Mobile PWA Experience
**Domain:** Progressive Web App retrofit for desktop-first React SPA (self-hosted AI server OS)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

Livinity is a desktop-first React 18 SPA that uses a windowed UI metaphor (floating, draggable windows with a macOS-style dock). The v23.0 milestone converts this into an installable, phone-native PWA without touching the desktop experience. Research confirms the existing codebase is well-positioned for this: `useIsMobile()` is already used in 30+ files, `WindowsContainer` already returns null on mobile, `SheetLayout` handles route-based mobile views for Files/Settings/App Store, and icon assets for PWA manifest already exist. The critical gap is that the five most important apps (AI Chat, Server Control, Agents, Schedules, Terminal) are window-only with no mobile rendering path -- they are completely inaccessible on phones today.

The recommended approach is minimalist: two new runtime dependencies (`vite-plugin-pwa` for service worker generation, `tailwindcss-safe-area` for Tailwind utilities), a new `MobileAppRenderer` component that reuses the existing `WindowAppContent` lazy-loader to render any app full-screen, and a lightweight `MobileAppContext` that is intentionally separate from the desktop `WindowManagerProvider`. No new frameworks, no Capacitor/Ionic wrapping, no React Router changes. The architecture pattern is "shared content, different chrome" -- the same app components render inside either a desktop Window frame or a mobile full-screen overlay, selected by the existing `useIsMobile()` hook.

The highest-risk area is iOS-specific PWA behavior. iOS standalone mode uses a completely separate storage sandbox from Safari (users must re-login after install), iOS kills WebSocket connections when the app is backgrounded (breaking AI Chat streaming and tRPC subscriptions), and the tRPC split-link architecture routes most traffic through WebSocket which becomes fragile on mobile resume. These are not blockers but require deliberate engineering: `visibilitychange`-based reconnection, possible HTTP-fallback for tRPC on mobile, and clear UX for the re-login flow. Real-device iOS testing is mandatory -- simulators do not replicate backgrounding, storage isolation, or safe area behavior accurately.

## Key Findings

### Recommended Stack

The stack additions are intentionally minimal. The existing Vite 4 + React 18 + Tailwind 3.4 + Framer Motion 10 setup handles everything. Only two dev dependencies are added; everything else is configuration and new components.

**Core additions:**
- **vite-plugin-pwa ^1.2.0**: Service worker generation via Workbox `generateSW`, manifest injection, SW registration virtual module. Verified compatible with Vite 4. Replaces manual `site.webmanifest`.
- **tailwindcss-safe-area@0.8.0**: Tailwind utilities for `env(safe-area-inset-*)`. Version 0.8.0 is the Tailwind v3 release (v1.x targets v4). Provides `pt-safe`, `pb-safe`, `h-screen-safe` composable with responsive variants.

**Already installed, no changes needed:**
- **framer-motion 10.16.4**: `AnimatePresence` for slide transitions between mobile views. Used in 35+ files already.
- **react-router-dom 6.17.0**: Route-based navigation for SheetLayout apps continues as-is.
- **vaul ^0.9.0**: iOS-style bottom sheets for mobile settings and context menus.

**Explicitly rejected:** Capacitor/Ionic (massive overhead for a web-served app), Tailwind v4 upgrade (scope creep), Vite 5+ upgrade (unnecessary), push notification libraries (defer), React Native/Expo (PWA approach chosen).

See: `.planning/research/STACK.md`

### Expected Features

**Must have (table stakes) -- PWA is broken/useless without these:**
- TS-01: PWA manifest + service worker (installability)
- TS-02: iOS Apple meta tags (`viewport-fit=cover`, `apple-mobile-web-app-capable`)
- TS-03: Safe area handling for notch and home indicator
- TS-04: Mobile app grid (phone-like home screen showing all system apps)
- TS-05: Full-screen app rendering (mobile routes for the 5 window-only apps)
- TS-06: Mobile navigation (hide dock, add back button, provide navigation controls)
- TS-07: Mobile AI Chat layout (full-screen, drawer sidebar, responsive messages)

**Should have (differentiators):**
- DF-01: iOS splash screens (branded launch instead of white flash)
- DF-02: Page transitions via Framer Motion (native-feeling slide animations)
- DF-04: Offline app shell (instant load after first visit)
- DF-06: Custom PWA install prompt (guide users to install)

**Defer to future milestones:**
- Push notifications, offline data persistence (IndexedDB), background sync, landscape optimization, widget support on mobile, native swipe-to-go-back gesture handling

See: `.planning/research/FEATURES.md`

### Architecture Approach

The architecture uses a "context-based overlay" pattern rather than extending React Router or SheetLayout. A new `MobileAppRenderer` component renders as a fixed full-screen overlay when an app is open on mobile. It reuses the existing `WindowAppContent` switch statement (which maps appId to lazy-loaded components) so every desktop window app automatically works on mobile with zero per-app effort. A separate `MobileAppContext` manages which single app is open, intentionally decoupled from the multi-window `WindowManagerProvider`. Browser History API integration (`pushState` + `popstate`) makes the hardware back button and iOS swipe-back gesture close the active app.

**Major components:**
1. **MobileAppRenderer** -- Full-screen overlay that renders any app by appId using `WindowAppContent` (NEW)
2. **MobileAppContext** -- Lightweight context for open/close state, separate from WindowManager (NEW)
3. **MobileNavBar** -- Top bar with back button, app title, safe area padding (NEW)
4. **use-mobile-back hook** -- History API integration for hardware/OS back button (NEW)
5. **Service Worker** -- Auto-generated by vite-plugin-pwa, precaches shell assets only (NEW, config-only)
6. **Dock** -- Modified to return null on mobile (MODIFY)
7. **DesktopContent** -- Modified to show system apps in grid with mobile-app-open handlers (MODIFY)

**Anti-patterns to avoid:**
- Do NOT register mobile routes in React Router (window-only apps were explicitly designed without URLs)
- Do NOT extend SheetLayout (it is a dialog/sheet, not a full-screen app container)
- Do NOT create separate mobile components per app (doubles maintenance)
- Do NOT add runtime API caching to the service worker (stale server data is harmful)
- Do NOT modify WindowManager for mobile (it manages drag/resize/z-index -- desktop-only concerns)

See: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **iOS storage isolation (Pitfall 1)** -- Safari and standalone PWA have completely separate localStorage. Users MUST re-login after installing. Mitigate with clear messaging in the install flow and a polished mobile login screen.

2. **Stale service worker cache (Pitfall 2)** -- Service worker can serve old JS bundles indefinitely. Use `registerType: 'prompt'` (not `autoUpdate`) with a visible "Update available" toast. Set `Cache-Control: no-cache` on `service-worker.js` and `index.html` at Caddy.

3. **WebSocket death on iOS background (Pitfall 3)** -- iOS kills WebSockets when the PWA is backgrounded. AI Chat streaming and tRPC subscriptions break silently. Add `visibilitychange` listener to force immediate reconnection on resume, bypassing backoff. Consider HTTP-fallback for tRPC non-subscription traffic on mobile.

4. **Missing viewport-fit=cover (Pitfall 5)** -- Without this single meta tag addition, all `env(safe-area-inset-*)` values resolve to 0px. This must be the first change, before any safe area CSS is written.

5. **Keyboard pushes content on iOS (Pitfall 10)** -- iOS standalone mode does NOT resize the viewport when the keyboard opens. The `visualViewport` API must be used to detect keyboard presence and adjust the AI Chat input position dynamically.

See: `.planning/research/PITFALLS.md`

## Implications for Roadmap

Based on combined research, the milestone naturally splits into 4 phases with clear dependencies.

### Phase 1: PWA Foundation (Installability + Meta)
**Rationale:** Everything else depends on the PWA being installable and `viewport-fit=cover` being set. This phase has zero UI changes -- it is purely infrastructure. It can be verified independently: "Can I install Livinity on my phone home screen? Does it launch in standalone mode?"
**Delivers:** Installable PWA with service worker, correct manifest, Apple meta tags, safe area CSS variables, self-hosted fonts for offline support
**Addresses:** TS-01 (manifest + SW), TS-02 (iOS meta tags), TS-03 (safe area CSS foundation), DF-04 (offline shell)
**Avoids:** Pitfall 5 (viewport-fit must come first), Pitfall 8 (manifest gaps), Pitfall 15 (font offline failure)
**Stack changes:** Install `vite-plugin-pwa`, `tailwindcss-safe-area@0.8.0`. Configure Vite, Tailwind, index.html. Delete `site.webmanifest` (replaced by plugin).

### Phase 2: Mobile Navigation Infrastructure
**Rationale:** Before showing apps on the home screen, the system to open and render them must exist. This phase builds the rendering pipeline. It can be developed in parallel with Phase 1 since it has no dependency on the service worker.
**Delivers:** MobileAppContext, MobileAppRenderer, MobileNavBar, use-mobile-back hook, WindowAppContent export. After this phase, calling `openApp('ai-chat', ...)` from the console renders AI Chat full-screen on mobile.
**Addresses:** TS-05 (full-screen app rendering), TS-06 (mobile navigation -- back button, nav bar)
**Avoids:** Pitfall 4 (window manager on mobile), Pitfall 13 (no back button -- trapped users)
**Architecture:** Context-based overlay pattern, NOT route-based. History API for back-button support.

### Phase 3: Mobile Home Screen + App Access
**Rationale:** With the rendering pipeline in place, this phase connects it to the UI. Users can now tap app icons and use the full mobile flow. This is the phase that makes the PWA actually usable.
**Delivers:** Dock hidden on mobile, system apps visible in app grid, tap-to-open wired to MobileAppContext, DockSpacer/DockBottomPositioner hidden, overscroll prevention, mobile-optimized AI Chat layout
**Addresses:** TS-04 (mobile app grid), TS-06 (dock hiding), TS-07 (AI Chat mobile layout)
**Avoids:** Pitfall 6 (100vh issues -- use dvh), Pitfall 7 (overscroll bounce), Pitfall 11 (Framer drag vs scroll conflicts)
**Dependency:** Phase 2 must be complete (needs MobileAppContext for click handlers).

### Phase 4: Polish + iOS Hardening
**Rationale:** The core mobile experience works after Phase 3. This phase addresses the iOS-specific pitfalls and adds differentiator features that make the PWA feel native rather than web-like.
**Delivers:** Page transitions (Framer Motion slide), iOS splash screens, PWA install prompt banner, visibilitychange reconnection for WebSockets, tRPC HTTP fallback on mobile, keyboard handling for AI Chat, real-device testing and fixes
**Addresses:** DF-01 (splash screens), DF-02 (page transitions), DF-06 (install prompt), DF-03 (pull-to-refresh), DF-05 (haptic feedback)
**Avoids:** Pitfall 1 (storage isolation -- install flow messaging), Pitfall 3 (WS death -- reconnection), Pitfall 9 (tRPC WS resume), Pitfall 10 (keyboard), Pitfall 12 (OAuth redirect in standalone)

### Phase Ordering Rationale

- **Phase 1 before all others** because `viewport-fit=cover` and service worker registration are prerequisites. Writing safe-area CSS without `viewport-fit=cover` is testing against 0px values. Installing the PWA without a service worker gives a broken experience.
- **Phase 2 before Phase 3** because the app grid needs `mobileAppContext.openApp()` to wire click handlers. Building the grid without a rendering target is dead code.
- **Phase 3 before Phase 4** because polish (transitions, splash screens, reconnection logic) should only be applied to a working flow. Tuning animations on a half-built system wastes time.
- **Phases 1 and 2 can be parallelized** since Phase 1 (config/meta) and Phase 2 (React components) have no code overlap.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** The `WindowAppContent` export and `MobileAppRenderer` integration need careful analysis of the existing `window-content.tsx` component tree. Research-phase recommended to map all app components and their internal mobile handling.
- **Phase 4 (iOS hardening):** WebSocket reconnection, tRPC transport switching, and keyboard handling are complex iOS-specific behaviors. Research-phase strongly recommended -- simulator testing is insufficient, and the visibilitychange + visualViewport patterns need real-device validation.

Phases with standard patterns (skip research-phase):
- **Phase 1:** PWA manifest, service worker, meta tags, and safe area CSS are thoroughly documented. vite-plugin-pwa docs provide exact configuration. Straightforward implementation.
- **Phase 3:** Hiding dock, showing apps in grid, and wiring click handlers are standard React conditional rendering. The existing codebase patterns (`useIsMobile()` guards) are well-established.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Both new dependencies verified against exact project versions (Vite 4, Tailwind 3.4). PeerDeps confirmed from GitHub. |
| Features | HIGH | Feature list derived from codebase audit (30+ files checked) + MDN/Apple docs. Dependency graph is clear. |
| Architecture | HIGH | Based on direct analysis of router.tsx, window-content.tsx, desktop-content.tsx, dock.tsx. Component boundaries verified against existing code patterns. |
| Pitfalls | HIGH | iOS-specific pitfalls verified across 3+ independent sources. Codebase-specific pitfalls (viewport meta, tRPC split link, agent socket) confirmed by reading source files. |

**Overall confidence:** HIGH

### Gaps to Address

- **Maskable icon safe zone**: The existing 512x512 icon may have content too close to edges for Android adaptive icon masking. Needs visual inspection during Phase 1 asset preparation.
- **iPad behavior at 1024px boundary**: `useIsMobile()` returns false at exactly 1024px. iPad landscape is 1024px. This creates an ambiguous state where the desktop window UI renders on a touch-only device. May need a secondary touch-detection check.
- **tRPC HTTP fallback on mobile**: The suggestion to route non-subscription tRPC traffic through HTTP on mobile PWA is architecturally sound but untested. The `splitLink` in `trpc.ts` needs modification. Validate during Phase 4 that HTTP fallback does not break any mutation flows.
- **iOS splash screen device list**: The device media query list for `apple-touch-startup-image` changes with new iPhone releases. Generated assets may be stale by the time of implementation. Use `pwa-asset-generator` at build time rather than committing static media queries.
- **Service worker update strategy**: Research disagrees on `autoUpdate` vs `prompt`. STACK.md recommends `autoUpdate`; PITFALLS.md recommends `prompt`. **Recommendation: use `prompt`** -- standalone PWA users have no reload button, so a stale cache with no update UI is a trap. The "Update available" toast is essential.
- **OAuth in standalone mode**: Claude OAuth PKCE redirect flow will break in iOS standalone (redirect opens Safari, token lands in wrong storage). Must use popup-based auth or postMessage pattern. Needs testing during Phase 4.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `router.tsx`, `window-content.tsx`, `desktop-content.tsx`, `dock.tsx`, `windows-container.tsx`, `use-is-mobile.ts`, `vite.config.ts`, `index.html`, `site.webmanifest`, `trpc.ts`, `use-agent-socket.ts`, `shared.ts`, `sheet.tsx`, `index.css`, `main.tsx`, `providers/apps.tsx` (all inspected directly)
- [vite-pwa/vite-plugin-pwa - GitHub](https://github.com/vite-pwa/vite-plugin-pwa) -- peerDependencies verified for Vite 4
- [Vite PWA Official Docs](https://vite-pwa-org.netlify.app/) -- generateSW, workbox config, React integration
- [tailwindcss-safe-area - GitHub](https://github.com/mvllow/tailwindcss-safe-area) -- v0.8.0 for Tailwind v3
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN: CSS env() function](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [Apple Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)

### Secondary (MEDIUM confidence)
- [PWA iOS Limitations 2026 - MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [PWA on iOS 2025 - Brainhub](https://brainhub.eu/library/pwa-on-ios)
- [iOS PWA Compatibility - firt.dev](https://firt.dev/notes/pwa-ios/)
- [Do Progressive Web Apps Work on iOS - MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [Web App Manifest - web.dev](https://web.dev/learn/pwa/web-app-manifest)
- [Dynamic Viewport Units - web.dev](https://web.dev/blog/viewport-units)
- [Navigating Safari/iOS PWA Limitations - Vinova](https://vinova.sg/navigating-safari-ios-pwa-limitations/)

### Tertiary (LOW confidence -- needs validation)
- iOS 26 "every home screen site opens as web app" behavior -- announced but not widely tested
- React `<ViewTransition>` experimental API timeline -- currently canary only
- EU DMA enforcement impact on PWA support -- proceedings ongoing

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
