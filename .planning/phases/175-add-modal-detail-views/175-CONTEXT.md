# Phase 175: Add Modal + Item Detail Views

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 175 + § Item Detail View (research output Part D) + D-V38-B/J
**Wave:** 2 (depends on 174)

<domain>
## Phase Boundary

Build the "+ Add" modal flow and the per-type detail views. Delete Phase 168 `SessionSidebar` + `NewSessionButton` + cc-pty-router (now superseded by Phase 171 vault-items).

**Phase 175 sonu:**
- `<AddItemModal>` opens inline from sidebar "+ Add" button
- Type selection: Project / Agent / Chat with icon + description
- Parent selector defaults to currently-focused Item or Main Liv
- Per-type form: Project (name + cwd + template), Agent (name + parent + system prompt snippet OR template skill + tools checklist + schedule), Chat (name optional, parent)
- `<ProjectDetail>` view: README/CLAUDE preview, Tasks checklist, Children list, Recent sessions
- `<AgentDetail>` view: system prompt editor (textarea + streamdown preview), allowed tools list, MCP servers, schedule + Run Now + pause, inbox preview, last-run log link, children
- `<ChatDetail>` = direct CC PTY attach (no detail page — Chat row click immediately mounts CcTerminal full-pane)
- Phase 168 components DELETED: `SessionSidebar`, `SessionItem`, `NewSessionButton`, `cc-pty-router.ts` + tests (replaced wholesale by Phase 171 + 174)
</domain>

<decisions>

### Plan 175-01: AddItemModal — type picker + parent selector
- NEW `livos/packages/ui/src/features/item-detail/AddItemModal.tsx` + test
- Anchored to sidebar "+ Add" button (NOT full-screen dialog — preserve LivOS window logic per memory feedback)
- Type picker: 3 cards (Project/Agent/Chat) with icon + 1-line description
- Parent dropdown: lists ancestors of focus + Main Liv
- Acceptance: 6 vitest assertions — opens on Add click, type cards clickable, parent dropdown populated from tree

### Plan 175-02: Per-type create forms
- Same modal, type selection → step 2 form
- Project form: name (required) + cwd (path picker reuse Files-feature browser) + template select (blank/git-clone/.planning)
- Agent form: name + parent + system prompt snippet (textarea, optional from-template) + tools checklist + schedule cron picker
- Chat form: name (optional auto-gen `Chat 2026-05-20 09:14`) + parent
- Submit → tRPC `vault.items.create` → tree updates via Redis pub/sub → modal closes → new Item focused
- Acceptance: 10 vitest assertions — form validation, submit success, error toast on backend rejection

### Plan 175-03: ProjectDetail + ChatDetail
- NEW `features/item-detail/ProjectDetail.tsx` + test
- Renders README.md via streamdown, CLAUDE.md collapsed, tasks.json checklist, children list, recent sessions
- ChatDetail: thin wrapper — auto-attaches `<CcTerminal>` keyed on `chat.ccSessionId`, no detail UI
- Acceptance: 8 vitest assertions

### Plan 175-04: AgentDetail
- NEW `features/item-detail/AgentDetail.tsx` + test
- System prompt textarea + streamdown preview tab
- Allowed tools list (editable via Settings sub-modal)
- Schedule cron picker + Pause/Run Now buttons (Run Now wired via Phase 177)
- Inbox preview (last 3) — Phase 177 plumbs data
- Last-run log link → opens terminal pane on the run's transcript
- Acceptance: 12 vitest assertions

### Plan 175-05: Phase 168 component deletion + grep verification
- DELETE `cc-sessions/SessionSidebar.tsx`, `SessionItem.tsx`, `NewSessionButton.tsx`, `index.ts`, test files
- DELETE `server/trpc/cc-pty-router.ts` + test
- Remove 5 entries from httpOnlyPaths cluster
- Update tRPC index registration
- Acceptance: grep proves no imports of deleted components remain, `pnpm --filter ui exec tsc` clean
</decisions>

<canonical_refs>
- Master plan § Phase 175 + Part D (Item Detail View specs)
- `livos/packages/ui/src/features/cc-sessions/` (Phase 168 — being deleted)
- `livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts` (Phase 168 — being deleted)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (httpOnlyPaths cluster)
- streamdown markdown renderer (already in tailwind content paths)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 175-01 | NEW features/item-detail/AddItemModal.tsx + test |
| 175-02 | MOD AddItemModal (form steps) + tRPC integration |
| 175-03 | NEW features/item-detail/{ProjectDetail,ChatDetail}.tsx + tests |
| 175-04 | NEW features/item-detail/AgentDetail.tsx + test |
| 175-05 | DEL features/cc-sessions/* + server/trpc/cc-pty-router.ts; MOD trpc/index + common.ts |

**Sacred guards:** Phase 166 cc-pty manager STAYS (the underlying tmux + node-pty engine is still the substrate). Only Phase 168 router + UI is deleted.

</specifics>

<deferred>
- Inbox data plumbing → Phase 177
- Run Now / Pause handler implementation → Phase 177
- Main Liv root agent (empty state) → Phase 176
- Subagent template registry for "from-template" agent creation → Phase 176 (ships the 4 LivOS-native skills)
</deferred>

---

*Phase: 175-add-modal-detail-views*
*Wave: 2*
*Depends on: Phase 174*
*Estimated: ~2-3 days agent work*
