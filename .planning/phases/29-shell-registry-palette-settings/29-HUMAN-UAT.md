---
status: partial
phase: 29-shell-registry-palette-settings
source: [29-VERIFICATION.md]
started: 2026-04-25T23:55:00Z
updated: 2026-04-25T23:55:00Z
---

## Tests

### 1. Multi-tab xterm session preservation
expected: Open 3 tabs → switch between them; each preserves its terminal state (history, cursor pos, running command).
result: [pending]

### 2. cmd+k palette navigation feel
expected: cmd+k opens palette → search "n8n" → click result → palette closes + section switches + container detail opens. No flicker.
result: [pending]

### 3. Registry image search live
expected: In Registry > Image Search, type "nginx" → results from Docker Hub appear within 2s; click Pull → image pulls to selected env.
result: [pending]

### 4. Copy Deep Link UX
expected: Click IconLink button on container detail → clipboard contains `livinity://docker/containers/<name>` + toast "Copied".
result: [pending]

### 5. Theme persistence across reload
expected: Toggle theme to dark → reload window → theme stays dark.
result: [pending]

### 6. Sidebar density visual feel
expected: Settings > Appearance > switch density (compact ↔ comfortable) → sidebar items re-pad live without flicker.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0
