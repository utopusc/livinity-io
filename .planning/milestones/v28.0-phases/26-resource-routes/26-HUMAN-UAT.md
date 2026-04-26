---
status: partial
phase: 26-resource-routes
source: [26-VERIFICATION.md]
started: 2026-04-25T21:20:00Z
updated: 2026-04-25T21:20:00Z
---

## Current Test

[awaiting bruce.livinity.io deploy + browser eyeball]

## Tests

### 1. Container detail sheet animation
expected: Click a container row → detail sheet slides in from right smoothly; click outside or X to close.
why_human: Animation feel observable only in browser.
result: [pending]

### 2. Search responsiveness on large container/image lists
expected: Type in search input → list filters within 1 frame; no debounce lag.
why_human: Performance against real container counts (60+).
result: [pending]

### 3. Schedules cross-section link UX
expected: Click "Schedule backup" on a volume → section flips to Schedules + selectedVolume preserved + Phase 27 will pre-fill backup form.
why_human: Cross-section state persistence + Phase 27 dependency.
result: [pending]

### 4. AI Diagnose live render
expected: Click AI Diagnose on a container → Kimi response renders within 30s with Likely Cause / Suggested Action / Confidence.
why_human: Live LLM round-trip required.
result: [pending]

### 5. Explain CVEs live render
expected: After scan, click Explain CVEs → plain-English remediation + concrete upgrade target.
why_human: Live LLM required.
result: [pending]

### 6. Container actions (start/stop/restart/remove)
expected: Each action triggers correct mutation + list refetches; toast on success/error.
why_human: Live mutation behavior.
result: [pending]

### 7. Programmatic deep-link side effect
expected: Calling `useDockerResource.getState().setSelectedContainer('foo')` from console → containers section opens with foo's detail panel.
why_human: Cross-component reactivity verification.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

(none — runtime UAT only)
