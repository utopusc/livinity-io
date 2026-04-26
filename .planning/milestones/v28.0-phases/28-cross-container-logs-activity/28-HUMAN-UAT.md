---
status: partial
phase: 28-cross-container-logs-activity
source: [28-VERIFICATION.md]
started: 2026-04-25T22:00:00Z
updated: 2026-04-25T22:00:00Z
---

## Tests

### 1. Cross-container multiplex feel + WS latency
expected: Check 3-5 containers in sidebar → live lines arrive within 1s; no buffering pauses.
result: [pending]

### 2. Color stripe distinctness
expected: 5+ containers each get visually distinct color stripes; consistent across reloads.
result: [pending]

### 3. AnimatePresence fade-in smoothness
expected: New events fade-in at top of timeline without layout jitter.
result: [pending]

### 4. Click-through navigation
expected: Click container event → opens that container's detail sheet; click scheduler run → switches to Schedules; click AI alert → opens container in Logs.
result: [pending]

### 5. Live-tail auto-disable on manual scroll-up
expected: When live-tail on, scrolling up >4px disables auto-snap; toggle re-enables.
result: [pending]

### 6. Severity classifier accuracy
expected: Real container output (postgres / nginx / app) classified correctly as ERROR/WARN/INFO/DEBUG.
result: [pending]

### 7. Cross-env switch resets sidebar
expected: Switch env in StatusBar → Logs sidebar refetches running containers; previous selections cleared.
result: [pending]

### 8. Cross-env AI alert filter
expected: Activity timeline shows AI alerts only for selected env (or all if no env selected per filter UX).
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0
