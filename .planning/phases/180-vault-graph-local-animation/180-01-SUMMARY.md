---
phase: 180-vault-graph-local-animation
plan: "01"
subsystem: vault-graph
tags: [tdd, bfs, local-graph, depth-chip]
dependency_graph:
  requires: [179-vault-graph-controls]
  provides: [local-graph-mode, depth-chip]
  affects: [VaultGraph]
tech_stack:
  added: []
  patterns: [BFS pure function, floating pill UI]
key_files:
  created:
    - livos/packages/ui/src/features/vault-graph/local-graph-mode.ts
    - livos/packages/ui/src/features/vault-graph/DepthChip.tsx
    - livos/packages/ui/src/features/vault-graph/local-graph-mode.test.ts
    - livos/packages/ui/src/features/vault-graph/DepthChip.test.tsx
  modified:
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
decisions:
  - BFS traverses edges in both directions (undirected) for consistent neighbour discovery
  - depth clamped to [1,4] inside bfsSubgraph (T-180-01-A)
  - visited Set prevents cycle revisit (T-180-01-B)
  - localNodes/localEdges memos both call bfsSubgraph independently (simple, acceptable)
metrics:
  duration: "~15min"
  completed: "2026-05-20"
  tasks: 2
  files: 5
---

# Phase 180 Plan 01: BFS depth resolver + DepthChip + VaultGraph local mode

**One-liner:** BFS from active node up to depth 4 with DepthChip top-center pill and VaultGraph local/global mode toggle.

## Commits

| Hash | Message |
|------|---------|
| 306d9ae0 | test(180-01): add failing tests for bfsSubgraph + DepthChip |
| 5cd81d59 | feat(180-01): implement bfsSubgraph + DepthChip + VaultGraph local mode |

## Test Results

- local-graph-mode.test.ts: 6/6 PASS
- DepthChip.test.tsx: 2/2 PASS
- VaultGraph.test.tsx: 15/15 PASS (no regressions)
- Full vault-graph suite: 80/80 PASS

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- local-graph-mode.ts: FOUND
- DepthChip.tsx: FOUND
- Commits 306d9ae0, 5cd81d59: FOUND
- Sacred SHA 25/25: PASS
