# Architecture Patterns: Mobile PWA Integration

**Domain:** PWA integration into existing desktop-first React SPA
**Researched:** 2026-04-01
**Confidence:** HIGH (based on direct codebase analysis + PWA standards)

## Executive Summary

Livinity's UI is a desktop-first React 18 SPA with a windowed interface. On desktop, system apps (AI Chat, Settings, Files, Server, Terminal, etc.) open as draggable floating windows via `WindowManagerProvider` / `WindowsContainer`. On mobile (< 1024px), `WindowsContainer` returns `null` and the existing `SheetLayout` renders some apps as bottom-sheet overlays. However, only a subset of apps are registered as routes under `SheetLayout` -- the AI-heavy apps (AI Chat, Server Control, Agents, Schedules, Terminal, My Devices) are **window-only** with no route registration, meaning they are completely inaccessible on mobile today.

The mobile PWA integration must solve two problems: (1) make the app installable as a PWA, and (2) provide a phone-native rendering path for all system apps that currently only work in windows.

## Recommended Architecture

**Strategy: MobileAppRenderer -- a new component that renders app content as full-screen overlays on mobile, using the existing `WindowAppContent` component tree.**

Do NOT extend `SheetLayout`. SheetLayout is a bottom-sheet dialog designed for browsing content (Files, Settings, App Store) with close/back-to-desktop semantics. Mobile apps need full-screen rendering with navigation, status bars, and safe area handling -- a fundamentally different UX pattern.

### High-Level Rendering Flow

```
Desktop (>= 1024px):
  Router "/" -> Desktop -> DesktopContent (AppGrid + Dock)
                        -> WindowsContainer (floating windows)
                        -> SheetLayout (Files, Settings, App Store sheets)

Mobile (< 1024px):
  Router "/" -> Desktop -> DesktopContent (MobileAppGrid with system apps, no Dock)
                        -> MobileAppRenderer (full-screen app overlays)
                        -> WindowsContainer returns null (unchanged)
                        -> SheetLayout still works for Files/Settings/App Store
```

### Component Boundaries

| Component | Responsibility | Status | Communicates With |
|-----------|---------------|--------|-------------------|
| `useIsMobile()` | Viewport detection (< 1024px) | EXISTS -- no changes needed | All mobile-aware components |
| `site.webmanifest` | PWA installability manifest | EXISTS -- needs enhancement | Browser PWA engine |
| Service Worker | Cache-first offline shell, update prompts | NEW -- `vite-plugin-pwa` | Vite build pipeline |
| `MobileAppGrid` | Phone-style app grid with system apps visible | MODIFY `DesktopContent` | `AppsProvider`, `MobileAppRenderer` |
| `MobileAppRenderer` | Full-screen overlay rendering of any app by ID | NEW | `WindowContent` (reuse), navigation state |
| `MobileNavBar` | Top status bar with back button, app title | NEW | `MobileAppRenderer` |
| `Dock` | Hide on mobile | MODIFY -- conditional render | `useIsMobile()` |
| `DockBottomPositioner` | Hide on mobile | MODIFY -- conditional render | `useIsMobile()` |
| `WindowContent` | Lazy-loaded app content by appId | EXISTS -- no changes | `MobileAppRenderer`, `Window` |
| Safe area CSS | `env(safe-area-inset-*)` for notch/home indicator | NEW -- global CSS | `index.html` viewport-fit, Tailwind |

## Integration Points: What to Modify vs Create

### Files to MODIFY (minimal, targeted changes)

**1. `livos/packages/ui/index.html`** -- Add viewport-fit=cover for safe areas + Apple meta tags

Current viewport meta:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
```

Needed:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Livinity" />
```

**2. `livos/packages/ui/public/site.webmanifest`** -- Add required PWA fields

Current manifest is minimal (missing `start_url`, `scope`, `orientation`, and maskable icon). Needs:
```json
{
  "name": "Livinity",
  "short_name": "Livinity",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#f8f9fc",
  "background_color": "#f8f9fc",
  "icons": [
    {"src": "/favicon/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/favicon/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"},
    {"src": "/favicon/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
```

**3. `livos/packages/ui/vite.config.ts`** -- Add `vite-plugin-pwa`

Add `VitePWA` plugin with `generateSW` strategy. No manual service worker file needed. Configuration only.

**4. `livos/packages/ui/src/router.tsx`** -- Wire MobileAppProvider + MobileAppRenderer

Add `MobileAppProvider` inside the existing provider tree (around `Desktop` and siblings). Add `MobileAppRenderer` as a sibling of `WindowsContainer`. No route structure changes.

**5. `livos/packages/ui/src/modules/desktop/dock.tsx`** -- Hide dock on mobile

The `Dock` component already imports `useIsMobile()`. Add early return: `if (isMobile) return null`. Same for `DockBottomPositioner`.

**6. `livos/packages/ui/src/modules/desktop/desktop-content.tsx`** -- Mobile app grid

On mobile, add core system app icons (AI Chat, Settings, Files, Server, Terminal) to the grid items array. Change their `onClick` to call `mobileAppContext.openApp()` instead of `windowManager.openWindow()`. Desktop behavior completely unchanged.

**7. `livos/packages/ui/src/modules/desktop/dock.tsx` (DockSpacer)** -- Return null on mobile

When dock is hidden, the 76px bottom spacer should also be hidden.

### Files to CREATE (new components)

**1. `livos/packages/ui/src/modules/mobile/mobile-app-renderer.tsx`**

Core new component. Full-screen overlay that renders an app by appId. Uses Framer Motion slide-up animation. Imports `WindowAppContent` from `window-content.tsx` to lazy-load the correct app component. Handles safe area insets.

Conceptual structure:
```typescript
function MobileAppRenderer() {
  const {activeApp, closeApp} = useMobileApp()
  if (!activeApp) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex flex-col bg-surface-base"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        initial={{y: '100%'}}
        animate={{y: 0}}
        exit={{y: '100%'}}
        transition={{type: 'spring', damping: 30, stiffness: 300}}
      >
        <MobileNavBar title={activeApp.title} onBack={closeApp} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <WindowAppContent appId={activeApp.appId} initialRoute={activeApp.route} />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
```

**2. `livos/packages/ui/src/modules/mobile/mobile-nav-bar.tsx`**

Top navigation bar with: chevron-left back button, centered app title, optional right action slot. Height ~44px + safe-area-inset-top. Background extends behind status bar for seamless look.

**3. `livos/packages/ui/src/modules/mobile/mobile-app-context.tsx`**

Lightweight React context that tracks which app is open on mobile. Completely separate from the desktop `WindowManagerProvider`.

```typescript
type MobileAppState = {
  appId: string
  route: string
  title: string
  icon: string
} | null

type MobileAppContextT = {
  activeApp: MobileAppState
  openApp: (appId: string, route: string, title: string, icon: string) => void
  closeApp: () => void
}
```

**4. `livos/packages/ui/src/modules/mobile/use-mobile-back.ts`**

Hook that integrates with the browser History API. When `openApp()` is called, pushes a state entry. When the user presses the browser/OS back button (popstate event), calls `closeApp()`. This makes the hardware back button on Android and the swipe-back gesture on iOS work naturally.

**5. Service worker** -- Auto-generated by `vite-plugin-pwa`

The `generateSW` strategy in vite-plugin-pwa produces the service worker at build time via Workbox. No manual `sw.js` file needed. Precaches the SPA shell (HTML, JS, CSS, fonts). No runtime API caching -- LivOS is a real-time server management tool where stale API responses would be harmful.

### Files that need NO changes

| File | Why It Is Fine |
|------|----------------|
| `providers/window-manager.tsx` | Desktop-only provider; MobileAppRenderer does not use it |
| `modules/window/windows-container.tsx` | Already returns null on mobile |
| `layouts/sheet.tsx` (SheetLayout) | Continues to work for Files/Settings/App Store on both platforms |
| `modules/desktop/app-icon.tsx` | Generic icon component, works for both grid contexts |
| `providers/apps.tsx` | System app definitions already complete; no changes needed |
| `hooks/use-is-mobile.ts` | Already works correctly at < 1024px breakpoint |
| All app content components (AI Chat, Server, Terminal, etc.) | These render inside any container; already use `useIsMobile()` for internal responsive adjustments |
| `modules/window/window-content.tsx` | Need to export `WindowAppContent` but no logic changes |

## Data Flow

### Desktop (unchanged)
```
User clicks dock icon
  -> DockItem.onOpenWindow()
  -> windowManager.openWindow(appId, route, title, icon)
  -> WindowsContainer renders <Window><WindowContent appId={...} /></Window>
```

### Mobile (new)
```
User taps app icon in grid
  -> AppIcon.onClick()
  -> mobileAppContext.openApp(appId, route, title, icon)
  -> history.pushState({mobileApp: appId}) for back button support
  -> MobileAppRenderer renders full-screen overlay with slide-up animation
  -> <WindowAppContent appId={...} /> (same lazy components as desktop)

User taps back button / swipes back / presses hardware back
  -> popstate event fires
  -> use-mobile-back hook detects mobileApp state
  -> mobileAppContext.closeApp()
  -> MobileAppRenderer animates out (slide-down)
  -> Returns to home screen app grid
```

### Key Insight: Reuse WindowAppContent

The `WindowAppContent` switch statement in `window-content.tsx` (lines 50-99) already maps every appId to its lazy-loaded component. The mobile renderer reuses this exact function. Every app that works in a desktop window automatically works in the mobile full-screen view with zero per-app work.

Currently `WindowAppContent` is not exported. The only change needed to `window-content.tsx` is adding the `export` keyword to that function.

### SheetLayout Apps on Mobile

Files, Settings, and App Store already render via `SheetLayout` on both desktop and mobile. On mobile, `SheetLayout` renders as a full-height bottom sheet. These apps do NOT need the `MobileAppRenderer` -- they continue working through their existing route-based rendering. The user can still navigate to `/files/Home` or `/settings` via the app grid.

The decision of whether an app uses SheetLayout (route-based) or MobileAppRenderer (context-based overlay):
- **SheetLayout:** Files, Settings, App Store, Community App Store -- already have routes
- **MobileAppRenderer:** AI Chat, Server Control, My Devices, Agents, Schedules, Terminal -- window-only apps

## Patterns to Follow

### Pattern 1: Mobile-First Conditional Rendering
**What:** Use `useIsMobile()` at the component level to choose rendering path.
**When:** Components that need fundamentally different UX on mobile vs desktop.
**Already used in:** `WindowsContainer` (`if (isMobile) return null`), `Dock` (dimension sizing), `AiChat` (drawer sidebar vs fixed sidebar).

### Pattern 2: Shared Content, Different Chrome
**What:** App content components are platform-agnostic. Only the containing shell differs (Window frame vs MobileAppRenderer vs SheetLayout).
**When:** Rendering the same app in different contexts.
**Why:** Prevents maintaining two versions of every app. AI Chat already uses `useIsMobile()` internally for its sidebar (drawer on mobile, fixed panel on desktop) -- this pattern is established.

### Pattern 3: Context-Based Navigation State
**What:** A lightweight React context (`MobileAppContext`) manages which app is currently open on mobile, separate from the desktop `WindowManagerProvider`.
**When:** Mobile app open/close state.
**Why:** The desktop WindowManager manages multiple simultaneous windows with z-index, drag, resize -- none of which apply to mobile's single-app-at-a-time model. A separate, simpler context avoids bloating WindowManager with mobile concerns.

### Pattern 4: History API for Back Navigation
**What:** Push a history entry when opening a mobile app, listen for popstate to close it.
**When:** Any full-screen overlay on mobile.
**Why:** Users expect the browser/OS back button to close the current view. Without this, back navigates away from the entire app. This pattern is critical for PWA "feels native" UX.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Route-Based Mobile Apps
**What:** Registering each system app as a React Router route (e.g., `/m/ai-chat`, `/m/settings`).
**Why bad:** The window-only apps (AI Chat, Server Control, etc.) were explicitly designed without URL routes. The router.tsx comment says: "AI pages (ai-chat, server-control, subagents, schedules) are window-only. They are NOT registered as routes." Adding routes would require extracting state management, conflict with the desktop no-URL pattern, and create two rendering paths to maintain per app.
**Instead:** Use context-based overlay with history.pushState for back-button support. No URL changes.

### Anti-Pattern 2: Extending SheetLayout for All Apps
**What:** Making window-only system apps render inside the existing bottom-sheet overlay.
**Why bad:** SheetLayout is a modal dialog with close button, scroll area, sheet-top sticky header, and "zoom-out desktop" animation. It has `h-[calc(100dvh-var(--sheet-top))]` -- it intentionally does NOT fill the screen. Apps like AI Chat need full-screen real estate, their own navigation chrome, and persistent WebSocket connections. Forcing them into SheetLayout creates UX conflicts (sheet close button vs app back button, sheet scroll vs chat scroll, reduced viewport height).
**Instead:** Create `MobileAppRenderer` as a separate full-screen overlay, purpose-built for app rendering.

### Anti-Pattern 3: Separate Mobile Components for Each App
**What:** Creating `MobileAiChat.tsx`, `MobileSettings.tsx`, `MobileTerminal.tsx`, etc.
**Why bad:** Doubles maintenance. Every feature added to the desktop version must be manually replicated. AI Chat already handles mobile responsiveness internally with `useIsMobile()`.
**Instead:** Reuse `WindowAppContent` which already lazy-loads the right component by appId.

### Anti-Pattern 4: Complex Service Worker with Runtime API Caching
**What:** Using `injectManifest` with custom runtime caching strategies for tRPC/API calls.
**Why bad:** LivOS is a real-time server management tool. Caching API responses would show stale Docker container states, stale file listings, stale AI conversations. The offline story for this app is minimal -- the value is the live server connection.
**Instead:** Use `generateSW` with precache for static assets only. No runtime API caching. The service worker exists for installability and fast shell loading, not offline functionality.

### Anti-Pattern 5: Modifying WindowManager for Mobile
**What:** Adding mobile-specific logic to `WindowManagerProvider` (e.g., "on mobile, openWindow renders full-screen instead of floating").
**Why bad:** Violates separation of concerns. WindowManager's reducer manages z-index, position, size, minimize/restore -- all desktop-only concepts. Adding mobile branching would complicate the reducer and every consumer.
**Instead:** Separate `MobileAppContext` with a much simpler API (one app at a time, open/close only).

## Component Tree (Mobile Path)

```
<TrpcProvider>
  <WallpaperProviderConnected>
    <GlobalSystemStateProvider>
      <GlobalFilesProvider>
        <RouterProvider>
          <EnsureLoggedIn>
            <Wallpaper />
            <AvailableAppsProvider>
              <AppsProvider>
                <WindowManagerProvider>         // still present, WindowsContainer returns null
                  <MobileAppProvider>            // NEW: lightweight mobile nav state
                    <CmdkProvider>
                      <AiQuickProvider>
                        <Desktop />             // renders app grid; on mobile shows system apps
                        <Outlet />              // SheetLayout children (Files, Settings, etc.)
                        <WindowsContainer />    // returns null on mobile (unchanged)
                        <MobileAppRenderer />   // NEW: full-screen app overlay
                        <FloatingIslandContainer />
                        {/* Dock + DockBottomPositioner hidden on mobile */}
                      </AiQuickProvider>
                    </CmdkProvider>
                  </MobileAppProvider>
                </WindowManagerProvider>
              </AppsProvider>
            </AvailableAppsProvider>
          </EnsureLoggedIn>
        </RouterProvider>
      </GlobalFilesProvider>
    </GlobalSystemStateProvider>
  </WallpaperProviderConnected>
</TrpcProvider>
```

## Safe Area Implementation

**Viewport meta:** `viewport-fit=cover` in `index.html` opts into full-screen rendering behind notch/home indicator. Without this, `env(safe-area-inset-*)` values are always 0.

**CSS approach:** Use `env(safe-area-inset-*)` with fallbacks via `max()`.

```css
/* Mobile app renderer safe area handling */
.mobile-safe-top {
  padding-top: env(safe-area-inset-top, 0px);
}
.mobile-safe-bottom {
  padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
}
```

For Tailwind, use arbitrary values: `pt-[env(safe-area-inset-top)]` or `pb-[max(16px,env(safe-area-inset-bottom))]`.

**Key values on iOS in standalone PWA mode:**
- `safe-area-inset-top`: ~59px (Dynamic Island/iPhone 15+), ~47px (notch/iPhone X-14), ~20px (no notch)
- `safe-area-inset-bottom`: ~34px (home indicator gesture bar), 0px (home button devices)
- `safe-area-inset-left/right`: 0px in portrait, varies in landscape

**The mobile nav bar absorbs the top safe area** (its background color extends behind the status bar using padding-top), and **the app content area absorbs the bottom safe area** (padding-bottom for the home indicator).

**Desktop is unaffected:** `env(safe-area-inset-*)` returns 0px on desktop browsers, so these styles are no-ops outside mobile.

## PWA Installability Checklist

### Minimum Requirements

1. **Web manifest** with `name`, `icons` (192x192 + 512x512), `start_url`, `display: standalone` -- partially exists, needs `start_url` and `scope`
2. **Service worker** registered -- needs `vite-plugin-pwa`
3. **HTTPS** -- already served via Caddy with TLS
4. **Apple meta tags** -- `apple-mobile-web-app-capable`, `apple-touch-icon`, `apple-mobile-web-app-status-bar-style`

### iOS 26+ Note
As of iOS 26, every site added to the Home Screen defaults to opening as a web app even without a manifest. However, a proper manifest ensures correct icon, name, orientation, and status bar styling. The manifest is still required for Android "Add to Home Screen" prompt.

## Suggested Build Order (Dependency-Based)

### Phase 1: PWA Installability Shell (no UI changes)
1. Enhance `site.webmanifest` (add `start_url`, `scope`, `orientation`, maskable icon)
2. Add Apple meta tags to `index.html` (`viewport-fit`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`)
3. Install + configure `vite-plugin-pwa` in `vite.config.ts` (`generateSW` strategy)
4. Add SW registration via `virtual:pwa-register/react` in `main.tsx`

**Dependency:** None. **Testable independently:** App becomes installable as PWA. Desktop UI completely unchanged.

### Phase 2: Mobile Navigation Infrastructure
1. Create `MobileAppContext` (`openApp`, `closeApp`, `activeApp` state)
2. Create `use-mobile-back` hook (History API integration)
3. Create `MobileNavBar` (back button, title, safe area top padding)
4. Create `MobileAppRenderer` (full-screen overlay, imports `WindowAppContent`, Framer Motion slide-up)
5. Export `WindowAppContent` from `window-content.tsx`
6. Wire `MobileAppProvider` + `MobileAppRenderer` into `router.tsx`

**Dependency:** None from Phase 1 (can be built in parallel). **Testable:** Can manually call `openApp()` from console.

### Phase 3: Mobile Home Screen (dock hiding + system app grid)
1. Modify `Dock` -- hide on mobile (`if (isMobile) return null`)
2. Modify `DockBottomPositioner` -- hide on mobile
3. Modify `DockSpacer` -- return null on mobile
4. Modify `DesktopContent` -- on mobile, add system app icons to grid with `onClick -> mobileAppContext.openApp()`

**Dependency:** Phase 2 (needs `MobileAppContext` for click handlers). After this phase, the full mobile flow works: home screen with apps -> tap to open full-screen -> back to close.

### Phase 4: Polish + Safe Areas
1. Add safe area CSS (global styles or Tailwind utilities)
2. Tune slide-up animation parameters for iOS-native feel
3. Handle edge cases: orientation change, keyboard visibility, scroll bounce
4. Test on real devices (iPhone with Dynamic Island, Android)

**Dependency:** Phase 3 functional. **Nature:** Polish, not structural.

## Scalability Considerations

| Concern | Current State | At PWA Launch | Future |
|---------|--------------|---------------|--------|
| Adding new system app | Add to dock + WindowContent switch | Also add to mobile grid items in DesktopContent | Extract to config-driven app registry |
| App-specific mobile tweaks | AI Chat already uses `useIsMobile()` internally | Same pattern for any app needing mobile-specific layout | Consider container queries per-app |
| Offline capability | Not needed (live server tool) | Static shell cache only via service worker | Could add read-only cache for Settings/Files listing |
| Push notifications | Not supported | Service worker enables capability | Add notification subscription + backend integration |
| Tablet layout | Treated as desktop (>= 1024px) | Same behavior | Could add tablet-specific breakpoint (768-1024px) |

## Sources

- Direct codebase analysis of `router.tsx`, `desktop-content.tsx`, `dock.tsx`, `windows-container.tsx`, `app-grid.tsx`, `window-content.tsx`, `window-manager.tsx`, `app-icon.tsx`, `use-is-mobile.ts`, `sheet.tsx`, `vite.config.ts`, `index.html`, `site.webmanifest`, `main.tsx`, `providers/apps.tsx`, `use-launch-app.ts`, `ai-chat/index.tsx` (HIGH confidence)
- [PWA iOS Limitations and Safari Support 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Making PWAs installable - MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Do Progressive Web Apps Work on iOS - Complete Guide 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [vite-plugin-pwa GitHub](https://github.com/vite-pwa/vite-plugin-pwa)
- [Vite PWA - React Examples](https://vite-pwa-org.netlify.app/examples/react)
- [CSS env() function - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [iOS PWA standalone safe area CSS patterns](https://gist.github.com/cvan/6c022ff9b14cf8840e9d28730f75fc14)
- [Understanding env() Safe Area Insets in CSS with React and Tailwind](https://medium.com/@developerr.ayush/understanding-env-safe-area-insets-in-css-from-basics-to-react-and-tailwind-a0b65811a8ab)
- [Make Your PWAs Look Handsome on iOS](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08)

---
*Architecture research for: v23.0 Mobile PWA integration with LivOS*
*Researched: 2026-04-01*
