---
status: partial
phase: 24-docker-app-skeleton
source: [24-VERIFICATION.md]
started: 2026-04-25T06:30:00Z
updated: 2026-04-25T06:30:00Z
---

## Current Test

[awaiting deploy + browser eyeball on bruce.livinity.io]

## Tests

### 1. Sidebar visual look-feel vs. Dockhand reference
expected: Persistent left sidebar (w-56 expanded / w-14 collapsed) with proper Dockhand-style polish — icon spacing, font weight, active highlight depth, chevron toggle alignment.
why_human: Visual UX comparison against Dockhand reference design (https://dockhand.bor6.pl).
result: [pending]

### 2. Top status bar polish + pill alignment
expected: Sticky 48px header aligned with sidebar header h-12; 8 stat pills render in correct order with consistent vertical centering, proper backdrop-blur, no layout jitter on data refetch.
why_human: Visual alignment + transition smoothness require live browser inspection.
result: [pending]

### 3. Theme toggle visual transition
expected: Clicking ThemeToggle cycles sun → moon → laptop icons; backgrounds smoothly transition between zinc-50 / zinc-900 across docker-app root + sidebar + status bar; no FOUC.
why_human: Cross-component theme propagation via storage event needs live verification.
result: [pending]

### 4. Live indicator real-time WS state
expected: Live pill is green (pulsing) when nexus-core is running; flips to red Offline within 1-2s after stopping nexus-core; flips back to green within 1-2s after restart.
why_human: Real-time WS reconnect behavior cannot be verified statically.
result: [pending]

### 5. Time pill ticks every minute
expected: Clock pill updates HH:MM each minute boundary; no visible jitter.
why_human: 1s setInterval render scope observable only in DevTools profiler.
result: [pending]

### 6. Docker dock entry icon + label
expected: Dock icon + tooltip both read 'Docker'; Spotlight entry reads 'Docker'; mobile tab bar shows IconBrandDocker; desktop tile shows 'Docker'.
why_human: Plan reused legacy dock-server.svg pending Phase 29 polish.
result: [pending]

### 7. Sidebar tooltips when collapsed
expected: Hovering a section icon when sidebar is collapsed (w-14) surfaces a Radix Tooltip on the right side after 300ms.
why_human: Radix Tooltip portal positioning + delay UX needs live interaction.
result: [pending]

### 8. Reload persistence — sidebar + theme
expected: After reloading the docker window or browser, last selected section + collapsed state + theme mode all restore from localStorage.
why_human: localStorage write is verified in code; observed restoration requires browser session.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Notes

All 8 items are visual/runtime UAT against bruce.livinity.io (Mini PC). Code path verified — only browser eyeball needed.

## Gaps

(none — visual/runtime UAT only)
