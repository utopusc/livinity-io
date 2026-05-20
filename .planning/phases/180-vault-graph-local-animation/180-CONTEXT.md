# Phase 180: Vault Graph Local Mode + Animation Timeline

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 180 + research Part A4/A8, Part E Phase 3
**Wave:** 3 (parallel with 174 — depends 179)

<domain>
## Phase Boundary

Two Obsidian "killer" features: Local Graph mode (BFS from active node, depth chip UI) and Animate timeline (`mtime`-ordered reveal). Plus LegendBadge bottom-left.

**Phase 180 sonu:**
- Local Graph mode toggle in NodeDetail drawer → switches canvas to render only active node + N-hop neighbors
- `<DepthChip>` top-center pill: `Depth: 2  −  +   Back to global`
- Max depth 4
- "Animate appearance" button in Display section → all nodes hide, re-appear in mtime order over ~8s, edges draw as targets materialise
- `<LegendBadge>` bottom-left, 220px wide, shows current group mode's color→label mapping, click row toggles visibility, click title switches group mode
</domain>

<decisions>

### Plan 180-01: BFS depth resolver + Local Graph mode
- NEW `features/vault-graph/local-graph-mode.ts` — BFS up to depth from active node, returns subset of nodes + edges
- NEW `<DepthChip>` component — top-center floating, `−`/`+` buttons, "Back to global"
- MOD `<VaultGraph>` orchestrator: `mode: 'global' | 'local'` state
- Acceptance: 8 vitest assertions — BFS correctness at depth 1/2/3/4, mode switching, focus-node persistence

### Plan 180-02: Animation timeline
- NEW `features/vault-graph/animation.ts` — given graph data + duration, schedules `setTimeout` reveals in `mtime` order
- Nodes hide on start, materialise in chronological order
- Edges fade in when target appears
- Acceptance: 6 vitest assertions — reveal order matches mtime asc, animation respects `prefers-reduced-motion`

### Plan 180-03: LegendBadge
- NEW `<LegendBadge>` — bottom-left, lists current group mode's swatches
- Click row → toggle that group's visibility
- Click title → switches group mode (cycles through by-type → by-folder → by-tag → custom)
- Acceptance: 6 vitest assertions
</decisions>

<canonical_refs>
- Research Part A4 (Local Graph flow) + Part A8 (Animate timeline)
- Phase 178 + 179 outputs (palette, controls panel)
- react-force-graph-2d API for graph data manipulation
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 180-01 | NEW features/vault-graph/{local-graph-mode.ts, DepthChip.tsx} + tests; MOD VaultGraph orchestrator |
| 180-02 | NEW features/vault-graph/animation.ts + test |
| 180-03 | NEW features/vault-graph/LegendBadge.tsx + test |

</specifics>

<deferred>
- 3D mode (community plugin) → v39+
- Per-user vs vault-global settings storage decision → v38.1 polish
</deferred>

---

*Phase: 180-vault-graph-local-animation*
*Wave: 3 (parallel with 174 — depends 179)*
*Depends on: Phase 179*
*Estimated: ~1-2 days agent work*
