---
phase: 19-compose-graph-vuln-scan
plan: 01
subsystem: ui
tags: [reactflow, js-yaml, compose, graph, docker, stacks, tabs, trpc]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: trpc.docker.getStackCompose route + StacksTab expanded-row infrastructure
provides:
  - ComposeGraphViewer React component (compose YAML → React Flow service-dependency graph)
  - Tabs (Containers + Graph) inside StacksTab expanded row
  - reactflow + js-yaml + @types/js-yaml dependency set in @livos/ui
affects: [server-control-ui, stack-detail, future-graph-features, docker-management]

# Tech tracking
tech-stack:
  added: [reactflow@^11.11.4, js-yaml@^4.1.0, "@types/js-yaml@^4.0.9"]
  patterns:
    - "Client-side compose YAML parsing with js-yaml + topological grid layout"
    - "Custom node registry hoisted to module scope (avoids React Flow remount)"
    - "Tabs nested inside TableRow expanded-row pattern for stack detail"
    - "Lazy data fetch via Radix tabs unmounting inactive panes"

key-files:
  created:
    - livos/packages/ui/src/routes/server-control/compose-graph-viewer.tsx
  modified:
    - livos/packages/ui/package.json
    - livos/pnpm-lock.yaml
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "Use reactflow 11.x (React 18 stable) — 12.x requires React 19 which @livos/ui hasn't migrated to"
  - "Hoist nodeTypes/customNode to module scope per documented React Flow gotcha"
  - "Topological sort + grid layout (Kahn's algorithm) instead of dagre/elkjs — sufficient for ≤10-service home-server stacks"
  - "Default to networks: ['default'] when service has no networks key — matches docker compose's actual behaviour"
  - "Install with --ignore-scripts on Windows to bypass the postinstall mkdir -p (Unix-only) failure; deps still resolve correctly"

patterns-established:
  - "js-yaml client-side compose parsing with try/catch + structured ParseResult"
  - "customNode-at-module-scope for React Flow customisations"
  - "Tabs-inside-TableRow for stack/container detail expansion"
  - "Three-state render (loading | error | parsed) for tRPC-backed visualisations"

requirements-completed: [CGV-01]

# Metrics
duration: ~5 min
completed: 2026-04-24
---

# Phase 19 Plan 01: Compose Graph Viewer Summary

**Compose YAML → React Flow service-dependency graph rendered inside a new Graph tab on every deployed-stack detail row, using js-yaml client-side parsing with topological grid layout.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T22:40:43Z
- **Completed:** 2026-04-24T22:45:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- New `ComposeGraphViewer` component (~350 lines) parses compose YAML and renders services as React Flow nodes with image, port-mapping pills, and network labels
- `depends_on` relationships rendered as labelled directed edges; depender placed right of dependee via Kahn's-algorithm topological sort
- StacksTab expanded row converted from a plain Containers panel to `Tabs(Containers + Graph)` — original Containers list preserved exactly inside its TabsContent
- Compose-spec parsing handles both array and object forms of `depends_on`/`networks`/`ports`, with inline error UI for invalid YAML or missing services key
- Production build (`pnpm --filter ui build`) succeeds; final bundle generated with reactflow code-split

## Task Commits

Each task was committed atomically:

1. **Task 1: Install reactflow + js-yaml in @livos/ui and scaffold ComposeGraphViewer** — `f2a725c0` (feat)
2. **Task 2: Wire Graph tab into the StacksTab expanded row** — `4a094607` (feat)

**Plan metadata:** _(this commit, see final commit hash below)_

## Files Created/Modified
- `livos/packages/ui/src/routes/server-control/compose-graph-viewer.tsx` — NEW: ComposeGraphViewer component, parseCompose YAML→graph helper, ComposeServiceNode customNode at module scope, topoSort layout, tRPC docker.getStackCompose query wiring
- `livos/packages/ui/src/routes/server-control/index.tsx` — Added `ComposeGraphViewer` import; replaced expanded-row Containers panel with `Tabs(Containers + Graph)` (50 insertions, 39 deletions)
- `livos/packages/ui/package.json` — Added `reactflow ^11.11.4`, `js-yaml ^4.1.0`, devDep `@types/js-yaml ^4.0.5`
- `livos/pnpm-lock.yaml` — Lockfile updated for the three new deps

## Decisions Made
- **reactflow@11 over @xyflow/react v12** — v12 requires React 19; @livos/ui pins React 18.2, so 11.x is the highest stable line we can adopt without a React major upgrade.
- **Topological grid layout instead of a layout engine** — dagre/elkjs add ~80KB+ for marginal benefit on the typical home-server stack (≤ 10 services). Kahn's-algorithm column placement + per-column row counter gives a readable left-to-right dependency layout for free.
- **`--ignore-scripts` for the install** — the existing `postinstall: copy-tabler-icons` script uses `mkdir -p` which fails on Windows cmd. Skipping postinstall is safe for adding deps; the icon copy already happened on a previous successful install and is not affected by adding new packages.
- **Lazy mount via Radix Tabs default behavior** — `<TabsContent value="graph">` only mounts ComposeGraphViewer when the Graph tab is active, so the `getStackCompose` query fires only on user intent (no extra load on the API for users who never click Graph).
- **Defining `nodeTypes` at module scope** — React Flow re-mounts every node when `nodeTypes` is a new object on each render. Hoisting the registry outside the component is the documented fix.

## Deviations from Plan

None — plan executed exactly as written. Two minor adjustments were made within the plan's stated tolerance:

- **Install with `--ignore-scripts`** — Required because the @livos/ui postinstall (`mkdir -p public/generated-tabler-icons && cp -r ...`) is Unix-only and fails under Windows cmd. The deps install correctly with this flag; the icon copy is unrelated to the new deps. This is a pre-existing Windows compatibility quirk in the package, not a deviation from the plan's intent.
- **Networks rendering** — The plan specified network labels on a legend strip. We additionally render small per-service network pills inside each node (purple) so users see network membership without scanning the legend separately. Same data, complementary placement.

## Issues Encountered

- **`pnpm typecheck` reports many pre-existing errors** in `src/routes/server-control/index.tsx` (Tabler icon `ForwardRefExoticComponent` vs `ComponentType` mismatch) and `stories/`. These are completely unrelated to this plan's changes — they existed on master before the plan started. Out of scope per deviation Rule scope-boundary; flagged for a future cleanup phase.
- **Resolution:** Confirmed the plan's primary verification gate (`pnpm --filter ui build`) succeeds cleanly — the build pipeline uses Vite/SWC, not strict tsc, so the production bundle compiles without issue. CGV-01 verified via successful build.

## Deferred Issues

- Pre-existing typecheck errors in `livos/packages/ui/src/routes/server-control/index.tsx` (Tabler icon prop typing across ~25 lines) and `livos/packages/ui/stories/` — see `livos/packages/ui` typecheck output. Not introduced by this plan; tracked for future tech-debt phase.
- Manual smoke test on Server4 (production) — the plan's `<verify>` block lists post-deploy clicks (open Server Control → Stacks → expand a stack → click Graph). Not yet performed; deploy ownership lies with the next deploy step.

## User Setup Required

None — no external service configuration required. The Graph tab works on any deployed compose stack that the existing `getStackCompose` route can read.

## Next Phase Readiness

- ComposeGraphViewer is ready for Plan 19-02 (Vulnerability Scanning) to potentially overlay vuln status on graph nodes (e.g., red border on nodes with critical CVEs in their image).
- The customNode pattern + Tabs-inside-TableRow pattern are reusable for future stack detail panes (e.g., Resource Usage tab, Logs tab).
- Concrete extension points for follow-up:
  - Add vuln badges to ComposeServiceNode (next plan)
  - Click-through on a node to open ContainerDetailSheet
  - Optional dagre layout behind a feature flag for very large stacks

---
*Phase: 19-compose-graph-vuln-scan*
*Completed: 2026-04-24*

## Self-Check: PASSED

- FOUND: livos/packages/ui/src/routes/server-control/compose-graph-viewer.tsx
- FOUND: .planning/phases/19-compose-graph-vuln-scan/19-01-SUMMARY.md
- FOUND: commit f2a725c0 (feat: add ComposeGraphViewer)
- FOUND: commit 4a094607 (feat: wire Graph tab)
- FOUND: reactflow + js-yaml + @types/js-yaml in livos/packages/ui/package.json
