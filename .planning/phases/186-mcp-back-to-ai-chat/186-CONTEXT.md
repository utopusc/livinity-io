# Phase 186: Restore MCP Panel in AI Chat Window

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** v38.0 UAT finding #2 — operator wants MCP in AI Chat, not Settings ("MCp yi buraya degil bunuda AI chat in oldugu yere almaliydin")
**Wave:** 2 (parallel-safe with 185 only after 185-01 lands — both touch ai-chat/index.tsx)

<domain>
## Phase Boundary

Mount MCP Servers UI inside the AI Chat window (alongside Terminal / Vault Graph tabs). Phase 182-04 lifted `mcp-panel.tsx` into reusable `<McpServerList>` + `<McpServerDetail>` and mounted them at `routes/settings/mcp-servers.tsx`. Operator wants the AI Chat surface too — MCP servers extend the active conversation, so co-locating them with the chat is the natural mental model.

**Decision (per operator preference):** AI Chat is the PRIMARY MCP surface. Settings keeps the panel too (so power users can configure servers without opening a chat window) BUT the AI Chat tab is the discoverable path operator referenced.

**Phase 186 sonu:**
- AI Chat window gains a third tab: `Terminal | Vault Graph | MCP Servers`
- The "MCP Servers" tab mounts `<McpServerList>` + `<McpServerDetail>` from Phase 182-04 (same components, no new code in components/mcp/)
- Featured-MCP one-click install row preserved (lifted from `routes/ai-chat/mcp-panel.tsx`)
- Settings → AI → MCP Servers entry STAYS (do NOT remove — power users may want non-chat-context access; cheap to keep)
- `routes/ai-chat/mcp-panel.tsx` (1316-line orphan) DELETED — superseded by lifted components mounted via the new tab
- The data flow: AI Chat's MCP tab and Settings MCP page both consume the SAME tRPC routes (`mcp.*` or `liv:mcp:*` Redis-backed); they are different UI mounts of the same backend state

</domain>

<decisions>

### Plan 186-01: Add "MCP Servers" tab to AI Chat window
- MOD `routes/ai-chat/index.tsx` — extend `Tab` union to `'terminal' | 'graph' | 'mcp'`
- Add tab button "MCP Servers" alongside existing two
- When `activeTab === 'mcp'`: render `<McpServerList>` + `<McpServerDetail>` split (list left of right pane, detail of selected server right of right pane) — OR a single-column layout if simpler
- Use the same data fetching pattern as `routes/settings/mcp-servers.tsx` (Phase 182-04)
- Acceptance: 6 vitest assertions — MCP tab clickable, list renders, detail renders on selection

### Plan 186-02: Featured-MCP install row (Brave Search / GitHub / Filesystem / Puppeteer / PostgreSQL / Memory)
- The orphan `routes/ai-chat/mcp-panel.tsx` has a featured-servers UI (one-click install). Lift this block into a new shared component `components/mcp/FeaturedMcpInstaller.tsx`
- Mount the featured installer at the TOP of the MCP tab content in AI Chat (above the list/detail)
- Optionally mount in Settings MCP page too (single source of truth — same component)
- Acceptance: 6 vitest assertions — 6 featured cards render, "Install" button triggers correct tRPC, "Installed" state shows for installed servers

### Plan 186-03: Delete orphan mcp-panel.tsx + grep audit
- DELETE `routes/ai-chat/mcp-panel.tsx` (1316 lines, 0 imports after Phase 182-04 lift, content fully migrated to `components/mcp/*` + `routes/settings/mcp-servers.tsx` + new `FeaturedMcpInstaller.tsx`)
- Verify zero imports via grep — must return 0 matches
- Acceptance: grep returns 0, tsc clean, no test regression

</decisions>

<canonical_refs>
- v38.0 UAT finding #2 (operator preference)
- `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` (1316-line orphan — content source for FeaturedMcpInstaller)
- `livos/packages/ui/src/components/mcp/McpServerList.tsx` (Phase 182-04 presentational — to mount)
- `livos/packages/ui/src/components/mcp/McpServerDetail.tsx` (Phase 182-04 presentational — to mount)
- `livos/packages/ui/src/routes/settings/mcp-servers.tsx` (Phase 182-04 Settings page — pattern reference + stays as alternative entry)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` (file to modify — adds 3rd tab)
- Phase 182-04 SUMMARY (lifted-component pattern)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 186-01 | MOD routes/ai-chat/index.tsx (add 'mcp' tab + content) + test |
| 186-02 | NEW components/mcp/FeaturedMcpInstaller.tsx + test; MOD routes/ai-chat/index.tsx (mount installer); MOD routes/settings/mcp-servers.tsx (optionally mount installer) |
| 186-03 | DELETE routes/ai-chat/mcp-panel.tsx + test (if any) |

**Sacred guards:** Phase 182-04 `McpServerList.tsx` + `McpServerDetail.tsx` UNCHANGED — consumed as-is. Settings MCP page UNCHANGED (one optional addition — the FeaturedMcpInstaller). No tRPC route changes (uses same backend).

**File overlap with Phase 185:** Both Phase 185 and Phase 186 modify `routes/ai-chat/index.tsx`. To avoid merge conflict, run 185-01..04 first, then 186-01..03 sequentially. Add 'mcp' tab AFTER the split layout exists (Phase 185 restructures the layout; Phase 186 adds a tab to the existing tab nav).

</specifics>

<deferred>
- Per-conversation MCP server enable/disable (right now MCP servers are global) → v39+
- MCP server logs viewer in the detail pane → v38.2
- MCP server marketplace integration (browse 100+ community servers) → v39+
</deferred>

---

*Phase: 186-mcp-back-to-ai-chat*
*Wave: 2 (after 185-01 lands)*
*Depends on: Phase 182-04, Phase 185-01*
*Estimated: ~0.5 day agent work*
