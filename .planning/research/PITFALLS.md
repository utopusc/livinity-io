# Domain Pitfalls: Adding Mobile PWA to Existing Desktop-First React SPA

**Domain:** Mobile PWA retrofit for Livinity (React 18 + Vite SPA with windowed desktop UI)
**Researched:** 2026-04-01
**Overall confidence:** HIGH (verified against codebase + multiple authoritative sources)

---

## Critical Pitfalls

Mistakes that cause rewrites, user-facing breakage, or require architectural changes.

---

### Pitfall 1: iOS Standalone Storage Isolation — Users Logged Out After Install

**What goes wrong:** User logs in via Safari, adds PWA to home screen, opens standalone PWA, and is greeted with the login screen. JWT token is gone.

**Why it happens:** iOS Safari and standalone PWA mode run in **completely separate storage sandboxes**. `localStorage`, `sessionStorage`, and cookies set in Safari are NOT accessible in standalone mode and vice versa. Livinity stores JWT in `localStorage` via `JWT_LOCAL_STORAGE_KEY = 'jwt'` (see `modules/auth/shared.ts`). When the user transitions from Safari to standalone, the JWT does not carry over.

**Consequences:**
- Every user must log in again after installing the PWA
- If user logs in via Safari first (to browse), then installs, they perceive "broken" auth
- Any `localStorage`-backed state (desktop folders, layout, conversation IDs) is also lost

**Prevention:**
- Accept that re-login after install is required on iOS. Do NOT try to work around this with service worker CacheStorage hacks (they are fragile and version-dependent)
- Add a clear install prompt flow that warns "You will need to sign in again after adding to home screen"
- Ensure the login screen is polished and fast on mobile (it is the PWA's first impression)
- Consider a "remember me" checkbox that persists the username/avatar selection in standalone-mode localStorage so re-login is less painful

**Detection:** Test on real iOS device. Install PWA. Check if JWT exists in standalone storage.

**Livinity-specific note:** The `initTokenRenewal()` function in `shared.ts` calls `renewToken` every hour. This works fine in standalone mode once the user has logged in there, but the initial token must come from a fresh login.

---

### Pitfall 2: Service Worker Caches Stale JS Bundles — Users Stuck on Old Version

**What goes wrong:** You deploy a critical bug fix. Service worker serves the old cached `index.html` and hashed JS chunks. Users see the old version. Some users see a broken app because old JS references API endpoints or data structures that have changed server-side.

**Why it happens:** Service workers intercept ALL navigation requests. If you precache `index.html` and use a cache-first strategy, the browser never reaches the network for navigation. Vite's hashed filenames help with JS/CSS assets but `index.html` itself has a fixed URL. The service worker file itself may also be cached by the HTTP layer (browser will check for SW updates, but only every 24h by default).

**Consequences:**
- Users stuck on old versions for hours or days
- Broken API calls if backend has changed
- "Works on my machine" debugging nightmare
- Standalone PWA users are especially vulnerable (no reload button, no way to clear cache easily)

**Prevention:**
- Use `vite-plugin-pwa` with `registerType: 'prompt'` (NOT `autoUpdate`). Show a toast/banner: "New version available. Tap to update."
- Set `workbox.navigateFallback` to `/index.html` but use **network-first** strategy for the HTML shell
- Set HTTP `Cache-Control: no-cache, max-age=0` on `service-worker.js` and `index.html` at the Caddy layer
- Implement `skipWaiting()` + `clients.claim()` but ONLY after user confirms the update
- Precache hashed assets (JS/CSS) with cache-first; they are immutable by definition
- Test the update flow: deploy v2, verify v1 users see the update prompt

**Detection:** Deploy a version that logs its build hash. Check if multiple versions coexist after deployment.

**Livinity-specific note:** Livinity already uses hashed chunk names via Vite's `manualChunks` in `vite.config.ts`. The risk is specifically with the HTML shell and any API-version mismatch between cached frontend and live backend. The tRPC WebSocket connection will fail if types diverge, which could silently break the app.

---

### Pitfall 3: WebSocket Connections Die on iOS Background/Resume — Agent Chat Breaks

**What goes wrong:** User starts an AI agent task, switches to another app briefly (checks a text message), returns to Livinity PWA. The WebSocket is dead. The agent status overlay shows "disconnected". Streaming messages are lost. The agent may still be running on the server but the UI has no connection to receive events.

**Why it happens:** iOS aggressively terminates WebSocket connections when a PWA is backgrounded. There is no background execution for PWAs on iOS. The `onclose` handler in `use-agent-socket.ts` does trigger reconnection with exponential backoff (1s to 30s), but:
1. The reconnect starts from scratch after resume (previous backoff timer was frozen/killed)
2. Messages sent while backgrounded are lost (no server-side buffering)
3. The tRPC WebSocket (`wsClient` in `trpc.ts`) also disconnects, causing subscription drops

**Consequences:**
- Lost streaming AI responses during brief app switches
- "Reconnecting..." state that takes too long (backoff starts at 1s but may escalate)
- tRPC subscriptions (file operations progress, app state updates) silently stop delivering events
- User perceives the app as unreliable

**Prevention:**
- On `visibilitychange` event (`document.hidden`), immediately attempt reconnection when app becomes visible again (bypass backoff, use fresh connection)
- Reset the backoff counter on visibility resume: `backoffRef.current = 1000`
- For agent sessions: implement server-side message buffering with a short TTL (30-60s). On reconnect, send `{type: 'resume', sessionId}` to replay missed events
- For tRPC: `wsClient` already reconnects, but verify it does so promptly after resume. Consider calling `wsClient.close()` + recreate on visibility change
- Add a visual "Reconnecting..." banner that is less alarming (spinner, not error red)
- Accept that long background periods (>30s) will lose context -- design the UI to gracefully show "Session may have progressed while away"

**Detection:** Open AI chat, start a task, switch to another app for 10s, return. Check if messages resume.

**Livinity-specific note:** The existing `use-agent-socket.ts` has solid reconnection logic (exponential backoff, intentional close detection) but lacks `visibilitychange` awareness. The `connect()` function rebuilds the WebSocket from scratch which is correct, but the trigger timing is wrong for mobile resume scenarios.

---

### Pitfall 4: Window Manager Renders on Mobile — Broken Drag/Resize UI

**What goes wrong:** AI Chat, Terminal, Server Control, and other apps that render as draggable floating windows attempt to render on mobile. Elements are too small, drag handles don't work with touch, windows overlap and can't be moved, or the window system renders but is completely unusable.

**Why it happens:** The desktop metaphor (floating windows with title bars, drag, resize) fundamentally doesn't work on mobile screens. If the `isMobile` detection fails or a code path bypasses it, the window system renders.

**Consequences:**
- Completely unusable interface
- Users cannot interact with any window-based app
- Touch drag conflicts with scroll

**Prevention:**
- The codebase already has the right guard: `WindowsContainer` returns `null` when `useIsMobile()` is true. This is good.
- BUT: `useIsMobile()` uses `useBreakpoint()` from `react-use/createBreakpoint` which is a **window resize listener**, not a device detection. If a tablet in landscape is 1024px+ wide, `isMobile` returns `false` and windows render. This may be wrong for touch-only tablets.
- Add a secondary check: `'ontouchstart' in window && navigator.maxTouchPoints > 0` alongside the breakpoint check for full-screen app rendering
- Ensure ALL window-only apps (AI Chat, Terminal, Server Control, Subagents, Schedules) have mobile route equivalents that render full-screen
- Test iPad specifically: 1024px viewport width means `useIsMobile()` returns `false`

**Detection:** Open the PWA on an iPad in landscape. Check if windows render or full-screen routes render.

**Livinity-specific note:** The router comment says "AI pages are window-only. They open exclusively as draggable windows from the dock." This means there are NO route-based equivalents for AI Chat etc. on mobile. This is a fundamental gap that the PWA milestone must solve -- routing these apps to full-screen mobile views.

---

### Pitfall 5: Missing `viewport-fit=cover` — Safe Area Insets Resolve to 0px

**What goes wrong:** You add `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` CSS throughout the mobile UI, but on iOS devices with notches, content still hides behind the notch and home indicator. All inset values are 0px.

**Why it happens:** Safe area environment variables ONLY have non-zero values when the viewport meta tag includes `viewport-fit=cover`. Without it, iOS renders the PWA within the safe area automatically (with black bars), and the env variables are all 0. The current `index.html` has:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
```
This is missing `viewport-fit=cover`.

**Consequences:**
- Either: safe area CSS is added but has no effect (content still clips under notch)
- Or: `viewport-fit=cover` is added without corresponding safe area padding, and the status bar overlaps the top of the UI

**Prevention:**
- Add `viewport-fit=cover` to the viewport meta tag: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`
- Add it BEFORE writing any safe-area CSS -- otherwise you're testing against 0px values
- Add safe area padding to: the dock (bottom), top status area, any fixed-position elements, full-screen app views
- Use `calc()` to combine safe area with existing padding: `padding-top: calc(env(safe-area-inset-top) + 12px)`
- For older iOS (11-13), also include `constant()` fallback: `padding-top: constant(safe-area-inset-top); padding-top: env(safe-area-inset-top);`
- The body background color shows through the safe area -- ensure `theme-color` meta tag and body background match

**Detection:** View on iPhone with notch. If top/bottom content is not under the notch, `viewport-fit=cover` is missing and safe area vars are 0.

**Livinity-specific note:** The existing `index.html` sets `<meta name="theme-color" content="#f8f9fc" />` which is good. The body background is `#f8f9fc`. These match, so the safe area "bleed" will look correct once `viewport-fit=cover` is added.

---

### Pitfall 6: 100vh Creates Scrollable Content on iOS — Layout Breaks

**What goes wrong:** Full-screen layouts using `height: 100vh` are taller than the visible viewport. Users see a scroll bounce. Fixed bottom elements (dock, navigation) appear below the fold.

**Why it happens:** On iOS Safari, `100vh` equals the MAXIMUM viewport height (with browser chrome fully collapsed). On initial load and in standalone mode, the actual visible height is smaller. This creates ~70px of extra height that causes overflow.

**Consequences:**
- Visible scroll on what should be a fixed-height layout
- Bottom-fixed elements not visible without scrolling
- Rubber-band bounce effect on the entire page

**Prevention:**
- Livinity desktop layout ALREADY uses `100dvh` correctly in `layouts/desktop.tsx`: `h-[100dvh]`. This is good.
- But `index.html` uses `class="h-full min-h-full"` on both `<html>` and `<body>`, plus `#root` also has `h-full min-h-full`. On mobile, `h-full` on `<html>` resolves to `100%` of the viewport (which IS correct), but combined with `min-h-full` it can cause issues with scrollable body.
- Audit ALL height calculations: `SheetLayout` uses `h-[calc(100dvh-var(--sheet-top))]` which is correct
- Any `h-screen` usage (Tailwind for `100vh`) must be replaced with `h-dvh` (for `100dvh`) on mobile
- For the mobile app grid and full-screen app views, always use `dvh` units or `h-full` on a parent that itself uses `dvh`
- Note: `100dvh` does NOT adjust when the iOS keyboard opens. Use `visualViewport` API for keyboard-aware sizing.

**Detection:** Open PWA on iPhone. If the page bounces when you try to scroll on what should be a non-scrollable view, `100vh` is the culprit.

**Livinity-specific note:** The desktop layout is fine (`100dvh`). The risk is in NEW mobile-specific components and in the Sheet layout which may need adjustment for mobile full-screen rendering. Five existing files use `100vh` directly -- these need auditing.

---

## Moderate Pitfalls

Issues that cause significant UX degradation but not complete breakage.

---

### Pitfall 7: iOS Overscroll Bounce — App Feels Like a Website

**What goes wrong:** User drags down on the top of the app and sees the iOS rubber-band bounce effect with white space appearing. User swipes left/right and triggers back/forward navigation. The app feels like a web page, not a native app.

**Prevention:**
- Apply `overscroll-behavior: none` on `html` and `body` to prevent pull-to-refresh and rubber-banding on the outer shell
- Be selective: only prevent on the outer container. Individual scroll areas (file list, chat messages, settings) should still have natural scroll behavior
- Safari 16+ supports `overscroll-behavior`. For older versions, add `position: fixed; overflow: hidden` on the body with a scrollable inner container
- Add `touch-action: manipulation` to prevent double-tap zoom (eliminates 300ms tap delay)
- The CSS in `index.css` already has `-webkit-tap-highlight-color: transparent` which is a good start

**Detection:** Pull down on the home screen. If white space appears above the wallpaper, overscroll prevention is missing.

---

### Pitfall 8: iOS PWA Manifest Gaps — Install Looks Wrong

**What goes wrong:** PWA installs but: splash screen shows wrong color/icon, app name is truncated, status bar is wrong color, or the app icon is a generic Safari screenshot.

**Prevention:**
- The existing `site.webmanifest` is minimal -- it only has 192px and 512px icons, both PNG. It is missing:
  - `start_url` (defaults to current page URL at install time, which could be `/settings` or `/login`)
  - `scope` (without it, ALL navigations stay in-app, including OAuth redirects)
  - `orientation` (should be `"any"` for phones/tablets)
  - `description` (used in some install prompts)
  - `id` (recommended for PWA identity consistency across installs)
- Add Apple-specific meta tags to `index.html`:
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` (so status bar uses app background color)
  - Multiple `apple-touch-icon` sizes (120x120, 152x152, 167x167, 180x180)
  - `apple-touch-startup-image` for splash screens (multiple resolutions, or use a generator)
- Set `start_url: "/"` and `scope: "/"` explicitly in the manifest
- `theme_color` in manifest should match `<meta name="theme-color">` and body background
- **Current conflict:** manifest has `theme_color: "#000000"` and `background_color: "#000000"` but the meta tag has `#f8f9fc` and the body background is `#f8f9fc`. These MUST be aligned. The splash screen will show a black background (from manifest) then flash to light gray (from CSS) on app load.

**Detection:** Install PWA on iOS. Watch the splash screen color. Check the status bar color. Verify the icon matches what you expect.

---

### Pitfall 9: tRPC WebSocket Split Link Fails Silently on Mobile Resume

**What goes wrong:** After iOS kills the background PWA process and user returns, the tRPC `wsClient` is in a broken state. Queries routed through the WebSocket link hang indefinitely. The split link in `trpc.ts` routes most queries/mutations through WebSocket when JWT exists, so most of the app stops working.

**Prevention:**
- The `wsClient` from `@trpc/client` has built-in reconnection, but verify it handles the iOS "process killed and restarted" scenario (not just a clean `close` event)
- Add a `visibilitychange` listener that pings the WebSocket and forces reconnection if it doesn't respond within 2 seconds
- Consider routing all queries/mutations through HTTP by default on mobile (only subscriptions on WS). This is more resilient to connection drops. The `httpOnlyPaths` mechanism already exists -- expand it for mobile
- Alternatively, add a "connection health" check that switches to HTTP fallback when WS is unavailable

**Detection:** On iOS PWA, background the app for 60s, return, try to navigate to Settings or any page that fetches data. If it hangs, the WS link is broken.

**Livinity-specific note:** The tRPC transport architecture (`trpc.ts`) uses a `splitLink` that routes non-subscription traffic through WS when a JWT exists. This is optimal for desktop (persistent WS = lower latency) but fragile on mobile. The simplest fix: detect mobile PWA (`navigator.standalone || window.matchMedia('(display-mode: standalone)').matches`) and force all non-subscription traffic through HTTP.

---

### Pitfall 10: Keyboard Pushes Content Up — Chat Input Unusable

**What goes wrong:** User taps the AI chat input. The iOS keyboard slides up. The entire viewport shifts, the chat messages scroll position is lost, the input field is hidden behind the keyboard or pushed off screen.

**Prevention:**
- Use `visualViewport` API to detect keyboard presence: `window.visualViewport.height < window.innerHeight` means keyboard is open
- On mobile, pin the chat input to the visual viewport bottom, not the layout viewport bottom
- Add `interactive-widget=resizes-content` to the viewport meta tag for Android/Chrome to resize properly
- On iOS standalone mode, the keyboard does NOT resize the viewport. `100dvh` does NOT change when the keyboard opens. You must use `visualViewport` resize events to adjust manually
- For the AI chat specifically: when keyboard opens, scroll the message list up so the latest message and input are both visible
- Avoid `position: fixed` for the input on mobile -- use `position: sticky` or a flex layout that naturally accommodates the keyboard

**Detection:** Open AI chat on iOS PWA, tap input field, check if input is visible and messages are scrollable.

---

### Pitfall 11: Framer Motion Drag Conflicts with Touch Scroll

**What goes wrong:** Components using Framer Motion's `drag` prop (dock items, windows, app icons in the grid) interfere with native touch scrolling. User tries to scroll a list but accidentally drags an element. Or the reverse: user tries to drag but the scroll captures the gesture.

**Prevention:**
- Disable `drag` prop on touch devices for components where it's not needed (dock magnification, window dragging)
- Use `dragConstraints` and `dragElastic` to limit drag behavior
- For the app grid: use long-press to enter "edit mode" (like iOS home screen) before enabling drag. Do not allow drag on normal taps
- Set `touch-action: pan-y` on vertically-scrollable containers to tell the browser "vertical touch = scroll, not drag"
- Framer Motion's `dragListener: false` can conditionally disable drag on mobile
- The dock uses `useMotionValue` for mouse-position-based magnification -- this entire interaction model needs to be replaced on mobile (no hover on touch devices)

**Detection:** On mobile, try to scroll through a list that contains draggable elements. If the list doesn't scroll smoothly, there's a conflict.

---

### Pitfall 12: OAuth/External Auth Redirects Break Standalone Mode

**What goes wrong:** User tries to connect Claude (OAuth PKCE) or any external service from within the standalone PWA. The OAuth redirect takes them to an external domain, which opens in Safari (not the PWA). After auth completes, the callback URL opens in Safari, not the standalone PWA. The auth token is stored in Safari's localStorage, not the PWA's.

**Prevention:**
- For Claude OAuth: use popup-based auth (`window.open`) instead of redirect-based auth. Popups in iOS PWA open in an in-app browser that shares the PWA context
- For OAuth redirect flows: use the `postMessage` pattern -- open auth in a new window, have the callback page `postMessage` the token back to the PWA window
- Set the manifest `scope` carefully. URLs outside scope will open in Safari on iOS < 12.2, and in an in-app browser on iOS >= 12.2
- Test every OAuth flow on iOS standalone PWA specifically
- The Kimi OAuth device flow (RFC 8628) is actually fine here -- it uses a separate browser for the auth step and the device code is entered manually, so storage isolation doesn't matter

**Detection:** In standalone PWA mode, trigger Claude OAuth. Check if the callback returns to the PWA or opens in Safari.

---

## Minor Pitfalls

Issues that cause slight UX friction or require small fixes.

---

### Pitfall 13: No Native Back Button — Users Get Trapped

**What goes wrong:** User navigates from home to Settings to a sub-page. There is no back button. On desktop, there's a close button and the dock. On mobile standalone PWA, there is no browser back button and no dock (by design for v23.0).

**Prevention:**
- Add a back/close button to every mobile view's header
- Consider iOS swipe-from-left-edge gesture for back navigation (but be careful not to conflict with app gestures)
- Use `window.history.length` to determine if back navigation is possible; if not, navigate to home
- Implement a simple mobile nav header component: `[< Back] [Title] [...]`

---

### Pitfall 14: `maximum-scale=1` Prevents Accessibility Zoom

**What goes wrong:** The current viewport meta tag has `maximum-scale=1` which prevents pinch-to-zoom. This is an accessibility violation (WCAG 1.4.4). Safari may also ignore this on newer iOS versions, creating inconsistent behavior.

**Prevention:**
- Remove `maximum-scale=1` from the viewport meta tag
- Use `touch-action: manipulation` in CSS instead -- this prevents double-tap zoom (removing the 300ms delay) without preventing pinch-to-zoom
- For specific views where zoom is problematic (AI chat, terminal), you can set `touch-action: none` on those containers only

---

### Pitfall 15: Font Loading Fails Offline

**What goes wrong:** The `index.css` imports Google Fonts via URL: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap')`. In PWA offline mode, this request fails. Font falls back to system font, causing layout shift and visual regression.

**Prevention:**
- Self-host the font files in the `public/fonts/` directory
- Include them in the service worker precache manifest
- Use `@font-face` declarations instead of the Google Fonts import URL
- Add `font-display: swap` (already implied by `&display=swap` parameter but won't matter if the request fails entirely offline)

---

### Pitfall 16: iOS 7-Day Storage Expiration

**What goes wrong:** A user installs the PWA but doesn't use it for 8 days. When they return, all `localStorage` data (JWT, desktop layout, preferences, conversation IDs) is potentially wiped by WebKit's Intelligent Tracking Prevention.

**Prevention:**
- This applies to "unused" origins only. If the user opens the PWA regularly, the timer resets
- Server-side state is already the source of truth for most data (PostgreSQL for user data, Redis for sessions)
- The JWT will expire on its own timeline anyway; re-login is expected
- Desktop layout and folders already sync to server preferences (`trpcReact.preferences.get`), so they'll restore after re-login
- Add a migration path: on first load, if localStorage is empty but server state exists, restore from server

---

### Pitfall 17: PWA Install Prompt Missing on Android — Users Don't Know They Can Install

**What goes wrong:** Android Chrome shows a native install prompt (beforeinstallprompt event), but only if the PWA meets all installability criteria. If any criterion is missed (no service worker, wrong manifest, no HTTPS), the prompt never fires and users never discover they can install the app.

**Prevention:**
- Ensure manifest has: `name`, `short_name`, `start_url`, `display: standalone`, at least one 192x192 and one 512x512 icon, `theme_color`
- Register a service worker with a fetch handler (even if minimal)
- Serve over HTTPS (already done via Caddy)
- Capture the `beforeinstallprompt` event and show a custom install banner
- On iOS (where there is no `beforeinstallprompt`), show a manual "Add to Home Screen" instruction overlay on first visit

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| PWA manifest + service worker setup | Pitfall 2 (stale cache), Pitfall 5 (viewport-fit), Pitfall 8 (manifest gaps) | Get these right FIRST before any UI work. Wrong manifest = bad install experience. Wrong caching = stuck users. |
| Mobile app grid / home screen | Pitfall 4 (window manager on mobile), Pitfall 6 (100vh), Pitfall 7 (overscroll) | Build the full-screen routing system before individual app views. Test height on real iOS device early. |
| Full-screen app rendering | Pitfall 10 (keyboard), Pitfall 11 (Framer drag vs scroll), Pitfall 13 (no back button) | AI Chat is the hardest -- keyboard interaction + streaming content + reconnection. Start with simpler apps (Settings, Files). |
| Safe area handling | Pitfall 5 (env vars resolve to 0 without viewport-fit), Pitfall 8 (status bar color mismatch) | Must be done in the manifest/meta phase, not after. Retrofitting safe area padding is much harder than building it in from the start. |
| Auth + reconnection on mobile | Pitfall 1 (storage isolation), Pitfall 3 (WS dies on background), Pitfall 9 (tRPC WS), Pitfall 12 (OAuth redirect) | These are the highest-risk items. Test on real iOS hardware. Simulators do not accurately replicate backgrounding behavior. |
| Service worker updates | Pitfall 2 (stuck versions), Pitfall 15 (font loading offline) | Implement update prompt from day one. Do not ship without it. Self-host fonts before enabling offline support. |

## Key Testing Requirements

**You MUST test on real iOS hardware.** iOS Simulator does not accurately reproduce:
- WebSocket backgrounding/killing behavior
- Safe area inset values (simulator has no notch by default)
- Storage isolation between Safari and standalone mode
- Keyboard viewport behavior in standalone mode
- Service worker update flow
- Home screen installation flow

Minimum test matrix:
- iPhone with notch (14/15/16) in standalone PWA mode
- iPad in both portrait and landscape
- Android Chrome (for comparison/baseline)
- Desktop browser (regression testing -- desktop UI must be UNCHANGED)

## "Looks Done But Isn't" Checklist

- [ ] **Manifest alignment**: `theme_color` and `background_color` in manifest match `<meta name="theme-color">` and body CSS
- [ ] **viewport-fit=cover**: Added to viewport meta tag AND safe area padding applied to all edges
- [ ] **Service worker update**: Deploy v2, verify v1 users see "Update available" prompt
- [ ] **Storage isolation**: Install on iOS, verify login is required (not broken, just expected)
- [ ] **WebSocket resume**: Background PWA for 10s, return, verify agent chat and tRPC both reconnect within 2s
- [ ] **Window-only apps on mobile**: AI Chat, Terminal, Server Control render full-screen, not in window manager
- [ ] **Keyboard behavior**: AI Chat input visible when keyboard is open on iOS
- [ ] **Overscroll prevention**: Home screen does not rubber-band when pulling down
- [ ] **Back navigation**: Every mobile screen has a way to go back. No dead ends.
- [ ] **Font offline**: Disconnect network, reload PWA, verify Space Grotesk font renders (not system fallback)
- [ ] **Desktop unchanged**: Load on desktop browser, verify zero visual/behavioral differences from pre-PWA build
- [ ] **iPad landscape**: Verify app grid or windows render appropriately at 1024px+ viewport
- [ ] **OAuth flows**: Claude OAuth PKCE works in standalone mode (popup, not redirect)
- [ ] **Status bar**: On iOS standalone, status bar text is readable (not white-on-white or black-on-black)
- [ ] **Install prompt**: On Android, `beforeinstallprompt` fires and custom install banner appears

## Sources

- [PWA iOS Limitations and Safari Support 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Navigating Safari/iOS PWA Limitations](https://vinova.sg/navigating-safari-ios-pwa-limitations/)
- [PWA on iOS - Current Status 2025](https://brainhub.eu/library/pwa-on-ios)
- [GitHub PWA-POLICE/pwa-bugs](https://github.com/PWA-POLICE/pwa-bugs)
- [How to share state between Safari and standalone PWA](https://jakub-kozak.medium.com/how-to-share-state-data-between-a-pwa-in-ios-safari-and-standalone-mode-64174a48b043)
- [Handling Service Worker Updates - Chrome Workbox Docs](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)
- [Service Worker Precache - Vite PWA](https://vite-pwa-org.netlify.app/guide/service-worker-precache)
- [Make Your PWAs Look Handsome on iOS](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08)
- [CSS env() Safe Area Insets - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Dynamic Viewport Units - web.dev](https://web.dev/blog/viewport-units)
- [Fix Mobile Keyboard Overlap with VisualViewport](https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a)
- [CSS overscroll-behavior - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior)
- [Vite Plugin PWA - GitHub](https://github.com/vite-pwa/vite-plugin-pwa)
- [300ms Tap Delay Gone Away - Chrome Blog](https://developer.chrome.com/blog/300ms-tap-delay-gone-away)
- [PWA Status Bar Customization](https://medium.com/appscope/changing-the-ios-status-bar-of-your-progressive-web-app-9fc8fbe8e6ab)
- [iOS PWA External Links and Scope](https://vinova.sg/navigating-safari-ios-pwa-limitations/)
- [PWA Design Tips - firt.dev](https://firt.dev/pwa-design-tips/)
- [iOS PWA Compatibility - firt.dev](https://firt.dev/notes/pwa-ios/)
- [Vite PWA InjectManifest Strategy](https://vite-pwa-org.netlify.app/guide/inject-manifest)
- Livinity codebase direct inspection: `index.html`, `vite.config.ts`, `site.webmanifest`, `use-auth.tsx`, `use-agent-socket.ts`, `trpc.ts`, `desktop.tsx`, `windows-container.tsx`, `sheet.tsx`, `dock.tsx`, `use-is-mobile.ts`, `index.css`, `shared.ts`, `desktop-content.tsx`, `router.tsx`

---
*Pitfalls research for: Adding Mobile PWA to Livinity desktop-first React SPA*
*Researched: 2026-04-01*
