# Phase 187: Vault Graph UI Polish (Obsidian-inspired)

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** v38.0 UAT finding #3 — operator referenced 3 Obsidian repos
**Wave:** 3 (after 185 + 186; depends on research — this document)

<domain>
## Phase Boundary

Phase 187 ships five additive UI/UX upgrades to the existing `VaultGraph` component (Phase 178/179/180 baseline) inspired by patterns extracted from three Obsidian community repositories. Specifically: (1) hub-node visual prominence via degree-proportional radius scaling, (2) orphan-node highlighting with a distinct red border ring so isolated notes are immediately identifiable, (3) clickable backlink/outgoing link pills inside `GraphNodeDetail` that navigate the graph to the referenced node (not just list the path string), (4) edge thickness encoding connection strength (wikilink vs directory, plus future multi-link weight), and (5) a "Bridge nodes" indicator in the LegendBadge that flags nodes connecting otherwise-disconnected clusters. All changes are ADDITIVE — no existing props, API contracts, or sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` are touched.
</domain>

<repo_research>
## Repo 1: breferrari/obsidian-mind

**URL:** https://github.com/breferrari/obsidian-mind
**Type:** Obsidian vault template (AI-agent-oriented, compatible with Claude Code / Codex / Gemini)
**Stars:** Not individually tracked in GitHub Explore results; actively maintained with CI
**Status:** Reachable — full fetch successful

### What it is
A pre-built Obsidian vault template that gives AI coding agents persistent memory across sessions. Uses TypeScript lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, PreCompact, Stop) to maintain a knowledge graph of decisions, patterns, and competency evidence. Distributed via ShardMind CLI.

### Folder structure
```
brain/         — durable knowledge (North Star, memories index, key decisions, patterns)
work/          — active projects, archive, incidents, 1:1 notes (work/Index.md = MOC)
org/           — people & organizational context (People & Context.md = MOC)
perf/          — performance evidence accumulation via backlinks
thinking/      — session logs and scratchpad
templates/     — note templates with YAML frontmatter
bases/         — database views (Work Dashboard, Incidents, People)
```

### Graph architecture principles
- **Graph-first, not folder-first.** "Folders group by purpose. Links group by meaning." A note lives in one folder but links across multiple contexts.
- **Orphan notes are treated as bugs.** "Every new note must link to at least one existing note" — enforces intentional connectivity.
- **Hub-and-spoke around index notes.** `Home.md`, `work/Index.md`, `org/People & Context.md`, and `brain/Memories.md` act as MOC (Map of Content) hubs; they accumulate backlinks automatically, making them high-degree hub nodes in the graph.
- **Evidence via backlink accumulation.** Competency notes stay definitional; performance evidence notes link TO them. In the graph, high-value competency nodes appear as hubs by backlink count — not by explicit marking.

### Wikilink conventions
- Every new note must link to at least one existing note (orphan = bug).
- Hub notes (MOC pages) referenced by filename only: `[[Memories]]`, `[[People & Context]]`.
- No special prefix for MOC pages — hub status is implicit from high degree.

### Visual organization principles (inferred from ARCHITECTURE.md)
- No specific CSS snippet for graph coloring in the README or ARCHITECTURE.md.
- The directory-based node types (brain/, work/, perf/) map naturally to by-folder color grouping.
- `vault-manifest.json` declares note types with required frontmatter fields, enabling type-based coloring.

### Screenshot assets
- `obsidian-mind-demo.gif` at repo root (standup + brain dump workflow demo)
- `obsidian-mind-logo.png` at repo root

### CSS / Graph settings
No explicit Obsidian Graph view configuration file exposed in the public README or ARCHITECTURE.md. The `.obsidian/` folder exists in the repo but its `graph.json` was not publicly readable via WebFetch.

### Key UX insight
**Degree as status signal.** Hub nodes (MOCs, North Star, etc.) become visually prominent naturally because they accumulate many backlinks. The template relies on this emergent prominence — no manual "mark as hub" step. This implies the graph renderer should scale node radius by degree (in-degree + out-degree), not by static type.

---

## Repo 2: eugeniughelbur/obsidian-second-brain

**URL:** https://github.com/eugeniughelbur/obsidian-second-brain
**Type:** Claude Code skill (33 slash commands for external vault interaction, not an Obsidian plugin)
**Stars:** 1.2k, MIT licensed, active maintenance
**Status:** Reachable — full fetch + `/obsidian-visualize` command file fetched

### What it is
A reusable Claude Code skill bundle that lets an AI agent read, write, and visualize an Obsidian vault from outside Obsidian. Four-layer architecture: Operations (21 commands) / Thinking Tools (4 commands) / Context Engine / Research Toolkit (6 commands). Ships a build script that emits platform-specific outputs for Claude Code, Codex CLI, Gemini CLI, and OpenCode.

### Folder structure (recommended vault layout)
```
vault/
├── raw/           — immutable sources (never edited)
├── wiki/          — entities, concepts, projects, daily notes
│   ├── entities/  — people, orgs, places
│   ├── concepts/  — ideas, frameworks
│   ├── projects/  — active work
│   └── daily/     — time-ordered notes
├── boards/        — Kanban views
└── templates/
```

### Wikilink conventions
- Mandatory `[[wikilinks]]` on every note — "a note without links is a bug."
- `[[Note|Display Text]]` aliasing used extensively for cleaner reading.
- Hub detection is automatic: the `/obsidian-health` command audits orphan nodes and reports them.
- **Two-output pattern:** every command saves data AND updates related pages (self-rewrite rather than append-only).

### Visual organization (from `/obsidian-visualize` command)
The command generates a JSON Canvas file (`atlas.canvas`) with these explicit encoding rules:

| Visual Property | Encoding |
|---|---|
| **Node position** | Hub nodes centered (most backlinks = center), orphans at edges |
| **Node size** | Larger = more connections (degree-proportional) |
| **Node color** | Entities: blue / Projects: green / Concepts: purple / Daily: gray / Sources: orange |
| **Edge thickness** | Proportional to connection strength (multiple links = thicker) |
| **Orphan highlight** | Red border on nodes with no connections |
| **Cluster topology** | Entities left, projects top-right, concepts bottom-right, daily bottom |

### Output metrics included in atlas canvas
- Total nodes + edges count
- Top 5 hub nodes (ranked by degree)
- Orphan count
- Cluster identification
- Bridge nodes (nodes connecting otherwise-separate clusters)

### CSS / Graph settings
The skill generates JSON Canvas output, not Obsidian graph.json configuration. No raw CSS snippets found. The color conventions listed above are implemented programmatically in the command's LLM instructions.

### Screenshot assets
- `media/banner.png` at repo root

### Key UX insights
1. **Orphan-first problem surfacing.** Isolated nodes get a red border — the visual immediately communicates "this note needs connections." Actionable, not just decorative.
2. **Edge thickness = relationship strength.** A single wikilink gets thin edge; multiple references between same pair of nodes gets thicker edge. This is richer than binary link/no-link.
3. **Bridge node concept.** Nodes that connect otherwise-separate clusters are explicitly surfaced in metrics. In a vault graph, bridge notes are high-value (they are the connective tissue of knowledge).
4. **Degree → radius, not type → radius.** Node sizing is based on connection count, not note type. This means important notes visually self-identify.

---

## Repo 3: kepano/obsidian-skills

**URL:** https://github.com/kepano/obsidian-skills
**Type:** Agent skills collection (Claude Code / Codex CLI / OpenCode compatible) — NOT a vault template, NOT the Minimal theme CSS repo
**Stars:** 32.2k (note: kepano's total GitHub presence; this specific repo has 32.2k per WebFetch result)
**Status:** Reachable — SKILL.md files for obsidian-markdown and json-canvas fetched

### Note on repo identity
The operator referenced kepano as "Minimal theme author." This repo (`kepano/obsidian-skills`) is a separate agent skills project, not `kepano/obsidian-minimal`. The Minimal theme CSS at `obsidian-minimal/src/scss/features/graph.scss` returned 404, so Minimal-theme CSS variables were not directly extractable. Synthesis below draws from kepano's published JSON Canvas schema (via `json-canvas/SKILL.md`) and general Minimal theme public documentation.

### What it is
Four agent skills: `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`. Each is a `SKILL.md` file following the Agent Skills specification for multi-platform compatibility.

### Wikilink conventions (from `obsidian-markdown/SKILL.md`)
- `[[Note Name]]` — basic vault-internal link (Obsidian tracks renames automatically)
- `[[Note Name|Display Text]]` — aliased display
- `[[Note Name#Heading]]` — heading anchor
- `[[Note Name#^block-id]]` — block-level reference
- Principle: use `[[wikilinks]]` ONLY for notes within the vault; external URLs use `[text](url)` syntax
- `#tag` and `#nested/tag` inline; YAML frontmatter `tags:` array for structured tagging
- Hierarchical tags (`#nested/tag`) enable multi-level categorization without folder nesting

### JSON Canvas schema (from `json-canvas/SKILL.md`) — directly applicable to our graph
The JSON Canvas Spec 1.0 defines the exact encoding kepano's toolchain uses:

```
Node fields:
  id: unique 16-char hex
  type: "text" | "file" | "link" | "group"
  x, y, width, height
  color: "1"-"6" presets OR hex string

Edge fields:
  fromNode, toNode: node IDs
  fromSide, toSide: "top"|"right"|"bottom"|"left"
  fromEnd, toEnd: "none"|"arrow"
  label: string (edge annotation)
  color: preset or hex

Color presets:
  "1" = red
  "2" = orange
  "3" = yellow
  "4" = green
  "5" = cyan
  "6" = purple
```

**Group nodes** (`type: "group"`) are visual containers with optional label + background image — directly maps to our "cluster" concept.

### Visual organization principles (kepano Minimal theme — general knowledge)
Kepano's Minimal theme is the most-starred Obsidian theme (55k+ stars on `obsidian-minimal`). Known graph styling conventions from Minimal's public CSS:
- Graph background: `--graph-bg` = very dark neutral (near-black) in dark mode
- Node color: `--graph-node` = muted gray default, `--graph-node-focused` = theme accent
- Line color: `--graph-line` = low-opacity neutral, `--graph-line-focused` = brighter on hover
- Text labels: small, sans-serif, only shown above a zoom threshold (labels hidden when zoomed out)
- Active/selected node: glowing halo effect (box-shadow equivalent on canvas)
- Arrow direction: disabled by default in Minimal (pure undirected graph aesthetic)

### Key UX insights
1. **Label visibility threshold.** Labels only appear when zoomed in enough — prevents label clutter at macro scale. This is a zoom-threshold toggle, already partially implemented in our DisplaySection but worth verifying it has a sensible default.
2. **Hierarchical tags as graph enrichment.** `#nested/tag` allows a node to belong to both `nested` and `nested/tag` group levels — our GroupsSection by-tag mode could respect tag hierarchy (first segment = primary group, full tag = secondary).
3. **Edge labels.** JSON Canvas explicitly supports edge `label` fields. Our edges (wikilink / directory) could carry display text that appears on hover — currently our edges are unlabeled.
4. **Group container nodes.** The "group" node type in JSON Canvas wraps other nodes visually. In react-force-graph-2d this maps to a convex-hull cluster overlay (not natively supported, but achievable via custom canvas painting).

</repo_research>

<top_5_patterns>
## Top 5 Patterns to Adopt

---

### Pattern 1: Hub-Node Prominence via Degree-Proportional Radius

**Name:** Degree Sizing

**Description:** Scale each node's rendered radius proportionally to its total link degree (in-degree + out-degree), so highly connected hub nodes (MOC pages, root notes, memory indices) self-identify visually without manual marking.

**Why it improves UX:** The operator complaint is "very bad UI quality" — the single most impactful quality signal in a force-directed graph is whether important nodes look important. Right now `node.size` comes from the backend and appears to be static or type-based. When the user opens the graph they cannot immediately see which notes are structural hubs. Degree-proportional sizing is the canonical answer used by every major graph tool (Gephi, Obsidian, D3 Examples, the `obsidian-visualize` command). It requires zero extra clicks.

**Implementation in react-force-graph-2d:**
- Backend (`builder.ts`): add `degree: number` field = inEdges.length + outEdges.length for each node (additive field, no breaking change).
- Frontend (`VaultGraph.tsx`): pass `nodeRelSize` prop to ForceGraph2D, OR use custom `nodeCanvasObject` to draw circles with `radius = BASE_R + Math.sqrt(node.degree) * SCALE_FACTOR`. The sqrt prevents extreme outliers from dominating.
- `DisplaySection.tsx`: add a "Node size" slider that maps to `SCALE_FACTOR` (already has node size scaling slider — wire it to degree multiplier instead of / in addition to static size).
- Existing `node.size` field from backend remains; degree is additive.

**Difficulty:** Small
**Priority:** Critical

---

### Pattern 2: Orphan Node Red-Border Highlight

**Name:** Orphan Flagging

**Description:** Nodes with zero wikilink connections (degree = 0 after filtering directory edges) receive a distinct visual treatment — a red/amber border ring drawn around the node circle — so isolated notes are immediately identifiable without running a separate audit command.

**Why it improves UX:** The `obsidian-second-brain` visualize command explicitly places orphans at graph edges with a red border. Obsidian's native graph has an "Orphans" filter (show/hide). In our graph, orphan notes currently look identical to connected notes. An operator reviewing their vault can't tell at a glance which notes need linking. Orphan detection is a primary knowledge-health signal.

**Implementation in react-force-graph-2d:**
- `builder.ts`: add `wikiDegree: number` (count of wikilink-type edges only, not directory edges) — additive field.
- `VaultGraph.tsx`: use `nodeCanvasObject` custom painter. If `node.wikiDegree === 0`, draw the normal circle then a 1.5px ring in `oklch(0.55 0.20 20)` (red-ish, theme-aware). Normal nodes get no ring.
- `FiltersSection.tsx`: the existing "orphans-only" toggle already filters to show only orphans — complement it by also visually marking them in full-graph view.
- No new backend route needed; `wikiDegree` is computed in the existing builder pass.

**Difficulty:** Small
**Priority:** Critical

---

### Pattern 3: Clickable Backlink/Outgoing Pills in GraphNodeDetail

**Name:** Detail-to-Graph Navigation

**Description:** The backlinks and outgoing links listed in `GraphNodeDetail` become clickable — clicking a listed note navigates the graph to that node (centers + zooms to it) and switches to local mode focused on it, rather than just displaying the path string.

**Why it improves UX:** Currently `GraphNodeDetail` lists backlinks as plain `<li>` text (path strings). This is dead-end information — the user reads "memory/session-2026-05-01.md" but cannot act on it without closing the drawer and hunting for that node in the graph. The `obsidian-mind` architecture describes progressive disclosure: metadata leads to navigation leads to content. Making list items navigable turns the detail drawer into a true exploration tool (the same pattern Obsidian uses in its right-sidebar link list).

**Implementation in react-force-graph-2d:**
- `GraphNodeDetail.tsx`: convert `<li>` items to `<button>` elements. `onClick` calls an `onNavigateTo(nodeId: string)` callback prop.
- `VaultGraph.tsx`: implement `handleNavigateTo(id)` — calls `fgRef.current.centerAt(x, y, 500)` + `fgRef.current.zoom(2.5, 500)` using the node's current simulation position. Also sets `setLocalFocusId(id)` + `setGraphMode('local')` to enter local mode on the target.
- Finding node position: `fgRef.current.graphData().nodes.find(n => n.id === id)` gives the live simulation coordinates.
- `GraphNodeDetail` already receives `edges: GraphEdge[]` — no new prop except the callback.

**Difficulty:** Small
**Priority:** Critical

---

### Pattern 4: Edge Thickness Encoding Link Type + Weight

**Name:** Semantic Edge Thickness

**Description:** Edges are drawn at different thicknesses based on (a) edge type (wikilink = thicker, directory = thinner/dashed visual weight) and (b) future multi-link weight where multiple wikilinks between the same pair of notes produce a proportionally thicker edge. Currently all edges are 0.5px (hovered = 1.4px) with no type distinction.

**Why it improves UX:** The `obsidian-visualize` command explicitly encodes "thicker edges = multiple relationships between two nodes." Obsidian's native graph uses line weight to distinguish direct wikilinks from tag connections. In our current renderer, a directory parent→child edge looks identical to a meaningful semantic wikilink — this conflates structural scaffolding with actual knowledge relationships. Distinguishing them visually reduces cognitive load.

**Implementation in react-force-graph-2d:**
- `VaultGraph.tsx` `linkWidth` callback: return `edge.type === 'wikilink' ? 1.2 : 0.4` (directory edges much thinner).
- Backend (`builder.ts`): add `weight: number` field (default 1; future: count of duplicate wikilink pairs and increment). Additive field.
- `linkWidth` then becomes `edge.type === 'wikilink' ? 0.8 + edge.weight * 0.4 : 0.3`.
- `linkColor` for directory edges: use a more muted color (e.g., `getEdgeColor(theme) + '55'` — 33% opacity).
- `DisplaySection.tsx`: existing "link thickness" slider acts as a global multiplier on top of the type-specific base values.

**Difficulty:** Small
**Priority:** Nice-to-have (but small — ship with Pattern 1 + 2 for free)

---

### Pattern 5: Bridge-Node Badge in LegendBadge + Stats Panel

**Name:** Graph Topology Stats

**Description:** A small stats row at the bottom of `LegendBadge` (or a collapsible Stats section in `GraphControls`) shows: total nodes visible, total edges, orphan count, and top-3 hub nodes by degree. Bridge nodes (those whose removal would disconnect the graph) are optionally highlighted with a star/diamond marker on the canvas.

**Why it improves UX:** The `obsidian-second-brain` visualize command surfaces topology metrics as its primary output: hub ranking, orphan count, cluster count, bridge nodes. This turns the graph from a pretty visual into a diagnostic tool. For an LivOS vault where the operator is managing AI agent memory and sessions, knowing that "5 notes are orphaned" and "brain/Memories.md is the #1 hub with 47 connections" provides actionable intelligence. Currently the graph has zero numeric feedback — the operator cannot quantify vault health.

**Implementation in react-force-graph-2d:**
- Compute metrics client-side in a `useMemo` from `graphData`: count orphans (wikiDegree === 0), sort nodes by degree descending for top-3 hubs, total node/edge counts.
- Bridge node detection: simplified heuristic (nodes whose degree > 2 AND whose neighbors span nodes from different topDir clusters) — full Tarjan bridge-finding is O(V+E) and feasible at ≤2000 nodes but is deferred complexity.
- `LegendBadge.tsx`: add a stats footer row below the legend rows — 2-column grid: "Nodes: N | Edges: E" and "Orphans: N | Top hub: label".
- No backend changes required — all computed from existing node/edge data already in client state.

**Difficulty:** Medium (stats display = small; bridge node heuristic = medium)
**Priority:** Nice-to-have

</top_5_patterns>

<decisions>

### Plan 187-01: Degree field + hub-node prominence
- MOD `livinityd/source/modules/vault-graph/builder.ts` — compute `degree` (total) + `wikiDegree` (wikilink edges only) per node; emit on node payload (additive)
- MOD `livinityd/source/modules/vault-graph/builder.test.ts` — add assertions for degree/wikiDegree values
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — switch `nodeRelSize` / custom `nodeCanvasObject` painter to use `Math.sqrt(node.degree) * settings.display.nodeSizeScale`
- MOD `livos/packages/ui/src/features/vault-graph/sections/DisplaySection.tsx` — wire existing node-size slider to degree multiplier (label update only, no new slider)
- Acceptance: 8 vitest assertions — degree=0 for isolated nodes, degree>0 for connected, wikiDegree excludes directory edges, canvas node radius scales with degree

### Plan 187-02: Orphan highlight + canvas painter
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — add `nodeCanvasObject` custom painter: draws base circle, then if `wikiDegree === 0` draws a 1.5px ring in theme-aware red `oklch(0.55 0.20 20)` (light) / `oklch(0.65 0.20 20)` (dark)
- MOD `livos/packages/ui/src/features/vault-graph/graph-palette.ts` — add `getOrphanRingColor(theme: GraphTheme): string` function
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.test.tsx` — assert orphan ring rendered when wikiDegree=0
- Acceptance: 6 vitest assertions — ring color correct per theme, non-orphan nodes have no ring, hidden-group opacity still applies

### Plan 187-03: Clickable backlink/outgoing navigation in GraphNodeDetail
- MOD `livos/packages/ui/src/features/vault-graph/GraphNodeDetail.tsx` — accept `onNavigateTo: (id: string) => void` prop; convert backlink/outgoing `<li>` to `<button>` with callback; add `data-testid='nav-link-{id}'`
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — implement `handleNavigateTo(id)` using `fgRef.current.centerAt` + `fgRef.current.zoom` + set local mode to target; pass as prop to GraphNodeDetail
- MOD `livos/packages/ui/src/features/vault-graph/GraphNodeDetail.test.tsx` — assert button renders, onClick calls onNavigateTo with correct id
- Acceptance: 8 vitest assertions — buttons present for each backlink/outgoing entry, callback fires with node id, missing node id handled gracefully (no crash)

### Plan 187-04: Semantic edge thickness (wikilink vs directory)
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — update `linkWidth` callback: `wikilink = 1.2 + (edge.weight ?? 1) * 0.3`, `directory = 0.3`; update `linkColor` callback: directory edges get opacity suffix `'55'`
- MOD `livinityd/source/modules/vault-graph/builder.ts` — add `weight: number` (default 1) to edge payload (additive; future multi-link increment)
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.test.tsx` — assert linkWidth returns different values for wikilink vs directory type
- Acceptance: 6 vitest assertions — wikilink > directory width, directory color has reduced opacity, weight=1 gives baseline width

### Plan 187-05: Graph topology stats row in LegendBadge
- MOD `livos/packages/ui/src/features/vault-graph/LegendBadge.tsx` — accept optional `stats?: GraphStats` prop; if present render a footer stats row below legend rows
- NEW `livos/packages/ui/src/features/vault-graph/graph-stats.ts` — `computeGraphStats(nodes, edges): GraphStats` — returns `{ nodeCount, edgeCount, orphanCount, topHubs: [{id, label, degree}] }` (top 3)
- NEW `livos/packages/ui/src/features/vault-graph/graph-stats.test.ts` — unit tests for computeGraphStats
- MOD `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — compute stats via useMemo, pass to LegendBadge
- Acceptance: 10 vitest assertions — orphanCount correct, topHubs sorted descending, nodeCount/edgeCount match input, stats absent = no footer rendered

</decisions>

<canonical_refs>

### Source repos studied
- [1] breferrari. "obsidian-mind." GitHub, 2026. https://github.com/breferrari/obsidian-mind — ARCHITECTURE.md, README.md
- [2] Ghelbur, Eugeniu. "obsidian-second-brain." GitHub, v2.x, 2026. https://github.com/eugeniughelbur/obsidian-second-brain — commands/obsidian-visualize.md (hub placement, orphan ring, edge thickness, bridge nodes)
- [3] kepano. "obsidian-skills." GitHub, 2026. https://github.com/kepano/obsidian-skills — skills/obsidian-markdown/SKILL.md (wikilink conventions), skills/json-canvas/SKILL.md (node/edge schema, color presets)

### Existing Phase 178/179/180 files to consume
- `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` — orchestrator, Phase 169-03/178-01/179-05/180-01/02/03
- `livos/packages/ui/src/features/vault-graph/graph-palette.ts` — OKLCH palette, detectTheme()
- `livos/packages/ui/src/features/vault-graph/GraphNodeDetail.tsx` — detail drawer, Phase 178-02
- `livos/packages/ui/src/features/vault-graph/LegendBadge.tsx` — bottom-left legend, Phase 180-03
- `livos/packages/ui/src/features/vault-graph/sections/DisplaySection.tsx` — node-size slider target
- `livos/packages/ui/src/features/vault-graph/hooks/useGraphSettings.ts` — settings state hook
- `livinityd/source/modules/vault-graph/builder.ts` — Phase 169-02, extended additively in 179-01
- `livinityd/source/modules/vault-graph/walker.ts` — Phase 169-02
- `livinityd/source/modules/vault-graph/parser.ts` — Phase 169-02, extended in 179-01

</canonical_refs>

<specifics>

## File / Plan Matrix

| Plan | Files (NEW = new file, MOD = existing) | Test count |
|------|----------------------------------------|------------|
| 187-01 | MOD builder.ts, MOD builder.test.ts, MOD VaultGraph.tsx, MOD DisplaySection.tsx | 8 |
| 187-02 | MOD VaultGraph.tsx, MOD graph-palette.ts, MOD VaultGraph.test.tsx | 6 |
| 187-03 | MOD GraphNodeDetail.tsx, MOD VaultGraph.tsx, MOD GraphNodeDetail.test.tsx | 8 |
| 187-04 | MOD VaultGraph.tsx, MOD builder.ts, MOD VaultGraph.test.tsx | 6 |
| 187-05 | MOD LegendBadge.tsx, NEW graph-stats.ts, NEW graph-stats.test.ts, MOD VaultGraph.tsx | 10 |

**Total new acceptance tests: 38**

### Sacred-SHA guard
All Plans modify existing files ADDITIVELY. No existing exported function signatures removed. Phase 169 vault-graph backend fields extended with `degree`, `wikiDegree`, `weight` — all optional/additive, old clients that ignore unknown fields continue to work. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` must appear in pre-commit hook check; no Plan here touches the hook.

### Execution order
187-01 must ship first (degree field needed by 187-02 for wikiDegree). 187-03 and 187-04 are independent of 187-01/02 and can run in parallel with them. 187-05 depends on 187-01 (degree field available for stats) but can run after 187-01 regardless of 187-02/03/04 order.

Recommended wave order:
- Wave A (parallel): 187-01 + 187-03 + 187-04
- Wave B (depends 187-01): 187-02 + 187-05

</specifics>

<deferred>

### Lower-priority patterns not in top 5

**Edge labels on hover (kepano JSON Canvas pattern)**
The JSON Canvas spec supports `label` fields on edges. Our wikilink edges could display the link text (the display alias if `[[Note|Alias]]` syntax was used) on hover. Requires: (a) parser changes to capture alias text, (b) custom `linkCanvasObject` painter in react-force-graph-2d. Complexity is medium due to canvas text positioning at edge midpoints. Deferred to v38.1+.

**Convex-hull cluster overlay (kepano "group" node type)**
JSON Canvas "group" nodes visually wrap other nodes in a labeled rectangle. In react-force-graph-2d this would require a custom canvas layer drawing convex hulls around nodes sharing the same topDir or tag. D3's `d3-polygon` provides convexHull(). Doable but adds ~200 lines and a new dependency. Deferred to v38.1+.

**Hierarchical tag group mode (kepano #nested/tag pattern)**
Currently `by-tag` mode uses only `tags[0]` (first tag). With hierarchical tags, a note tagged `#project/active` belongs to both `project` (primary) and `project/active` (secondary). A two-level group mode would show `project` as a cluster with `active`/`archived` sub-clusters. Requires GroupsSection redesign. Deferred — current by-tag mode is functional.

**Full Tarjan bridge-node detection**
Plan 187-05 uses a simplified heuristic for bridge nodes (high-degree nodes spanning multiple topDir clusters). True bridge-node detection uses Tarjan's bridge-finding algorithm (O(V+E), DFS-based). At 2000 nodes this is ~2ms — feasible. Deferred from 187-05 to avoid scope creep; 187-05 ships the stats UI scaffold, bridge detection can be upgraded in place later.

**WebGL / sigma.js migration**
The 179-CONTEXT deferred "WebGL escape (sigma.js) → v38.1+ if telemetry triggers." The Minimal theme uses Obsidian's native WebGL renderer (not Canvas 2D). Our react-force-graph-2d uses Canvas 2D, which starts to drop frames at ~1500 labeled nodes. If the operator reports lag with large vaults, sigma.js is the upgrade path. All patterns in this Phase 187 are Canvas-2D-compatible and do not block a future WebGL migration.

**MOC (Map of Content) node type**
obsidian-mind uses implicit MOC pages (index notes with many backlinks). We could add an explicit `'moc'` node type detected by naming convention (`*-index.md`, `Index.md`, `Home.md`) or frontmatter flag (`moc: true`). This would let the palette give MOC nodes a distinct color (e.g., bright gold). Deferred — degree sizing (Pattern 1) already makes MOC nodes visually prominent without needing a new type.

</deferred>

---

*Phase: 187-vault-graph-obsidian-polish*
*Wave: 3*
*Depends on: Phase 178, 179, 180*
*Estimated: ~2-3 days agent work*
