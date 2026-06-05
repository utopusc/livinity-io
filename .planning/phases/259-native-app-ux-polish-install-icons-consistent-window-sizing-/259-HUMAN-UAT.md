---
status: partial
phase: 259-native-app-ux-polish-install-icons-consistent-window-sizing
source: [259-VERIFICATION.md]
started: 2026-06-04
updated: 2026-06-04
---

## Current Test

[awaiting human testing on Mini PC bruce@10.69.31.68]

## Deploy first

- **259-01 (UI):** `cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build` → `systemctl restart livos` → **clear/unregister the PWA service worker** (DevTools → Application → Clear site data) or the stale bundle keeps serving.
- **259-02 (livinityd):** `systemctl restart livos` only — tsx, no build.

## Tests

### 1. Native app icon appears immediately after install (SC1 — load-bearing)
expected: Install a native app from the store; its launch icon appears on the LivOS desktop / apps grid immediately (no manual reload, no 30s wait).
result: [pending]

### 2. Native window is 16:9 with no letterbox (SC2)
expected: Open the installed native app from its desktop icon; the window is 1280x720 / 16:9 with NO black bands top or bottom. Same size whether opened from the desktop icon or the Displays(:1) popover.
result: [pending]

### 3. OBS fills the screen — no right-side black strip (SC3 — failing reference)
expected: Install + open OBS; it fills the full 1280x720 Xvfb with no leftover desktop strip on the right. Every other native app also opens fullscreen.
result: [pending]

### 4. Docker + WebApp windows unchanged (SC4 — no regression)
expected: A Docker app (beszel) and a WebApp stream window still open at their existing sizes/behavior — unaffected by the native changes.
result: [pending]

### 5. Native icon shows real artwork (SC1 — cosmetic)
expected: When a native app's manifest `desktopEntry.icon` is a URL or absolute path, its desktop tile renders the real artwork. (Bare freedesktop names like "vscode" correctly fall to the placeholder per the schema gate — this is expected, not a failure.)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
