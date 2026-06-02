---
status: partial
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
source: [254-VERIFICATION.md]
started: 2026-06-02T11:31:48Z
updated: 2026-06-02T11:31:48Z
---

## Current Test

[awaiting human testing — deploy phase 254 to the Mini PC first (commits are unpushed)]

## Tests

### 1. Top-edge hover reveal
expected: Open `https://bruce.livinity.io`, log in, move the cursor to the very top edge (top 2px) of the desktop. A drop-down strip reveals listing active X displays, each showing `:N`, `WxH`, and `running_apps.length app(s)`. `:1` MUST appear (written by boot `registerExisting` with empty `owner_session`). Strip shows DISPLAYS ONLY — no LivOS app windows.
result: [pending]

### 2. Click to open VNC window (admin user)
expected: After the strip reveals, click a display row (e.g. `:1`). A LivOS window opens sized to the display's WxH, containing a live stream of the X display. An admin user should NOT receive FORBIDDEN — `canAccessDisplay` admin-bypass (254-06) allows it.
result: [pending]

### 3. Native VNC input forwarding
expected: Inside the opened VNC window, move the mouse and type on the keyboard. The cursor moves and text appears in the remote X display in real time (native RFB `viewOnly:false` forwarding, not screenshot-polling latency).
result: [pending]

### 4. Panel collapse on mouse leave
expected: After the strip is revealed, move the cursor below the strip boundary. The strip collapses via the AnimatePresence exit animation.
result: [pending]

### 5. WR-02 z-index flicker check
expected: Hover in and out of the top 2px region slowly. The panel does not flicker open/close when the cursor re-enters the top 2px of the strip.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
