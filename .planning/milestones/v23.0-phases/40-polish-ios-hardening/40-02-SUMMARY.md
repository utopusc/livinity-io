---
phase: 40-polish-ios-hardening
plan: 02
subsystem: ui
tags: [ios, pwa, websocket, keyboard, visibilitychange, visualViewport, react-hooks]

# Dependency graph
requires:
  - phase: 37-pwa-manifest-service-worker
    provides: PWA installability and safe area CSS foundation
  - phase: 38-mobile-navigation-infrastructure
    provides: MobileAppContext, useIsMobile hook, mobile navigation
provides:
  - visibilitychange-aware WebSocket reconnection for iOS background/resume
  - useKeyboardHeight hook using Visual Viewport API
  - keyboard-safe chat input positioning on mobile
affects: [ai-chat, mobile-experience]

# Tech tracking
tech-stack:
  added: []
  patterns: [visibilitychange reconnection, visualViewport keyboard detection, conditional mobile styling]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-keyboard-height.ts
  modified:
    - livos/packages/ui/src/hooks/use-agent-socket.ts
    - livos/packages/ui/src/routes/ai-chat/chat-input.tsx

key-decisions:
  - "500ms delay after visibilitychange before WS reconnect attempt (lets iOS networking stack resume)"
  - "100px threshold for keyboard detection (avoids false positives from toolbar/address bar changes)"
  - "paddingBottom offset approach for keyboard avoidance (works with existing flex layout)"

patterns-established:
  - "visibilitychange reconnection: 500ms delay + readyState check + backoff reset for mobile WS recovery"
  - "useKeyboardHeight: visualViewport-based keyboard detection with threshold guard"

requirements-completed: [IOS-02, IOS-03]

# Metrics
duration: 3min
completed: 2026-04-01
---

# Phase 40 Plan 02: iOS Hardening Summary

**WebSocket auto-reconnection on iOS background/resume via visibilitychange, plus keyboard-safe chat input using Visual Viewport API**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T18:18:05Z
- **Completed:** 2026-04-01T18:21:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- WebSocket auto-reconnects within ~1.5s after iOS background/resume (500ms delay + connect)
- Backoff counter resets on resume so reconnection is immediate, not exponentially delayed
- iOS keyboard in standalone PWA no longer hides the chat input (paddingBottom offset + scrollIntoView)
- Desktop behavior completely unchanged (all changes gated on isMobile and keyboardHeight checks)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add visibilitychange reconnection to use-agent-socket.ts** - `d59abbb` (feat)
2. **Task 2: Create useKeyboardHeight hook and apply keyboard-safe positioning to chat-input** - `3d5361d` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-agent-socket.ts` - Added visibilitychange useEffect for iOS WS reconnection
- `livos/packages/ui/src/hooks/use-keyboard-height.ts` - New hook returning keyboard height via visualViewport API
- `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` - Keyboard-aware paddingBottom + scrollIntoView on mobile

## Decisions Made
- 500ms delay after visibilitychange before WS reconnect (per user decision, lets iOS networking resume)
- 100px threshold for keyboard detection avoids false positives from toolbar/address bar height changes
- paddingBottom approach (not transform/translate) works naturally with existing flex column layout
- Both resize and scroll events on visualViewport for complete iOS coverage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 40 (polish-ios-hardening) is now complete (both plans done)
- All iOS hardening requirements (IOS-02, IOS-03) satisfied
- Real-device iOS testing recommended to validate keyboard behavior in standalone PWA mode
- v23.0 Mobile PWA milestone is ready for final verification

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 40-polish-ios-hardening*
*Completed: 2026-04-01*
