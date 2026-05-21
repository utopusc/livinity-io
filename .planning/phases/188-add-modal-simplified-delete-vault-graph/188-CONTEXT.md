# Phase 188: Simplified Add Modal + DELETE Vault Graph

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Operator literal spec 2026-05-20 ("tane tane anlatıyorum") + UAT rejection of current multi-step modal + "Cault kullanmak istemiyorum"
**Wave:** 1 (file-disjoint with research — can start without it)

<domain>
## Phase Boundary

Replace the current multi-step `AddItemModal` (type → cwd → system prompt → tools → schedule — too complex, operator hated it) with a 2-step minimal modal:
- **Step 1:** Two large cards — "Agent" and "Project" (icons + 1-line description; mutually exclusive)
- **Step 2:** Name input (required) + Icon picker (lucide icons grid OR emoji picker — pick simplest: lucide grid of ~16 commonly-used icons)
- **Submit button:** "Kur" (Turkish for "Set up")

On submit:
- Call existing `vault.items.create` tRPC mutation with `{ name, type, icon, parent: 'main-liv' or focused-folder }`
- Server-side: create directory `~/liv/items/<id>/` (Phase 171 already does this — additive: also write `claude.md` placeholder + `.agent/config.json` for Agent type, `.project/config.json` for Project type)
- Modal closes, sidebar refreshes via existing pub/sub, new item is focused

ALSO in this phase:
- **DELETE Vault Graph feature entirely.** Operator: "Cault kullanmak istemiyorum birde inanilmaz igrenc duruyor."
- Remove `Vault Graph` tab from AI Chat (`routes/ai-chat/index.tsx` Tab union shrinks from `'terminal'|'graph'|'mcp'` to `'terminal'|'mcp'` — MCP tab removed in Phase 190; for now keep it)
- Delete `livos/packages/ui/src/features/vault-graph/` directory entirely (all files: VaultGraph.tsx, GraphControls.tsx, sections/, hooks/, animation.ts, graph-palette.ts, graph-stats.ts, local-graph-mode.ts, LegendBadge.tsx, DepthChip.tsx, ItemTreeRow gear footer — wait, gear footer is in sidebar-tree, not vault-graph)
- Keep `livos/packages/livinityd/source/modules/vault-graph/` backend (walker/parser/builder/routes) — UNTOUCHED for now (might be useful for Phase 192 Obsidian integration; deletion would be premature)
- Fix `+ Add` modal z-index bug: Radix Dialog overlay should be z-50; investigate current portal mounting

**Phase 188 sonu:**
- Operator clicks "+ Add" → modal opens **in front** (not behind), shows 2 cards
- Selects "Agent" → next screen: name + icon picker, "Kur" button
- Clicks Kur → new Agent appears in sidebar tree under Main Liv (or selected folder)
- On disk: `~/liv/items/<id>/{name,claude.md,.agent/{config.json,sessions/}}` created
- Vault Graph tab is GONE from AI Chat
- Vault Graph UI module is GONE from src (commit message documents the deletion)
</domain>

<decisions>

### Plan 188-01: Strip current AddItemModal multi-step + replace with 2-step minimal
- MOD `livos/packages/ui/src/features/item-detail/AddItemModal.tsx`
- Remove all multi-step state machine (currently has form step for cwd + system prompt + tools + schedule for Agent type)
- New state: `step: 'pick-type' | 'name-icon'`, `type: 'agent' | 'project' | null`, `name: string`, `iconName: string` (lucide icon name)
- Step 1 UI: 2 large clickable cards (h-32, w-1/2 each) with icon + label + 1-line description ("AI assistant that does work for you" / "Container for related items + tasks")
- Step 2 UI: name input (autoFocus, required, min 1 char) + lucide icon grid (4x4 = 16 common icons: User, Bot, Folder, FolderOpen, Code, Terminal, Book, Brain, Sparkles, Wrench, Calendar, Mail, Search, Database, Globe, Settings)
- "Kur" submit button (disabled until name non-empty + icon picked)
- "Geri" button on step 2 → back to step 1
- Acceptance: 10 vitest assertions covering both steps + happy-path submit

### Plan 188-02: tRPC + on-disk artifacts (Agent + Project folder structure)
- MOD `livos/packages/livinityd/source/modules/vault-items/vault-items-router.ts` `create` procedure
- Additive: when creating Agent type, also write:
  - `~/liv/items/<id>/claude.md` = template placeholder (1-line: "Agent: <name>" + system-prompt skeleton — leave blank for Phase 189 setup wizard to fill)
  - `~/liv/items/<id>/.agent/config.json` = `{"setup_done": false, "mcps": [], "tools": [], "schedule": null}`
  - `~/liv/items/<id>/.agent/sessions/` directory (empty)
- When creating Project type, additionally write:
  - `~/liv/items/<id>/.project/config.json` = `{"created_at": <iso>}`
  - (No claude.md for project — that's per-agent only)
- Existing Item type can stay (Chat backward-compat)
- Acceptance: 8 vitest assertions covering Agent + Project file creation + idempotency

### Plan 188-03: Modal z-index bug fix
- INVESTIGATE current Radix Dialog mounting — is overlay below other portals?
- The bug: operator clicks "+" → modal opens but appears BEHIND the workspace content (sidebar items obscure it)
- Likely cause: Radix Portal default container vs higher-z window manager containers
- FIX: add explicit `z-50` to Dialog Overlay + Dialog Content; portal to `document.body` explicitly via `Portal container={document.body}`
- Acceptance: 4 vitest assertions covering overlay z-index + portal target

### Plan 188-04: DELETE Vault Graph UI + remove tab
- DELETE entire `livos/packages/ui/src/features/vault-graph/` directory (via `git rm -r`)
- MOD `routes/ai-chat/index.tsx` Tab union: remove `'graph'`, remove the Vault Graph tab button, remove the VaultGraph mount in right-pane render switch
- MOD `routes/ai-chat/ai-chat.test.tsx`: remove any tests asserting Vault Graph tab presence
- Grep audit: `grep -r "vault-graph\|VaultGraph" livos/packages/ui/src/` returns 0 matches
- Keep backend untouched: `livos/packages/livinityd/source/modules/vault-graph/` STAYS (might be used by Phase 192 Obsidian integration; deletion premature)
- Acceptance: grep returns 0, tsc clean, ai-chat tests pass

</decisions>

<canonical_refs>
- Operator spec 2026-05-20 (this CONTEXT triggering source)
- `livos/packages/ui/src/features/item-detail/AddItemModal.tsx` (file to overhaul)
- `livos/packages/ui/src/features/item-detail/AddItemModal.test.tsx` (existing tests — refactor)
- `livos/packages/livinityd/source/modules/vault-items/vault-items-router.ts` (Phase 171 router to extend)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` (Phase 185 split layout — tab union shrinks)
- `livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx` (Phase 185 + 186 tests — adjust for graph removal)
- `livos/packages/ui/src/features/vault-graph/` (DELETE ENTIRELY)
- lucide-react icons (already in deps)
- Phase 171 (Item Model + Storage Layer)
- Phase 175-01 + 175-02 (previous AddItemModal — being overhauled)
- [feedback_v38_2_exact_spec] (THIS phase's literal source)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 188-01 | MOD AddItemModal.tsx (rewrite to 2-step) + AddItemModal.test.tsx |
| 188-02 | MOD vault-items-router.ts (additive Agent/Project on-disk artifacts) + tests |
| 188-03 | MOD AddItemModal.tsx (z-index + portal explicit) + assertion |
| 188-04 | DELETE features/vault-graph/* (via git rm -r); MOD routes/ai-chat/index.tsx + ai-chat.test.tsx |

**Sacred guards:**
- liv/packages/core/src/agent/sdk-agent-runner.ts UNCHANGED (SHA f3538e1d...)
- All 25 in scripts/sacred-shas-v38.json — verify after each commit
- Phase 174 SidebarTree + ItemTreeRow + ItemContextMenu — UNCHANGED (consumed via existing exports)
- Phase 185 ai-chat split layout — keep the split, just shrink the tab union
- Backend vault-graph (`livinityd/source/modules/vault-graph/`) — UNTOUCHED (future Phase 192 dep)

**Coordination with Phase 189:**
Phase 189 will read `<agentName>/.agent/config.json` to detect setup_done. Plan 188-02's empty config is the seed. Don't preemptively add wizard logic in 188 — that's 189's job.

**Coordination with Phase 190:**
Phase 190 changes the tab bar entirely. Phase 188 just shrinks the tab union (removes 'graph'). 190 will replace the bar with dynamic terminal tabs.

</specifics>

<deferred>
- MCP Server tab removal → Phase 190 (when tab bar is rebuilt)
- Settings gear button rewiring to in-pane panel → Phase 191 (v38.3)
- Backend `vault-graph` deletion → Phase 192 if Obsidian replaces it; otherwise keep
- Emoji icon picker (alternative to lucide grid) → polish, v38.x
- Custom icon upload → v39+
</deferred>

---

*Phase: 188-add-modal-simplified-delete-vault-graph*
*Wave: 1 (parallel with research for 189)*
*Depends on: Phase 174, 175, 185*
*Estimated: ~0.5 day*
