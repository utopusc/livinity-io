---
status: partial
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
source: [255-VERIFICATION.md]
started: 2026-06-02T14:30:00Z
updated: 2026-06-02T14:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Operator browser walk — single 🖥️ Displays popover (plan 04 Task 5)
expected: |
  Deploy to Mini PC (`git push origin master` → `bash /opt/livos/update.sh`), browse to
  https://bruce.livinity.io, then:
  1. Hover the very top of the screen — NO hover strip slides down (254-04 strip removed).
  2. No separate LayoutGrid windows popover exists.
  3. Click the 🖥️ Monitor button in the navbar → ONE glass popover opens with display cards.
  4. Each card shows a JPEG screenshot thumbnail refreshing ~every 2s — NOT a live VNC feed,
     NOT N spinning WebSocket sockets.
  5. With a WebApp open, its :N card also appears (validates plan-03 registerExisting end-to-end).
  6. Clicking a card opens the interactive VNC window (viewOnly:false, sized to real WxH).
  7. Folded-in Windows rows (Focus / Minimize / Pin / Close) appear inside the same popover.
  8. Clock shows a Turkish greeting (e.g. "İyi akşamlar, Bruce") + a weather glyph beside the
     temperature + a day/night accent tint — existing hh:mm / AM-PM / city / temp / pill / donut /
     profile layout structurally unchanged and unmoved.
result: [pending]

### 2. Operator VNC walk — branded :1 LivOS shell (plan 05 Task 4)
expected: |
  After `bash /opt/livos/update.sh` on the Mini PC:
  1. `which feh tint2` returns paths (apt install succeeded).
  2. Opening the :1 display from the Displays popover shows:
     (a) the LivOS wallpaper (NOT a flat gray fluxbox root),
     (b) a slim tint2 dock in dark LivOS token colors (#16161a panel, #f5f5f7 text),
     (c) dark design-token-themed fluxbox menu colors on right-click (bg #16161a, hilite #2563eb).
  3. The look is clearly LivOS-branded (NOT generic Ubuntu/XFCE gray).
  4. WebApp keys + mouse clicks still work on an open WebApp display (EMPTY_RC behavior preserved —
     no decorations re-added, no key swallowing).
  5. If feh/tint2 failed to install: graceful degrade to a solid dark root (xsetroot #0a0a0c
     fallback) and livinityd boot is NOT broken.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
