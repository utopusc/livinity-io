# Phase 185: Mount SidebarTree in AI Chat Window Content (Left Pane)

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** v38.0 UAT finding #1 — operator sees "Open a Chat from the sidebar to attach a terminal" but there is no sidebar
**Wave:** 1 (parallel-safe with 186 — file-disjoint after split decision)

<domain>
## Phase Boundary

Wire `<SidebarTree>` + `<SidebarFooter>` + `<AddItemModal>` into the AI Chat window content (`routes/ai-chat/index.tsx`) as a persistent LEFT PANE. Currently they are dead code — built in Phases 174-176 but never mounted in any route or layout.

**Architecture decision (LivOS window-logic compliant):** The sidebar lives INSIDE the AI Chat window content, NOT in the global desktop shell. Per [feedback_livos_window_logic_no_url_routing.md] LivOS does not have global persistent chrome outside of TopBar/Dock — windows own their layout. The SidebarTree is the navigation surface for the AI Chat workspace; it belongs inside that window.

The Phase 174 "global dock" comment in `ai-chat/index.tsx` was misleading — the dock is a launcher, not a layout container. Sidebar mount goes in the AI Chat window content.

**Phase 185 sonu:**
- AI Chat window opens with split layout: left pane = SidebarTree (~280px), right pane = tab content (Terminal / Vault Graph)
- SidebarFooter (Settings gear) at bottom-left of the left pane — already wired to `windowManager.openWindow('settings')` in Phase 183-02
- AddItemModal "+ Add" button at top of left pane — already wired to `vault.items.create` in Phase 175
- The misleading "Open a Chat from the sidebar..." prompt becomes accurate (sidebar now exists)
- Clicking a Chat item in SidebarTree triggers ChatDetail mount in the RIGHT pane (replaces tab content) OR opens as separate window — pick based on existing `windowManager.openItem` pattern from Phase 176-05
- Empty-state (no items) still shows LivWelcomeTerminal in right pane
- Mobile fallback unchanged (already redirects to /chat-mobile)

</domain>

<decisions>

### Plan 185-01: Embed SidebarTree as left pane in AI Chat window
- MOD `routes/ai-chat/index.tsx` — restructure layout from "tab-only" to "split: sidebar | tab-content"
- Import `<SidebarTree>` from `@/features/sidebar-tree`
- Width: 280px left pane (fixed), `flex-1` right pane
- Border separator: `border-r border-border` between panes
- Preserve existing tab nav (Terminal | Vault Graph) above right pane
- Acceptance: 6 vitest assertions — sidebar renders, AI Chat tabs still work, split layout responsive

### Plan 185-02: Right-pane item routing (click Chat → mount ChatDetail)
- When SidebarTree fires `onItemSelect(chatItem)` AND Terminal tab is active → mount `<ChatDetail>` in right pane instead of the empty-state prompt
- For Project/Agent selection → mount `<ProjectDetail>` / `<AgentDetail>` (Phase 175-03/04) in right pane
- Keep tab nav at top: switching to "Vault Graph" tab → render VaultGraph regardless of selected item
- Acceptance: 8 vitest assertions — Chat click mounts ChatDetail with correct sessionId, Project click mounts ProjectDetail, Agent click mounts AgentDetail, tab switch overrides item view

### Plan 185-03: Mobile/responsive behavior + AddItemModal trigger position
- AddItemModal "+ Add" button placement: top of sidebar (above tree root)
- On viewport < 768px: collapse sidebar by default with hamburger toggle (using existing useIsMobile)
- Already-rendered AddItemModal opens as dialog overlay (Radix) — no layout change needed
- Acceptance: 4 vitest assertions — collapse toggle, AddItemModal opens from button

### Plan 185-04: Smoke probe — manual UAT script + ROADMAP marker
- Append to `184-03-probes-log.md` (or NEW `185-uat-log.md`): manual probe "Open AI Chat window → confirm sidebar visible left → click + Add → create Chat → confirm new Chat appears in tree → click new Chat → confirm terminal mounts right"
- Update ROADMAP Phase 185 status to ✅ CODE-COMPLETE
- Acceptance: 0 code tests; documentation only

</decisions>

<canonical_refs>
- v38.0 UAT finding #1 (this CONTEXT triggering source)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` (file to restructure)
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` (Phase 174-02 — to mount)
- `livos/packages/ui/src/features/sidebar-tree/SidebarFooter.tsx` (Phase 183-02 — gear wired)
- `livos/packages/ui/src/features/item-detail/AddItemModal.tsx` (Phase 175-01/02 — already in feature barrel)
- `livos/packages/ui/src/features/item-detail/{ProjectDetail,AgentDetail,ChatDetail}.tsx` (Phase 175-03/04 — to right-mount)
- `livos/packages/ui/src/modules/window/app-contents/ai-chat-content.tsx` (window wrapper — lazy-loads the route; no changes needed there)
- Phase 174 CONTEXT (original sidebar spec)
- [feedback_livos_window_logic_no_url_routing.md] (window logic constraint)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 185-01 | MOD routes/ai-chat/index.tsx (split layout + SidebarTree mount) + test |
| 185-02 | MOD routes/ai-chat/index.tsx (selectedItem state + right-pane routing) + test |
| 185-03 | MOD routes/ai-chat/index.tsx (mobile collapse + AddItemModal trigger) + test |
| 185-04 | MOD .planning/phases/184-v38-deploy-uat/184-03-probes-log.md (append UAT probe); MOD .planning/ROADMAP.md (status marker) |

**Sacred guards:** Phase 174 SidebarTree.tsx (and dependents) UNCHANGED — pure consumer mount. Phase 175 ProjectDetail/AgentDetail/ChatDetail UNCHANGED — consumed via existing exports. Phase 176-04 LivWelcomeTerminal UNCHANGED — moves from full-pane to right-pane render path only.

</specifics>

<deferred>
- Resizable split (drag the border between sidebar and content) → v38.2
- Sidebar collapse-to-rail mode (icon-only) → v38.2
- Multi-pane right side (e.g., chat + agent inspector simultaneously) → v39+
</deferred>

---

*Phase: 185-sidebar-mount-shell*
*Wave: 1 (file-disjoint with 186 after deciding split)*
*Depends on: Phase 174, 175, 176, 183*
*Estimated: ~0.5 day agent work*
