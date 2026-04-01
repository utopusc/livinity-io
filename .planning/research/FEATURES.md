# Feature Landscape: v23.0 Mobile PWA

**Domain:** Progressive Web App for self-hosted AI server OS (phone-like mobile experience)
**Researched:** 2026-04-01
**Overall Confidence:** HIGH (MDN docs, Apple developer docs, codebase audit, PWA ecosystem research)

## Existing Infrastructure (Already Built)

Before listing features to build, here is what the codebase already provides:

| Existing Capability | Where | Status |
|---------------------|-------|--------|
| `useIsMobile()` hook (< 1024px) | `hooks/use-is-mobile.ts` | Used in 30+ files |
| `useIsSmallMobile()` (< 640px) | `hooks/use-is-mobile.ts` | Available |
| `WindowsContainer` returns null on mobile | `modules/window/windows-container.tsx:14` | Working |
| `SheetLayout` for mobile routing | `layouts/sheet.tsx` | Working |
| Vaul-based drawers for mobile | Settings, Files | Working |
| `site.webmanifest` with standalone display | `public/site.webmanifest` | Minimal (no start_url, no description) |
| 192x192 + 512x512 Android Chrome icons | `public/favicon/` | Present |
| `apple-touch-icon.png` (180x180) | `public/favicon/` | Present |
| `100dvh` for viewport height | `layouts/sheet.tsx` | Adopted |
| Responsive Tailwind breakpoints (sm/md/lg/xl) | `utils/tw.ts` | Established |
| One `env(safe-area-inset-bottom)` usage | `files/rewind/index.tsx:267` | Partial |
| `theme-color` meta tag | `index.html` | Present (#f8f9fc) |
| System apps array with routes | `providers/apps.tsx` | 16 system apps defined |
| DockSpacer for bottom spacing | `modules/desktop/dock.tsx` | Working |
| Dock has mobile icon size (44px) | `modules/desktop/dock.tsx:37` | Working |

**Key gap:** Window-only apps (AI Chat, Server, Agents, Schedules, Terminal) have NO route in the router -- they exist only as window contents. On mobile, clicking dock icons triggers `onOpenWindow` which silently fails since `WindowsContainer` returns null. These apps are completely inaccessible on mobile today.

---

## Table Stakes

Features users expect from any installable PWA. Missing = feels broken or unfinished.

### TS-01: PWA Installability (Manifest + Service Worker)

| Attribute | Value |
|-----------|-------|
| **Why Expected** | Without proper manifest and service worker, iOS "Add to Home Screen" shows a web bookmark, not an app. Android won't show install prompt. |
| **Complexity** | Low |
| **Depends On** | Nothing (foundational) |

**What to build:**
- Enhance `site.webmanifest`: add `start_url: "/"`, `description`, `scope: "/"`, `id: "/"`, proper `theme_color` and `background_color` matching the app
- Add maskable icon variant (512x512 with safe zone padding) for Android adaptive icons
- Add `vite-plugin-pwa` to Vite config with `generateSW` strategy for automatic service worker
- Service worker should precache the app shell (HTML, CSS, JS bundles) for instant loading after first visit

**Existing asset:** `public/site.webmanifest` exists but is minimal. `public/favicon/` has the required icon sizes.

**Confidence:** HIGH (MDN installability requirements well-documented)

---

### TS-02: iOS "Add to Home Screen" Meta Tags

| Attribute | Value |
|-----------|-------|
| **Why Expected** | iOS ignores standard manifest for splash screens and status bar styling. Without Apple-specific meta tags, the PWA looks like a webpage in disguise. |
| **Complexity** | Low |
| **Depends On** | TS-01 (manifest) |

**What to build in `index.html`:**
- `<meta name="apple-mobile-web-app-capable" content="yes">` -- enables standalone mode
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` -- renders content under the status bar (required for full edge-to-edge display)
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">` -- the `viewport-fit=cover` part is critical for safe area insets to work
- `<link rel="apple-touch-startup-image" ...>` for iOS splash screens (multiple sizes for device coverage)

**Important detail:** The viewport meta already exists in `index.html` but lacks `viewport-fit=cover`. This single addition unlocks `env(safe-area-inset-*)` CSS functions.

**Confidence:** HIGH (Apple developer docs, widely documented)

---

### TS-03: Safe Area Handling (Notch + Home Indicator)

| Attribute | Value |
|-----------|-------|
| **Why Expected** | Without safe area padding, content renders behind the notch (top) and overlaps the home indicator (bottom) on every iPhone with Face ID and Android gesture-nav devices. |
| **Complexity** | Low-Medium |
| **Depends On** | TS-02 (viewport-fit=cover meta tag) |

**What to build:**
- Global CSS: `padding-top: env(safe-area-inset-top, 0px)` on the root app container
- Bottom nav/dock: `padding-bottom: env(safe-area-inset-bottom, 0px)` -- the home indicator area is typically 34px on iPhones
- Left/right insets for landscape mode: `padding-left: env(safe-area-inset-left, 0px)`, `padding-right: env(safe-area-inset-right, 0px)`
- Fixed/absolute positioned elements (bottom tab bar, FABs, toasts) must account for bottom inset
- Toast positioning (`sonner`) needs offset adjustment for safe area

**Existing precedent:** `files/rewind/index.tsx` already uses `env(safe-area-inset-bottom)` with calc(). Apply same pattern globally.

**Confidence:** HIGH (CSS env() is well-supported in all modern browsers; the codebase already uses it once)

---

### TS-04: Mobile App Grid (Home Screen with System Apps)

| Attribute | Value |
|-----------|-------|
| **Why Expected** | On mobile, users need a phone-like home screen showing all apps as tappable icons. The desktop dock only shows a few apps; the grid is the primary launcher. |
| **Complexity** | Low |
| **Depends On** | TS-05 (full-screen app rendering -- apps must open somewhere when tapped) |

**What to build:**
- On mobile, the app grid should display ALL system apps that are mobile-accessible: AI Chat, Settings, Files, Server, Agents, Schedules, Terminal, plus user-installed Docker apps
- Filter out desktop-only apps on mobile (Remote Desktop, Chrome, web app shortcuts like Gmail/Facebook/YouTube/WhatsApp -- these require the KasmVNC streaming window which is desktop-only)
- App icons should use the existing `AppIcon` component with proper touch targets (already 66px wide on small screens per `useGridDimensions`)
- Tapping an app icon navigates to a full-screen route (not a window)
- The existing drag-to-reorder grid works with pointer events and should function on mobile already via `@dnd-kit/core` PointerSensor

**Existing infrastructure:** `AppGrid` component with responsive sizing (66x86px on mobile vs 112x106px on desktop) and `DesktopContent` already renders both system and user apps.

**Confidence:** HIGH (mostly filtering and routing changes to existing components)

---

### TS-05: Full-Screen App Rendering on Mobile

| Attribute | Value |
|-----------|-------|
| **Why Expected** | Floating windows make no sense on a phone. Every app must render full-screen with a way to go back. This is the single most critical mobile feature -- without it, AI Chat, Server, Terminal, and Agents are completely unreachable on mobile. |
| **Complexity** | Medium |
| **Depends On** | Nothing (foundational) |

**What to build:**
- Register mobile routes in `router.tsx` for all window-only apps: `/ai-chat`, `/server-control`, `/subagents`, `/schedules`, `/terminal`, `/my-devices`
- Create a `MobileAppLayout` wrapper component that renders the app content full-screen with:
  - A top header bar (app icon, title, back button)
  - Full-height content area
  - Safe area padding (top and bottom)
- On mobile, `DockItem` `onClick` should navigate to the app route instead of calling `windowManager.openWindow()`
- Desktop behavior unchanged: window-only apps continue to open in floating windows

**Architecture decision:** Use route-based rendering (not state-based). Each app gets a URL (`/ai-chat`, `/terminal`, etc.) which means browser back button works, deep linking works, and the URL is shareable. The existing `SheetLayout` pattern from settings/files already demonstrates this approach.

**Key challenge:** Window-only app components (AI Chat, Server Control, etc.) currently render inside `WindowContent` which wraps them in window chrome. The mobile layout needs to render the same content components but inside `MobileAppLayout` instead. Factor the app content out of the window wrapper so both layouts can use it.

**Confidence:** HIGH (clear pattern from existing SheetLayout; React Router is already in use)

---

### TS-06: Mobile Navigation (Back Button + No Dock)

| Attribute | Value |
|-----------|-------|
| **Why Expected** | iOS PWAs in standalone mode have NO browser back button and NO URL bar. If you don't provide navigation, users are trapped in whatever screen they opened. Android has a system back button but users still expect in-app navigation. |
| **Complexity** | Medium |
| **Depends On** | TS-05 (full-screen app rendering) |

**What to build:**
- **Hide the desktop dock on mobile** -- it takes up space and the magnification/hover effect is a desktop paradigm. Replace with mobile-appropriate navigation.
- **Back button in MobileAppLayout header** -- uses `useNavigate(-1)` or navigates to home. Must be a visible, tappable (44px+) button.
- **Bottom tab bar for mobile** -- 4-5 primary actions always visible: Home, AI Chat, Files, Settings, and optionally one more (Server or Agents). This is the iOS/Android standard pattern.
  - Position: fixed bottom, above `env(safe-area-inset-bottom)`
  - Icons + labels, active state indicator
  - 49-50px height (iOS standard) + safe area padding
- **Home button/gesture** -- tapping the Home tab or the app header logo returns to the app grid

**Why bottom tab bar (not hamburger menu):** Research consistently shows 72% of users prefer visible navigation. Bottom tabs increase engagement by 58% vs hidden menus. With only 5 primary apps, all fit in a tab bar. The hamburger menu is for 10+ navigation items.

**Confidence:** HIGH (well-established mobile UX pattern; bottom tab bar is standard in every major mobile app)

---

### TS-07: Mobile AI Chat Layout

| Attribute | Value |
|-----------|-------|
| **Why Expected** | AI Chat is the primary feature of Livinity. If it doesn't work well on mobile, the PWA has no value proposition. The current AI Chat has a fixed 256px sidebar that doesn't work on mobile. |
| **Complexity** | Medium |
| **Depends On** | TS-05 (full-screen rendering), TS-06 (navigation) |

**What to build:**
- Full-screen chat view on mobile: message list fills the viewport, input area at bottom
- Conversation sidebar hidden by default on mobile; accessible via a hamburger icon in the top bar or swipe-right gesture
- Chat input area: responsive padding (`p-3` instead of `p-6`), input field stretches full width
- Message bubbles: max-width responsive, readable on 375px viewport
- Streaming markdown rendering must work in mobile viewport (existing `streamdown` + Shiki should work but needs viewport testing)
- Tool call visualization cards: stack vertically, no horizontal overflow

**Existing analysis:** Phase 8 research (v1.1-08) already identified this issue with specific fix patterns (drawer sidebar, mobile chat header).

**Confidence:** HIGH (clear implementation path from Phase 8 research)

---

## Differentiators

Features that set the Livinity mobile PWA apart. Not expected, but significantly improve the experience.

### DF-01: iOS Splash Screens

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Without splash screens, iOS shows a white screen for 1-2 seconds while the PWA loads. With them, users see a branded loading screen identical to native apps. |
| **Complexity** | Low |
| **Depends On** | TS-02 (Apple meta tags) |

**What to build:**
- Generate `apple-touch-startup-image` PNGs for common iPhone sizes:
  - iPhone SE: 640x1136
  - iPhone 8: 750x1334
  - iPhone X/XS/11 Pro: 1125x2436
  - iPhone XR/11: 828x1792
  - iPhone 12/13/14: 1170x2532
  - iPhone 14/15 Pro: 1179x2556
  - iPhone 14/15 Pro Max: 1290x2796
  - iPhone 16 Pro: 1206x2622
  - iPhone 16 Pro Max: 1320x2868
- Each image: Livinity logo centered on the app's background color
- Add corresponding `<link rel="apple-touch-startup-image" media="...">` tags in `index.html`
- Use a build-time script or tool (e.g., `pwa-asset-generator` or Progressier) to generate all sizes

**Why a differentiator:** Most PWAs skip splash screens because of the boilerplate. Adding them signals polish and professionalism.

**Confidence:** HIGH (well-documented Apple feature; automated tools exist)

---

### DF-02: Page Transitions (Slide Animations)

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Native apps have smooth slide transitions between screens. Without them, PWA navigation feels like page loads. Transitions are the #1 difference users perceive between "native" and "web." |
| **Complexity** | Medium |
| **Depends On** | TS-05 (route-based app rendering) |

**What to build:**
- Slide-right animation when navigating into an app (home grid -> app)
- Slide-left animation when navigating back (app -> home grid)
- Use Framer Motion's `AnimatePresence` with `mode="wait"` for exit/enter sequencing
- Shared element transitions for app icons (icon expands into full-screen app) if feasible

**Implementation approach:** Framer Motion is already installed and used throughout. Wrap the mobile route outlet in `AnimatePresence` with slide variants:
```
enter: { x: "100%", opacity: 0 } -> { x: 0, opacity: 1 }
exit:  { x: 0 } -> { x: "-30%", opacity: 0 }
```

**Alternative (future):** React's experimental `<ViewTransition>` component (React canary channel, April 2025) offers declarative transitions using the browser's native View Transition API. However, it requires `react@experimental` and is not production-stable yet. Use Framer Motion now; migrate to `<ViewTransition>` when it ships in stable React.

**Confidence:** MEDIUM (Framer Motion approach is proven; timing/feel requires iteration)

---

### DF-03: Pull-to-Refresh on Home Screen

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Native phone home screens support pull-to-refresh to update app states. On the Livinity home grid, this could refresh Docker container statuses (running/stopped indicators). |
| **Complexity** | Low |
| **Depends On** | TS-04 (mobile app grid) |

**What to build:**
- On the home screen (app grid), pulling down triggers a data refresh (re-query `apps.list` and container states)
- Use `overscroll-behavior-y: contain` on the app container to prevent Safari's native page reload
- Implement a simple pull indicator (spinner or Livinity logo animation) using touch events
- Libraries: `react-use-pull-to-refresh` or a simple custom 40-line implementation using `touchstart`/`touchmove`/`touchend`

**Important:** Must disable Safari's default pull-to-refresh behavior first via CSS, then implement custom behavior.

**Confidence:** HIGH (well-documented pattern; CSS + touch events)

---

### DF-04: Offline App Shell

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | With a cached app shell, the PWA loads instantly (< 1 second) even on slow/no network. Users see the familiar UI immediately, then data populates. This is what makes Starbucks PWA feel native. |
| **Complexity** | Low (with vite-plugin-pwa) |
| **Depends On** | TS-01 (service worker) |

**What to build:**
- Precache the app shell: index.html, JS bundles, CSS, font files, app icons
- Runtime caching for API responses: network-first with fallback to stale cache for tRPC queries
- Offline indicator: when network is unavailable, show a subtle banner ("Offline -- showing cached data")
- Do NOT cache Docker container state or real-time data -- only cache the UI shell and static assets

**Strategy:** `generateSW` from `vite-plugin-pwa` handles precaching automatically. Add runtime caching rules for `/trpc/*` endpoints with `NetworkFirst` strategy and 24-hour cache TTL.

**iOS caveat:** Safari limits cache to 50MB. The Livinity UI bundle (after code splitting) should be well under this. Monitor with build-size reporting.

**Confidence:** HIGH (vite-plugin-pwa automates most of this)

---

### DF-05: Haptic Feedback on Interactions

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Subtle vibration on app launch, long-press, and toggle switches makes the PWA feel tactile and native. Modern browsers support the Vibration API. |
| **Complexity** | Very Low |
| **Depends On** | Nothing |

**What to build:**
- `navigator.vibrate(10)` on app icon tap
- `navigator.vibrate(5)` on toggle switches and button presses
- Feature-detect and no-op on unsupported browsers (Safari/iOS does NOT support Vibration API)

**iOS limitation:** The Vibration API is not supported on iOS Safari. This is Android-only. Still worth adding for the Android PWA experience.

**Confidence:** HIGH (trivial implementation; API is simple)

---

### DF-06: PWA Install Prompt (Custom UI)

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Users don't know they can install a PWA. A tasteful install banner guides them. |
| **Complexity** | Low |
| **Depends On** | TS-01 (manifest + service worker) |

**What to build:**
- **Android:** Listen for `beforeinstallprompt` event, show a custom "Install Livinity" banner with the app icon and an Install button. Dismiss permanently after install or 3 dismissals.
- **iOS:** Detect iOS Safari (no `beforeinstallprompt`), show a manual instruction banner: "Tap Share > Add to Home Screen" with visual guide. Only show on first visit or when not in standalone mode.
- **Standalone detection:** `window.matchMedia('(display-mode: standalone)').matches` -- hide install prompts when already installed.

**Confidence:** HIGH (standard pattern; well-documented)

---

## Anti-Features

Features to explicitly NOT build for v23.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Push notifications** | Requires iOS 16.4+, must be added to home screen first, no background sync means unreliable delivery, EU users get no support. Adds complexity for marginal value in a self-hosted tool. | Defer to future milestone. Focus on the visual/interaction layer first. |
| **Offline data persistence (IndexedDB)** | iOS aggressively evicts IndexedDB after 7 days of inactivity. Building complex offline-first data sync for a server management tool (which inherently needs a server connection) is wasted effort. | Cache the app shell only. Show "offline" indicator for data-dependent screens. The server is the source of truth. |
| **Native-like swipe-to-go-back gesture** | iOS PWA standalone mode already provides edge-swipe-to-go-back on some versions. Implementing custom swipe detection conflicts with this system gesture and causes double-navigation bugs (documented Ionic issue #22299). | Provide a visible back button. Let the system gesture work naturally. |
| **Background sync / periodic updates** | Not supported on iOS at all. On Android, behavior is unreliable. A self-hosted server OS doesn't benefit from background sync -- users check it when they want to. | Poll for updates only when the app is in the foreground. |
| **Vibration patterns / advanced haptics** | Over-engineering. Complex vibration patterns are annoying, not premium. | Single-pulse vibrate (10ms) on key actions only, Android only. |
| **Desktop UI changes** | The desktop experience with floating windows, dock magnification, and keyboard shortcuts is mature and working. Any mobile work must leave desktop completely untouched. | Use `useIsMobile()` guards. All mobile-specific code behind conditional rendering. |
| **Widget support on mobile home screen** | Desktop widgets (clock, system info, app status) are designed for the spacious desktop grid. On a phone-sized grid they would consume too much space and conflict with app icons. | Show widgets only on desktop. Mobile home screen is apps-only. |
| **Landscape orientation optimization** | Livinity is a portrait-first mobile experience. Landscape adds complexity for every screen (safe areas change, layouts reorganize) with minimal user value for a server management PWA. | Lock to portrait in manifest: `"orientation": "portrait"`. Users can still rotate but we don't optimize for it. |

---

## Feature Dependencies

```
TS-01 (Manifest + SW) ---- required by ---> TS-02 (iOS Meta Tags)
                      \                      |
                       \                     v
                        \---> DF-04 (Offline Shell)    DF-06 (Install Prompt)
                               
TS-02 (iOS Meta Tags) ----> TS-03 (Safe Areas) ----> DF-01 (Splash Screens)

TS-05 (Full-Screen Apps) ---> TS-06 (Navigation) ---> TS-07 (AI Chat Mobile)
         |                         |
         v                         v
    TS-04 (App Grid)          DF-02 (Transitions)

DF-03 (Pull-to-Refresh) depends on TS-04 (App Grid)
```

**Critical path:** TS-01 -> TS-02 -> TS-03 must come first (foundational PWA setup). Then TS-05 -> TS-06 -> TS-04 (mobile app rendering). Then TS-07 (AI Chat). Differentiators can be layered on after.

---

## MVP Recommendation

### Must-Have (Phase 1 -- PWA Foundation)
1. **TS-01** PWA manifest + service worker (vite-plugin-pwa)
2. **TS-02** iOS meta tags (viewport-fit=cover, apple-mobile-web-app-capable)
3. **TS-03** Safe area handling (CSS env() on root, bottom nav, toasts)

### Must-Have (Phase 2 -- Mobile App Experience)
4. **TS-05** Full-screen app rendering (mobile routes for window-only apps)
5. **TS-06** Mobile navigation (hide dock, add bottom tab bar, back button)
6. **TS-04** Mobile app grid (show system apps, filter desktop-only apps)
7. **TS-07** AI Chat mobile layout (full-screen, drawer sidebar)

### Should-Have (Phase 3 -- Polish)
8. **DF-01** iOS splash screens
9. **DF-02** Page transitions (Framer Motion slide animations)
10. **DF-04** Offline app shell (runtime caching for API responses)
11. **DF-06** PWA install prompt (custom banner for iOS + Android)

### Nice-to-Have (Phase 3 or defer)
12. **DF-03** Pull-to-refresh on home screen
13. **DF-05** Haptic feedback (Android only, trivial)

**Defer:** Push notifications, offline data sync, background sync, landscape optimization.

---

## Complexity Summary

| Feature | Complexity | Estimated Effort | New Dependencies |
|---------|-----------|------------------|------------------|
| TS-01 Manifest + SW | Low | 2-3 hours | `vite-plugin-pwa` |
| TS-02 iOS Meta Tags | Low | 1-2 hours | None |
| TS-03 Safe Areas | Low-Med | 2-4 hours | None (CSS only) |
| TS-04 App Grid | Low | 2-3 hours | None |
| TS-05 Full-Screen Apps | Medium | 4-6 hours | None |
| TS-06 Navigation | Medium | 4-6 hours | None |
| TS-07 AI Chat Mobile | Medium | 4-6 hours | None |
| DF-01 Splash Screens | Low | 2-3 hours | Build tool (optional) |
| DF-02 Transitions | Medium | 3-4 hours | None (Framer Motion) |
| DF-03 Pull-to-Refresh | Low | 1-2 hours | None |
| DF-04 Offline Shell | Low | 1-2 hours | Part of TS-01 |
| DF-05 Haptic | Very Low | 30 min | None |
| DF-06 Install Prompt | Low | 2-3 hours | None |

**Total estimated:** ~30-40 hours for all features.

---

## Sources

### HIGH confidence (official documentation)
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN: CSS env() function](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [vite-plugin-pwa documentation](https://vite-pwa-org.netlify.app/)
- [MDN: display_override manifest member](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override)
- Codebase audit: `router.tsx`, `windows-container.tsx`, `dock.tsx`, `desktop-content.tsx`, `app-grid.tsx`, `sheet.tsx`, `use-is-mobile.ts`, `site.webmanifest`, `index.html`
- Phase 8 mobile research: `.planning/milestones/v15.0-phases/v1.1-08-mobile-polish/08-RESEARCH.md`

### MEDIUM confidence (verified with multiple sources)
- [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [PWA on iOS 2025 - Brainhub](https://brainhub.eu/library/pwa-on-ios)
- [PWA Design Tips - firt.dev](https://firt.dev/pwa-design-tips/)
- [iOS PWA safe area CSS patterns](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08)
- [Notch avoidance with CSS](https://dev.to/marionauta/avoid-notches-in-your-pwa-with-just-css-al7)
- [Bottom navigation vs hamburger menus](https://acclaim.agency/blog/the-future-of-mobile-navigation-hamburger-menus-vs-tab-bars)
- [React ViewTransition experimental API](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more)

### LOW confidence (needs validation during implementation)
- iOS 26 "every home screen site opens as web app" behavior -- announced but not yet widely tested
- EU PWA restrictions may change with DMA enforcement proceedings
- React `<ViewTransition>` timeline to stable -- currently experimental only
