# v32 — AI Chat Ground-up Rewrite + Hermes-flavored Background Runtime

> **DRAFT 2026-05-05** — milestone planning. Replaces v31 P79 (band-aid fixes) with proper Suna+Hermes foundation. Awaits user approval before phase execution.

**Codename:** Liv Agent v2 — "WOOOWWW" Edition
**Sources:** Suna (cankalsoftware/suna-kortix-ai fork — UI + MCP patterns), Hermes (NousResearch/hermes-agent — background runtime patterns)
**UI scope:** ONLY Suna patterns. Hermes is background-runtime-only (per user direction 2026-05-05 "arka plandaki agent ise Hermes den ilham alarak").
**Light theme:** REQUIRED (per user direction 2026-05-05 "Aydinlik tema olmali").
**Replaces:** Current `/ai-chat`, `/agent-marketplace`, `mcp-panel` sidebar tab — full ground-up.
**Preserves:** subscription Claude broker path (D-NO-BYOK), per-user OAuth isolation, sacred `sdk-agent-runner.ts` as wrap-don't-rewrite (post-P77 SHA `f3538e1d...`).

---

## 0. Why this milestone exists

Per user 2026-05-05 (verbatim, paraphrased):

> "AI chat de Agentic AI duzgun calismiyor!. UI hala berbat! Hala iyice incelenmemis! ... burasi icin cok detayli arastirma yap UI i bastanda yazabilirsin Aydinlik tema olmali. ... bence Agent farkli bir tool yerini cekiuyor onceden ,livinity tool larini vs cekiyordu bozmustu mcp yi gecmisteki mcp toollari farkli yerde 2 tane var. ... gsd kullan iyice plan yap. Arka plandaki agent ise Hermes den ilham alarak tasarla"

**Pain points enumerated:**
1. UI is "berbat" (terrible) — wants Suna-faithful redesign
2. Light theme missing
3. MCP duplicated across 3 places (mcp-panel + /agent-marketplace + capabilities) — wants single source of truth
4. "Agent" position colliding with native tools (livinity_list etc)
5. P79 quick-fixes (provider fallback, MCP injection, screenshot via scrot) shipped but architecture wasn't addressed
6. Tool calls invisible in UI (panel doesn't auto-open — WebSocket vs SSE split, never finished P67-P68)

**v31 P79 status (carryover):** bytebot MCP works end-to-end as of 2026-05-05 — user confirmed "Tamam simdi calisiyor" after P79-04. Native bytebot via host Mini PC's GNOME desktop (bruce session + scrot subprocess + GDM XAUTHORITY). Multi-session/container path **NOT v32 scope** (separate future milestone if user wants).

---

## 1. Architecture Decisions (locked before any phase begins)

### A. UI base
- **Framework:** Keep React 18 + Vite + Tailwind 3.4 + shadcn/ui (no migration to Next.js — too costly)
- **Color tokens:** OKLCH custom properties, `:root` (light) + `.dark` swap, matches Suna's `globals.css` shape verbatim
- **Theme toggle:** New — system default, manual override stored in `localStorage.getItem('liv-theme')`, `<html class="dark">` toggle
- **Fonts:** Geist Sans (UI labels) + Geist Mono (tool names, code) — loaded via `@fontsource-variable/geist` packages
- **Icon library:** Tabler (existing) — map every Suna Lucide ref → Tabler in port

### B. Chat UI
- **Component scope:** new directory `livos/packages/ui/src/routes/ai-chat-v2/` — WORKS IN PARALLEL with existing `/ai-chat` until cutover
- **Routes:** `/ai-chat-v2` first, becomes `/ai-chat` at P91 cutover
- **Pillar pattern:** pill-first inline tool calls (Suna line 133-146 of ThreadContent.tsx) + side panel for full detail
- **Streaming protocol:** SSE (useLivAgentStream P67-04) — replaces WebSocket path that mcp-panel currently uses
- **Side panel:** Suna's `ToolCallSidePanel` ported verbatim — `fixed inset-y-0 right-0`, slider scrubber, live/manual mode, Cmd+I close

### C. Agent management
- **Routes:** new `/agents` (list+grid) and `/agents/:id` (two-pane editor)
- **Editor:** left pane config (Manual tab + Agent Builder Beta tab), right pane live preview chat with the agent
- **Autosave:** debounced 500ms (Suna pattern, agents/new/[agentId]/page.tsx:135-149)
- **Card style:** `rounded-2xl` + h-50 color-fill avatar zone + backdrop-blur-sm download badges (Suna pattern)
- **Tools:** `agentpress_tools` toggle map (start with 8 default LivOS-equivalents)
- **MCPs:** `configured_mcps` JSON array per-agent (replaces global liv:mcp:config)

### D. MCP single source of truth
- **Authority:** `MCPConfigurationNew` component embedded in agent settings (Suna pattern)
- **Discovery:** `BrowseDialog` modal — opened from composer `+ MCP` button OR agent settings → searches MCP Registry (registry.modelcontextprotocol.io v0.1)
- **Configure:** `ConfigDialog` modal — credentials inputs from server's `configSchema`, tool-selection checkboxes
- **Manage:** `ConfiguredMcpList` per-agent — edit/remove buttons
- **DEPRECATE:** `mcp-panel` sidebar tab, `/agent-marketplace` MCP route, capabilities panel
- **Migration:** existing global `liv:mcp:config` (bytebot) → per-default-agent during P84 cutover

### E. Tool views
- **Registry pattern:** `ToolViewRegistry.tsx` (Suna pattern — JS object name → component)
- **9 specialized views:** Browser, Command, FileOp, StrReplace, WebSearch, WebCrawl, WebScrape, MCP (with smart format detection), Generic fallback
- **MCPContentRenderer:** auto-detects format (search results / table / JSON / markdown / error) via `MCPFormatDetector` (Suna pattern)
- **Color identity per MCP server:** `getMCPServerColor()` returns gradient theme per server name (Exa blue, GitHub purple, etc)

### F. Background runtime (Hermes-inspired, NOT Hermes UI)
- **Location:** `liv/packages/core/src/liv-agent-runner.ts` (existing, extend)
- **5 Hermes patterns to port:**
  1. **`status_detail` chunk** — emit on every assistant message turn with random `THINKING_VERBS` phrase + elapsed ms. UI renders as subtle animated card.
  2. **`IterationBudget`** — `maxIterations: number` LivAgentRunnerOptions, default 90. Shared with subagents.
  3. **JSON repair chain** — 4-pass repair for malformed `tool_use` arguments. Goes into `kimi-agent-runner.ts` (legacy Kimi path) if any kept; alternatively skip — Claude SDK rarely emits malformed.
  4. **Steer injection** — new WS message type `{type:'steer', guidance:string}` — buffered, injected as system message in next turn (preserves role alternation).
  5. **`batchId` on ToolCallSnapshot** — additive field for future visual grouping of parallel tool calls.
- **NO KawaiiSpinner UI** (per user "ONLY Suna UI patterns") — but `THINKING_VERBS` constants reused in our own visual treatment.

### G. What we will NOT do (scope guards)
- ❌ Migrate to Next.js
- ❌ Multi-session container desktops (deferred to future milestone)
- ❌ Hermes UI patterns (CLI face emoticons, ASCII frames) — only the conceptual patterns
- ❌ Smithery integration directly — use the official MCP Registry (`registry.modelcontextprotocol.io`) we already have client for
- ❌ Touch sacred subscription path (D-NO-BYOK)
- ❌ Replace `LivAgentRunner` — extend, don't rewrite
- ❌ Migrate persistent storage — Redis stays primary, Postgres stays for users/conversations/messages
- ❌ Break the working `/api/agent/stream` (P77 path) — keep it as a fallback during cutover

---

## 2. Phase Breakdown — 12 Phases

```
P80 v32-Phase01:  Foundation — design tokens, fonts, Tailwind config, theme toggle    (8h)
P81 v32-Phase02:  Chat UI Port — ThreadContent + ChatComposer + tool pill + drag-drop  (14h)
P82 v32-Phase03:  Tool Side Panel — ToolCallSidePanel + slider + live/manual + Cmd+I   (10h)
P83 v32-Phase04:  Per-Tool Views — Registry + 9 views + MCPContentRenderer             (16h)
P84 v32-Phase05:  MCP Single SoT — BrowseDialog + ConfigDialog + ConfiguredMcpList    (12h)
P85 v32-Phase06:  Agent Management — /agents two-pane editor + autosave + card grid    (16h)
P86 v32-Phase07:  Agent Marketplace — /marketplace + Add to Library + search/filter     (8h)
P87 v32-Phase08:  Hermes Runtime — status_detail + IterationBudget + steer + batchId    (8h)
P88 v32-Phase09:  WS → SSE Migration — chat uses useLivAgentStream + panel auto-open    (10h)
P89 v32-Phase10:  Theme Toggle — light/dark switch + accessibility + keyboard shortcuts  (6h)
P90 v32-Phase11:  Cutover — /ai-chat-v2 → /ai-chat + retire mcp-panel + agent-marketplace (4h)
P91 v32-Phase12:  UAT + Polish — full flow smoke test + visual review + bug fixes        (8h)
```

**Total:** 120 hours sequential, ~70 hours parallel (P82+P83 paralel, P85+P86 paralel, P87 backend bağımsız).

**Wall-clock estimate:** 4-6 günde ship.

---

## 3. Phase Details (CONTEXT.md skeletons — full PLAN.md per phase at execution time)

### P80 — Foundation (8h)
- **Deliverables:**
  - `livos/packages/ui/src/styles/v32-tokens.css` — OKLCH `:root` + `.dark` swap (verbatim Suna globals.css)
  - `@fontsource-variable/geist` package + `@fontsource-variable/geist-mono` install + import in main entry
  - Tailwind config extension — Geist as default sans/mono, OKLCH var bindings
  - `useTheme()` hook + `<ThemeProvider>` wrapper — system default → `<html class>` toggle, persists to localStorage
  - 3-color theme demo page `/playground/theme` — preview light/dark side-by-side
- **No production code routes touched** — purely additive infrastructure.

### P81 — Chat UI Port (14h, depends on P80)
- **Deliverables:**
  - New directory `livos/packages/ui/src/routes/ai-chat-v2/`
  - `MessageThread.tsx` — port of Suna `ThreadContent.tsx` with XML tool-call detection, gradient pill rendering, streaming caret
  - `ChatComposer.tsx` — port of Suna `chat-input.tsx` orchestrator (drag-drop card, model selector, agent selector, file upload, voice button)
  - `MessageInput.tsx` — port of Suna `message-input.tsx` (auto-grow textarea, Enter-to-send, Shift+Enter multiline)
  - `LivOsModelSelector.tsx` — adapted, not pure port (Liv has fewer model choices)
  - `FileAttachment.tsx` + `AttachmentGroup.tsx` — port verbatim
  - `preview-renderers/` — port verbatim (csv, html, markdown)
  - All gradient icon containers, monospace tool names, hover states matching Suna
- **Tool pill renders inline but currently does nothing on click — wired in P82.**

### P82 — Tool Side Panel (10h, depends on P81)
- **Deliverables:**
  - `ToolCallPanel.tsx` — port of Suna `tool-call-side-panel.tsx`, `fixed inset-y-0 right-0 z-30`, responsive widths, slide-in animation
  - Live mode auto-advance to latest, manual mode on user scrub, "Jump to Live" pulse pill, "Jump to Latest" idle pill
  - Slider scrubber (shadcn Slider, OKLCH-aware)
  - Cmd+I close shortcut, `liv-sidebar-toggled` event listener
  - Wire pill click → `setCurrentToolIndex(idx)` → panel opens to that tool
  - **Auto-open trigger fix:** `isVisualTool(name)` regex extended to `/^(browser-|computer-use-|screenshot|mcp_bytebot_)/`
- **Empty state** — when no tool calls yet, panel collapsed `translate-x-full`.

### P83 — Per-Tool Views (16h, paralel ile P82)
- **Deliverables:**
  - `tool-views/wrapper/ToolViewRegistry.tsx` — JS object dispatch (verbatim Suna)
  - `tool-views/wrapper/ToolViewWrapper.tsx` — shared chrome (header + status + footer)
  - 9 view components: BrowserToolView, CommandToolView, FileOperationToolView, StrReplaceToolView, WebSearchToolView, WebCrawlToolView, WebScrapeToolView, McpToolView (with format detection), GenericToolView
  - `MCPContentRenderer.tsx` + `mcp-format-detector.ts` — Suna's smart renderer (search / table / JSON / markdown / error / plain)
  - `getMCPServerColor()` + `getMCPServerIcon()` — per-server identity
- **All views render with light + dark theme correctly** (P89 will add toggle, but tokens must work in both).

### P84 — MCP Single Source of Truth (12h, depends on P83)
- **Deliverables:**
  - `mcp/BrowseDialog.tsx` — Dialog modal, search + categorized sidebar + server cards grid, opens from composer `+ MCP` button OR agent settings
  - `mcp/CategorySidebar.tsx`, `mcp/CategorizedServersList.tsx`, `mcp/SearchResults.tsx`
  - `mcp/McpServerCard.tsx` — server tile (icon + name + use count + tags + chevron)
  - `mcp/ConfigDialog.tsx` — credentials form from `configSchema` + tool-selection checkboxes
  - `mcp/ConfiguredMcpList.tsx` — installed MCPs per agent with edit/remove buttons
  - `MCPConfigurationNew.tsx` — top-level wrapper consumed by agent settings
  - `hooks/use-mcp-servers.ts` — react-query hooks (search, popular, details)
  - tRPC endpoints: `mcp.list`, `mcp.installToAgent`, `mcp.removeFromAgent`, `mcp.searchRegistry`
  - DB migration: `agents.configured_mcps` JSONB column (existing scope from P85)
- **DEPRECATE:** `mcp-panel.tsx` — keep file but unmount from router (cleanup at P90 cutover).

### P85 — Agent Management (16h, paralel P86)
- **Deliverables:**
  - DB migration: `agents` table — agent_id (PK), user_id (FK), name, description, system_prompt, configured_mcps (JSONB), agentpress_tools (JSONB), avatar (emoji), avatar_color, is_default, is_public, marketplace_published_at, download_count, created_at, updated_at
  - tRPC endpoints: `agents.list`, `agents.get`, `agents.create`, `agents.update`, `agents.delete`, `agents.publish`, `agents.unpublish`
  - Routes:
    - `/agents` — grid list with search + sort + filter
    - `/agents/:id` — two-pane editor (Manual tab + Agent Builder Beta tab)
  - Components: `AgentCard.tsx` (rounded-2xl + h-50 color zone + badges), `AgentsGrid.tsx`, `AgentPreview.tsx`, `CreateAgentDialog.tsx`, `AgentToolsConfiguration.tsx`, `EditableText.tsx`, `EmptyState.tsx`
  - 8 default agentpress_tools — LivOS native tool set (shell, files, browser_devtools, web_search, web_scrape, mcp_proxy, file_diff, system_info)
  - Debounced autosave (500ms) with status badge ("Saving" amber → "Saved" green → "Error" red)

### P86 — Agent Marketplace (8h, paralel P85)
- **Deliverables:**
  - Route `/marketplace` — replaces `/agent-marketplace` deprecation slot
  - 4-col responsive grid (sm:2 / lg:3 / xl:4)
  - Search input + sort select (newest/popular/most_downloaded) + tag filter chip strip
  - `MarketplaceCard.tsx` — h-50 color zone + backdrop-blur download badge + tag badges + creator/date
  - "Add to Library" button → `agents.cloneFromMarketplace` mutation → invalidates `agents.list` query
  - 8 seed agents (move existing `agent_templates` → `agents` table with `is_public:true`)

### P87 — Hermes-inspired Background Runtime (8h, backend bağımsız, paralel)
- **Deliverables:**
  - `liv/packages/core/src/liv-agent-runner.ts` — extend with:
    - New chunk type `status_detail` in `RunStore.ChunkType` — payload `{phase: 'thinking'|'tool_use'|'waiting', phrase: string, elapsed: number}`
    - Emit on every `handleAssistantMessage` start + tool dispatch + tool result
    - `THINKING_VERBS` constants array (from Hermes verbatim: pondering, contemplating, etc — 15 entries)
    - `maxIterations` option (default 90) — INCR counter in handleAssistantMessage, error chunk + markError on breach
  - `liv-agent-runner.ts` — `_pendingSteer: string | null` field + `injectSteer(guidance)` method, drained on next assistant turn
  - `RunStore.ToolCallSnapshot` — additive optional `batchId?: string` field for future parallel grouping
  - WebSocket message type `{type: 'steer', guidance: string}` in `agent-session.ts` ClientWsMessage union
- **NO touching of `sdk-agent-runner.ts`** — sacred constraint preserved (post-P77 baseline).

### P88 — WS → SSE Migration (10h, depends on P81+P87)
- **Deliverables:**
  - Refactor `livos/packages/ui/src/routes/ai-chat-v2/index.tsx` to use `useLivAgentStream` (P67-04 SSE) instead of `useAgentSocket` (WebSocket)
  - Bridge SSE chunk types to UI state: text chunks → message thread, tool_snapshot chunks → LivToolPanel, status_detail chunks → typing card
  - Auto-open ToolCallPanel on visual tool snapshots (`isVisualTool(name)` extended)
  - Deprecate `useAgentSocket` for v32 chat (keep for legacy `/ai-chat` during cutover)

### P89 — Theme Toggle + A11y + Keyboard (6h, depends on P80)
- **Deliverables:**
  - `<ThemeToggle>` component in chat header (sun/moon icon)
  - Keyboard shortcuts: Cmd+I (close panel), Cmd+K (composer focus), Cmd+/ (slash menu), Cmd+Shift+C (copy last message)
  - ARIA labels on all interactive components
  - Color contrast WCAG AA verification on light theme
  - Focus visible rings on all buttons (Tailwind `focus-visible:ring-2`)

### P90 — Cutover (4h, depends on ALL above)
- **Deliverables:**
  - Rename `/ai-chat-v2` → `/ai-chat` (delete old `/ai-chat` directory)
  - Remove `mcp-panel.tsx` sidebar tab from router
  - Redirect `/agent-marketplace` → `/marketplace` (HTTP 301 in livinityd, also client-side useEffect redirect for hash routes)
  - Update Dock app entry pointing to new chat
  - Update Dependencies of `useAgentSocket` to be unused (delete after grace period)
  - Memory + STATE.md update

### P91 — UAT + Polish (8h)
- **Deliverables:**
  - Full flow smoke test: open chat → chat with default agent → see streaming → tool pill → click pill → side panel opens → screenshot tool → side panel shows image
  - Marketplace flow: browse → Add to Library → see in /agents
  - Agent edit flow: edit name → autosave → see in preview pane
  - MCP browse: composer +MCP → search → install → see in agent settings
  - Theme toggle: light → dark → light, no flash
  - Mobile responsive: chat input full width, panel full screen
  - Visual review by user — A/B blink test against current `/ai-chat`

---

## 4. Source Material Index

Primary sources cloned + analyzed locally:
- `C:/Users/hello/Desktop/Projects/contabo/suna-reference/` — Suna fork (cankalsoftware/suna-kortix-ai), 212MB
- Hermes repos surveyed externally (NousResearch/hermes-agent v0.12.0 + outsourc-e/hermes-workspace v2.2.0 + nesquena/hermes-webui v0.51.5)

Research outputs (in this conversation, persisted via task notification):
- R-1: Suna chat UI A-Z — component inventory, OKLCH theme, Geist fonts, pill JSX, side panel layout, drag-drop, tool registry, light/dark theme
- R-2: Suna agents+marketplace A-Z — two-pane editor, debounced autosave, agent card pattern, agentpress_tools, configured_mcps per-agent, marketplace 4-col grid
- R-3: Suna MCP A-Z — BrowseDialog, ConfigDialog, MCPConfigurationNew, MCPToolWrapper backend (dynamic methods via setattr), MCPFormatDetector smart rendering, single source of truth
- R-4: Hermes A-Z — AIAgent class, IterationBudget shared, KawaiiSpinner phrase rotation, 3-phase context compression, JSON repair chain, steer injection, MCP via stdio with circuit breaker

---

## 5. Risk Register

| Risk | Mitigation |
|---|---|
| `useLivAgentStream` SSE relay (P67-04) was never validated under load — may have bugs | P88 includes regression smoke test; fallback: keep WebSocket path during cutover grace |
| `agents` table migration breaks existing user data | P85 migration writes to new table, never drops existing; agent_templates kept readonly |
| MCP Registry API may have rate limits or downtime | P84 includes graceful degraded mode (cached popular list, retry with backoff) |
| Light theme regressions on existing routes (settings, factory-reset, etc.) | P89 sweeps all routes for hard-coded `dark:` classes; non-v32 routes get `class="dark"` lock until they're audited |
| Tunnel reconnect every 90s breaks SSE — same issue user reported during P79 testing | P88 SSE consumer has reconnect-with-after-idx logic (built in P67-04); validate it actually works under reconnect |
| Sacred SHA inadvertently changed | Per-phase `git hash-object` check + integrity test (already in place from P77-02) |

---

## 6. Definition of Done — v32 Ships When

- [ ] All 12 phases (P80-P91) closed with VERIFICATION.md
- [ ] `git grep -i "mcp-panel"` returns 0 hits in active routes (only archived planning)
- [ ] `git grep -i "agent-marketplace"` returns 0 hits except as 301 redirect
- [ ] Light theme passes WCAG AA color contrast on every text+bg pair
- [ ] User runs full smoke test (open chat → screenshot agent → see image in side panel → switch theme to light → marketplace → install agent → use it) without UAT failure
- [ ] No regression on subscription Claude broker path (D-NO-BYOK preserved)
- [ ] User says "WOW" (success criterion per v31 carryover from `.planning/v31-DRAFT.md` line 14)

---

## 7. Locked Answers (user 2026-05-05)

| # | Decision | Implementation |
|---|----------|----------------|
| 1 | **Direct in `/ai-chat`** | New components live at `livos/packages/ui/src/routes/ai-chat/v32/`. `index.tsx` checks `liv:config:new_chat_enabled` Redis flag → routes to v32 sub-tree or legacy. Default `false` during dev, `true` at P90 cutover, then legacy directory deleted at P91. |
| 2 | **Current MCP registry preserved + optional Smithery toggle** | Primary: existing `mcp-registry-client.ts` → `registry.modelcontextprotocol.io`. New: `mcp-smithery-client.ts` → `server.smithery.ai`. BrowseDialog has source selector pill: "Official" (default) / "Smithery" (requires `liv:config:smithery_api_key` Redis key). Each shows its own catalog. Server entries from either are stored in same `agents.configured_mcps` JSONB but tagged with `source: 'official'\|'smithery'` for re-discovery. |
| 3 | **4-5 specialized seed agents** | Move existing `agent_templates` table to `agents` table with `is_public:true is_default:false`, seed 5 agents at first migration: 🤖 **Liv Default** (general), 🔬 **Researcher** (web tools heavy), 💻 **Coder** (terminal+files+devtools), 🖥️ **Computer Operator** (bytebot), 📊 **Data Analyst** (CSV+viz). Each has tailored `system_prompt` + `agentpress_tools` toggles + `configured_mcps` defaults. Onboarding tour highlights the 5 cards on first chat open. |
| 4 | **Per-agent model badge** | `AgentCard` + chat header show "Liv Default · Claude Sonnet 4.6" / "Coder · Claude Opus 4.7" etc. Each agent has `model_tier` field on `agents` row (haiku/sonnet/opus). Badge clickable → opens agent settings tab "Model" for switching. |
| 5 | **All 5 Hermes patterns at P87** | Full port: status_detail chunk, IterationBudget, JSON repair chain, steer injection, batchId. ~8h still — Hermes patterns are mostly small additive surface. UI animation for status_detail uses Liv-styled card (not KawaiiSpinner emoticons — that's CLI-only). |

---

## 8. Approval Gate

Before any phase begins, user reviews:
- This v32-DRAFT.md
- The 4 research outputs (in conversation history)
- Confirmed: GSD workflow with per-phase PLAN.md + SUMMARY.md + atomic commits
- Confirmed: 4-6 günde ship (parallel work-streams)

User says **"v32 onayla"** → I add P80-P91 to ROADMAP.md, write per-phase CONTEXT.md, dispatch first wave (P80 + P83 + P87 paralel since they're independent).

---

*Generated 2026-05-05 by synthesis of 4 parallel research agent outputs (R-1 chat UI, R-2 agents+marketplace, R-3 MCP, R-4 Hermes). All file references verified in local Suna fork at `C:/Users/hello/Desktop/Projects/contabo/suna-reference/`.*
