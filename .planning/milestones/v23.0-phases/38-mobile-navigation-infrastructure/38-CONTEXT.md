# Phase 38: Mobile Navigation Infrastructure - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the core mobile app rendering infrastructure: MobileAppContext (state), MobileAppRenderer (full-screen overlay), and back navigation hook. When a system app is "opened" on mobile, it renders full-screen using the existing WindowAppContent lazy-loader. Desktop UI is completely untouched.

</domain>

<decisions>
## Implementation Decisions

### App Opening Animation
- Right-to-left slide-in animation using Framer Motion (iOS native style)
- AnimatePresence for mount/unmount transitions
- Duration: 200-300ms, ease-out curve

### Header Bar & Back Navigation
- Minimal white header bar with safe-area-top padding
- Left arrow back button + centered app title
- Hardware/OS back button support via popstate/history API
- iOS swipe-back gesture: not custom — rely on browser default if in Safari, or provide fallback

### Architecture
- New MobileAppContext (React context) — manages which app is open on mobile
- New MobileAppRenderer component — renders full-screen overlay with header + WindowAppContent
- Integrate into router.tsx — render alongside existing Desktop + WindowsContainer
- MobileAppContext is separate from WindowManagerProvider (no desktop state pollution)
- WindowAppContent from window-content.tsx already maps every appId to lazy component — reuse it directly

### Claude's Discretion
- Exact Framer Motion spring/tween config values
- z-index layering relative to existing overlays
- Whether to use React Router history push or custom state management for back button

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/src/modules/window/window-content.tsx` — WindowAppContent maps appId → lazy component
- `livos/packages/ui/src/hooks/use-is-mobile.ts` — useIsMobile() hook
- `livos/packages/ui/src/modules/window/windows-container.tsx` — returns null on mobile (integration point)
- Framer Motion already in 52+ files — AnimatePresence, motion.div patterns established

### Established Patterns
- Context providers in `src/providers/` directory
- Lazy loading with React.lazy + Suspense fallback
- AnimatePresence for mount/unmount animations

### Integration Points
- `src/router.tsx` — render MobileAppRenderer alongside Desktop
- `src/modules/desktop/desktop-content.tsx` — system app onClick handlers need to open via MobileAppContext on mobile
- `src/modules/desktop/dock.tsx` — dock items need to use MobileAppContext on mobile (before dock is hidden in Phase 39)

</code_context>

<specifics>
## Specific Ideas

- The overlay should be fixed inset-0 with z-40 or higher
- App title should come from the appId mapping or a title prop
- Back button should close the app and show the home screen (desktop grid)
- WindowAppContent already handles: AI Chat, Settings, Files, Server Control, Terminal, App Store, Live Usage, Agents, Schedules, My Devices, Remote Desktop, Chrome

</specifics>

<deferred>
## Deferred Ideas

- Bottom tab bar navigation (Phase 39)
- System apps in grid (Phase 39)  
- Page transitions between apps (Phase 40)
- Gesture-based app switching (v2)

</deferred>
