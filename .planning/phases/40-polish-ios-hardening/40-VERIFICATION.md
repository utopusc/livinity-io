---
phase: 40-polish-ios-hardening
verified: 2026-04-01T19:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
must_haves:
  truths:
    - "First-time mobile visitors see a bottom banner suggesting Add to Home Screen"
    - "Banner is NOT shown when app is already in standalone (installed) mode"
    - "Banner is NOT shown after user dismisses it (persisted in localStorage)"
    - "On Android, the native beforeinstallprompt event is intercepted and surfaced via the banner Install button"
    - "On iOS, the banner shows manual instruction text since there is no beforeinstallprompt API"
    - "iOS splash screen displays theme_color background with app icon during launch (manifest-driven)"
    - "After backgrounding and resuming the PWA on iOS, WebSocket connections automatically reconnect within 2 seconds"
    - "The backoff counter resets on visibility resume so reconnection is immediate"
    - "When the iOS keyboard opens in AI Chat, the input field remains visible above the keyboard"
    - "The viewport does not break or shift unexpectedly when the keyboard opens"
    - "Desktop behavior is completely unchanged by these modifications"
  artifacts:
    - path: "livos/packages/ui/src/components/install-prompt-banner.tsx"
      provides: "Install prompt banner component"
    - path: "livos/packages/ui/src/hooks/use-is-standalone.ts"
      provides: "Hook to detect standalone PWA mode"
    - path: "livos/packages/ui/src/hooks/use-keyboard-height.ts"
      provides: "Hook returning current keyboard height via visualViewport API"
    - path: "livos/packages/ui/src/router.tsx"
      provides: "InstallPromptBanner rendered in layout tree"
    - path: "livos/packages/ui/src/hooks/use-agent-socket.ts"
      provides: "visibilitychange-aware WebSocket reconnection"
    - path: "livos/packages/ui/src/routes/ai-chat/chat-input.tsx"
      provides: "Keyboard-aware chat input positioning"
  key_links:
    - from: "router.tsx"
      to: "install-prompt-banner.tsx"
      via: "JSX <InstallPromptBanner />"
    - from: "install-prompt-banner.tsx"
      to: "use-is-standalone.ts"
      via: "import useIsStandalone"
    - from: "use-agent-socket.ts"
      to: "WebSocket reconnection"
      via: "visibilitychange event handler"
    - from: "chat-input.tsx"
      to: "use-keyboard-height.ts"
      via: "import useKeyboardHeight"
human_verification:
  - test: "Open Livinity in iOS Safari on a non-installed device and verify the install prompt banner appears at the bottom"
    expected: "A banner with the Livinity icon, Add to Home Screen text, Share icon instruction, and dismiss X button slides up from the bottom"
    why_human: "Requires real iOS Safari to trigger isIos detection and verify banner rendering above the tab bar"
  - test: "Install Livinity as a PWA on iOS, then open the standalone app"
    expected: "The install banner does NOT appear since the app is in standalone mode. A branded splash screen with #f8f9fc background displays during launch."
    why_human: "Standalone mode detection and splash screen rendering require a real installed PWA"
  - test: "On Android Chrome, visit Livinity for the first time"
    expected: "The banner appears with an Install button. Tapping Install triggers the native Android install prompt."
    why_human: "The beforeinstallprompt event only fires on real Android Chrome"
  - test: "In the iOS PWA, open AI Chat, start a streaming conversation, then switch to another app for 10 seconds and return"
    expected: "WebSocket reconnects automatically within ~1.5 seconds and streaming resumes"
    why_human: "Requires real iOS background/resume cycle to trigger visibilitychange + WS close"
  - test: "In the iOS PWA AI Chat, tap the chat input to open the keyboard"
    expected: "The input field rises above the keyboard and remains fully visible. The viewport does not shift unexpectedly."
    why_human: "iOS standalone PWA keyboard behavior cannot be simulated programmatically"
---

# Phase 40: Polish + iOS Hardening Verification Report

**Phase Goal:** The PWA feels native on iOS with smooth transitions, branded splash screens, guided installation, resilient connectivity, and keyboard-safe input layouts
**Verified:** 2026-04-01T19:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | First-time mobile visitors see a bottom banner suggesting Add to Home Screen | VERIFIED | `install-prompt-banner.tsx` line 47: `visible = isMobile && !isStandalone && !dismissed && (!!deferredPrompt \|\| isIos)`, rendered in `router.tsx` line 83 |
| 2 | Banner is NOT shown when app is already in standalone mode | VERIFIED | `!isStandalone` in visibility check; `use-is-standalone.ts` checks `navigator.standalone` (iOS) and `matchMedia('(display-mode: standalone)')` (Android) with change listener |
| 3 | Banner is NOT shown after user dismisses it (persisted in localStorage) | VERIFIED | Init: `localStorage.getItem('liv:install-prompt-dismissed') === '1'`; Dismiss: `localStorage.setItem('liv:install-prompt-dismissed', '1')` |
| 4 | On Android, native beforeinstallprompt event intercepted and surfaced via Install button | VERIFIED | `beforeinstallprompt` listener in useEffect (line 22-29), `handleInstall` calls `deferredPrompt.prompt()` + awaits `userChoice` |
| 5 | On iOS, banner shows manual instruction text | VERIFIED | iOS detection via UA string, renders "Tap Share then Add to Home Screen" with TbShare icon (lines 69-72) |
| 6 | iOS splash screen displays theme_color background (manifest-driven) | VERIFIED | All three sources aligned: vite.config.ts `theme_color: '#f8f9fc'`, index.html `<meta name="theme-color" content="#f8f9fc">`, body `style="background: #f8f9fc"` |
| 7 | After backgrounding and resuming the PWA, WebSocket connections auto-reconnect within 2s | VERIFIED | `use-agent-socket.ts` lines 411-432: visibilitychange handler with 500ms delay, checks `ws.readyState !== WebSocket.OPEN`, calls `connect()` |
| 8 | Backoff counter resets on visibility resume for immediate reconnection | VERIFIED | `backoffRef.current = 1000` at line 420, pending reconnect timer cleared at lines 422-425 |
| 9 | When iOS keyboard opens in AI Chat, input field remains visible above keyboard | VERIFIED | `chat-input.tsx` line 191: `style={isMobile && keyboardHeight > 0 ? {paddingBottom: keyboardHeight + 12 + 'px'} : undefined}`, plus `scrollIntoView` at lines 44-52 |
| 10 | Viewport does not break or shift unexpectedly when keyboard opens | VERIFIED | `use-keyboard-height.ts` uses visualViewport API with 100px threshold to avoid false positives; conditional styling only applied on mobile |
| 11 | Desktop behavior is completely unchanged | VERIFIED | All changes gated: banner requires `isMobile`, keyboard offset requires `isMobile && keyboardHeight > 0`, visibilitychange WS reconnect skips when WS is OPEN |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/ui/src/components/install-prompt-banner.tsx` | Install prompt banner component | VERIFIED | 102 lines, full implementation with Android native install + iOS manual instructions + localStorage dismissal |
| `livos/packages/ui/src/hooks/use-is-standalone.ts` | Standalone PWA mode detection hook | VERIFIED | 25 lines, dual detection (navigator.standalone + matchMedia), change listener |
| `livos/packages/ui/src/hooks/use-keyboard-height.ts` | Keyboard height via visualViewport API | VERIFIED | 28 lines, listens to resize + scroll events, 100px threshold |
| `livos/packages/ui/src/router.tsx` | InstallPromptBanner rendered in layout | VERIFIED | Import at line 5, rendered at line 83 after MobileTabBar |
| `livos/packages/ui/src/hooks/use-agent-socket.ts` | visibilitychange WS reconnection | VERIFIED | Lines 411-432, 500ms delay, backoff reset, connect() call |
| `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` | Keyboard-aware input positioning | VERIFIED | useKeyboardHeight import at line 6, paddingBottom at line 191, scrollIntoView at lines 44-52 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `router.tsx` | `install-prompt-banner.tsx` | `<InstallPromptBanner />` JSX | WIRED | Import at line 5, rendered at line 83 inside MobileAppProvider |
| `install-prompt-banner.tsx` | `use-is-standalone.ts` | `import useIsStandalone` | WIRED | Import at line 6, called at line 17, used in visibility check at line 47 |
| `install-prompt-banner.tsx` | `use-is-mobile.ts` | `import useIsMobile` | WIRED | Import at line 5, called at line 16, used in visibility check at line 47 |
| `use-agent-socket.ts` | WebSocket reconnection | `visibilitychange` event handler | WIRED | addEventListener at line 430, handler checks readyState and calls connect() |
| `chat-input.tsx` | `use-keyboard-height.ts` | `import useKeyboardHeight` | WIRED | Import at line 6, called at line 40, used for paddingBottom at line 191 and scrollIntoView at line 45 |
| `chat-input.tsx` | `use-is-mobile.ts` | `import useIsMobile` | WIRED | Import at line 7, called at line 41, gates keyboard offset at line 191 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PWA-05 | 40-01-PLAN | User sees a custom install prompt banner suggesting "Add to Home Screen" on first visit | SATISFIED | InstallPromptBanner component with platform detection, dismissal persistence, standalone gating |
| PWA-06 | 40-01-PLAN | iOS splash screens display correctly during app launch | SATISFIED | Manifest theme_color, meta theme-color, and body background all aligned at #f8f9fc |
| IOS-02 | 40-02-PLAN | WebSocket reconnects automatically after iOS background/resume cycle | SATISFIED | visibilitychange handler in use-agent-socket.ts with 500ms delay and backoff reset |
| IOS-03 | 40-02-PLAN | iOS keyboard opening doesn't break viewport layout | SATISFIED | useKeyboardHeight hook via visualViewport API, paddingBottom offset + scrollIntoView in chat-input.tsx |

No orphaned requirements found. REQUIREMENTS.md maps exactly PWA-05, PWA-06, IOS-02, IOS-03 to Phase 40 and all are accounted for in the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

No TODOs, FIXMEs, placeholders, console.logs, empty returns, or stub patterns found in any of the 6 modified/created files.

### Commit Verification

All 4 commits claimed in summaries exist in git history:

| Commit | Message | Verified |
|--------|---------|----------|
| `d78cc1c` | feat(40-01): create useIsStandalone hook and InstallPromptBanner component | Yes |
| `705a1f8` | feat(40-01): render InstallPromptBanner in router and verify splash screen config | Yes |
| `d59abbb` | feat(40-02): add visibilitychange WebSocket reconnection for iOS background/resume | Yes |
| `3d5361d` | feat(40-02): keyboard-safe chat input positioning for iOS PWA | Yes |

### Human Verification Required

### 1. iOS Install Prompt Banner

**Test:** Open Livinity in iOS Safari on a non-installed device
**Expected:** A banner with the Livinity icon, "Add to Home Screen" text, Share icon instruction, and dismiss X button slides up from the bottom
**Why human:** Requires real iOS Safari to trigger isIos detection and verify banner rendering above the tab bar

### 2. Standalone Mode Suppression and Splash Screen

**Test:** Install Livinity as a PWA on iOS, then open the standalone app
**Expected:** The install banner does NOT appear since the app is in standalone mode. A branded splash screen with #f8f9fc background displays during launch.
**Why human:** Standalone mode detection and splash screen rendering require a real installed PWA

### 3. Android Native Install Prompt

**Test:** On Android Chrome, visit Livinity for the first time
**Expected:** The banner appears with an "Install" button. Tapping Install triggers the native Android install prompt.
**Why human:** The beforeinstallprompt event only fires on real Android Chrome

### 4. iOS WebSocket Reconnection on Resume

**Test:** In the iOS PWA, open AI Chat, start a streaming conversation, then switch to another app for 10 seconds and return
**Expected:** WebSocket reconnects automatically within ~1.5 seconds and streaming resumes
**Why human:** Requires real iOS background/resume cycle to trigger visibilitychange + WS close

### 5. iOS Keyboard Chat Input Visibility

**Test:** In the iOS PWA AI Chat, tap the chat input to open the keyboard
**Expected:** The input field rises above the keyboard and remains fully visible. The viewport does not shift unexpectedly.
**Why human:** iOS standalone PWA keyboard behavior cannot be simulated programmatically

### Gaps Summary

No gaps found. All 11 observable truths verified against the codebase. All 6 artifacts exist, are substantive (no stubs), and are properly wired. All 6 key links confirmed. All 4 requirement IDs (PWA-05, PWA-06, IOS-02, IOS-03) are satisfied with implementation evidence. No anti-patterns detected. No orphaned requirements.

The only remaining verification is real-device testing on iOS and Android, which cannot be done programmatically (5 human verification items listed above).

---

_Verified: 2026-04-01T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
