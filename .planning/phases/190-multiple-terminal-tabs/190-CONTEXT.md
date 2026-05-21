# Phase 190: Multiple Terminal Tabs + Claude/Terminal Icons

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Operator literal spec 2026-05-20 ("En yukari kisimda Multiple Terminal calistirabilelim istiyorum acik olan terminalleride orada gorebileyim bu bolumun en sag tarafinda Claude iconu olsun ve claude un yaninda Terminal iconu da olsun")
**Wave:** 3 (depends 188 + 189)

<domain>
## Phase Boundary

Replace the AI Chat window's top tab bar (currently after Phase 188: `Terminal | MCP Server`) with a DYNAMIC terminal tab strip. Each open agent/chat session becomes a tab labeled by item name. At the RIGHT of the strip: two icon buttons — Claude (spawn new ad-hoc Claude session with cwd `~`) and Terminal (spawn new bare bash session with cwd `~`).

**Capacity:** ≥10 concurrent tabs. Beyond that, horizontal scroll. Tab close button (×) per tab; close kills the tmux session and removes the tab.

**Tab content:** swapping tabs swaps the right-pane mounted `<CcTerminal>` (or `<BareTerminal>` for bare bash) session id without re-spawn. Tmux sessions persist across tab switches.

**MCP Server tab REMOVAL:** operator spec says MCP goes to settings gear panel (future Phase 191). For Phase 190: just remove the `'mcp'` Tab union value + render branch. MCP UI components (`McpServerList`, `McpServerDetail`, `FeaturedMcpInstaller`) STAY on disk — Phase 191 will reuse them in the gear panel.

**Phase 190 sonu:**
- AI Chat window's top bar is a horizontal scroll strip of terminal tabs (one per open session) + right-side icon cluster (Claude icon + Terminal icon)
- Operator clicks an agent in sidebar → tab opens for it (or focuses existing tab)
- Operator clicks Claude icon → new ad-hoc Claude tab "Claude N" (N = next index)
- Operator clicks Terminal icon → new bash tab "Terminal N" (cwd = ~)
- Operator can have 10+ tabs; horizontal scroll if overflow
- Tabs are closeable via × button (kills tmux session)
- Active tab is visually highlighted (border-b-2 + bg)
- MCP Server tab is GONE (the components stay on disk for Phase 191)
- Vault Graph already gone from Phase 188

**Terminology:** Tab strip = `<TerminalTabStrip>`. Each tab = `<TerminalTab>`. Bare bash terminal session = `<BareTerminal>` (NEW wrapper similar to CcTerminal but no claude command — just plain bash).
</domain>

<decisions>

### Plan 190-01: NEW `<BareTerminal>` component (plain bash PTY)
- NEW `livos/packages/ui/src/features/cc-terminal/BareTerminal.tsx` + test
- Composed pattern: reuse CcTerminal infrastructure (xterm + WS connection + sendStdin) but with `sessionType: 'bare'` flag
- Server-side: cc-pty `manager.create()` already supports a `command` parameter (bash if not specified). Add a sessionType flag in WS handshake; for `bare`, skip the claude command injection
- Acceptance: 6 vitest assertions — BareTerminal mounts, sends correct WS handshake, sendStdin works, no claude-specific behavior

### Plan 190-02: NEW `<TerminalTabStrip>` + `<TerminalTab>` components
- NEW `livos/packages/ui/src/features/terminal-tabs/TerminalTabStrip.tsx` + test
- NEW `livos/packages/ui/src/features/terminal-tabs/TerminalTab.tsx` + test
- TabStrip props: `{ tabs: TerminalTabInfo[], activeId: string | null, onSelect, onClose, onAddClaude, onAddBareTerminal }`
- Tab strip layout: `flex-row` with `overflow-x-auto`; tabs `min-w-[140px] max-w-[240px]`; right cluster `flex-row` with Claude + Terminal icon buttons
- Tab info: `{ id, label, type: 'agent'|'chat'|'claude'|'terminal', sessionId, badge?: 'running'|'idle'|'error' }`
- Tab `<TerminalTab>`: label + close × on hover; click selects (calls onSelect); × calls onClose
- Right cluster: `<button>` with `lucide.Sparkles` (Claude) + `<button>` with `lucide.Terminal` (bare)
- Acceptance: 10 vitest assertions — tab strip renders N tabs, click selects, × closes, icons trigger correct callbacks, overflow scrolls

### Plan 190-03: Wire tab strip into AI Chat window + remove MCP tab
- MOD `routes/ai-chat/index.tsx` — replace the current Tab nav (`<button>Terminal</button><button>MCP Servers</button>`) with `<TerminalTabStrip>`
- New state: `tabs: TerminalTabInfo[]`, `activeTabId: string | null`
- When sidebar selects an agent/chat item: open tab (if not exists) OR focus existing
- When operator clicks Claude icon: append new tab `{type:'claude', sessionId: 'liv-adhoc-claude-' + uuid, label: 'Claude ' + N}`
- When operator clicks Terminal icon: append `{type:'terminal', sessionId: 'liv-bare-' + uuid, label: 'Terminal ' + N}`
- Tab close: call ws message to kill tmux session; remove from tabs array; if activeTabId was closed, focus previous tab
- Right pane: render `<CcTerminal>` or `<BareTerminal>` based on active tab's type
- REMOVE `'mcp'` Tab value (already shrunk by Phase 188 to `'terminal'|'mcp'`; this plan removes `'mcp'` too)
- REMOVE the MCP Server tab UI (button) and the right-pane MCP render branch
- Acceptance: 8 vitest assertions — sidebar agent click opens tab, Claude icon click adds tab, Terminal icon click adds tab, close removes tab, type switching works

### Plan 190-04: Persistent tab state across page reload (localStorage)
- Tabs persisted to localStorage key `liv:ai-chat:tabs:<userId>` so reloads restore open sessions
- On mount: read localStorage, hydrate tabs array
- On tabs change: debounced (300ms) localStorage write
- Acceptance: 6 vitest assertions — restored on mount, write debounced, removed entries actually removed
</decisions>

<canonical_refs>
- Operator spec 2026-05-20 (literal terminal tabs ask)
- `.planning/research/v38_2_hermes_openclaw_findings.md` Pattern #1 carry — OpenClaw SessionWorkspaceStrip inspires the horizontal strip layout
- `livos/packages/ui/src/routes/ai-chat/index.tsx` (Phase 188 post-rewrite — Tab union `'terminal'|'mcp'`; this phase rebuilds the bar entirely)
- `livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx` (Phase 167 + 181 substrate; BareTerminal reuses)
- `livos/packages/ui/src/features/cc-terminal/terminal-ws-client.ts` (Phase 167 + 181 — WS handshake; may need sessionType param)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (Phase 166 + 167.2 + 183 + 189 — additive bare session support)
- `livos/packages/livinityd/source/modules/cc-pty/ws-handler.ts` (Phase 166 — WS handshake)
- `livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.tsx` (Phase 189 — agent-specific PTY mount; this phase makes it tab-aware)
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` (Phase 174 — selection callback fires onSelect which now opens tab)
- `livos/packages/ui/src/components/mcp/{McpServerList,McpServerDetail,FeaturedMcpInstaller}.tsx` (Phase 182-04 + 186-02 — STAY on disk for Phase 191)
- lucide-react icons: Sparkles (Claude), Terminal, X (close), Plus (alternative)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 190-01 | NEW features/cc-terminal/BareTerminal.tsx + test; MOD cc-pty/manager.ts (additive bare session support if missing) + test |
| 190-02 | NEW features/terminal-tabs/{TerminalTabStrip,TerminalTab}.tsx + tests |
| 190-03 | MOD routes/ai-chat/index.tsx (replace tab bar with TabStrip + tabs state) + test |
| 190-04 | MOD routes/ai-chat/index.tsx (additive localStorage persistence) + test |

**Sacred guards:**
- sdk-agent-runner.ts (SHA f3538e1d...) UNCHANGED
- All 25 in scripts/sacred-shas-v38.json
- Phase 167 CcTerminal.tsx — ADDITIVE only (BareTerminal is a NEW sibling, not a modification)
- Phase 166 cc-pty/manager.ts — ADDITIVE only (if bare bash needs new branch in spawn logic, add it via existing extension surface — Phase 189 agent-session-hooks pattern is the precedent)
- Phase 188 ai-chat tab union — being rebuilt; tests will need rewrite (acceptable per CONTEXT)
- Phase 182-04 + 186-02 MCP components — STAY on disk (Phase 191 absorbs)

**MCP UI components (NOT deleted):**
- `components/mcp/McpServerList.tsx`
- `components/mcp/McpServerDetail.tsx`
- `components/mcp/FeaturedMcpInstaller.tsx`
- `routes/settings/mcp-servers.tsx` (Settings page still mounts them)
- All 4 stay. Only the `'mcp'` Tab branch in ai-chat is removed.

</specifics>

<deferred>
- Drag-to-reorder tabs → v38.x polish (OpenClaw Pattern #1 carry — nice-to-have)
- Tab pinning → v38.x
- Tab grouping / workspaces → v39+
- Status dot per tab (running/idle/error indicator) → v38.x (CONTEXT mentions, but not in MVP)
- Maximum tabs limit (10?) → enforce in v38.x; for MVP allow unlimited with scroll
- Settings gear → in-pane MCP panel → Phase 191 (v38.3)
</deferred>

---

*Phase: 190-multiple-terminal-tabs*
*Wave: 3 (depends Phase 188 ai-chat tab union + Phase 189 AgentTerminalPane)*
*Depends on: Phase 166, 167, 174, 181, 185, 188, 189*
*Estimated: ~0.5-1 day*
