# Phase 194: Sidebar UI + Files Default Adapt to ~/livinity/

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Source:** v38.3 closing phase after Phase 192 (bruce-user) + Phase 193 (~/livinity/ filesystem model)
**Wave:** 3 (depends on Phase 193 data shape)

<domain>
## Phase Boundary

UI polish + Files app integration for the new `~/livinity/` filesystem model. Phase 193's filesystem-walk source-of-truth means the sidebar tree naturally reflects on-disk reality — but UI affordances need to catch up:

- Sidebar shows agents/projects as their **slug** (folder name) but **renders the human-readable name** from claude.md frontmatter
- Agent settings inline (operator's repeated ask — sidebar shows clicked agent's metadata)
- Files app defaults to `/home/bruce/livinity/` (so operator can browse the workspace directly)
- Project click → opens that project as a workspace in Files + makes it the default cwd for the active terminal tab
- "+ Add" modal stays as-is (Phase 188) but the slug is shown as a preview ("Name: Luse Control Agent → folder: luse-control-agent")

**Phase 194 sonu:**
- SidebarTree row displays: `<icon> <name from frontmatter>` — slug is implementation detail
- Clicking an agent: right pane = AgentTerminalPane (unchanged); LEFT sidebar BELOW the tree shows that agent's metadata inline (Bug #10 deferred from v38.2)
- Files app opens `/home/bruce/livinity/` by default (not `/home/bruce/` or vault)
- Project click adds a Project workspace tab + sets terminal cwd to project root
- Add Modal preview shows slug as user types name
- `~/livinity/.livinity/migration-backup-<ts>/` hidden from UI (dotfile)
</domain>

<decisions>

### Plan 194-01: SidebarTree displays frontmatter `name` (not slug)
- MOD `vault-items` tRPC `list` response shape — include both `slug` (folder name, stable id) and `name` (from frontmatter, human-readable)
- MOD `ItemTreeRow.tsx` — render `name` (already does this for chats; ensure agents + projects same)
- Fallback: if frontmatter missing `name`, render slug as-is
- Acceptance: existing UI tests pass; sidebar shows "Luse Control Agent" not "luse-control-agent"

### Plan 194-02: Inline agent settings panel below sidebar tree
- MOD `ai-chat/index.tsx` — when `selectedItemId` is an agent, render `<AgentInlineSettings>` below the tree (in the same 280px sidebar pane, scrollable)
- NEW `livos/packages/ui/src/features/sidebar-tree/AgentInlineSettings.tsx`:
  - Read `agent.frontmatter` from tRPC `vault.items.read`
  - Compact UI: name + icon + MCPs (chip list) + tools (chip list) + schedule + "Edit in Settings" link
  - "Edit in Settings" → opens Phase 191 AiChatSettingsPanel scoped to this agent
- Acceptance: agent click shows inline metadata in sidebar; no terminal mount delay

### Plan 194-03: Files app default to ~/livinity/
- AUDIT current Files app default path — likely `/home/bruce/` or platform-specific
- MOD Files app initial route / state — `/home/bruce/livinity/`
- Preserve operator's "remember last folder" preference (if exists) — only DEFAULT to livinity if no last
- Acceptance: opening Files app fresh shows livinity dir listing (agents/, projects/, sessions/, CLAUDE.md, USER.md visible)

### Plan 194-04: Project click → workspace tab + cwd
- MOD `ai-chat/index.tsx` `handleItemSelect` — when item type === 'project':
  - Open a "Project" tab in TerminalTabStrip (like agent tab, but type='project')
  - Tab content = bare bash terminal with `cwd = /home/bruce/livinity/projects/<slug>/`
  - OR detail view (ProjectDetail.tsx from Phase 175-03) above the terminal — operator chooses
- The Project workspace concept matches operator's "Project icerisinde Proje gelistirsin" intent (Phase 188 spec)
- Acceptance: project click spawns terminal in correct cwd; tab labeled with project name

### Plan 194-05: Add Modal slug preview + validation
- MOD `AddItemModal.tsx` — as operator types name, show below input: `"Will be created as: <slug>"`
- Reject names that slugify to empty string (all special chars)
- Show collision warning if slug already exists (read from tRPC list)
- Acceptance: typing "Luse Control Agent" shows `luse-control-agent` preview; trying duplicate name shows warning
</decisions>

<canonical_refs>
- Phase 193 filesystem model (canonical)
- Phase 192 bruce-user (foundation)
- Operator's Bug #10 deferred from v38.2 ("sidebar shows clicked agent's settings inline")
- Phase 175 ProjectDetail.tsx (reused for project click)
- Phase 185 AI Chat split layout + sidebar mount
- Phase 188 AddItemModal (slug preview added here)
- Phase 191 AiChatSettingsPanel (linked-to from inline panel)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 194-01 | MOD vault-items tRPC list response shape; MOD ItemTreeRow.tsx |
| 194-02 | NEW sidebar-tree/AgentInlineSettings.tsx; MOD ai-chat/index.tsx (sidebar slot) |
| 194-03 | MOD Files app default state/route (location TBD by audit) |
| 194-04 | MOD ai-chat/index.tsx handleItemSelect (project branch); MOD TerminalTabStrip (project tab type) |
| 194-05 | MOD AddItemModal.tsx (slug preview + collision check) |

**Sacred guards:**
- sdk-agent-runner.ts (SHA f3538e1d...) UNCHANGED
- Phase 174 SidebarTree.tsx — additive (props for inline panel may need adding) but core tree unchanged
- Phase 185 AI Chat split layout UNCHANGED — just adds the inline panel slot
- AiChatSettingsPanel (v38.2 hotfix) UNCHANGED — 194-02 just deep-links into it

</specifics>

<deferred>
- Project workspace inline file tree (mini Files-app embedded in workspace tab) → v38.4
- Per-agent recent-activity feed → v38.4
- Drag-and-drop file into agent terminal → v39+
- Drag-and-drop sidebar item to reparent (already done in Phase 174-04 — works with slug paths now) — verify still functional

</deferred>

---

*Phase: 194-sidebar-livinity-shape-adapt*
*Wave: 3 (depends on Phase 193 data shape)*
*Depends on: Phase 193*
*Estimated: ~0.5-1 day*
