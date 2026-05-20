---
phase: 180-vault-graph-local-animation
plan: "03"
subsystem: vault-graph
tags: [tdd, legend-badge, group-visibility, color-swatch]
dependency_graph:
  requires: [180-02]
  provides: [legend-badge, hidden-groups]
  affects: [VaultGraph]
tech_stack:
  added: []
  patterns: [bottom-left overlay badge, per-group visibility toggle, group mode cycling]
key_files:
  created:
    - livos/packages/ui/src/features/vault-graph/LegendBadge.tsx
    - livos/packages/ui/src/features/vault-graph/LegendBadge.test.tsx
  modified:
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
decisions:
  - buildLegendRows exported separately so tests can verify row derivation without rendering
  - custom mode returns empty rows (stub) — matching Phase 179 custom stub pattern
  - hidden group nodes get 1a alpha suffix (10% opacity) — distinct from search dim (66 = 40%)
  - GROUP_MODES array defined inline in VaultGraph (not exported from LegendBadge)
metrics:
  duration: "~12min"
  completed: "2026-05-20"
  tasks: 2
  files: 3
---

# Phase 180 Plan 03: LegendBadge + VaultGraph hiddenGroups wiring

**One-liner:** Bottom-left 220px legend badge with per-group visibility toggle and group mode cycling via title click.

## Commits

| Hash | Message |
|------|---------|
| 6baf420b | test(180-03): add failing tests for LegendBadge + buildLegendRows |
| 351a8069 | feat(180-03): implement LegendBadge + VaultGraph hiddenGroups wiring |

## Test Results

- LegendBadge.test.tsx: 6/6 PASS (rows by-type, rows by-folder, render, row click, opacity-40, title click)
- Full vault-graph suite: 92/92 PASS (no regressions)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `buildLegendRows('custom', ...)` returns `[]` — custom group matching not yet implemented. This matches the Phase 179 custom-mode stub in `resolveNodeColor`. Future plan can wire custom rows. Does NOT prevent plan's goal (badge works for by-type/by-folder/by-tag).

## Self-Check: PASSED

- LegendBadge.tsx: FOUND
- Commits 6baf420b, 351a8069: FOUND
- Sacred SHA 25/25: PASS
