# Phase 40: Polish + iOS Hardening - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Final polish: custom install prompt banner, minimal splash screen (logo + theme color), WebSocket reconnection on iOS background/resume, and keyboard-safe viewport handling. Makes the PWA feel native-quality on iOS.

</domain>

<decisions>
## Implementation Decisions

### Install Prompt Banner (PWA-05)
- Small bottom banner: "Add Livinity to Home Screen" with app icon + Install + Dismiss buttons
- Only shown on mobile Safari when NOT already in standalone mode
- Shown once per device (localStorage flag after dismiss/install)
- Uses `beforeinstallprompt` event on Android, custom banner on iOS
- Dismiss button sets localStorage flag, never shows again

### Splash Screen (PWA-06)
- Minimal approach: rely on manifest theme_color (#f8f9fc) + name + icon
- No per-device apple-launch-image media queries (fragile, changes with new devices)
- The manifest already has 192x192 and 512x512 icons — sufficient for splash

### WebSocket Reconnection (IOS-02)
- Add visibilitychange listener to use-agent-socket.ts
- When page becomes visible after being hidden: check WS readyState, force reconnect if not OPEN
- Same pattern for tRPC WebSocket link if applicable
- Small delay (500ms) after visibility change to let network resume

### Keyboard Handling (IOS-03)
- Use 100dvh (already in use) instead of 100vh
- Add visualViewport resize listener for keyboard detection
- When keyboard opens: scroll input into view, adjust chat input position
- Prevent iOS bounce/zoom on input focus (already handled by overscroll-behavior from Phase 37)

### Claude's Discretion
- Banner animation style
- Banner icon size and layout
- Exact visualViewport resize handling approach
- Whether to add a useIsStandalone() hook

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/src/hooks/use-agent-socket.ts` — WebSocket hook with reconnect logic
- `livos/packages/ui/src/hooks/use-is-mobile.ts` — useIsMobile()
- `livos/packages/ui/src/index.css` — already has overscroll-behavior:none, standalone media query
- Manifest already configured in vite.config.ts (Phase 37)

### Established Patterns
- localStorage for persistent flags
- Framer Motion for animations
- Tailwind CSS utilities

### Integration Points
- `use-agent-socket.ts` — add visibilitychange listener
- `router.tsx` — render InstallPromptBanner
- New component for install banner
- Chat input area for keyboard handling

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's in decisions.

</specifics>

<deferred>
## Deferred Ideas

- Per-device splash screen images (future if needed)
- Push notification permission prompt (v2)
- Offline mode with cached conversations (v2)

</deferred>
