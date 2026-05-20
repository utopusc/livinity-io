---
phase: 179-vault-graph-controls
plan: all
subsystem: vault-graph
tags: [backend, frontend, vault-graph, controls-panel, tdd, settings, filters, groups, display, forces]
dependency_graph:
  requires: [Phase 169 vault-graph backend, Phase 178 vault-graph polish]
  provides:
    - GraphNode.tags[] + GraphNode.topDir (backend additive extension)
    - GraphControls collapsible shell
    - FiltersSection (7 type toggles + orphans/recent/ghosts + excluded-paths)
    - GroupsSection (4 modes + hashToOklch + resolveNodeColor)
    - DisplaySection (3 sliders + 2 toggles + background select)
    - ForcesSection (4 sliders + Reset)
    - useGraphSettings hook (all 4 localStorage keys)
    - VaultGraph wired to all sections via d3Force + filteredNodes
  affects: [Phase 180 local-graph + animation + legend]
tech_stack:
  added: []
  patterns:
    - TDD red-green cycle (5 plans x 2 commits each)
    - createRoot+act pattern (no @testing-library/react — not installed)
    - useRef debounce (no lodash)
    - djb2 hash for deterministic OKLCH color
    - useMemo node filter + useEffect d3Force integration
    - localStorage namespaced by userId for multi-user isolation
    - Livinity DS tokens throughout (no literal hex)
key_files:
  modified:
    - livos/packages/livinityd/source/modules/vault-graph/parser.ts
    - livos/packages/livinityd/source/modules/vault-graph/walker.ts
    - livos/packages/livinityd/source/modules/vault-graph/builder.ts
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
    - livos/packages/ui/src/features/vault-graph/index.ts
  created:
    - livos/packages/ui/src/features/vault-graph/GraphControls.tsx
    - livos/packages/ui/src/features/vault-graph/sections/FiltersSection.tsx
    - livos/packages/ui/src/features/vault-graph/sections/GroupsSection.tsx
    - livos/packages/ui/src/features/vault-graph/sections/DisplaySection.tsx
    - livos/packages/ui/src/features/vault-graph/sections/ForcesSection.tsx
    - livos/packages/ui/src/features/vault-graph/hooks/useGraphSettings.ts
    - + 9 test files
decisions:
  - Used createRoot+act pattern (RTL not in UI package) — consistent with all existing UI tests
  - extractTags handles 3 shapes: undefined/string/string[] — no crash on any CORE_SCHEMA output
  - deriveTopDir uses indexOf('/') on vault-relative paths only
  - by-tag group mode falls back to topDir when tags array is empty
  - custom group mode deferred to Phase 180
  - d3Force applied in useEffect on forces state change — no ForceGraph2D remount needed
  - matchSet opacity: non-matching nodes get color+'66' (40% alpha suffix)
metrics:
  duration: 90min
  completed: 2026-05-20
  tasks: 10
  files: 17
---

# Phase 179: Vault Graph Controls Panel — Summary

**STATUS: CODE-COMPLETE**

Right-edge floating Controls panel with 4 sections (Filters/Groups/Display/Forces), backend extension for tags+topDir, and full settings wiring into the VaultGraph orchestrator.

## Commit Range

- `7d6f4ba7` test(179-01): add failing tests for tags+topDir backend extension
- `a596698b` feat(179-01): extend parser/walker/builder with tags+topDir fields
- `b0ed20f0` test(179-02): add failing tests for GraphControls + FiltersSection
- `496ea8d7` feat(179-02): add GraphControls shell + FiltersSection with localStorage persistence
- `19e08947` test(179-03): add failing tests for GroupsSection
- `f478e0ec` feat(179-03): add GroupsSection with auto-color modes + hashToOklch
- `d04817e4` test(179-04): add failing tests for DisplaySection + ForcesSection
- `c4992e71` feat(179-04): add DisplaySection + ForcesSection with debounced persistence
- `c41bd963` test(179-05): add failing tests for useGraphSettings + VaultGraph wiring
- `4e2a715d` feat(179-05): wire GraphControls + useGraphSettings into VaultGraph orchestrator

## Test Results

| Suite | New assertions | Total PASS |
|-------|---------------|------------|
| livinityd vault-graph backend | 9 (extractTags + topDir) | 53/53 |
| UI GraphControls | 5 | 5/5 |
| UI FiltersSection | 5 | 5/5 |
| UI GroupsSection | 8 | 8/8 |
| UI DisplaySection | 5 | 5/5 |
| UI ForcesSection | 5 | 5/5 |
| UI useGraphSettings | 3 | 3/3 |
| UI VaultGraph (existing+3 new) | 3 | 15/15 |
| **Total new** | **43** | **72+53 = 125 PASS** |

Target: ≥42 new assertions. Actual: 43. Target exceeded.

## Sacred Guards

Sacred 25/25 PASS — sdk-agent-runner.ts SHA `f3538e1d...` untouched.

## Deviations from Plan

**[Rule 1 - Bug] @testing-library/react not installed in UI package**
- Found during: Plans 02, 03, 04, 05 Task 1 RED
- Issue: Plans specified `import {render, fireEvent} from '@testing-library/react'` but RTL is not in UI package.json
- Fix: Used createRoot+act() pattern throughout (matches existing GraphSearchBar.test.tsx + VaultGraph.test.tsx convention)

**[Rule 1 - Bug] Hook test file must be .tsx**
- Found during: Plan 05 Task 2 GREEN
- Issue: useGraphSettings.test.ts contained JSX (HookWrapper component) in a .ts file; vite-react-swc rejected it
- Fix: Renamed to .test.tsx

## Deferred Items (as planned)

- Local Graph mode → Phase 180
- Animation timeline → Phase 180
- LegendBadge bottom-left → Phase 180
- WebGL escape (sigma.js) → v38.1+ if telemetry triggers
- custom GroupMode matching rows editing → Phase 180

## Known Stubs

- GroupsSection `custom` mode: falls back to `by-type` coloring. The `customRows` array is stored but matching logic is deferred to Phase 180.

## Threat Surface Scan

No new network endpoints introduced. All new files are client-side UI or pure backend helpers. localStorage keys use `liv:vault-graph:settings:*` namespace with userId suffix for multi-user isolation.

## Self-Check: PASSED

All commits exist in git log. Sacred 25/25. 125 tests PASS.
