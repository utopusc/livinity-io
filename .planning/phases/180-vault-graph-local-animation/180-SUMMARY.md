---
phase: 180-vault-graph-local-animation
subsystem: vault-graph
tags: [tdd, local-graph, bfs, animation, legend-badge]
dependency_graph:
  requires: [179-vault-graph-controls]
  provides: [local-graph-mode, depth-chip, animation-timeline, legend-badge]
  affects: [VaultGraph, DisplaySection]
tech_stack:
  added: []
  patterns:
    - Pure TypeScript BFS with visited-set cycle protection
    - useState/useMemo/useRef/useEffect for React-side wiring
    - setTimeout scheduler with cleanup ref (no memory leak on unmount)
    - createRoot+act test pattern (no @testing-library/react)
    - Fake timers (vi.useFakeTimers) for animation scheduler tests
key_files:
  created:
    - livos/packages/ui/src/features/vault-graph/local-graph-mode.ts
    - livos/packages/ui/src/features/vault-graph/local-graph-mode.test.ts
    - livos/packages/ui/src/features/vault-graph/DepthChip.tsx
    - livos/packages/ui/src/features/vault-graph/DepthChip.test.tsx
    - livos/packages/ui/src/features/vault-graph/animation.ts
    - livos/packages/ui/src/features/vault-graph/animation.test.ts
    - livos/packages/ui/src/features/vault-graph/LegendBadge.tsx
    - livos/packages/ui/src/features/vault-graph/LegendBadge.test.tsx
  modified:
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
    - livos/packages/ui/src/features/vault-graph/sections/DisplaySection.tsx
decisions:
  - BFS traverses edges undirected (both source→target and target→source) for consistent neighbourhood discovery
  - animRevealedSet=null means "all visible" (no animation); Set<string> means animation active with subset visible
  - Hidden group nodes get 1a alpha (10%) vs search-dim 66 (40%) — two distinct dimming signals
  - buildLegendRows custom mode returns [] (intentional stub; matches Phase 179 custom-mode stub)
  - handleCycleGroupMode uses GROUP_MODES inline array (not exported) — sufficient for single call-site
metrics:
  duration: "~40min total"
  completed: "2026-05-20"
  tasks: 6
  files: 10
---

# Phase 180: Vault Graph Local Mode + Animation Timeline

**One-liner:** Obsidian-style local graph (BFS depth 1-4 with DepthChip), mtime-ordered animation timeline, and bottom-left LegendBadge with per-group visibility toggle.

## Commit Range

306d9ae0 → 351a8069

| Hash | Message |
|------|---------|
| 306d9ae0 | test(180-01): add failing tests for bfsSubgraph + DepthChip |
| 5cd81d59 | feat(180-01): implement bfsSubgraph + DepthChip + VaultGraph local mode |
| a6367cb1 | test(180-02): add failing tests for scheduleAnimation |
| 96877bf6 | feat(180-02): implement animation timeline + DisplaySection Animate button |
| 6baf420b | test(180-03): add failing tests for LegendBadge + buildLegendRows |
| 351a8069 | feat(180-03): implement LegendBadge + VaultGraph hiddenGroups wiring |

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| local-graph-mode.test.ts | 6 | PASS |
| DepthChip.test.tsx | 2 | PASS |
| animation.test.ts | 6 | PASS |
| LegendBadge.test.tsx | 6 | PASS |
| VaultGraph.test.tsx | 15 | PASS (no regressions) |
| All other vault-graph suites | 57 | PASS |
| **Total** | **92** | **PASS** |

Phase 179 baseline was 72. Phase 180 added 20 new assertions. Total: 92 PASS.

## Deviations from Plan

None - all 3 plans executed exactly as written.

## Known Stubs

- `buildLegendRows('custom', ...)` → `[]` (intentional, matches Phase 179 GroupsSection custom stub)

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. All changes are frontend-only React components and pure TypeScript utilities. Existing T-180-0x threat mitigations applied as documented in each plan.

## Sacred SHA Verification

`bash scripts/check-sacred.sh` → PASS: 25 files verified

## Deferred Items

- 3D mode (community plugin) → v39+
- Per-user vs vault-global settings storage decision → v38.1 polish
- Custom group rows legend support → follows Phase 179 custom stub resolution

## Self-Check: PASSED

All new files present. All 6 commits in git log. Sacred SHA 25/25 PASS.
