# Phase 174: SidebarTree Component

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 174 + § Sidebar UX (research output Part C)
**Wave:** 3 (parallel with 180 — depends 171, 173)

<domain>
## Phase Boundary

Build the tree-based sidebar UI that replaces Phase 168 flat `SessionSidebar`. Uses `react-arborist` (D-NEW-DEPS-v38 authorized) for virtualised tree + drag-drop. Per-type row styling. Context menu. Bottom-left Settings gear button.

**Phase 174 sonu:**
- NEW `<SidebarTree>` component mounted in AI Chat dock window
- Tree fed from `vault.items.list` tRPC query (Phase 171)
- Main Liv pinned at top (synthetic root, not a real Item)
- Per-type icon + color (D-V38-O palette): Project=warm-amber/folder-kanban, Agent=cyan/bot, Chat=text-secondary/message-square
- Drag-to-reparent with cycle check + depth cap warnings (server validates via Phase 171 tree-resolver)
- Right-click context menu (Open / Rename / Duplicate / Archive / Delete / Export / Reveal in Files / agent-only actions)
- "+ Add" button at top (Phase 175 implements modal)
- Settings gear button at bottom-left (Phase 183 wires the click to open Settings)
- Empty state — when no items, show centered "talk to Liv in terminal ↓" hint
</domain>

<decisions>

### Plan 174-01: Install + scaffold
- MOD `livos/packages/ui/package.json` — add `react-arborist@^3.x`
- NEW `livos/packages/ui/src/features/sidebar-tree/{SidebarTree,ItemTreeRow,index}.tsx`
- Acceptance: package.json + lockfile diff is ONLY react-arborist + transitive (no other deps), tsc clean

### Plan 174-02: Tree rendering from tRPC
- `<SidebarTree>` queries `vault.items.list` via tRPC, transforms flat list → react-arborist tree shape
- Main Liv pinned at top
- Real-time updates: subscribes to `vault.items.subscribeTree` (or polls every 5s for v1)
- Acceptance: 10 vitest assertions — empty tree shows hint, populated tree renders rows in sorted order, Main Liv always top

### Plan 174-03: Per-type styling + icons
- `<ItemTreeRow>` renders icon + label + optional badge (inbox unread count, schedule pill)
- Type color from D-V38-O palette via Livinity DS tokens (NOT hard-coded hex)
- Acceptance: 8 vitest assertions — Project rows bold + folder icon, Agent rows medium + bot icon, Chat rows light + message icon, dark+light theme parity

### Plan 174-04: Drag-drop with cycle/depth check
- react-arborist `onMove` calls `vault.items.move` tRPC
- Server validates cycle + depth → returns 400 → UI toasts error + reverts
- Acceptance: 6 vitest assertions — successful move, cycle rejection toast, depth warning ≥5, depth reject ≥8

### Plan 174-05: Context menu + footer Settings gear
- NEW `<ItemContextMenu>` triggered by right-click on row
- Conditional items: Run Now + View Inbox + Stop Tmux are agent-only
- Bottom-left footer slot: gear icon button (handler wired in Phase 183)
- Acceptance: 8 vitest assertions — each menu item dispatches correct tRPC, agent-only items only on agents, gear button renders with `lucide-react` icon
</decisions>

<canonical_refs>
- Master plan § D-V38-F (react-arborist choice)
- Master plan § D-V38-O (color palette)
- Master plan § Sidebar UX (Part C research output)
- `livos/packages/ui/src/features/cc-sessions/SessionSidebar.tsx` (Phase 168 — being replaced, but mount point and styling conventions to mirror)
- `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts` (Phase 171, the data source)
- Livinity DS tokens at `livos/packages/design-tokens/`
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 174-01 | MOD packages/ui/package.json + pnpm-lock.yaml |
| 174-02 | NEW features/sidebar-tree/SidebarTree.tsx + test |
| 174-03 | NEW features/sidebar-tree/ItemTreeRow.tsx + test |
| 174-04 | MOD SidebarTree.tsx (drag handler); MOD vault-items-router validation (error shape) |
| 174-05 | NEW features/sidebar-tree/ItemContextMenu.tsx + test; footer slot in SidebarTree |

**Sacred guards:** Phase 168 SessionSidebar/SessionItem/NewSessionButton stay; deletion happens in Phase 175.

</specifics>

<deferred>
- Add modal flow → Phase 175
- Item detail views → Phase 175
- Main Liv terminal in empty state → Phase 176
- Settings panel click handler wiring → Phase 183
- Schedule pill / inbox badge data plumbing → Phase 177
</deferred>

---

*Phase: 174-sidebartree-component*
*Wave: 3 (parallel with 180 — depends 171, 173)*
*Depends on: Phase 171, 173*
*Estimated: ~2 days agent work*
