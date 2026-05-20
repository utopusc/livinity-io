# Phase 179: Vault Graph Controls Panel

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 179 + Obsidian Graph Hybrid spec (Part C all 4 sections, Part E Phase 2)
**Wave:** 2 (parallel with 173 — depends 178)

<domain>
## Phase Boundary

Right-edge floating Controls panel with 4 sections (Filters / Groups / Display / Forces), mirroring Obsidian's IA. Backend extends to emit per-node `tags[]` + `topDir`. Settings persist to localStorage.

**Phase 179 sonu:**
- `<GraphControls>` — right-side floating card, collapsible chip when closed
- **Filters** — search input + type toggles + orphans-only + recent-only + ghost-links toggle + excluded-paths textarea
- **Groups** — radio selector: by-type / by-folder / by-tag / custom; auto-color per group
- **Display** — sliders: label visibility (zoom threshold), node size scaling, link thickness, show-arrows toggle, show-directory-edges toggle, background-mode select
- **Forces** — 4 sliders (center, repel, link, distance) + Reset button
- Backend extension: `/api/vault/graph` adds per-node `tags: string[]` (parsed from frontmatter) + `topDir: string`
- localStorage persistence (`liv:vault-graph:settings`, keyed by `currentUser.id` in multi-user mode)
</domain>

<decisions>

### Plan 179-01: Backend extension — tags + topDir
- MOD `livinityd/source/modules/vault-graph/parser.ts` — parse `tags:` array from YAML frontmatter (already has parseFrontmatter)
- MOD `walker.ts` — derive `topDir` from path (first segment)
- MOD `builder.ts` — emit `tags[]` + `topDir` on each node
- Acceptance: 8 vitest assertions — tags parsed correctly (single string OR array variants), topDir matches first path segment, nodes without frontmatter get empty tags array

### Plan 179-02: GraphControls scaffold + Filters section
- NEW `features/vault-graph/GraphControls.tsx` — collapsible right-edge card
- NEW `features/vault-graph/sections/FiltersSection.tsx` — type toggles, orphans/recent/ghost toggles, excluded-paths textarea
- localStorage helpers `liv:vault-graph:settings:filters`
- Acceptance: 10 vitest assertions

### Plan 179-03: Groups section + color mode switching
- NEW `features/vault-graph/sections/GroupsSection.tsx`
- 4 modes: by-type (default), by-folder, by-tag, custom (query→color rows)
- Color transition 300ms when switching
- Acceptance: 8 vitest assertions

### Plan 179-04: Display + Forces sections
- NEW `features/vault-graph/sections/{DisplaySection,ForcesSection}.tsx`
- Display: 3 sliders + 2 toggles + background select + Animate button (Phase 180)
- Forces: 4 sliders (center 0-1, repel -200-0, link 0-1, distance 20-200) + Reset
- Settings persist via debounced localStorage write
- Acceptance: 10 vitest assertions

### Plan 179-05: Settings integration + state plumbing
- MOD `<VaultGraph>` orchestrator: settings state via `useGraphSettings()` hook
- Forces apply via `.d3Force(...)` calls on ForceGraph2D ref (no remount)
- Acceptance: 6 vitest assertions — settings reach canvas, no remount on settings change
</decisions>

<canonical_refs>
- Master plan § D-V38-O + § Vault Graph (research Part C)
- `livinityd/source/modules/vault-graph/{walker,parser,builder}.ts` (Phase 169 — being extended additively)
- `features/vault-graph/VaultGraph.tsx` (Phase 178 — orchestrator gains GraphControls mount)
- Livinity DS card styling (`bg-surface`, `border-line-strong`, `rounded-[var(--r-lg)]`, `shadow-pop`)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 179-01 | MOD walker.ts + parser.ts + builder.ts + tests |
| 179-02 | NEW GraphControls.tsx + sections/FiltersSection.tsx + tests |
| 179-03 | NEW sections/GroupsSection.tsx + test |
| 179-04 | NEW sections/DisplaySection.tsx + sections/ForcesSection.tsx + tests |
| 179-05 | MOD VaultGraph orchestrator; NEW hooks/useGraphSettings.ts + test |

**Sacred guards:** Phase 169 vault-graph backend files modified ADDITIVELY (extra fields on node payload, not breaking changes — old clients still work).

</specifics>

<deferred>
- Local Graph mode → Phase 180
- Animation timeline → Phase 180
- LegendBadge bottom-left → Phase 180
- WebGL escape (sigma.js) → v38.1+ if telemetry triggers
</deferred>

---

*Phase: 179-vault-graph-controls*
*Wave: 2 (parallel with 173 — depends 178)*
*Depends on: Phase 178*
*Estimated: ~2-3 days agent work*
