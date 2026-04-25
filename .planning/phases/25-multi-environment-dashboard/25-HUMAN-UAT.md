---
status: partial
phase: 25-multi-environment-dashboard
source: [25-VERIFICATION.md]
started: 2026-04-25T20:30:00Z
updated: 2026-04-25T20:30:00Z
---

## Current Test

[awaiting bruce.livinity.io deploy + browser eyeball]

## Tests

### 1. HealthBanner color correctness vs real container states
expected: Banner is green when all containers running; amber when ≥1 unhealthy/restarting; red when ≥1 dead.
why_human: Color thresholds need verification against live container states.
result: [pending]

### 2. Smooth refetch — no flicker during 5s polling
expected: Container counts / event list updates smoothly without re-render flicker; placeholderData keeps last data while refetching.
why_human: Polling smoothness only observable in real browser.
result: [pending]

### 3. Click-to-scope navigation feel
expected: Click env card → scope changes + section switches to Containers; transition feels instant.
why_human: UX feel needs interaction.
result: [pending]

### 4. Tag filter persistence + auto-fallback timing
expected: Selected filter persists across reload; if all envs with that tag deleted, falls back to "All" smoothly.
why_human: localStorage roundtrip + auto-fallback observable only in browser.
result: [pending]

### 5. Top-CPU live data accuracy
expected: Top-CPU panel rows match per-env Containers tab CPU% (±2%); refresh every 5s.
why_human: Live data accuracy comparison requires running containers.
result: [pending]

### 6. Logs/Shell chip cross-store side effects
expected: Click Logs chip on a container row → env scoped to that container's env + section switches to logs (env-scoped, container-deep-link comes in Phase 28).
why_human: Cross-store side effects observable only at runtime.
result: [pending]

### 7. Unreachable error state + per-card retry
expected: Stop nexus-core or block agent env → card shows red Unreachable banner with Retry button; click Retry refetches successfully after restart.
why_human: Error state + reconnect requires backend toggling.
result: [pending]

### 8. Aesthetic — Dockhand reference comparison
expected: Card spacing, font weights, color palette, hover transitions all align with https://dockhand.bor6.pl reference.
why_human: Visual judgement.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

(none — visual / runtime UAT only)
