---
phase: 180-vault-graph-local-animation
plan: "02"
subsystem: vault-graph
tags: [tdd, animation, mtime, reduced-motion]
dependency_graph:
  requires: [180-01]
  provides: [animation-timeline, animate-button]
  affects: [VaultGraph, DisplaySection]
tech_stack:
  added: []
  patterns: [pure scheduler, setTimeout cleanup via ref]
key_files:
  created:
    - livos/packages/ui/src/features/vault-graph/animation.ts
    - livos/packages/ui/src/features/vault-graph/animation.test.ts
  modified:
    - livos/packages/ui/src/features/vault-graph/sections/DisplaySection.tsx
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
decisions:
  - scheduleAnimation is pure TS with no React — easy to unit test with fake timers
  - animCleanupRef cancels previous animation on new start and on unmount
  - animRevealedSet=null means all visible (no animation); Set<string> means animation active
metrics:
  duration: "~10min"
  completed: "2026-05-20"
  tasks: 2
  files: 4
---

# Phase 180 Plan 02: Animation timeline + DisplaySection Animate button

**One-liner:** mtime-ordered setTimeout node reveal over 8s with reduced-motion support and cleanup-on-unmount safety.

## Commits

| Hash | Message |
|------|---------|
| a6367cb1 | test(180-02): add failing tests for scheduleAnimation |
| 96877bf6 | feat(180-02): implement animation timeline + DisplaySection Animate button |

## Test Results

- animation.test.ts: 6/6 PASS (order, timing, single-node, reduced-motion, cleanup, return-type)
- Full vault-graph suite: 86/86 PASS (no regressions)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- animation.ts: FOUND
- Commits a6367cb1, 96877bf6: FOUND
- Sacred SHA 25/25: PASS
