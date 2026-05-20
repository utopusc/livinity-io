# Phase 178: Vault Graph MVP Polish

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 178 + Obsidian Graph Hybrid spec (research output Part A1/A3/A7 + Part B + Part E Phase 1)
**Wave:** 3 (parallel with 177)

<domain>
## Phase Boundary

Polish Phase 169 Vault Graph MVP. Re-palette to D-V38-O 7-type colors (steel-blue/violet/sage/amber/teal/plum/gray-mute). Replace `<pre>` markdown with streamdown render. Backlinks/Outgoing client-derived. Restyle UI to Livinity DS tokens. Add SearchBar `Cmd+K`.

**Phase 178 sonu:**
- Phase 169 `<VaultGraph>` re-palette: D-V38-O 7-type curated colors (NOT `--blue` brand)
- `<GraphNodeDetail>` rewrites `<pre>` → `<Markdown>` via streamdown
- Backlinks list + Outgoing list computed client-side from existing graph payload
- Refresh button + truncated banner restyled with Livinity tokens (NOT literal hex)
- NEW `<GraphSearchBar>` — Cmd+K opens, live-filter highlights matching nodes
- Empty/loading/error states restyled per Livinity DS
- Edges restyled: `--line-strong` 50% alpha baseline, hover thickens to 1.4px source-color 60%
</domain>

<decisions>

### Plan 178-01: D-V38-O palette + token migration
- MOD `features/vault-graph/VaultGraph.tsx` — NODE_COLORS dictionary uses Livinity DS tokens via OKLCH-derived hue per type
- NEW `features/vault-graph/graph-palette.ts` — exports `getNodeColor(type, theme)` function
- Acceptance: 6 vitest assertions — palette correct in dark/light/iridescent, no literal hex outside palette file

### Plan 178-02: NodeDetail rewrite with streamdown
- MOD `features/vault-graph/GraphNodeDetail.tsx` — replace `<pre>` body with `<Markdown>` (streamdown)
- Backlinks list (client-derived from edges where target=this node)
- Outgoing list (edges where source=this node)
- Header: type pill (Geist Mono uppercase 11px) + filename Geist 17px semibold
- Acceptance: 10 vitest assertions — markdown renders, backlinks count matches edges, scroll-on-focus

### Plan 178-03: Refresh + truncated banner restyle
- Restyle banner: `bg-[var(--bg-2)] border border-line-strong text-fg-dim`
- Replace `bg-amber-500/20` literal with token-driven
- Add link "Adjust limit in Settings" (placeholder; wires up in Phase 182)
- Acceptance: 4 vitest assertions

### Plan 178-04: SearchBar `Cmd+K` + live filter
- NEW `features/vault-graph/GraphSearchBar.tsx` — top-center floating, 480px, Geist Mono 13px
- Cmd+K focuses, Esc closes
- Live-filter highlights matching nodes (`+1.15× radius`, brighter); non-matching drop to 8% opacity
- Acceptance: 8 vitest assertions — filter on title match, on path match, on type: match operator
</decisions>

<canonical_refs>
- Master plan § D-V38-O (palette), § Vault Graph (Obsidian hybrid research Part A1-A7)
- `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` (Phase 169 — being polished)
- `livos/packages/ui/src/features/vault-graph/GraphNodeDetail.tsx` (Phase 169 — being rewritten)
- streamdown markdown renderer (in tailwind content paths)
- Livinity DS tokens at `livos/packages/design-tokens/`
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 178-01 | NEW features/vault-graph/graph-palette.ts + test; MOD VaultGraph.tsx |
| 178-02 | MOD features/vault-graph/GraphNodeDetail.tsx + test |
| 178-03 | MOD VaultGraph.tsx (banner restyle) |
| 178-04 | NEW features/vault-graph/GraphSearchBar.tsx + test |

**Sacred guards:** Phase 169 walker.ts + parser.ts + builder.ts + routes.ts UNCHANGED (backend extension is Phase 179's job).

</specifics>

<deferred>
- Controls panel (Filters/Groups/Display/Forces) → Phase 179
- Backend tags+topDir extension → Phase 179
- Local Graph mode + animation timeline → Phase 180
- Ghost nodes toggle → Phase 179 (Filters panel)
</deferred>

---

*Phase: 178-vault-graph-polish*
*Wave: 3 (parallel with 177)*
*Estimated: ~1-2 days agent work*
