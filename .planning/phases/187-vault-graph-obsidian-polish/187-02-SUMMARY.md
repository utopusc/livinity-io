---
phase: 187
plan: 02
subsystem: vault-graph
tags: [tdd, graph, orphan, canvas, oklch]
dependency_graph:
  requires: [187-01 (wikiDegree field)]
  provides: [getOrphanRingColor, nodeCanvasObject orphan ring]
  affects: [graph-palette.ts, VaultGraph.tsx]
tech_stack:
  added: []
  patterns: [Canvas 2D custom painter, OKLCH warm-red per theme]
key_files:
  created: []
  modified:
    - livos/packages/ui/src/features/vault-graph/graph-palette.ts
    - livos/packages/ui/src/features/vault-graph/graph-palette.test.ts
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
    - livos/packages/ui/src/features/vault-graph/VaultGraph.test.tsx
decisions:
  - OKLCH warm-red chosen (hue 20) with per-theme lightness to match DS color space
  - 1.5px stroke ring drawn outside base circle radius to avoid covering node fill
  - Canvas strokeStyle uses string OKLCH literals (not CSS vars) for canvas compatibility
metrics:
  duration: ~10min
  completed: "2026-05-20"
  commits: [676c3019, 5ed8f594]
  tests_added: 6
  tests_total: 25
---

# Phase 187 Plan 02: Orphan Flagging Summary

Orphan node visual ring via Canvas 2D `nodeCanvasObject` painter using warm OKLCH red; nodes with `wikiDegree === 0` receive a 1.5px red border ring.

## What Was Built

- `graph-palette.ts`: Added `ORPHAN_RING` color map and exported `getOrphanRingColor(theme)` returning `oklch(0.55 0.20 20)` (light), `oklch(0.65 0.20 20)` (dark), `oklch(0.60 0.20 20)` (iridescent)
- `VaultGraph.tsx`: Added `nodeCanvasObject` custom painter; draws base fill circle then conditionally strokes orphan ring when `node.wikiDegree === 0`

## TDD Gate Compliance

- RED commit `676c3019`: 6 failing assertions added (3 palette + 3 VaultGraph)
- GREEN commit `5ed8f594`: All 6 new + all existing 19 assertions pass (25 total)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `676c3019` exists in git log
- `5ed8f594` exists in git log
- graph-palette.ts exports `getOrphanRingColor`
- VaultGraph.tsx contains `nodeCanvasObject`
